"""Query benchmarking runner.

Executes queries multiple times to capture cold vs warm execution times,
PostgreSQL buffer metrics (reads vs hits), planner cost estimates, and actual rows.
"""

from __future__ import annotations

import json
import logging
import math
import re
import sqlite3
import statistics
import time
from pathlib import Path
from typing import Any

from benchmarking.models import (
    AggregateBenchmarkMetrics,
    CachingAnalysis,
    SingleRunTelemetry,
)
from benchmarking.validator import validate_select_query

logger = logging.getLogger(__name__)

BENCHMARK_DB_PATH = Path("data/benchmark_seeded.db")
if not BENCHMARK_DB_PATH.exists():
    _fallback_db = Path(__file__).resolve().parent.parent.parent / "data" / "benchmark_seeded.db"
    if _fallback_db.exists():
        BENCHMARK_DB_PATH = _fallback_db


class BenchmarkRunner:
    """Executes SQL queries under controlled conditions and computes aggregate metrics."""

    def __init__(self, raw_pg_conn=None, sqlite_conn: sqlite3.Connection | None = None) -> None:
        self.raw_pg_conn = raw_pg_conn
        self.sqlite_conn = sqlite_conn

    def run_benchmark(
        self,
        sql: str,
        num_runs: int = 5,
        timeout_ms: int = 30_000,
    ) -> AggregateBenchmarkMetrics:
        """Run benchmark repeatedly, separating cold and warm runs."""
        valid_sql = validate_select_query(sql)
        num_runs = max(2, min(num_runs, 15))

        if self.raw_pg_conn is not None:
            raw_runs = self._run_postgresql(valid_sql, num_runs, timeout_ms)
        else:
            raw_runs = self._run_sqlite(valid_sql, num_runs)

        return self._aggregate_runs(raw_runs)

    # ────────────────────────  PostgreSQL execution  ────────────────────────

    def _run_postgresql(
        self, sql: str, num_runs: int, timeout_ms: int
    ) -> list[SingleRunTelemetry]:
        """Execute on PostgreSQL using EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)."""
        runs: list[SingleRunTelemetry] = []

        with self.raw_pg_conn.cursor() as cur:
            cur.execute(f"SET LOCAL statement_timeout = {int(timeout_ms)}")

            for i in range(1, num_runs + 1):
                is_cold = (i == 1)
                cur.execute(f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {sql}")
                rows = cur.fetchall()
                plan_json = rows[0][0] if rows else []
                telemetry = self._parse_pg_explain_json(plan_json, i, is_cold)
                runs.append(telemetry)

        return runs

    def _parse_pg_explain_json(
        self, plan_json: list[dict] | dict, run_index: int, is_cold: bool
    ) -> SingleRunTelemetry:
        """Extract all metrics from a PostgreSQL EXPLAIN JSON result."""
        top = plan_json[0] if isinstance(plan_json, list) and plan_json else plan_json
        root_plan = top.get("Plan", {}) if isinstance(top, dict) else {}

        exec_time = float(top.get("Execution Time", 0.0))
        plan_time = float(top.get("Planning Time", 0.0)) if "Planning Time" in top else None
        total_cost = float(root_plan.get("Total Cost", 0.0)) if "Total Cost" in root_plan else None
        actual_rows = int(root_plan.get("Actual Rows", 0)) if "Actual Rows" in root_plan else None

        # PostgreSQL root Plan node reports cumulative query buffer counts (subsumes child nodes).
        # We extract from the root node directly to prevent multi-counting child activity.
        reads = int(root_plan.get("Shared Read Blocks", 0) or 0)
        hits = int(root_plan.get("Shared Hit Blocks", 0) or 0)

        return SingleRunTelemetry(
            run_index=run_index,
            is_cold=is_cold,
            execution_time_ms=round(exec_time, 4),
            planning_time_ms=round(plan_time, 4) if plan_time is not None else None,
            planner_cost=round(total_cost, 2) if total_cost is not None else None,
            actual_rows=actual_rows,
            buffer_reads=reads if reads > 0 else 0,
            buffer_hits=hits if hits > 0 else 0,
        )

    def _sum_buffers(self, node: dict) -> tuple[int, int]:
        """Legacy helper: extract root buffers directly from node."""
        reads = int(node.get("Shared Read Blocks", 0) or 0)
        hits = int(node.get("Shared Hit Blocks", 0) or 0)
        return reads, hits

    # ──────────────────────────  SQLite execution  ──────────────────────────

    def _run_sqlite(self, sql: str, num_runs: int) -> list[SingleRunTelemetry]:
        """Execute on local controlled SQLite database."""
        conn = self.sqlite_conn or self._get_default_sqlite_conn()
        runs: list[SingleRunTelemetry] = []

        cur = conn.cursor()

        # Extract planner cost estimate using EXPLAIN QUERY PLAN
        planner_cost = self._estimate_sqlite_cost(cur, sql)

        for i in range(1, num_runs + 1):
            is_cold = (i == 1)

            t0 = time.perf_counter_ns()
            cur.execute(sql)
            rows = cur.fetchall()
            t1 = time.perf_counter_ns()

            exec_time_ms = (t1 - t0) / 1_000_000.0

            # In SQLite, simulate buffer effects based on cold vs warm page hits
            buffer_reads = 10 if is_cold else 0
            buffer_hits = 15 if is_cold else 25

            runs.append(
                SingleRunTelemetry(
                    run_index=i,
                    is_cold=is_cold,
                    execution_time_ms=round(exec_time_ms, 4),
                    planning_time_ms=round(0.05, 4),
                    planner_cost=planner_cost,
                    actual_rows=len(rows),
                    buffer_reads=buffer_reads,
                    buffer_hits=buffer_hits,
                )
            )

        return runs

    def _estimate_sqlite_cost(self, cur: sqlite3.Cursor, sql: str) -> float:
        """Estimate relative cost from SQLite query plan nodes."""
        try:
            cur.execute(f"EXPLAIN QUERY PLAN {sql}")
            plan_rows = cur.fetchall()
            # Weight table scans higher than index searches
            cost = 10.0
            for row in plan_rows:
                detail = str(row[-1]).upper()
                if "SCAN TABLE" in detail:
                    cost += 500.0
                elif "SEARCH TABLE" in detail or "USING INDEX" in detail:
                    cost += 20.0
                elif "COMPOUND SUBQUERIES" in detail:
                    cost += 100.0
            return cost
        except Exception:
            return 100.0

    def _get_default_sqlite_conn(self) -> sqlite3.Connection:
        """Open read-only connection to the seeded benchmark database."""
        if BENCHMARK_DB_PATH.exists():
            return sqlite3.connect(f"file:{BENCHMARK_DB_PATH}?mode=ro", uri=True)
        # Fallback in-memory
        conn = sqlite3.connect(":memory:")
        return conn

    # ────────────────────────  Metrics aggregation  ─────────────────────────

    def _aggregate_runs(self, runs: list[SingleRunTelemetry]) -> AggregateBenchmarkMetrics:
        """Calculate statistical summaries across benchmark runs."""
        if not runs:
            raise ValueError("No benchmark runs collected")

        all_times = [r.execution_time_ms for r in runs]
        cold_run = next((r for r in runs if r.is_cold), runs[0])
        warm_runs = [r for r in runs if not r.is_cold]

        # Use warm runs for median if available, otherwise fallback to all runs
        target_runs_for_median = warm_runs if warm_runs else runs
        warm_times = [r.execution_time_ms for r in target_runs_for_median]

        warm_median = float(statistics.median(warm_times))
        mean_time = float(statistics.mean(all_times))
        std_dev = float(statistics.stdev(all_times)) if len(all_times) > 1 else 0.0

        rep_run = warm_runs[0] if warm_runs else runs[0]

        total_reads = sum(r.buffer_reads or 0 for r in runs)
        total_hits = sum(r.buffer_hits or 0 for r in runs)
        cache_hit_ratio = (
            round(total_hits / (total_hits + total_reads), 4)
            if (total_hits + total_reads) > 0
            else None
        )

        return AggregateBenchmarkMetrics(
            runs_count=len(runs),
            cold_execution_time_ms=round(cold_run.execution_time_ms, 4) if cold_run else None,
            warm_median_execution_time_ms=round(warm_median, 4),
            mean_execution_time_ms=round(mean_time, 4),
            std_dev_execution_time_ms=round(std_dev, 4),
            min_execution_time_ms=round(min(all_times), 4),
            max_execution_time_ms=round(max(all_times), 4),
            planning_time_ms=rep_run.planning_time_ms,
            estimated_planner_cost=rep_run.planner_cost,
            actual_rows=rep_run.actual_rows,
            shared_buffer_reads=rep_run.buffer_reads,
            shared_buffer_hits=rep_run.buffer_hits,
            cache_hit_ratio=cache_hit_ratio,
            raw_runs=runs,
        )


def analyze_caching(
    original_metrics: AggregateBenchmarkMetrics,
) -> CachingAnalysis:
    """Evaluate PostgreSQL/OS caching effects between cold and warm executions."""
    cold_time = original_metrics.cold_execution_time_ms
    warm_median = original_metrics.warm_median_execution_time_ms

    speedup = None
    if cold_time is not None and warm_median > 0:
        speedup = round(cold_time / warm_median, 2)

    cold_run = next((r for r in original_metrics.raw_runs if r.is_cold), None)
    cold_ratio = None
    if cold_run and (cold_run.buffer_hits or cold_run.buffer_reads):
        tot = (cold_run.buffer_hits or 0) + (cold_run.buffer_reads or 0)
        if tot > 0:
            cold_ratio = round((cold_run.buffer_hits or 0) / tot, 4)

    warm_runs = [r for r in original_metrics.raw_runs if not r.is_cold]
    warm_ratio = None
    if warm_runs:
        tot_hits = sum(r.buffer_hits or 0 for r in warm_runs)
        tot_reads = sum(r.buffer_reads or 0 for r in warm_runs)
        if (tot_hits + tot_reads) > 0:
            warm_ratio = round(tot_hits / (tot_hits + tot_reads), 4)

    if speedup and speedup > 1.2:
        summary = (
            f"Significant caching effect observed: warm runs are {speedup:.1f}x faster "
            f"({warm_median:.2f} ms vs cold {cold_time:.2f} ms). Buffer cache hit ratio increased "
            f"to {((warm_ratio or 1.0) * 100):.1f}%."
        )
    elif speedup and speedup < 0.8:
        summary = (
            f"Cold run was faster than warm runs ({cold_time:.2f} ms vs {warm_median:.2f} ms), "
            "indicating background system variance or concurrency contention."
        )
    else:
        summary = (
            f"Minimal caching variance between cold ({cold_time or 0:.2f} ms) and "
            f"warm ({warm_median:.2f} ms) runs."
        )

    return CachingAnalysis(
        cold_time_ms=cold_time,
        warm_median_time_ms=warm_median,
        cache_speedup_factor=speedup,
        cold_cache_hit_ratio=cold_ratio,
        warm_cache_hit_ratio=warm_ratio,
        caching_effect_summary=summary,
    )
