"""Tests for ML regression models, evaluation, and artifact serialization."""

import tempfile
from pathlib import Path
import numpy as np
import pytest

from ml.dataset import QuerySample
from ml.models import create_random_forest_model, create_xgboost_model
from ml.trainer import evaluate_predictions, train_models


def test_models_fit_and_predict():
    np.random.seed(42)
    X = np.random.randn(30, 10).astype(np.float32)
    y_ms = np.random.uniform(0.5, 100.0, size=(30,)).astype(np.float32)

    rf = create_random_forest_model(random_state=42)
    rf.fit(X, y_ms)
    rf_pred = rf.predict(X[:5])
    assert len(rf_pred) == 5
    assert np.all(rf_pred > 0)

    xgb = create_xgboost_model(random_state=42)
    xgb.fit(X, y_ms)
    xgb_pred = xgb.predict(X[:5])
    assert len(xgb_pred) == 5
    assert np.all(xgb_pred > 0)


def test_evaluate_predictions_metrics():
    y_true = np.array([10.0, 20.0, 30.0, 40.0], dtype=np.float32)
    y_pred = np.array([11.0, 19.0, 31.0, 39.0], dtype=np.float32)

    metrics = evaluate_predictions(y_true, y_pred)
    assert "mae_ms" in metrics
    assert "rmse_ms" in metrics
    assert "r2_score" in metrics
    assert "accuracy_within_30pct" in metrics
    assert metrics["mae_ms"] == 1.0
    assert metrics["accuracy_within_30pct"] == 100.0
    assert metrics["r2_score"] > 0.95


def test_train_pipeline_artifacts_and_metrics():
    samples = [
        QuerySample(sql="SELECT * FROM users", execution_time_ms=0.5, is_benchmark=True),
        QuerySample(sql="SELECT * FROM orders", execution_time_ms=1.2, is_benchmark=True),
        QuerySample(sql="SELECT * FROM products", execution_time_ms=0.3, is_benchmark=True),
        QuerySample(sql="SELECT u.id, o.id FROM users u JOIN orders o ON u.id = o.user_id", execution_time_ms=4.5, is_benchmark=True),
        QuerySample(sql="SELECT u.id, count(o.id) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.id", execution_time_ms=6.8, is_benchmark=True),
        QuerySample(sql="SELECT * FROM users WHERE age > 30 ORDER BY id LIMIT 10", execution_time_ms=0.8, is_benchmark=True),
        QuerySample(sql="SELECT * FROM orders WHERE total > 100 ORDER BY total DESC LIMIT 5", execution_time_ms=1.5, is_benchmark=True),
        QuerySample(sql="SELECT u.country, sum(o.total) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.country", execution_time_ms=7.2, is_benchmark=True),
        QuerySample(sql="SELECT * FROM products WHERE price > 50", execution_time_ms=0.6, is_benchmark=True),
        QuerySample(sql="SELECT count(*) FROM users", execution_time_ms=0.2, is_benchmark=True),
        QuerySample(sql="SELECT max(price) FROM products", execution_time_ms=0.2, is_benchmark=True),
        QuerySample(sql="SELECT u.id, p.name FROM users u JOIN orders o ON u.id=o.user_id JOIN order_items oi ON o.id=oi.order_id JOIN products p ON oi.product_id=p.id", execution_time_ms=12.0, is_benchmark=True),
    ]

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        meta = train_models(samples=samples, artifacts_dir=tmp_path, random_state=42)

        assert meta["status"] == "ready"
        assert meta["default_model"] in ("random_forest", "xgboost")
        assert (tmp_path / "rf_model.joblib").exists()
        assert (tmp_path / "xgb_model.joblib").exists()
        assert (tmp_path / "scaler.joblib").exists()
        assert (tmp_path / "metrics.json").exists()
