"""API integration tests for the benchmarking endpoints."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestBenchmarkingAPI:
    def test_run_benchmark_single_query(self, client):
        """POST /api/v1/benchmark/run with original SQL only."""
        resp = client.post(
            "/api/v1/benchmark/run",
            json={
                "original_sql": "SELECT * FROM users WHERE age > 25 LIMIT 10",
                "num_runs": 3,
                "save_to_history": True,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "benchmark_id" in data
        assert data["original_metrics"]["runs_count"] == 3
        assert data["original_metrics"]["warm_median_execution_time_ms"] > 0
        assert "caching_analysis" in data

    def test_run_benchmark_comparison_rewrite(self, client):
        """POST /api/v1/benchmark/run comparing original SQL and rewrite."""
        resp = client.post(
            "/api/v1/benchmark/run",
            json={
                "original_sql": "SELECT * FROM users WHERE age > 30 ORDER BY id LIMIT 5",
                "optimized_sql": "SELECT id, name, age FROM users WHERE age > 30 ORDER BY id LIMIT 5",
                "num_runs": 3,
                "save_to_history": True,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["optimized_metrics"] is not None
        assert data["execution_time_improvement_pct"] is not None
        assert data["equivalence"] is not None

    def test_run_benchmark_with_isolated_index(self, client):
        """POST /api/v1/benchmark/run testing an index recommendation in isolation."""
        resp = client.post(
            "/api/v1/benchmark/run",
            json={
                "original_sql": "SELECT * FROM orders WHERE user_id = 42",
                "index_sql": "CREATE INDEX idx_bench_orders_user ON orders(user_id)",
                "num_runs": 3,
                "save_to_history": True,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["applied_index_sql"] is not None
        assert data["optimized_metrics"] is not None

    def test_benchmark_history_and_detail(self, client):
        """GET /api/v1/benchmark/history and GET /api/v1/benchmark/{id}."""
        # 1. Run a benchmark
        post_resp = client.post(
            "/api/v1/benchmark/run",
            json={
                "original_sql": "SELECT count(*) FROM products",
                "num_runs": 2,
                "save_to_history": True,
            },
        )
        assert post_resp.status_code == 200
        bench_id = post_resp.json()["benchmark_id"]

        # 2. List history
        hist_resp = client.get("/api/v1/benchmark/history")
        assert hist_resp.status_code == 200
        items = hist_resp.json()
        assert any(item["id"] == bench_id for item in items)

        # 3. Retrieve specific detail
        detail_resp = client.get(f"/api/v1/benchmark/{bench_id}")
        assert detail_resp.status_code == 200
        assert detail_resp.json()["benchmark_id"] == bench_id

    def test_invalid_index_sql_rejected(self, client):
        """Reject non-CREATE INDEX statements in index_sql field."""
        resp = client.post(
            "/api/v1/benchmark/run",
            json={
                "original_sql": "SELECT 1",
                "index_sql": "DROP TABLE users;",
            },
        )
        assert resp.status_code == 422

    def test_reject_dml_in_original_sql(self, client):
        """Reject DELETE/DROP/UPDATE/INSERT in original_sql via Pydantic validator."""
        resp = client.post(
            "/api/v1/benchmark/run",
            json={
                "original_sql": "DELETE FROM users WHERE id = 1;",
                "num_runs": 2,
            },
        )
        assert resp.status_code == 422

    def test_invalid_connection_id_fails_cleanly(self, client):
        """Passing an invalid connection_id must reject rather than silently falling back."""
        resp = client.post(
            "/api/v1/benchmark/run",
            json={
                "original_sql": "SELECT 1",
                "connection_id": "non-existent-uuid-123",
                "num_runs": 2,
            },
        )
        assert resp.status_code in (400, 500)
        assert "not found" in resp.json()["detail"].lower()
