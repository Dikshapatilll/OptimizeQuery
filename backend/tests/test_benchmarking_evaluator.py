"""Tests for improvement calculations, equivalence diffing, and ML comparisons."""

import os
import sqlite3
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from benchmarking.evaluator import (
    calculate_improvement_pct,
    compare_with_ml_prediction,
    verify_equivalence,
)


class TestImprovementCalculations:
    def test_positive_improvement(self):
        # 100ms -> 40ms = 60% improvement
        assert calculate_improvement_pct(100.0, 40.0) == 60.0

    def test_regression(self):
        # 50ms -> 100ms = -100% regression
        assert calculate_improvement_pct(50.0, 100.0) == -100.0

    def test_zero_change(self):
        assert calculate_improvement_pct(50.0, 50.0) == 0.0

    def test_none_handling(self):
        assert calculate_improvement_pct(None, 50.0) is None
        assert calculate_improvement_pct(50.0, None) is None


class TestVerifyEquivalence:
    def test_identical_queries_match(self):
        conn = sqlite3.connect(":memory:")
        cur = conn.cursor()
        cur.execute("CREATE TABLE t (id INT, val TEXT)")
        cur.execute("INSERT INTO t VALUES (1, 'a'), (2, 'b')")

        res = verify_equivalence(
            "SELECT * FROM t WHERE id = 1",
            "SELECT * FROM t WHERE id = 1",
            sqlite_conn=conn,
        )
        assert res.results_match is True
        assert res.rows_compared == 1
        assert res.first_diff is None

    def test_different_results_mismatch(self):
        conn = sqlite3.connect(":memory:")
        cur = conn.cursor()
        cur.execute("CREATE TABLE t (id INT, val TEXT)")
        cur.execute("INSERT INTO t VALUES (1, 'a'), (2, 'b')")

        res = verify_equivalence(
            "SELECT * FROM t WHERE id = 1",
            "SELECT * FROM t WHERE id = 2",
            sqlite_conn=conn,
        )
        assert res.results_match is False
        assert res.first_diff is not None
        assert res.first_diff.row_number == 1

    def test_strict_order_by_sequence_mismatch(self):
        """When ORDER BY is present, rows must match in exact sequence, not sorted sets."""
        conn = sqlite3.connect(":memory:")
        cur = conn.cursor()
        cur.execute("CREATE TABLE t (id INT, val TEXT)")
        cur.execute("INSERT INTO t VALUES (1, 'first'), (2, 'second')")

        # Query 1 returns (1, first), (2, second)
        # Query 2 returns (2, second), (1, first)
        res = verify_equivalence(
            "SELECT id, val FROM t ORDER BY id ASC",
            "SELECT id, val FROM t ORDER BY id DESC",
            sqlite_conn=conn,
        )
        assert res.results_match is False
        assert res.order_by_checked is True
        assert res.first_diff is not None
        assert res.first_diff.row_number == 1

    def test_unordered_multiset_equivalence_without_order_by(self):
        """When no ORDER BY is present, multiset sorting allows physical permutation."""
        conn = sqlite3.connect(":memory:")
        cur = conn.cursor()
        cur.execute("CREATE TABLE t (id INT, val TEXT)")
        cur.execute("INSERT INTO t VALUES (1, 'x'), (2, 'y')")

        res = verify_equivalence(
            "SELECT id, val FROM t",
            "SELECT id, val FROM t",
            sqlite_conn=conn,
        )
        assert res.results_match is True
        assert res.order_by_checked is False
        assert res.is_bounded_check is True
        assert "sample rows" in res.equivalence_note


class TestMLComparison:
    def test_ml_comparison_provenance(self):
        """ML comparison must note provenance and clearly distinguish prediction from measurement."""
        comp = compare_with_ml_prediction("SELECT * FROM users", actual_measured_time_ms=15.0)
        if comp is not None:
            assert comp.actual_measured_time_ms == 15.0
            assert "ML prediction is distinct" in comp.provenance_note
            assert comp.prediction_error_ms >= 0.0
