"""Machine Learning query execution-time prediction endpoints."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from sqlalchemy.orm import Session

from api.dependencies import get_real_ip, require_api_key
from api.models.schemas import (
    ExecutionTimePrediction,
    MLModelInfoResponse,
    PredictTimeRequest,
)
from core.config import settings
from core.database import get_db
from ml.predictor import ExecutionTimePredictor
from services.connection_manager import ConnectionManager

logger = logging.getLogger(__name__)

_ml_deps = [] if settings.hosted_mode else [Depends(require_api_key)]
router = APIRouter(prefix="/ml", tags=["ml"], dependencies=_ml_deps)

limiter = Limiter(key_func=get_real_ip)
_ml_rate = settings.hosted_rate_limit if settings.hosted_mode else settings.rate_limit


@router.post("/predict-time", response_model=ExecutionTimePrediction)
@limiter.limit(_ml_rate)
def predict_execution_time(
    request: Request,
    body: PredictTimeRequest,
    db: Session = Depends(get_db),
):
    """Predict query execution time using Random Forest and XGBoost regression models."""
    if len(body.sql) > settings.max_query_length:
        raise HTTPException(
            status_code=400,
            detail=f"Query exceeds maximum allowed length of {settings.max_query_length} characters.",
        )

    # Optional: fetch table row counts from live DB catalog if connection_id provided
    row_estimates = body.table_row_estimates or {}
    indexed_columns: list[str] = []

    if body.connection_id:
        try:
            manager = ConnectionManager(db)
            conn_record = manager.get(body.connection_id)
            if conn_record:
                connector = manager.open_connector(body.connection_id)
                try:
                    from services.query_introspector import extract_table_names

                    tables = extract_table_names(body.sql)
                    for t in tables:
                        try:
                            schema = connector.get_table_schema(t)
                            if schema.row_count > 0:
                                row_estimates[t] = schema.row_count
                            for idx in schema.indexes:
                                indexed_columns.extend(idx.columns)
                        except Exception:
                            pass
                finally:
                    connector.close()
        except Exception as exc:
            logger.debug("Could not retrieve connection metadata for ML prediction: %s", exc)

    predictor = ExecutionTimePredictor.get_instance()
    prediction = predictor.predict(
        sql=body.sql,
        table_row_estimates=row_estimates if row_estimates else None,
        indexed_columns=indexed_columns if indexed_columns else None,
        preferred_model=body.model,
    )

    return ExecutionTimePrediction(
        predicted_time_ms=prediction.predicted_time_ms,
        latency_tier=prediction.latency_tier,  # type: ignore[arg-type]
        confidence_range=prediction.confidence_range,  # type: ignore[arg-type]
        models=prediction.models,  # type: ignore[arg-type]
        features_summary=prediction.features_summary,
        cost_factors=prediction.cost_factors,
        model_version=prediction.model_version,
    )


@router.get("/model-info", response_model=MLModelInfoResponse)
def get_model_info():
    """Retrieve metadata, current evaluation metrics, and feature lists for active ML models."""
    predictor = ExecutionTimePredictor.get_instance()
    info = predictor.get_model_info()
    return info
