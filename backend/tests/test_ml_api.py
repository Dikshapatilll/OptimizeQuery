"""Tests for ML API endpoints: /api/v1/ml/predict-time and /api/v1/ml/model-info."""

from unittest.mock import patch
from api.models.schemas import AnalysisResult


def test_predict_time_endpoint(client):
    resp = client.post(
        "/api/v1/ml/predict-time",
        json={
            "sql": "SELECT u.id, count(o.id) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.id",
            "model": "xgboost",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "predicted_time_ms" in data
    assert data["predicted_time_ms"] > 0
    assert data["latency_tier"] in ("fast", "moderate", "heavy")
    assert "models" in data
    assert "random_forest_ms" in data["models"]
    assert "xgboost_ms" in data["models"]
    assert "confidence_range" in data
    assert "cost_factors" in data


def test_predict_time_empty_sql_rejected(client):
    resp = client.post("/api/v1/ml/predict-time", json={"sql": ""})
    assert resp.status_code == 422


def test_model_info_endpoint(client):
    resp = client.get("/api/v1/ml/model-info")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "models_available" in data
    assert "default_model" in data
    assert "evaluation_metrics" in data
    assert "dataset_summary" in data


def test_analyze_includes_ml_prediction(client):
    mock_result = AnalysisResult(
        query_id="test-id",
        summary="Test analysis",
        tables_analyzed=["users"],
    )
    with patch("api.routes.analyze.LLMAnalyzer") as MockAnalyzer:
        instance = MockAnalyzer.return_value
        instance.analyze.return_value = mock_result
        resp = client.post("/api/v1/analyze", json={"sql": "SELECT * FROM users WHERE id = 1"})

    assert resp.status_code == 200
    data = resp.json()
    assert "execution_time_prediction" in data
    pred = data["execution_time_prediction"]
    assert pred is not None
    assert "predicted_time_ms" in pred
    assert pred["predicted_time_ms"] > 0
    assert "models" in pred
