"""Unit tests for the constrained index-selection model."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from or_engine.index_selector import estimate_index_size_bytes, select_indexes
from or_engine.models import IndexCandidate


def _candidate(
    index_id: int,
    size_bytes: float,
    cost_reduction: float,
    sql: str = "CREATE INDEX idx ON t(c)",
) -> IndexCandidate:
    return IndexCandidate(
        index_id=index_id,
        sql=sql,
        explanation=f"Test index {index_id}",
        estimated_size_bytes=size_bytes,
        estimated_cost_reduction=cost_reduction,
    )


class TestEstimateIndexSize:
    def test_default_values(self):
        size = estimate_index_size_bytes(row_count=100_000)
        assert size > 0
        # 100_000 × 8 × 1 × 3 = 2_400_000
        assert size == 2_400_000.0

    def test_multi_column(self):
        single = estimate_index_size_bytes(row_count=1000, num_columns=1)
        multi = estimate_index_size_bytes(row_count=1000, num_columns=3)
        assert multi == single * 3


class TestSelectIndexes:
    def test_empty_candidates(self):
        result = select_indexes([], budget_bytes=1_000_000)
        assert result.solver_status == "Optimal"
        assert result.selected_indexes == []
        assert result.objective_value == 0.0

    def test_single_fits(self):
        """Single candidate within budget should be selected."""
        c = _candidate(0, size_bytes=1000, cost_reduction=50.0)
        result = select_indexes([c], budget_bytes=5000)
        assert result.solver_status == "Optimal"
        assert len(result.selected_indexes) == 1
        assert result.selected_indexes[0].index_id == 0
        assert result.selected_indexes[0].selected is True
        assert result.objective_value == 50.0

    def test_single_exceeds_budget(self):
        """Single candidate exceeding budget should be rejected."""
        c = _candidate(0, size_bytes=10_000, cost_reduction=50.0)
        result = select_indexes([c], budget_bytes=5000)
        assert result.solver_status == "Optimal"
        assert len(result.selected_indexes) == 0
        assert len(result.rejected_indexes) == 1

    def test_knapsack_optimal_selection(self):
        """Solver should pick the combination maximising cost reduction within budget."""
        candidates = [
            _candidate(0, size_bytes=500, cost_reduction=10.0),   # low value
            _candidate(1, size_bytes=400, cost_reduction=80.0),   # high value
            _candidate(2, size_bytes=300, cost_reduction=60.0),   # moderate value
            _candidate(3, size_bytes=600, cost_reduction=5.0),    # big, low value
        ]
        # Budget allows at most ~700 bytes → should pick #1 (400) + #2 (300) = 700
        result = select_indexes(candidates, budget_bytes=700)
        assert result.solver_status == "Optimal"
        selected_ids = {c.index_id for c in result.selected_indexes}
        assert selected_ids == {1, 2}
        assert result.objective_value == pytest.approx(140.0)

    def test_budget_utilisation(self):
        c = _candidate(0, size_bytes=500, cost_reduction=50.0)
        result = select_indexes([c], budget_bytes=1000)
        assert result.budget_utilisation_pct == pytest.approx(50.0)

    def test_formulation_documented(self):
        """The formulation dict should describe the mathematical model."""
        c = _candidate(0, size_bytes=100, cost_reduction=10.0)
        result = select_indexes([c], budget_bytes=1000)
        assert "decision_variables" in result.formulation
        assert "objective" in result.formulation
        assert "constraints" in result.formulation
        assert "algorithm" in result.formulation
