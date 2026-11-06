"""Isolated index recommendation benchmarking.

Tests recommended indexes strictly within an isolated database environment
without permanently modifying or polluting the user's database catalog.

PostgreSQL:
    Uses transactional DDL (BEGIN -> CREATE INDEX -> benchmark -> ROLLBACK)
    or HypoPG virtual index simulation.

SQLite:
    Uses an isolated in-memory or cloned sandbox database.
"""

from __future__ import annotations

import logging
import re
import sqlite3
from pathlib import Path
from typing import Any

from benchmarking.models import AggregateBenchmarkMetrics
from benchmarking.runner import BENCHMARK_DB_PATH, BenchmarkRunner

logger = logging.getLogger(__name__)


class IsolatedIndexBenchmarker:
    """Benchmarks queries with proposed indexes in safe, strictly isolated environments."""

    @classmethod
    def benchmark_with_index_pg(
        cls,
        raw_conn,
        index_sql: str,
        query_sql: str,
        num_runs: int = 5,
        timeout_ms: int = 30_000,
    ) -> tuple[AggregateBenchmarkMetrics, str]:
        """Benchmark index on PostgreSQL inside an isolated transaction that rolls back."""
        environment = "postgresql_isolated_transaction"

        try:
            with raw_conn.cursor() as cur:
                # Set statement timeout
                cur.execute(f"SET statement_timeout = {int(timeout_ms)}")
                # Start transaction
                cur.execute("BEGIN")

                # Create the index inside the transaction
                logger.info("Creating index inside isolated transaction: %s", index_sql)
                cur.execute(index_sql)

                # Benchmark the query with the newly active index
                runner = BenchmarkRunner(raw_pg_conn=raw_conn)
                metrics = runner.run_benchmark(query_sql, num_runs=num_runs, timeout_ms=timeout_ms)

                # Clean rollback
                cur.execute("ROLLBACK")
                logger.info("Successfully rolled back isolated index transaction")
                return metrics, environment

        except Exception as exc:
            try:
                raw_conn.rollback()
            except Exception:
                pass
            logger.warning("PostgreSQL transactional index test failed: %s; trying HypoPG fallback", exc)
            return cls._fallback_hypopg(raw_conn, index_sql, query_sql, num_runs, timeout_ms)

    @classmethod
    def _fallback_hypopg(
        cls,
        raw_conn,
        index_sql: str,
        query_sql: str,
        num_runs: int,
        timeout_ms: int,
    ) -> tuple[AggregateBenchmarkMetrics, str]:
        """Fallback to HypoPG simulation if transactional DDL fails."""
        from services.index_simulator import IndexSimulator

        environment = "postgresql_hypopg"
        simulator = IndexSimulator(raw_conn)
        res = simulator.simulate(index_sql, query_sql, timeout_ms=timeout_ms)

        if not res.success or res.simulated_cost is None:
            raise RuntimeError(f"Index simulation failed: {res.error}")

        # Baseline runner to estimate buffer & execution time scaling
        runner = BenchmarkRunner(raw_pg_conn=raw_conn)
        base_metrics = runner.run_benchmark(query_sql, num_runs=num_runs, timeout_ms=timeout_ms)

        # Apply simulated cost ratio to execution time
        cost_ratio = (
            res.simulated_cost / res.original_cost
            if res.original_cost and res.original_cost > 0
            else 1.0
        )
        simulated_time = base_metrics.warm_median_execution_time_ms * cost_ratio

        runs = [
            r.model_copy(
                update={
                    "execution_time_ms": round(r.execution_time_ms * cost_ratio, 4),
                    "planner_cost": round(res.simulated_cost, 2),
                }
            )
            for r in base_metrics.raw_runs
        ]

        metrics = runner._aggregate_runs(runs)
        metrics.estimated_planner_cost = res.simulated_cost
        return metrics, environment

    @classmethod
    def benchmark_with_index_sqlite(
        cls,
        index_sql: str,
        query_sql: str,
        num_runs: int = 5,
    ) -> tuple[AggregateBenchmarkMetrics, str]:
        """Benchmark index on an isolated SQLite database clone."""
        environment = "controlled_sqlite_sandbox"

        # Create an in-memory clone of the benchmark seeded database
        mem_conn = sqlite3.connect(":memory:")

        if BENCHMARK_DB_PATH.exists():
            disk_conn = sqlite3.connect(BENCHMARK_DB_PATH)
            disk_conn.backup(mem_conn)
            disk_conn.close()

        try:
            # If an index with this name already exists in the clone, drop it first so recreation succeeds
            m = re.search(
                r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([`\"'\[]?\w+[`\"'\]]?)",
                index_sql,
                re.IGNORECASE,
            )
            if m:
                idx_name = m.group(1).strip("`\"'[]")
                cur = mem_conn.cursor()
                cur.execute(f'DROP INDEX IF EXISTS "{idx_name}"')

            # Create the index in the in-memory clone
            logger.info("Applying index in memory clone: %s", index_sql)
            cur = mem_conn.cursor()
            cur.execute(index_sql)
            mem_conn.commit()

            # Benchmark query
            runner = BenchmarkRunner(sqlite_conn=mem_conn)
            metrics = runner.run_benchmark(query_sql, num_runs=num_runs)
            return metrics, environment

        finally:
            mem_conn.close()
