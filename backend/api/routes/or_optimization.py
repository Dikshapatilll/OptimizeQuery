"""OR Optimization API routes.

POST /api/v1/or/optimize       — Multi-objective scoring of optimization alternatives
GET  /api/v1/or/config         — Current weight configuration and objective definitions
POST /api/v1/or/select-indexes — Constrained index-selection with storage budget
"""

from __future__ import annotations

import json
import logging
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter

from api.dependencies import get_real_ip, require_api_key
from core.config import settings
from or_engine.index_selector import (
    estimate_index_size_bytes,
    select_indexes,
)
from or_engine.models import (
    DEFAULT_WEIGHTS,
    IndexCandidate,
    IndexSelectionRequest,
    IndexSelectionResponse,
    ObjectiveName,
    ORConfigResponse,
    OROptimizeRequest,
    OROptimizeResponse,
)
from or_engine.objectives import OBJECTIVE_DEFINITIONS
from or_engine.optimizer import optimize

logger = logging.getLogger(__name__)

_or_deps = [] if settings.hosted_mode else [Depends(require_api_key)]
router = APIRouter(prefix="/or", tags=["operations-research"], dependencies=_or_deps)
limiter = Limiter(key_func=get_real_ip)
_rate = settings.hosted_rate_limit if settings.hosted_mode else settings.rate_limit


@router.post("/optimize", response_model=OROptimizeResponse)
@limiter.limit(_rate)
def or_optimize(request: Request, body: OROptimizeRequest):
    """Rank optimization alternatives using multi-objective weighted scoring."""
    query_id = str(uuid.uuid4())

    # ── Parse the analysis result ────────────────────────────────────────────
    analysis_result = _parse_analysis_result(body)

    # ── ML prediction (optional) ─────────────────────────────────────────────
    ml_pred_ms: float | None = None
    ml_available = False
    if body.include_ml_prediction:
        ml_pred_ms = _get_ml_prediction(body.sql)
        ml_available = ml_pred_ms is not None

    # ── Extract EXPLAIN plan metrics if provided ─────────────────────────────
    explain_plan_json = body.explain_plan_json
    explain_exec_ms: float | None = None
    explain_plan_ms: float | None = None

    # Also try to get EXPLAIN from the analysis result
    if explain_plan_json is None:
        explain_plan_json = analysis_result.get("explain_plan")

    if explain_plan_json:
        try:
            plan_data = json.loads(explain_plan_json)
            top = plan_data[0] if isinstance(plan_data, list) and plan_data else plan_data
            if isinstance(top, dict):
                explain_exec_ms = top.get("Execution Time")
                explain_plan_ms = top.get("Planning Time")
        except (json.JSONDecodeError, TypeError, IndexError):
            pass

    # ── Run the OR optimiser ─────────────────────────────────────────────────
    scored = optimize(
        analysis_result=analysis_result,
        explain_plan_json=explain_plan_json,
        explain_execution_time_ms=explain_exec_ms,
        explain_planning_time_ms=explain_plan_ms,
        ml_predicted_time_ms=ml_pred_ms,
        weights=body.weights,
    )

    # ── Resolve actual weights used ──────────────────────────────────────────
    weights_used = dict(DEFAULT_WEIGHTS)
    if body.weights:
        for k, v in body.weights.items():
            if k in weights_used:
                weights_used[k] = v
        total = sum(weights_used.values())
        if total > 0:
            weights_used = {k: round(v / total, 4) for k, v in weights_used.items()}

    return OROptimizeResponse(
        query_id=query_id,
        alternatives=scored,
        weights_used=weights_used,
        objectives=OBJECTIVE_DEFINITIONS,
        total_alternatives=len(scored),
        ml_prediction_available=ml_available,
    )


@router.get("/config", response_model=ORConfigResponse)
def or_config():
    """Return current OR engine configuration."""
    return ORConfigResponse(
        default_weights=DEFAULT_WEIGHTS,
        objectives=OBJECTIVE_DEFINITIONS,
        normalisation_method="min-max",
        scoring_algorithm="weighted-sum",
    )


@router.post("/select-indexes", response_model=IndexSelectionResponse)
@limiter.limit(_rate)
def or_select_indexes(request: Request, body: IndexSelectionRequest):
    """Solve the constrained index-selection problem with a storage budget."""
    query_id = str(uuid.uuid4())
    budget_bytes = body.budget_mb * 1024 * 1024

    # ── Parse index suggestions ──────────────────────────────────────────────
    analysis_result = _parse_index_analysis(body)
    index_items = analysis_result.get("indexes", [])

    if not index_items:
        return IndexSelectionResponse(
            query_id=query_id,
            result=select_indexes([], budget_bytes),
            budget_mb=body.budget_mb,
        )

    # ── Build index candidates ───────────────────────────────────────────────
    candidates: list[IndexCandidate] = []
    for i, item in enumerate(index_items):
        sql = item.get("sql", "")
        explanation = item.get("explanation", "")
        impact = item.get("estimated_impact", "low").lower()

        # Estimate cost reduction from impact
        cost_reduction = {"high": 100.0, "medium": 50.0, "low": 20.0}.get(impact, 10.0)

        # Estimate size — parse column count from the CREATE INDEX SQL if possible
        num_cols = _count_index_columns(sql)
        est_size = estimate_index_size_bytes(
            row_count=100_000,  # conservative default when catalog stats unavailable
            num_columns=num_cols,
        )

        candidates.append(
            IndexCandidate(
                index_id=i,
                sql=sql,
                explanation=explanation,
                estimated_size_bytes=est_size,
                estimated_cost_reduction=cost_reduction,
            )
        )

    result = select_indexes(candidates, budget_bytes)

    return IndexSelectionResponse(
        query_id=query_id,
        result=result,
        budget_mb=body.budget_mb,
    )


# ────────────────────────────  Private helpers  ──────────────────────────────


def _parse_analysis_result(body: OROptimizeRequest) -> dict:
    """Extract an analysis result dict from the request."""
    if body.analysis_result_json:
        try:
            return json.loads(body.analysis_result_json)
        except (json.JSONDecodeError, TypeError) as exc:
            raise HTTPException(status_code=400, detail=f"Invalid analysis_result_json: {exc}")
    # Return an empty structure when no analysis is provided
    return {
        "indexes": [],
        "rewrites": [],
        "materialized_views": [],
        "bottlenecks": [],
        "statistics": [],
        "configuration": [],
    }


def _parse_index_analysis(body: IndexSelectionRequest) -> dict:
    """Extract analysis result for index selection."""
    if body.analysis_result_json:
        try:
            return json.loads(body.analysis_result_json)
        except (json.JSONDecodeError, TypeError) as exc:
            raise HTTPException(status_code=400, detail=f"Invalid analysis_result_json: {exc}")
    return {"indexes": []}


def _get_ml_prediction(sql: str) -> float | None:
    """Attempt to get ML-predicted execution time.  Returns None on failure."""
    try:
        from ml.predictor import ExecutionTimePredictor

        predictor = ExecutionTimePredictor.get_instance()
        if not predictor.is_ready():
            return None
        pred = predictor.predict(sql)
        return pred.predicted_time_ms
    except Exception as exc:
        logger.debug("ML prediction unavailable: %s", exc)
        return None


def _count_index_columns(create_index_sql: str) -> int:
    """Count columns in a CREATE INDEX ... (col1, col2, ...) statement."""
    match = re.search(r"\(([^)]+)\)", create_index_sql)
    if match:
        cols = [c.strip() for c in match.group(1).split(",") if c.strip()]
        return max(1, len(cols))
    return 1
