"""Pydantic schemas for the OR optimization engine.

Decision variables, objectives, scored alternatives, and index selection results.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


# ────────────────────────────  Objective definitions  ─────────────────────────


class ObjectiveName(str, Enum):
    """Measurable objectives for multi-objective query optimization."""

    EXECUTION_TIME = "execution_time"
    PLANNER_COST = "planner_cost"
    BUFFER_READS = "buffer_reads"
    BUFFER_HITS = "buffer_hits"
    BUFFER_ACCESSES = "buffer_accesses"  # maintained as backwards-compatible alias


# Default weight vector — four strictly independent, non-overlapping objectives
DEFAULT_WEIGHTS: dict[str, float] = {
    ObjectiveName.EXECUTION_TIME: 0.40,
    ObjectiveName.PLANNER_COST: 0.30,
    ObjectiveName.BUFFER_READS: 0.20,
    ObjectiveName.BUFFER_HITS: 0.10,
}


class ObjectiveDefinition(BaseModel):
    """Description of a single measurable objective."""

    name: ObjectiveName
    description: str
    unit: str
    direction: Literal["minimize", "maximize"] = "minimize"
    weight: float = Field(ge=0.0, le=1.0)


# ────────────────────────────  Alternative metrics  ──────────────────────────


class AlternativeMetrics(BaseModel):
    """Raw (un-normalised) metric values for one optimization alternative."""

    execution_time_ms: float | None = None
    planner_cost: float | None = None
    buffer_reads: int | None = None
    buffer_hits: int | None = None
    total_buffer_accesses: int | None = None

    def get_total_buffer_accesses(self) -> int | None:
        """Return total buffer block accesses (shared reads + shared hits)."""
        if self.total_buffer_accesses is not None:
            return self.total_buffer_accesses
        if self.buffer_reads is not None or self.buffer_hits is not None:
            return (self.buffer_reads or 0) + (self.buffer_hits or 0)
        return None


class NormalisedMetrics(BaseModel):
    """Min-max normalised values in [0, 1] for each objective."""

    execution_time: float | None = None
    planner_cost: float | None = None
    buffer_reads: float | None = None
    buffer_accesses: float | None = None
    buffer_hits: float | None = None


# ────────────────────────────  Score details  ────────────────────────────────


class ObjectiveScoreDetail(BaseModel):
    """Detailed scoring components for a single objective."""

    objective: str
    original_value: float | None = None
    optimized_value: float | None = None
    direction: Literal["minimize", "maximize"] = "minimize"
    normalized_penalty: float | None = None
    active_weight: float = 0.0
    weighted_contribution: float = 0.0


# ────────────────────────────  Scored alternative  ────────────────────────────


class ScoredAlternative(BaseModel):
    """A ranked optimization alternative with its score breakdown."""

    rank: int
    category: str  # "index" | "rewrite" | "materialized_view" | "statistics" | "configuration"
    sql: str | None = None
    explanation: str
    estimated_impact: str  # "high" | "medium" | "low"

    # Objective metrics
    raw_metrics: AlternativeMetrics
    normalised_metrics: NormalisedMetrics
    weighted_score: float = Field(
        ..., description="Lower is better (all objectives are minimised after normalisation)."
    )
    score_breakdown: dict[str, float] = Field(
        default_factory=dict,
        description="Per-objective weighted contribution to the final score.",
    )
    detailed_breakdown: list[ObjectiveScoreDetail] = Field(
        default_factory=list,
        description="Full breakdown including original, optimized, direction, penalty, weight, and contribution.",
    )
    score_explanation: str = ""

    # ML prediction provenance
    ml_predicted_time_ms: float | None = Field(
        None,
        description="ML-predicted execution time. Clearly distinct from actual measurement.",
    )
    is_ml_prediction: bool = Field(
        False,
        description="True when execution_time_ms was derived from the ML model rather than measurement.",
    )


# ────────────────────────────  Index selection  ──────────────────────────────


class IndexCandidate(BaseModel):
    """A candidate index under consideration by the index-selection model."""

    index_id: int
    sql: str
    explanation: str
    estimated_size_bytes: float
    estimated_cost_reduction: float = Field(
        ..., description="Estimated reduction in planner cost (dimensionless)."
    )
    selected: bool = False
    is_estimated_size: bool = True
    size_provenance: str = "Estimated from catalog row counts and column width statistics (B-tree node overhead multiplier ~3x). Not actual physical file size."


class IndexSelectionResult(BaseModel):
    """Result of the constrained index-selection optimisation."""

    solver_status: str  # "Optimal", "Infeasible", "Not Solved"
    selected_indexes: list[IndexCandidate]
    rejected_indexes: list[IndexCandidate]
    total_size_bytes: float
    budget_bytes: float
    budget_utilisation_pct: float
    objective_value: float = Field(
        ..., description="Objective function value (sum of cost reductions of selected indexes)."
    )
    formulation: dict[str, Any] = Field(
        default_factory=dict,
        description="Mathematical formulation: decision variables, objective, constraints.",
    )


# ────────────────────────────  API request / response  ────────────────────────


class OROptimizeRequest(BaseModel):
    """Request to rank optimization alternatives using multi-objective scoring."""

    sql: str = Field(..., min_length=1)
    connection_id: str | None = None
    weights: dict[str, float] | None = Field(
        None,
        description="Custom weight vector. Keys are ObjectiveName values. Must sum to ~1.0.",
    )
    include_ml_prediction: bool = True
    # Client-provided analysis result (for playground / offline mode)
    analysis_result_json: str | None = Field(
        None,
        description="JSON-serialised AnalysisResult from a previous /analyze call.",
    )
    explain_plan_json: str | None = Field(
        None,
        description="JSON-serialised EXPLAIN ANALYZE plan (PostgreSQL FORMAT JSON).",
    )


class OROptimizeResponse(BaseModel):
    """Ranked optimization alternatives with scoring metadata."""

    query_id: str
    alternatives: list[ScoredAlternative]
    weights_used: dict[str, float]
    objectives: list[ObjectiveDefinition]
    normalisation_method: str = "min-max"
    scoring_algorithm: str = "weighted-sum"
    total_alternatives: int
    ml_prediction_available: bool = False


class ORConfigResponse(BaseModel):
    """Current OR engine configuration."""

    default_weights: dict[str, float]
    objectives: list[ObjectiveDefinition]
    normalisation_method: str
    scoring_algorithm: str


class IndexSelectionRequest(BaseModel):
    """Request for constrained index-selection optimisation."""

    sql: str = Field(..., min_length=1)
    connection_id: str | None = None
    budget_mb: float = Field(
        default=500.0, gt=0, description="Maximum total index storage budget in MB."
    )
    analysis_result_json: str | None = None


class IndexSelectionResponse(BaseModel):
    """Response from the index-selection optimiser."""

    query_id: str
    result: IndexSelectionResult
    budget_mb: float
