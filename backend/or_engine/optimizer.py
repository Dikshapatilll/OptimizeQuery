"""Main OR orchestrator.

Takes an ``AnalysisResult`` (from the LLM analyser), optional EXPLAIN plan
metrics, and optional ML-predicted execution time, then:

1. Extracts baseline metrics from the EXPLAIN plan.
2. Builds an ``AlternativeMetrics`` for each suggestion (index, rewrite, etc.).
3. Integrates ML-predicted execution time when actual measurement is unavailable.
4. Feeds alternatives into the multi-objective scorer.
5. Returns ranked ``ScoredAlternative`` list.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from or_engine.models import (
    AlternativeMetrics,
    DEFAULT_WEIGHTS,
    ObjectiveName,
    ScoredAlternative,
)
from or_engine.objectives import (
    OBJECTIVE_DEFINITIONS,
    build_baseline_metrics,
    extract_metrics_from_plan,
)
from or_engine.scoring import normalise_and_score

logger = logging.getLogger(__name__)

# Impact multipliers — map estimated_impact strings to cost adjustment factors.
# "high" impact → larger estimated cost reduction → lower planner cost after applying.
IMPACT_FACTOR = {
    "high": 0.30,    # expected ~30 % improvement
    "medium": 0.15,
    "low": 0.05,
}


def optimize(
    analysis_result: dict,
    explain_plan_json: str | None = None,
    explain_execution_time_ms: float | None = None,
    explain_planning_time_ms: float | None = None,
    ml_predicted_time_ms: float | None = None,
    weights: dict[str, float] | None = None,
) -> list[ScoredAlternative]:
    """Run multi-objective scoring on the alternatives from an analysis result.

    Parameters
    ----------
    analysis_result:
        Dict representation of ``AnalysisResult`` (from ``.model_dump()`` or JSON).
    explain_plan_json:
        Raw EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) plan string.
    explain_execution_time_ms:
        Actual measured execution time (from ``ExplainResult``).
    explain_planning_time_ms:
        Actual measured planning time.
    ml_predicted_time_ms:
        ML-model predicted execution time (clearly distinct from measurement).
    weights:
        Custom weight vector.

    Returns
    -------
    Sorted list of ``ScoredAlternative`` (best first).
    """
    # ── Baseline metrics from EXPLAIN ────────────────────────────────────────
    baseline = build_baseline_metrics(
        explain_plan_json,
        explain_execution_time_ms,
        explain_planning_time_ms,
    )

    # ── Build alternatives ───────────────────────────────────────────────────
    alternatives: list[dict] = []

    suggestion_categories = [
        ("index", "indexes"),
        ("rewrite", "rewrites"),
        ("materialized_view", "materialized_views"),
        ("statistics", "statistics"),
    ]

    for category, key in suggestion_categories:
        items = analysis_result.get(key, [])
        for item in items:
            alt = _build_alternative(
                category=category,
                item=item,
                baseline=baseline,
                ml_predicted_time_ms=ml_predicted_time_ms,
            )
            alternatives.append(alt)

    # Configuration items (different schema: parameter-based)
    for cfg in analysis_result.get("configuration", []):
        alt = _build_config_alternative(cfg, baseline, ml_predicted_time_ms)
        alternatives.append(alt)

    if not alternatives:
        return []

    return normalise_and_score(alternatives, weights, baseline=baseline)


# ────────────────────────────  Private helpers  ──────────────────────────────


def _build_alternative(
    category: str,
    item: dict,
    baseline: AlternativeMetrics,
    ml_predicted_time_ms: float | None,
) -> dict:
    """Build an alternative dict ready for the scorer."""
    impact_str = item.get("estimated_impact", "low").lower()
    factor = IMPACT_FACTOR.get(impact_str, 0.05)

    is_ml = False

    # Check if actual benchmarked metrics are already attached to this recommendation
    if "benchmarked_metrics" in item and isinstance(item["benchmarked_metrics"], dict):
        bm = item["benchmarked_metrics"]
        reads = bm.get("buffer_reads")
        hits = bm.get("buffer_hits")
        accesses = bm.get("total_buffer_accesses")
        if accesses is None and (reads is not None or hits is not None):
            accesses = (reads or 0) + (hits or 0)
        metrics = AlternativeMetrics(
            execution_time_ms=bm.get("execution_time_ms"),
            planner_cost=bm.get("planner_cost"),
            buffer_reads=reads,
            buffer_hits=hits,
            total_buffer_accesses=accesses,
        )
    else:
        # Estimate post-optimisation metrics by applying the impact factor to baseline
        metrics = _estimate_post_optimisation_metrics(baseline, factor)

        # Determine execution time source
        if metrics.execution_time_ms is None and ml_predicted_time_ms is not None:
            # Use ML prediction as a fallback — clearly flagged
            metrics.execution_time_ms = ml_predicted_time_ms * (1 - factor)
            is_ml = True

    return {
        "category": category,
        "sql": item.get("sql"),
        "explanation": item.get("explanation", ""),
        "estimated_impact": impact_str,
        "raw_metrics": metrics,
        "ml_predicted_time_ms": ml_predicted_time_ms if is_ml else None,
        "is_ml_prediction": is_ml,
    }


def _build_config_alternative(
    cfg: dict,
    baseline: AlternativeMetrics,
    ml_predicted_time_ms: float | None,
) -> dict:
    """Build an alternative dict for a configuration suggestion."""
    impact_str = cfg.get("estimated_impact", "low").lower()
    factor = IMPACT_FACTOR.get(impact_str, 0.05)
    metrics = _estimate_post_optimisation_metrics(baseline, factor)

    is_ml = False
    if metrics.execution_time_ms is None and ml_predicted_time_ms is not None:
        metrics.execution_time_ms = ml_predicted_time_ms * (1 - factor)
        is_ml = True

    param = cfg.get("parameter", "unknown")
    recommended = cfg.get("recommended_value", "")
    explanation = cfg.get("explanation", "")

    return {
        "category": "configuration",
        "sql": None,
        "explanation": f"Set {param} = {recommended}. {explanation}",
        "estimated_impact": impact_str,
        "raw_metrics": metrics,
        "ml_predicted_time_ms": ml_predicted_time_ms if is_ml else None,
        "is_ml_prediction": is_ml,
    }


def _estimate_post_optimisation_metrics(
    baseline: AlternativeMetrics,
    improvement_factor: float,
) -> AlternativeMetrics:
    """Estimate metrics after applying an optimisation with a given improvement factor.

    The improvement factor (0.0 – 1.0) represents the expected percentage reduction.
    For example, factor=0.30 means ~30% improvement → metric becomes 70% of baseline.
    """
    multiplier = 1.0 - improvement_factor
    base_accesses = baseline.get_total_buffer_accesses()

    return AlternativeMetrics(
        execution_time_ms=(
            baseline.execution_time_ms * multiplier
            if baseline.execution_time_ms is not None
            else None
        ),
        planner_cost=(
            baseline.planner_cost * multiplier
            if baseline.planner_cost is not None
            else None
        ),
        buffer_reads=(
            int(baseline.buffer_reads * multiplier)
            if baseline.buffer_reads is not None
            else None
        ),
        buffer_hits=(
            int(baseline.buffer_hits * multiplier)
            if baseline.buffer_hits is not None
            else None
        ),
        total_buffer_accesses=(
            int(base_accesses * multiplier)
            if base_accesses is not None
            else None
        ),
    )
