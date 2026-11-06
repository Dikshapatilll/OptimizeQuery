"""Multi-objective scoring engine.

Implements min-max normalisation and weighted-sum scoring across the four
measurable objectives.  All objectives are formulated in a *minimisation* direction
(lower value = lower penalty) so that a lower ``weighted_score`` always indicates a
superior alternative.

Objective Formulation (Alternative B - Total Buffer Access Minimisation)
------------------------------------------------------------------------
1. execution_time (ms): Minimize execution latency.
2. planner_cost (cost units): Minimize PostgreSQL optimizer estimated cost.
3. buffer_reads (blocks): Minimize disk block reads (I/O penalty).
4. buffer_accesses (blocks): Minimize total shared buffer block touches
   (shared_buffer_reads + shared_buffer_hits, 8 KiB per block). Lower buffer
   touches reduce CPU cache churn and buffer lock contention.

Normalisation method
--------------------
Min-max normalisation across the evaluated set (including baseline where available):

    normalised = (x - x_min) / (x_max - x_min)     if x_max ≠ x_min
    normalised = 0.0                                 if x_max = x_min (all equal)

All objectives are minimised directly: lower x gives a normalized value closer to 0.0.

Scoring algorithm
-----------------
Weighted sum:  score = Σ (w_i × normalised_i)

Lower score → superior optimization alternative.
"""

from __future__ import annotations

import logging
from typing import Sequence

from or_engine.models import (
    AlternativeMetrics,
    DEFAULT_WEIGHTS,
    NormalisedMetrics,
    ObjectiveName,
    ObjectiveScoreDetail,
    ScoredAlternative,
)

logger = logging.getLogger(__name__)


def normalise_and_score(
    alternatives: list[dict],
    weights: dict[str, float] | None = None,
    baseline: AlternativeMetrics | None = None,
) -> list[ScoredAlternative]:
    """Normalise metrics across alternatives and compute weighted scores.

    Parameters
    ----------
    alternatives:
        Each dict must contain at least:
        - ``category``, ``sql``, ``explanation``, ``estimated_impact``
        - ``raw_metrics``: an ``AlternativeMetrics`` instance
        Optional:
        - ``ml_predicted_time_ms``, ``is_ml_prediction``
    weights:
        Custom weight vector keyed by ``ObjectiveName`` values.
        Falls back to ``DEFAULT_WEIGHTS``.
    baseline:
        Optional baseline metrics for the original query before optimization.
        Used to compute relative score ranges and detailed score breakdowns.

    Returns
    -------
    List of ``ScoredAlternative`` sorted by ``weighted_score`` ascending (best first).
    """
    if not alternatives:
        return []

    w = _resolve_weights(weights)

    # ── Collect raw metric arrays across alternatives and baseline ─────────────
    raw_vals: dict[str, list[float | None]] = {
        ObjectiveName.EXECUTION_TIME: [],
        ObjectiveName.PLANNER_COST: [],
        ObjectiveName.BUFFER_READS: [],
        ObjectiveName.BUFFER_HITS: [],
    }

    all_metrics: list[AlternativeMetrics] = [alt["raw_metrics"] for alt in alternatives]
    if baseline is not None:
        all_metrics.append(baseline)

    for m in all_metrics:
        raw_vals[ObjectiveName.EXECUTION_TIME].append(m.execution_time_ms)
        raw_vals[ObjectiveName.PLANNER_COST].append(m.planner_cost)
        raw_vals[ObjectiveName.BUFFER_READS].append(
            float(m.buffer_reads) if m.buffer_reads is not None else None
        )
        raw_vals[ObjectiveName.BUFFER_HITS].append(
            float(m.buffer_hits) if m.buffer_hits is not None else None
        )

    # ── Compute min / max per objective (ignoring None) ──────────────────────
    ranges: dict[str, tuple[float, float]] = {}
    for key, vals in raw_vals.items():
        numeric = [v for v in vals if v is not None]
        if numeric:
            ranges[key] = (min(numeric), max(numeric))
        else:
            ranges[key] = (0.0, 0.0)

    # ── Build scored alternatives ────────────────────────────────────────────
    scored: list[ScoredAlternative] = []
    for alt in alternatives:
        m: AlternativeMetrics = alt["raw_metrics"]
        normed, breakdown, details, explanation_parts = _score_one(m, w, ranges, baseline)
        total = sum(d.weighted_contribution for d in details)
        scored.append(
            ScoredAlternative(
                rank=0,  # assigned after sorting
                category=alt["category"],
                sql=alt.get("sql"),
                explanation=alt["explanation"],
                estimated_impact=alt["estimated_impact"],
                raw_metrics=m,
                normalised_metrics=normed,
                weighted_score=round(total, 6),
                score_breakdown=breakdown,
                detailed_breakdown=details,
                score_explanation="; ".join(explanation_parts),
                ml_predicted_time_ms=alt.get("ml_predicted_time_ms"),
                is_ml_prediction=alt.get("is_ml_prediction", False),
            )
        )

    # Sort ascending (lower = better)
    scored.sort(key=lambda s: s.weighted_score)
    for i, s in enumerate(scored, 1):
        s.rank = i
        s.score_explanation += f" | Final Score: {s.weighted_score:.4f} (Rank {i})"

    return scored


# ────────────────────────────  Internal helpers  ─────────────────────────────


