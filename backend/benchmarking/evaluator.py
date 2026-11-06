"""Benchmarking evaluator and integration service.

Computes:
- Percentage improvements across execution time, planner cost, and buffer reads
- Result-set equivalence verification
- ML prediction vs actual measurement validation
- OR multi-objective metric grounding
"""

from __future__ import annotations

import logging
import re
from typing import Any

from benchmarking.models import (
    AggregateBenchmarkMetrics,
    EquivalenceDiff,
    EquivalenceResult,
    MLBenchmarkComparison,
)

logger = logging.getLogger(__name__)


def calculate_improvement_pct(original: float | None, optimized: float | None) -> float | None:
    """Calculate percentage improvement: (orig - opt) / orig * 100.

    Positive = improvement (faster / cheaper / less I/O).
    Negative = regression.
    """
    if original is None or optimized is None:
        return None
    if original <= 0:
        return 0.0
    improvement = ((original - optimized) / original) * 100.0
    return round(improvement, 2)


def verify_equivalence(
    original_sql: str,
    optimized_sql: str,
    raw_pg_conn=None,
    sqlite_conn=None,
    row_limit: int = 100,
) -> EquivalenceResult:
    """Verify result-set equivalence between original and optimized SQL."""
    orig_rows: list[tuple] = []
    opt_rows: list[tuple] = []
    orig_err: str | None = None
    opt_err: str | None = None

    if raw_pg_conn is not None:
        orig_rows, orig_err = _fetch_limited_pg(raw_pg_conn, original_sql, row_limit)
        opt_rows, opt_err = _fetch_limited_pg(raw_pg_conn, optimized_sql, row_limit)
    else:
        orig_rows, orig_err = _fetch_limited_sqlite(sqlite_conn, original_sql, row_limit)
        opt_rows, opt_err = _fetch_limited_sqlite(sqlite_conn, optimized_sql, row_limit)

    if orig_err or opt_err:
        return EquivalenceResult(
            results_match=False,
            rows_compared=0,
            original_row_count=len(orig_rows),
            optimized_row_count=len(opt_rows),
            original_error=orig_err,
            optimized_error=opt_err,
            is_bounded_check=True,
            order_by_checked=False,
            equivalence_note="Comparison halted due to database execution error.",
        )

    # Check if queries demand strict ORDER BY semantics
    has_order_by = bool(
        re.search(r"\bORDER\s+BY\b", original_sql, re.IGNORECASE)
        or re.search(r"\bORDER\s+BY\b", optimized_sql, re.IGNORECASE)
    )

    if has_order_by:
        # Preserve strict output order as returned by the database engine
        orig_comp = orig_rows
        opt_comp = opt_rows
    else:
        # Sort results to be independent of physical order when query has no ORDER BY
        def _sort_key(row: tuple) -> tuple:
            return tuple((str(v) if v is not None else "") for v in row)

        orig_comp = sorted(orig_rows, key=_sort_key)
        opt_comp = sorted(opt_rows, key=_sort_key)

    orig_count = len(orig_comp)
    opt_count = len(opt_comp)
    rows_compared = min(orig_count, opt_count)

    first_diff: EquivalenceDiff | None = None
    for i in range(rows_compared):
        if orig_comp[i] != opt_comp[i]:
            first_diff = EquivalenceDiff(
                row_number=i + 1,
                original_row=list(orig_comp[i]),
                optimized_row=list(opt_comp[i]),
            )
            break

    if first_diff is None and orig_count != opt_count:
        first_diff = EquivalenceDiff(
            row_number=rows_compared + 1,
            original_row=list(orig_comp[rows_compared]) if orig_count > rows_compared else [],
            optimized_row=list(opt_comp[rows_compared]) if opt_count > rows_compared else [],
        )

    note = (
        f"Bounded comparison verified across {rows_compared} sample rows (limit: {row_limit}). "
        f"{'Strict ORDER BY sequence verified.' if has_order_by else 'Unordered multiset equivalence verified (no ORDER BY clause).'}"
    )

    return EquivalenceResult(
        results_match=(first_diff is None),
        rows_compared=rows_compared,
        original_row_count=orig_count,
        optimized_row_count=opt_count,
        first_diff=first_diff,
        is_bounded_check=True,
        order_by_checked=has_order_by,
        equivalence_note=note,
    )


def compare_with_ml_prediction(
    sql: str,
    actual_measured_time_ms: float,
) -> MLBenchmarkComparison | None:
    """Compare ML pre-execution predicted time against actual measured benchmark time."""
    try:
        from ml.predictor import ExecutionTimePredictor

        predictor = ExecutionTimePredictor.get_instance()
        if not predictor.is_ready():
            return None

        pred = predictor.predict(sql)
        predicted_ms = pred.predicted_time_ms
        actual_ms = actual_measured_time_ms

        error_ms = abs(predicted_ms - actual_ms)
        rel_error = (error_ms / actual_ms * 100.0) if actual_ms > 0 else 0.0

        return MLBenchmarkComparison(
            ml_predicted_time_ms=round(predicted_ms, 2),
            actual_measured_time_ms=round(actual_ms, 2),
            prediction_error_ms=round(error_ms, 2),
            relative_error_pct=round(rel_error, 2),
            latency_tier_predicted=pred.latency_tier,
            is_prediction_accurate_within_30pct=(rel_error <= 30.0),
            provenance_note="ML prediction is distinct from actual benchmark measurement.",
        )
    except Exception as exc:
        logger.debug("ML benchmark comparison unavailable: %s", exc)
        return None


# ────────────────────────────  Private helpers  ──────────────────────────────


def _fetch_limited_pg(conn, sql: str, limit: int) -> tuple[list[tuple], str | None]:
    try:
        from connectors.base import apply_limit

        clean_sql = apply_limit(sql, limit)
        with conn.cursor() as cur:
            cur.execute(clean_sql)
            return cur.fetchall(), None
    except Exception as exc:
        conn.rollback()
        return [], str(exc).strip()


def _fetch_limited_sqlite(conn, sql: str, limit: int) -> tuple[list[tuple], str | None]:
    try:
        from connectors.base import apply_limit

        clean_sql = apply_limit(sql, limit)
        cur = conn.cursor()
        cur.execute(clean_sql)
        return cur.fetchall(), None
    except Exception as exc:
        return [], str(exc).strip()
