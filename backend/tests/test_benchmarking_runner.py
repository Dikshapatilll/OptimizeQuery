"""Tests for the benchmarking runner, stats aggregation, and caching analysis."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from benchmarking.models import SingleRunTelemetry
from benchmarking.runner import BenchmarkRunner, analyze_caching


class TestBenchmarkRunner:
    def test_sqlite_benchmark_runs(self):
        """BenchmarkRunner executes query num_runs times and aggregates stats."""
        runner = BenchmarkRunner()
        # Query the seeded benchmark database
        metrics = runner.run_benchmark(
            "SELECT * FROM users WHERE age > 30 ORDER BY id LIMIT 20",
            num_runs=4,
        )

        assert metrics.runs_count == 4
        assert len(metrics.raw_runs) == 4
        assert metrics.raw_runs[0].is_cold is True
        assert metrics.raw_runs[1].is_cold is False
        assert metrics.warm_median_execution_time_ms > 0
        assert metrics.min_execution_time_ms <= metrics.warm_median_execution_time_ms <= metrics.max_execution_time_ms
        assert metrics.actual_rows == 20

    def test_parse_pg_explain_json(self):
        """_parse_pg_explain_json extracts cost, execution time, rows, and buffer reads/hits."""
        runner = BenchmarkRunner()
        mock_plan = [
            {
                "Plan": {
                    "Node Type": "Index Scan",
                    "Total Cost": 42.5,
                    "Plan Rows": 10,
                    "Actual Rows": 10,
                    "Shared Hit Blocks": 120,
                    "Shared Read Blocks": 5,
                    "Plans": [
                        {
                            "Node Type": "Seq Scan",
                            "Shared Hit Blocks": 30,
                            "Shared Read Blocks": 15,
                        }
                    ],
                },
                "Planning Time": 0.45,
                "Execution Time": 12.34,
            }
        ]

        telemetry = runner._parse_pg_explain_json(mock_plan, run_index=1, is_cold=True)

        assert telemetry.run_index == 1
        assert telemetry.is_cold is True
        assert telemetry.execution_time_ms == 12.34
        assert telemetry.planning_time_ms == 0.45
        assert telemetry.planner_cost == 42.5
        assert telemetry.actual_rows == 10
        # Root node reports cumulative query total: 120 hits, 5 reads (does NOT sum children)
        assert telemetry.buffer_hits == 120
        assert telemetry.buffer_reads == 5

    def test_nested_plan_buffer_counts_include_children(self):
        """Verify that nested plan extraction takes the root Plan node's aggregate exactly once."""
        runner = BenchmarkRunner()
        # In real PostgreSQL, root Limit/Sort node reports 550 hits and 12 reads
        # Child Seq Scan nodes report 319 and 219 hits, 8 and 4 reads
        nested_plan = [
            {
                "Plan": {
                    "Node Type": "Limit",
                    "Total Cost": 1632.51,
                    "Plan Rows": 20,
                    "Actual Rows": 20,
                    "Shared Hit Blocks": 550,
                    "Shared Read Blocks": 12,
                    "Plans": [
                        {
                            "Node Type": "Sort",
                            "Shared Hit Blocks": 550,
                            "Shared Read Blocks": 12,
                            "Plans": [
                                {
                                    "Node Type": "Aggregate",
                                    "Shared Hit Blocks": 547,
                                    "Shared Read Blocks": 12,
                                    "Plans": [
                                        {
                                            "Node Type": "Seq Scan",
                                            "Shared Hit Blocks": 319,
                                            "Shared Read Blocks": 8,
                                        },
                                        {
                                            "Node Type": "Seq Scan",
                                            "Shared Hit Blocks": 219,
                                            "Shared Read Blocks": 4,
                                        },
                                    ],
                                }
                            ],
                        }
                    ],
                },
                "Planning Time": 1.25,
                "Execution Time": 54.18,
            }
        ]

        telemetry = runner._parse_pg_explain_json(nested_plan, run_index=1, is_cold=False)
        assert telemetry.buffer_hits == 550
        assert telemetry.buffer_reads == 12
        # Verify it did not multi-count children (which would total 2185 hits and 48 reads)
        assert telemetry.buffer_hits < 2000


class TestCachingAnalysis:
    def test_caching_speedup_detected(self):
        """When cold run is significantly slower than warm runs, caching speedup is reported."""
        runs = [
            SingleRunTelemetry(run_index=1, is_cold=True, execution_time_ms=50.0, buffer_reads=50, buffer_hits=10),
            SingleRunTelemetry(run_index=2, is_cold=False, execution_time_ms=10.0, buffer_reads=0, buffer_hits=60),
            SingleRunTelemetry(run_index=3, is_cold=False, execution_time_ms=10.0, buffer_reads=0, buffer_hits=60),
        ]
        runner = BenchmarkRunner()
        metrics = runner._aggregate_runs(runs)

        analysis = analyze_caching(metrics)
        assert analysis.cold_time_ms == 50.0
        assert analysis.warm_median_time_ms == 10.0
        assert analysis.cache_speedup_factor == pytest.approx(5.0)
        assert "Significant caching effect" in analysis.caching_effect_summary


class TestBenchmarkRunnerSafety:
    def test_reject_destructive_dml_statements(self):
        """BenchmarkRunner must strictly reject non-SELECT statements."""
        runner = BenchmarkRunner()

        with pytest.raises(ValueError, match="Only read-only SELECT"):
            runner.run_benchmark("DELETE FROM users WHERE id = 1")

        with pytest.raises(ValueError, match="Only read-only SELECT"):
            runner.run_benchmark("DROP TABLE users")

        with pytest.raises(ValueError, match="Only read-only SELECT"):
            runner.run_benchmark("UPDATE users SET balance = 0")

    def test_reject_multi_statement_injection(self):
        """BenchmarkRunner must reject multi-statement queries to prevent injection."""
        runner = BenchmarkRunner()

        with pytest.raises(ValueError, match="multiple statements"):
            runner.run_benchmark("SELECT * FROM users; DROP TABLE orders;")

    def test_accept_complex_read_only_queries(self):
        """BenchmarkRunner must accept CTEs and valid SELECT queries."""
        from benchmarking.validator import validate_select_query

        assert "SELECT" in validate_select_query("SELECT 1")
        assert "WITH" in validate_select_query("WITH cte AS (SELECT id FROM users) SELECT * FROM cte")
        assert "UNION" in validate_select_query("SELECT id FROM users UNION SELECT id FROM products")
