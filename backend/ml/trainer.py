"""Training pipeline for SQL execution time prediction models."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from ml.dataset import QuerySample, prepare_training_dataset
from ml.features import FEATURE_COLUMNS, SQLFeatureExtractor
from ml.models import create_random_forest_model, create_xgboost_model

logger = logging.getLogger(__name__)

ARTIFACTS_DIR = Path("backend/ml/artifacts")


def evaluate_predictions(y_true_ms: np.ndarray, y_pred_ms: np.ndarray) -> dict[str, float]:
    """Calculate MAE, RMSE, R2, and tolerance accuracy on milliseconds scale."""
    mae = float(mean_absolute_error(y_true_ms, y_pred_ms))
    rmse = float(root_mean_squared_error(y_true_ms, y_pred_ms))
    r2 = float(r2_score(y_true_ms, y_pred_ms))

    # Avoid division by zero
    rel_error = np.abs(y_pred_ms - y_true_ms) / np.maximum(y_true_ms, 0.05)
    acc_30 = float(np.mean(rel_error <= 0.30) * 100.0)

    return {
        "mae_ms": round(mae, 3),
        "rmse_ms": round(rmse, 3),
        "r2_score": round(r2, 4),
        "accuracy_within_30pct": round(acc_30, 2),
    }


def train_models(
    samples: list[QuerySample] | None = None,
    db_session=None,
    num_benchmark_queries: int = 500,
    artifacts_dir: Path = ARTIFACTS_DIR,
    random_state: int = 42,
) -> dict[str, Any]:
    """Full training pipeline with strict train/val/test separation and no leakage."""
    if samples is None:
        samples, dataset_stats = prepare_training_dataset(
            db_session=db_session,
            num_benchmark_queries=num_benchmark_queries,
        )
    else:
        dataset_stats = {
            "total_samples": len(samples),
            "real_samples": sum(1 for s in samples if not s.is_benchmark),
            "benchmark_samples": sum(1 for s in samples if s.is_benchmark),
        }

    if len(samples) < 10:
        raise ValueError(f"Insufficient samples to train models: {len(samples)}")

    extractor = SQLFeatureExtractor()

    # Build feature matrix and target vector
    X_rows: list[list[float]] = []
    y_ms_list: list[float] = []

    for s in samples:
        vec = extractor.extract_feature_vector(s.sql)
        X_rows.append(vec)
        y_ms_list.append(s.execution_time_ms)

    X = np.array(X_rows, dtype=np.float32)
    y = np.array(y_ms_list, dtype=np.float32)

    # 1. Train / Val / Test split (70% train, 15% validation, 15% test)
    X_train_val, X_test, y_train_val, y_test = train_test_split(
        X, y, test_size=0.15, random_state=random_state
    )
    # 0.1765 of 0.85 is ~0.15 of total
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_val, y_train_val, test_size=0.1765, random_state=random_state
    )

    # 2. Scaler - fitted STRICTLY on X_train only to prevent leakage
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)
    X_test_scaled = scaler.transform(X_test)

    # 3. Train Random Forest
    rf_model = create_random_forest_model(random_state=random_state)
    rf_model.fit(X_train_scaled, y_train)

    # 4. Train XGBoost
    xgb_model = create_xgboost_model(random_state=random_state)
    xgb_model.fit(X_train_scaled, y_train)

    # 5. Evaluate on held-out test set
    rf_test_pred = rf_model.predict(X_test_scaled)
    rf_metrics = evaluate_predictions(y_test, rf_test_pred)

    xgb_test_pred = xgb_model.predict(X_test_scaled)
    xgb_metrics = evaluate_predictions(y_test, xgb_test_pred)

    # Determine default/best model
    best_model = "xgboost" if xgb_metrics["r2_score"] >= rf_metrics["r2_score"] else "random_forest"

    # 6. Save artifacts
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(rf_model, artifacts_dir / "rf_model.joblib")
    joblib.dump(xgb_model, artifacts_dir / "xgb_model.joblib")
    joblib.dump(scaler, artifacts_dir / "scaler.joblib")

    with open(artifacts_dir / "feature_names.json", "w", encoding="utf-8") as f:
        json.dump(FEATURE_COLUMNS, f, indent=2)

    metadata = {
        "status": "ready",
        "default_model": best_model,
        "models_available": ["random_forest", "xgboost"],
        "dataset_summary": dataset_stats,
        "splits": {
            "train_count": len(X_train),
            "val_count": len(X_val),
            "test_count": len(X_test),
        },
        "evaluation_metrics": {
            "random_forest": rf_metrics,
            "xgboost": xgb_metrics,
        },
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "model_version": "1.0.0",
    }

    with open(artifacts_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    logger.info("Training complete. Best model: %s. Metrics: %s", best_model, metadata["evaluation_metrics"])
    return metadata


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    meta = train_models(num_benchmark_queries=500)
    print("Training finished successfully:")
    print(json.dumps(meta, indent=2))