def _resolve_weights(custom: dict[str, float] | None) -> dict[str, float]:
    """Merge custom weights with defaults and re-normalise to sum=1."""
    w = dict(DEFAULT_WEIGHTS)
    if custom:
        mapped_custom = dict(custom)
        # Handle alias: buffer_accesses -> buffer_hits if buffer_hits not given
        if "buffer_accesses" in mapped_custom and "buffer_hits" not in mapped_custom:
            mapped_custom["buffer_hits"] = mapped_custom["buffer_accesses"]

        for k, v in mapped_custom.items():
            if k in w:
                w[k] = max(0.0, v)
            elif k == "buffer_accesses" and ObjectiveName.BUFFER_HITS in w:
                w[ObjectiveName.BUFFER_HITS] = max(0.0, v)

    total = sum(w.values())
    if total > 0:
        w = {k: v / total for k, v in w.items()}
    return w


def _normalise_value(
    val: float | None, lo: float, hi: float, maximize: bool = False
) -> float | None:
    """Min-max normalise a single value.  Returns None if the raw value is None.

    If maximize=True (higher is better), inverted to (hi - val)/(hi - lo) so
    lower normalised value represents better performance (minimisation objective).
    """
    if val is None:
        return None
    if hi == lo:
        return 0.0
    if maximize:
        return (hi - val) / (hi - lo)
    return (val - lo) / (hi - lo)


def _score_one(
    m: AlternativeMetrics,
    w: dict[str, float],
    ranges: dict[str, tuple[float, float]],
    baseline: AlternativeMetrics | None = None,
) -> tuple[NormalisedMetrics, dict[str, float], list[ObjectiveScoreDetail], list[str]]:
    """Normalise and score a single alternative across four independent objectives."""

    norm_exec = _normalise_value(m.execution_time_ms, *ranges[ObjectiveName.EXECUTION_TIME])
    norm_cost = _normalise_value(m.planner_cost, *ranges[ObjectiveName.PLANNER_COST])
    norm_reads = _normalise_value(
        float(m.buffer_reads) if m.buffer_reads is not None else None,
        *ranges[ObjectiveName.BUFFER_READS],
    )
    norm_hits = _normalise_value(
        float(m.buffer_hits) if m.buffer_hits is not None else None,
        *ranges[ObjectiveName.BUFFER_HITS],
    )

    normed = NormalisedMetrics(
        execution_time=round(norm_exec, 6) if norm_exec is not None else None,
        planner_cost=round(norm_cost, 6) if norm_cost is not None else None,
        buffer_reads=round(norm_reads, 6) if norm_reads is not None else None,
        buffer_hits=round(norm_hits, 6) if norm_hits is not None else None,
        buffer_accesses=round(norm_hits, 6) if norm_hits is not None else None,  # backwards-compatible alias
    )

    obj_map = {
        ObjectiveName.EXECUTION_TIME: (
            norm_exec,
            baseline.execution_time_ms if baseline else None,
            m.execution_time_ms,
        ),
        ObjectiveName.PLANNER_COST: (
            norm_cost,
            baseline.planner_cost if baseline else None,
            m.planner_cost,
        ),
        ObjectiveName.BUFFER_READS: (
            norm_reads,
            float(baseline.buffer_reads) if baseline and baseline.buffer_reads is not None else None,
            float(m.buffer_reads) if m.buffer_reads is not None else None,
        ),
        ObjectiveName.BUFFER_HITS: (
            norm_hits,
            float(baseline.buffer_hits) if baseline and baseline.buffer_hits is not None else None,
            float(m.buffer_hits) if m.buffer_hits is not None else None,
        ),
    }

    active_weight_sum = sum(
        w[k] for k, (norm_val, _, _) in obj_map.items() if norm_val is not None
    )

    breakdown: dict[str, float] = {}
    details: list[ObjectiveScoreDetail] = []
    explanations: list[str] = []

    for key, (norm_val, orig_val, opt_val) in obj_map.items():
        if norm_val is not None:
            effective_w = w[key] / active_weight_sum if active_weight_sum > 0 else 0.0
            contribution = round(effective_w * norm_val, 6)
            breakdown[key.value] = contribution
            # Alias for legacy compatibility
            if key == ObjectiveName.BUFFER_HITS:
                breakdown[ObjectiveName.BUFFER_ACCESSES.value] = contribution

            detail = ObjectiveScoreDetail(
                objective=key.value,
                original_value=round(orig_val, 4) if orig_val is not None else None,
                optimized_value=round(opt_val, 4) if opt_val is not None else None,
                direction="minimize",
                normalized_penalty=round(norm_val, 6),
                active_weight=round(effective_w, 4),
                weighted_contribution=contribution,
            )
            details.append(detail)

            orig_str = f"{orig_val:.2f}" if orig_val is not None else "N/A"
            opt_str = f"{opt_val:.2f}" if opt_val is not None else "N/A"
            explanations.append(
                f"{key.value}(orig={orig_str} -> opt={opt_str}, dir=min, penalty={norm_val:.3f}, w={effective_w:.2f}) → {contribution:.4f}"
            )
        else:
            breakdown[key.value] = 0.0
            if key == ObjectiveName.BUFFER_HITS:
                breakdown[ObjectiveName.BUFFER_ACCESSES.value] = 0.0
            details.append(
                ObjectiveScoreDetail(
                    objective=key.value,
                    original_value=round(orig_val, 4) if orig_val is not None else None,
                    optimized_value=round(opt_val, 4) if opt_val is not None else None,
                    direction="minimize",
                    normalized_penalty=None,
                    active_weight=0.0,
                    weighted_contribution=0.0,
                )
            )
            explanations.append(f"{key.value}: not available (weight redistributed)")

    # Derived diagnostic telemetry (not a weighted objective)
    tot_acc = m.get_total_buffer_accesses()
    if tot_acc is not None:
        explanations.append(f"[Diagnostic: Total Buffer Accesses = {tot_acc} blocks]")

    return normed, breakdown, details, explanations
