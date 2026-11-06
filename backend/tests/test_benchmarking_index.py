"""Tests for isolated index benchmarking."""

import os
import sqlite3
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from benchmarking.index_benchmarker import IsolatedIndexBenchmarker


class TestIsolatedIndexBenchmarker:
    def test_benchmark_with_index_sqlite(self):
        """Isolated SQLite index benchmarking applies index to clone without polluting original."""
        metrics, env = IsolatedIndexBenchmarker.benchmark_with_index_sqlite(
            index_sql="CREATE INDEX idx_test_users_age ON users(age)",
            query_sql="SELECT * FROM users WHERE age = 30",
            num_runs=3,
        )

        assert env == "controlled_sqlite_sandbox"
        assert metrics.runs_count == 3
        assert metrics.warm_median_execution_time_ms > 0

    def test_benchmark_with_preexisting_index_sqlite(self):
        """Regression test: Benchmarking an index whose name already exists in the cloned DB drops and recreates it cleanly."""
        # idx_orders_user_id already exists in benchmark_seeded.db
        metrics, env = IsolatedIndexBenchmarker.benchmark_with_index_sqlite(
            index_sql="CREATE INDEX idx_orders_user_id ON orders(user_id)",
            query_sql="SELECT * FROM orders WHERE user_id = 42 LIMIT 10",
            num_runs=3,
        )

        assert env == "controlled_sqlite_sandbox"
        assert metrics.runs_count == 3
        assert metrics.warm_median_execution_time_ms > 0

    def test_benchmark_with_index_pg_rolls_back(self):
        """PostgreSQL index benchmarking must execute in a transaction and ALWAYS ROLLBACK."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        # Mock EXPLAIN (ANALYZE, BUFFERS) response
        mock_cursor.fetchall.return_value = [
            (
                [
                    {
                        "Plan": {
                            "Node Type": "Index Scan",
                            "Total Cost": 5.0,
                            "Actual Rows": 1,
                            "Shared Hit Blocks": 10,
                            "Shared Read Blocks": 0,
                        },
                        "Execution Time": 1.25,
                        "Planning Time": 0.1,
                    }
                ],
            )
        ]

        metrics, env = IsolatedIndexBenchmarker.benchmark_with_index_pg(
            raw_conn=mock_conn,
            index_sql="CREATE INDEX idx_mock ON orders(status)",
            query_sql="SELECT * FROM orders WHERE status = 'shipped'",
            num_runs=2,
        )

        assert env == "postgresql_isolated_transaction"
        # Verify transaction sequence
        executed_statements = [call[0][0] for call in mock_cursor.execute.call_args_list]
        assert any("BEGIN" in stmt for stmt in executed_statements)
        assert any("CREATE INDEX idx_mock" in stmt for stmt in executed_statements)
        assert any("ROLLBACK" in stmt for stmt in executed_statements)
        assert metrics.warm_median_execution_time_ms == 1.25
