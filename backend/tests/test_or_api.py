"""API integration tests for the OR optimization endpoints."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


SAMPLE_ANALYSIS_RESULT = {
    "query_id": "test-123",
    "indexes": [
        {
            "sql": "CREATE INDEX idx_orders_customer_id ON orders(customer_id)",
            "explanation": "Add index on customer_id to speed up joins",
            "estimated_impact": "high",
        },
        {
            "sql": "CREATE INDEX idx_orders_date ON orders(order_date)",
            "explanation": "Add index on order_date for range queries",
            "estimated_impact": "medium",
        },
    ],
    "rewrites": [
        {
            "sql": "SELECT o.* FROM orders o WHERE EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id)",
            "explanation": "Use EXISTS instead of IN for correlated subquery",
            "estimated_impact": "medium",
        },
    ],
    "materialized_views": [],
    "bottlenecks": [
        {
            "sql": None,
            "explanation": "Sequential scan on orders table (500K rows)",
            "estimated_impact": "high",
            "plan_node": "Seq Scan on orders",
            "root_cause": "missing_index",
        },
    ],
    "statistics": [],
    "configuration": [
        {
            "parameter": "work_mem",
            "current_value": "4MB",
            "recommended_value": "64MB",
            "explanation": "Increase work_mem for large sorts",
            "estimated_impact": "medium",
        },
    ],
    "summary": "Test analysis",
}

SAMPLE_EXPLAIN_PLAN = json.dumps([
    {
        "Plan": {
            "Node Type": "Seq Scan",
            "Relation Name": "orders",
            "Total Cost": 12345.67,
            "Plan Rows": 500000,
            "Shared Hit Blocks": 200,
            "Shared Read Blocks": 800,
            "Plans": [],
        },
        "Planning Time": 0.5,
        "Execution Time": 150.2,
    }
])


class TestOROptimizeEndpoint:
    def test_optimize_with_analysis_result(self, client):
        """POST /api/v1/or/optimize with a pre-computed analysis result."""
        resp = client.post("/api/v1/or/optimize", json={
            "sql": "SELECT * FROM orders WHERE customer_id = 1",
            "analysis_result_json": json.dumps(SAMPLE_ANALYSIS_RESULT),
            "explain_plan_json": SAMPLE_EXPLAIN_PLAN,
            "include_ml_prediction": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_alternatives"] > 0
        assert data["normalisation_method"] == "min-max"
        assert data["scoring_algorithm"] == "weighted-sum"

        # Alternatives should be ranked
        alts = data["alternatives"]
        for i, alt in enumerate(alts):
            assert alt["rank"] == i + 1
        # First should have lowest weighted_score
        if len(alts) >= 2:
            assert alts[0]["weighted_score"] <= alts[1]["weighted_score"]

    def test_optimize_without_analysis(self, client):
        """POST /api/v1/or/optimize without analysis data returns empty alternatives."""
        resp = client.post("/api/v1/or/optimize", json={
            "sql": "SELECT 1",
            "include_ml_prediction": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_alternatives"] == 0
        assert data["alternatives"] == []

    def test_optimize_with_custom_weights(self, client):
        resp = client.post("/api/v1/or/optimize", json={
            "sql": "SELECT * FROM orders",
            "analysis_result_json": json.dumps(SAMPLE_ANALYSIS_RESULT),
            "explain_plan_json": SAMPLE_EXPLAIN_PLAN,
            "include_ml_prediction": False,
            "weights": {
                "execution_time": 0.8,
                "planner_cost": 0.1,
                "buffer_reads": 0.05,
                "buffer_hits": 0.05,
            },
        })
        assert resp.status_code == 200
        data = resp.json()
        # execution_time should dominate
        assert data["weights_used"]["execution_time"] > 0.5


class TestORConfigEndpoint:
    def test_get_config(self, client):
        """GET /api/v1/or/config returns engine configuration."""
        resp = client.get("/api/v1/or/config")
        assert resp.status_code == 200
        data = resp.json()
        assert "default_weights" in data
        assert "objectives" in data
        assert data["normalisation_method"] == "min-max"
        assert data["scoring_algorithm"] == "weighted-sum"
        assert len(data["objectives"]) == 4


class TestORSelectIndexesEndpoint:
    def test_select_indexes_basic(self, client):
        """POST /api/v1/or/select-indexes picks optimal indexes within budget."""
        resp = client.post("/api/v1/or/select-indexes", json={
            "sql": "SELECT * FROM orders WHERE customer_id = 1",
            "analysis_result_json": json.dumps(SAMPLE_ANALYSIS_RESULT),
            "budget_mb": 500.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        result = data["result"]
        assert result["solver_status"] == "Optimal"
        assert result["budget_bytes"] == 500.0 * 1024 * 1024
        assert "formulation" in result
        # With 500 MB budget, both small indexes should be selected
        assert len(result["selected_indexes"]) >= 1

    def test_select_indexes_empty(self, client):
        """No indexes to select returns empty result."""
        resp = client.post("/api/v1/or/select-indexes", json={
            "sql": "SELECT 1",
            "budget_mb": 10.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"]["solver_status"] == "Optimal"
        assert data["result"]["selected_indexes"] == []

    def test_select_indexes_tight_budget(self, client):
        """Tight budget should reject large indexes."""
        resp = client.post("/api/v1/or/select-indexes", json={
            "sql": "SELECT * FROM orders",
            "analysis_result_json": json.dumps(SAMPLE_ANALYSIS_RESULT),
            "budget_mb": 0.001,  # ~1 KB — very tight
        })
        assert resp.status_code == 200
        data = resp.json()
        result = data["result"]
        # With ~1KB budget, 100K-row indexes shouldn't fit
        assert result["solver_status"] == "Optimal"
        assert len(result["selected_indexes"]) == 0
