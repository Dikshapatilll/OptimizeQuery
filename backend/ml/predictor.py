"""Inference engine for SQL execution-time prediction."""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import joblib
import numpy as np

from ml.features import FEATURE_COLUMNS, SQLFeatureExtractor
from ml.models import SQLExecutionTimeModel

logger = logging.getLogger(__name__)

# Search in both backend/ml/artifacts and ml/artifacts
POSSIBLE_ARTIFACT_PATHS = [
    Path("backend/ml/artifacts"),
    Path("ml/artifacts"),
    Path(__file__).parent / "artifacts",
]


@dataclass
class PredictionOutput:
    predicted_time_ms: float
    latency_tier: str  # "fast" | "moderate" | "heavy"
    confidence_range: dict[str, float]  # {"min_ms": ..., "max_ms": ...}
    models: dict[str, float]  # {"random_forest_ms": ..., "xgboost_ms": ...}
    features_summary: dict[str, Any]
    cost_factors: list[str]
    model_version: str


class ExecutionTimePredictor:
    """Predicts query execution time using trained Random Forest and XGBoost models."""

    _instance: ExecutionTimePredictor | None = None

    def __init__(self, artifacts_dir: Path | None = None) -> None:
        self.artifacts_dir = artifacts_dir or self._find_artifacts_dir()
        self.extractor = SQLFeatureExtractor()
        self.rf_model: SQLExecutionTimeModel | None = None
        self.xgb_model: SQLExecutionTimeModel | None = None
        self.scaler = None
        self.metadata: dict[str, Any] = {}
        self._load_artifacts()

    @classmethod
    def get_instance(cls) -> ExecutionTimePredictor:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _find_artifacts_dir(self) -> Path:
        for p in POSSIBLE_ARTIFACT_PATHS:
            if p.exists() and (p / "metrics.json").exists():
                return p
        return POSSIBLE_ARTIFACT_PATHS[0]

    def _load_artifacts(self) -> None:
        if not self.artifacts_dir.exists():
            logger.warning("Artifacts directory %s not found", self.artifacts_dir)
            return

        try:
            metrics_file = self.artifacts_dir / "metrics.json"
            if metrics_file.exists():
                with open(metrics_file, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)

            rf_file = self.artifacts_dir / "rf_model.joblib"
            if rf_file.exists():
                self.rf_model = joblib.load(rf_file)

            xgb_file = self.artifacts_dir / "xgb_model.joblib"
            if xgb_file.exists():
                self.xgb_model = joblib.load(xgb_file)

            scaler_file = self.artifacts_dir / "scaler.joblib"
            if scaler_file.exists():
                self.scaler = joblib.load(scaler_file)

            logger.info("Loaded ML models from %s (Default: %s)", self.artifacts_dir, self.metadata.get("default_model"))
        except Exception as exc:
            logger.warning("Failed to load artifacts from %s: %s", self.artifacts_dir, exc)

    def is_ready(self) -> bool:
        return self.rf_model is not None and self.xgb_model is not None and self.scaler is not None

    def predict(
        self,
        sql: str,
        table_row_estimates: dict[str, int] | None = None,
        indexed_columns: Sequence[str] | None = None,
        preferred_model: str | None = None,
    ) -> PredictionOutput:
        """Predict execution time for a SQL query in milliseconds."""
        # Pre-execution feature extraction
        raw_features = self.extractor.extract_features(
            sql=sql,
            table_row_estimates=table_row_estimates,
            indexed_columns=indexed_columns,
        )

        features_summary = {
            "num_tables": int(raw_features["num_tables"]),
            "num_joins": int(raw_features["num_joins"]),
            "num_where_predicates": int(raw_features["num_where_predicates"]),
            "has_group_by": bool(raw_features["has_group_by"]),
            "has_order_by": bool(raw_features["has_order_by"]),
            "has_limit": bool(raw_features["has_limit"]),
            "num_aggregates": int(raw_features["num_aggregates"]),
        }

        cost_factors = self._identify_cost_factors(raw_features)

        if not self.is_ready():
            # Heuristic baseline fallback if models are not yet trained
            heuristic_ms = self._heuristic_prediction(raw_features)
            return PredictionOutput(
                predicted_time_ms=round(heuristic_ms, 2),
                latency_tier=self._get_tier(heuristic_ms),
                confidence_range={
                    "min_ms": round(heuristic_ms * 0.7, 2),
                    "max_ms": round(heuristic_ms * 1.4, 2),
                },
                models={
                    "random_forest_ms": round(heuristic_ms, 2),
                    "xgboost_ms": round(heuristic_ms, 2),
                },
                features_summary=features_summary,
                cost_factors=cost_factors,
                model_version="heuristic-fallback",
            )

        # Vectorize
        vec = [raw_features[col] for col in FEATURE_COLUMNS]
        X = np.array([vec], dtype=np.float32)
        X_scaled = self.scaler.transform(X)

        rf_ms = float(self.rf_model.predict(X_scaled)[0])
        xgb_ms = float(self.xgb_model.predict(X_scaled)[0])

        default_model = preferred_model or self.metadata.get("default_model", "xgboost")
        chosen_ms = xgb_ms if default_model == "xgboost" else rf_ms

        min_bound = round(max(0.01, min(rf_ms, xgb_ms) * 0.85), 2)
        max_bound = round(max(rf_ms, xgb_ms) * 1.15, 2)

        return PredictionOutput(
            predicted_time_ms=round(chosen_ms, 2),
            latency_tier=self._get_tier(chosen_ms),
            confidence_range={"min_ms": min_bound, "max_ms": max_bound},
            models={
                "random_forest_ms": round(rf_ms, 2),
                "xgboost_ms": round(xgb_ms, 2),
            },
            features_summary=features_summary,
            cost_factors=cost_factors,
            model_version=self.metadata.get("model_version", "1.0.0"),
        )

    def get_model_info(self) -> dict[str, Any]:
        """Return metadata, metrics, and readiness for model-info endpoint."""
        return {
            "status": "ready" if self.is_ready() else "not_ready",
            "models_available": ["random_forest", "xgboost"] if self.is_ready() else [],
            "default_model": self.metadata.get("default_model", "xgboost"),
            "model_version": self.metadata.get("model_version", "1.0.0"),
            "dataset_summary": self.metadata.get("dataset_summary", {}),
            "splits": self.metadata.get("splits", {}),
            "evaluation_metrics": self.metadata.get("evaluation_metrics", {}),
            "trained_at": self.metadata.get("trained_at"),
            "features_used": FEATURE_COLUMNS,
        }

    def _get_tier(self, ms: float) -> str:
        if ms < 50.0:
            return "fast"
        elif ms <= 500.0:
            return "moderate"
        return "heavy"

    def _identify_cost_factors(self, f: dict[str, float]) -> list[str]:
        factors: list[str] = []
        if f.get("num_joins", 0) >= 3:
            factors.append(f"Deep multi-table join ({int(f['num_joins'])} joins)")
        elif f.get("num_joins", 0) >= 1:
            factors.append(f"Relational join ({int(f['num_joins'])} join)")

        if f.get("has_group_by", 0) and f.get("num_aggregates", 0) >= 2:
            factors.append("Grouping aggregation over multiple metrics")
        elif f.get("has_group_by", 0):
            factors.append("GROUP BY column partitioning overhead")

        if not f.get("has_limit", 0) and f.get("is_select", 0):
            factors.append("Unbounded result set (missing LIMIT clause)")

        if f.get("has_order_by", 0) and not f.get("has_limit", 0):
            factors.append("Full table sort without LIMIT")

        if f.get("ratio_indexed_filters", 1.0) < 0.5:
            factors.append("Unindexed filter conditions (table scan potential)")

        if f.get("num_subqueries", 0) >= 1:
            factors.append("Nested subquery execution overhead")

        if not factors:
            factors.append("Lightweight indexable point query")
        return factors

    def _heuristic_prediction(self, f: dict[str, float]) -> float:
        base = 0.5
        base += f.get("num_tables", 1) * 0.8
        base += f.get("num_joins", 0) * 2.5
        base += f.get("has_group_by", 0) * 3.0
        base += f.get("has_order_by", 0) * 2.0
        if not f.get("has_limit", 0):
            base *= 1.8
        return max(0.1, base)
