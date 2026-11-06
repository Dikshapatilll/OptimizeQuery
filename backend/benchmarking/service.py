"""Benchmark orchestration service.

Executes end-to-end benchmarking across original queries, rewritten queries,
and isolated index candidates, persisting results in the database.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from api.models.orm import BenchmarkHistory, QueryHistory
from benchmarking.evaluator import (
    calculate_improvement_pct,
    compare_with_ml_prediction,
    verify_equivalence,
)
from benchmarking.index_benchmarker import IsolatedIndexBenchmarker
from benchmarking.models import (
    AggregateBenchmarkMetrics,
    BenchmarkComparisonResult,
    BenchmarkRunRequest,
)
from benchmarking.runner import BENCHMARK_DB_PATH, BenchmarkRunner, analyze_caching
from services.connection_manager import ConnectionManager

logger = logging.getLogger(__name__)


class BenchmarkService:
    """Manages benchmarking runs and database persistence."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def run_benchmark(self, request: BenchmarkRunRequest) -> BenchmarkComparisonResult:
        """Run full benchmark comparison according to the request parameters."""
        benchmark_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()

        raw_pg_conn = None
        sqlite_conn = None
        environment = "controlled_sqlite_sandbox"

        # ── 1. Acquire execution connection ──────────────────────────────────
        if request.connection_id:
            manager = ConnectionManager(self.db)
            conn_record = manager.get(request.connection_id)
            if not conn_record:
                raise ValueError(f"Database connection '{request.connection_id}' not found.")
            if conn_record.db_type != "postgresql":
                raise ValueError(
                    f"Connection '{conn_record.name}' ({conn_record.db_type}) does not support live transactional isolation. "
                    "Live benchmarking is currently supported on PostgreSQL (via transactional DDL/EXPLAIN BUFFERS) and the local SQLite Sandbox."
                )
            try:
                raw_pg_conn = manager.open_raw_pg_connection(request.connection_id)
                environment = "postgresql_isolated_transaction"
            except Exception as exc:
                raise ValueError(
                    f"Failed to open connection to PostgreSQL database '{conn_record.name}': {exc}. "
                    "Benchmarking aborted to avoid misrepresenting sandbox results as live database telemetry."
                )
        else:
            # Controlled SQLite sandbox
            if BENCHMARK_DB_PATH.exists():
                sqlite_conn = sqlite3.connect(f"file:{BENCHMARK_DB_PATH}?mode=ro", uri=True)
            else:
                sqlite_conn = sqlite3.connect(":memory:")

        try:
            # ── 2. Benchmark Original Query ──────────────────────────────────
            orig_runner = BenchmarkRunner(raw_pg_conn=raw_pg_conn, sqlite_conn=sqlite_conn)
            original_metrics = orig_runner.run_benchmark(
                request.original_sql,
                num_runs=request.num_runs,
            )

            # ── 3. Benchmark Optimized Query or Index ────────────────────────
            optimized_metrics: AggregateBenchmarkMetrics | None = None
            opt_env = environment

            if request.optimized_sql:
                # SQL Rewrite benchmarking
                opt_runner = BenchmarkRunner(raw_pg_conn=raw_pg_conn, sqlite_conn=sqlite_conn)
                optimized_metrics = opt_runner.run_benchmark(
                    request.optimized_sql,
                    num_runs=request.num_runs,
                )
            elif request.index_sql:
                # Isolated index benchmarking
                if raw_pg_conn is not None:
                    optimized_metrics, opt_env = IsolatedIndexBenchmarker.benchmark_with_index_pg(
                        raw_conn=raw_pg_conn,
                        index_sql=request.index_sql,
                        query_sql=request.original_sql,
                        num_runs=request.num_runs,
                    )
                else:
                    optimized_metrics, opt_env = IsolatedIndexBenchmarker.benchmark_with_index_sqlite(
                        index_sql=request.index_sql,
                        query_sql=request.original_sql,
                        num_runs=request.num_runs,
                    )

            # ── 4. Verify Equivalence ────────────────────────────────────────
            equivalence = None
            if request.optimized_sql:
                equivalence = verify_equivalence(
                    original_sql=request.original_sql,
                    optimized_sql=request.optimized_sql,
                    raw_pg_conn=raw_pg_conn,
                    sqlite_conn=sqlite_conn,
                    row_limit=request.row_limit_for_equivalence,
                )

            # ── 5. Calculate Improvements ────────────────────────────────────
            exec_improvement = None
            cost_improvement = None
            reads_improvement = None

            if optimized_metrics is not None:
                exec_improvement = calculate_improvement_pct(
                    original_metrics.warm_median_execution_time_ms,
                    optimized_metrics.warm_median_execution_time_ms,
                )
                cost_improvement = calculate_improvement_pct(
                    original_metrics.estimated_planner_cost,
                    optimized_metrics.estimated_planner_cost,
                )
                reads_improvement = calculate_improvement_pct(
                    float(original_metrics.shared_buffer_reads or 0),
                    float(optimized_metrics.shared_buffer_reads or 0),
                )

            # ── 6. Caching Analysis ──────────────────────────────────────────
            caching_analysis = analyze_caching(original_metrics)

            # ── 7. ML Prediction Comparison ──────────────────────────────────
            ml_comparison = compare_with_ml_prediction(
                request.original_sql,
                original_metrics.warm_median_execution_time_ms,
            )

            result = BenchmarkComparisonResult(
                benchmark_id=benchmark_id,
                original_sql=request.original_sql,
                optimized_sql=request.optimized_sql,
                applied_index_sql=request.index_sql,
                environment=opt_env,
                original_metrics=original_metrics,
                optimized_metrics=optimized_metrics,
                equivalence=equivalence,
                execution_time_improvement_pct=exec_improvement,
                planner_cost_improvement_pct=cost_improvement,
                buffer_read_improvement_pct=reads_improvement,
                caching_analysis=caching_analysis,
                ml_comparison=ml_comparison,
                created_at=created_at,
            )

            # ── 8. Persist to Application DB ─────────────────────────────────
            if request.save_to_history:
                self._persist_benchmark(result, request.connection_id)

            return result

        finally:
            if raw_pg_conn is not None:
                try:
                    raw_pg_conn.close()
                except Exception:
                    pass
            if sqlite_conn is not None:
                try:
                    sqlite_conn.close()
                except Exception:
                    pass

    def _persist_benchmark(
        self, result: BenchmarkComparisonResult, connection_id: str | None
    ) -> None:
        """Store the benchmark run in benchmark_history and QueryHistory."""
        try:
            record = BenchmarkHistory(
                id=result.benchmark_id,
                connection_id=connection_id,
                original_sql=result.original_sql,
                optimized_sql=result.optimized_sql,
                applied_index_sql=result.applied_index_sql,
                environment=result.environment,
                original_exec_time_ms=result.original_metrics.warm_median_execution_time_ms,
                optimized_exec_time_ms=(
                    result.optimized_metrics.warm_median_execution_time_ms
                    if result.optimized_metrics
                    else None
                ),
                exec_time_improvement_pct=result.execution_time_improvement_pct,
                planner_cost_improvement_pct=result.planner_cost_improvement_pct,
                buffer_read_improvement_pct=result.buffer_read_improvement_pct,
                results_match=result.equivalence.results_match if result.equivalence else None,
                full_telemetry_json=result.model_dump_json(),
            )
            self.db.add(record)

            # Also seed QueryHistory with is_benchmark=True for future ML training grounding
            qh = QueryHistory(
                id=str(uuid.uuid4()),
                connection_id=connection_id,
                sql_query=result.original_sql,
                execution_time_ms=result.original_metrics.warm_median_execution_time_ms,
                planning_time_ms=result.original_metrics.planning_time_ms,
                is_benchmark=True,
            )
            self.db.add(qh)

            self.db.commit()
            logger.info("Persisted benchmark run %s to history", result.benchmark_id)
        except Exception as exc:
            logger.warning("Failed to persist benchmark to history: %s", exc)
            self.db.rollback()
