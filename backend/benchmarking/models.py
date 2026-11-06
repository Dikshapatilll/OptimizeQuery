"""Pydantic schemas for the Query Performance Benchmarking Module."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from benchmarking.validator import validate_select_query


class SingleRunTelemetry(BaseModel):
    """Telemetry captured from a single execution run."""

    run_index: int
    is_cold: bool = False
    execution_time_ms: float
    planning_time_ms: float | None = None
    planner_cost: float | None = None
    actual_rows: int | None = None
    buffer_reads: int | None = None  # Shared Read Blocks
    buffer_hits: int | None = None   # Shared Hit Blocks


class AggregateBenchmarkMetrics(BaseModel):
    """Aggregated statistical metrics across multiple benchmark runs."""

    runs_count: int
    cold_execution_time_ms: float | None = None
    warm_median_execution_time_ms: float
    mean_execution_time_ms: float
    std_dev_execution_time_ms: float
    min_execution_time_ms: float
    max_execution_time_ms: float

    # Planner and buffer metrics (representative run)
    planning_time_ms: float | None = None
    estimated_planner_cost: float | None = None
    actual_rows: int | None = None
    shared_buffer_reads: int | None = None
    shared_buffer_hits: int | None = None
    cache_hit_ratio: float | None = None
    cache_state_provenance: str = "Trial 1 reflects initial execution latency before repeated memory buffer hits. OS/DB buffer caches are not physically dropped without elevated OS privileges."

    raw_runs: list[SingleRunTelemetry] = []


class EquivalenceDiff(BaseModel):
    """Row difference between original and optimized queries."""

    row_number: int
    original_row: list[Any]
    optimized_row: list[Any]


class EquivalenceResult(BaseModel):
    """Result-set equivalence verification."""

    results_match: bool
    rows_compared: int
    original_row_count: int
    optimized_row_count: int
    first_diff: EquivalenceDiff | None = None
    original_error: str | None = None
    optimized_error: str | None = None
    is_bounded_check: bool = True
    order_by_checked: bool = False
    equivalence_note: str = "Bounded check over sample rows; does not constitute complete formal equivalence proof across all possible database states."


class CachingAnalysis(BaseModel):
    """Analysis of PostgreSQL or OS caching effects across benchmark runs."""

    cold_time_ms: float | None = None
    warm_median_time_ms: float
    cache_speedup_factor: float | None = None  # cold_time / warm_median_time
    cold_cache_hit_ratio: float | None = None
    warm_cache_hit_ratio: float | None = None
    caching_effect_summary: str


class MLBenchmarkComparison(BaseModel):
    """Comparison between ML pre-execution prediction and actual benchmark measurement."""

    ml_predicted_time_ms: float
    actual_measured_time_ms: float
    prediction_error_ms: float
    relative_error_pct: float
    latency_tier_predicted: str
    is_prediction_accurate_within_30pct: bool
    provenance_note: str = "ML prediction is distinct from actual benchmark measurement."


class BenchmarkComparisonResult(BaseModel):
    """Full benchmark comparison between original and optimized queries/indexes."""

    benchmark_id: str
    query_id: str | None = None
    original_sql: str
    optimized_sql: str | None = None
    applied_index_sql: str | None = None
    environment: str  # "controlled_sqlite_sandbox" | "postgresql_isolated_transaction" | "postgresql_hypopg"

    original_metrics: AggregateBenchmarkMetrics
    optimized_metrics: AggregateBenchmarkMetrics | None = None
    equivalence: EquivalenceResult | None = None

    # Improvement percentages (positive = improvement, negative = regression)
    execution_time_improvement_pct: float | None = None
    planner_cost_improvement_pct: float | None = None
    buffer_read_improvement_pct: float | None = None

    caching_analysis: CachingAnalysis
    ml_comparison: MLBenchmarkComparison | None = None
    created_at: str


class BenchmarkRunRequest(BaseModel):
    """Request to benchmark original query against optimized SQL or an index recommendation."""

    original_sql: str = Field(..., min_length=1)
    optimized_sql: str | None = None
    index_sql: str | None = None
    connection_id: str | None = None
    num_runs: int = Field(default=5, ge=2, le=15)
    row_limit_for_equivalence: int = Field(default=100, ge=1, le=1000)
    save_to_history: bool = True

    @field_validator("original_sql")
    @classmethod
    def strip_original_sql(cls, v: str) -> str:
        return validate_select_query(v)

    @field_validator("optimized_sql")
    @classmethod
    def strip_opt_sql(cls, v: str | None) -> str | None:
        return validate_select_query(v) if v else None

    @field_validator("index_sql")
    @classmethod
    def strip_idx_sql(cls, v: str | None) -> str | None:
        if not v:
            return None
        v = v.strip()
        if not v.upper().startswith("CREATE INDEX") and not v.upper().startswith("CREATE UNIQUE INDEX"):
            raise ValueError("index_sql must be a CREATE INDEX statement")
        return v


class BenchmarkHistoryItem(BaseModel):
    """Summary item for historical benchmark runs."""

    id: str
    connection_id: str | None = None
    original_sql: str
    optimized_sql: str | None = None
    applied_index_sql: str | None = None
    environment: str
    original_exec_time_ms: float
    optimized_exec_time_ms: float | None = None
    exec_time_improvement_pct: float | None = None
    planner_cost_improvement_pct: float | None = None
    buffer_read_improvement_pct: float | None = None
    results_match: bool | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
