"""Constrained index-selection model using binary decision variables.

Formulation
-----------
Decision variables:
    x_i ∈ {0, 1}  for each candidate index i.

Objective (maximise):
    Σ  cost_reduction_i × x_i
    i.e. select the set of indexes that maximises total estimated cost reduction.

Constraint:
    Σ  estimated_size_i × x_i  ≤  budget
    The total storage consumed by selected indexes must not exceed the budget.

Algorithm:
    Binary Integer Linear Program (0-1 Knapsack) solved with PuLP's default
    CBC solver.  PuLP is a lightweight, pure-Python modelling library for
    LP/MILP problems.

Storage estimation
------------------
When actual index sizes are unknown, we approximate using PostgreSQL catalog
statistics:

    estimated_bytes ≈ row_count × avg_column_width × index_overhead_factor

where ``index_overhead_factor`` is conservatively set to 3× (B-tree node
overhead + fill factor).
"""

from __future__ import annotations

import logging
from typing import Sequence

from or_engine.models import IndexCandidate, IndexSelectionResult

logger = logging.getLogger(__name__)

# Conservative multiplier: B-tree node overhead + fill factor ≈ 3×
INDEX_OVERHEAD_FACTOR = 3.0

# Fallback average column width when catalog stats are unavailable
DEFAULT_AVG_COL_WIDTH = 8  # bytes


def estimate_index_size_bytes(
    row_count: int,
    avg_col_width: int = DEFAULT_AVG_COL_WIDTH,
    num_columns: int = 1,
) -> float:
    """Rough-order-of-magnitude estimate for a B-tree index size in bytes."""
    return float(row_count * avg_col_width * num_columns * INDEX_OVERHEAD_FACTOR)


def select_indexes(
    candidates: list[IndexCandidate],
    budget_bytes: float,
) -> IndexSelectionResult:
    """Solve the constrained index-selection problem using PuLP.

    Parameters
    ----------
    candidates:
        List of ``IndexCandidate`` with ``estimated_size_bytes`` and
        ``estimated_cost_reduction`` filled in.
    budget_bytes:
        Maximum total storage budget in bytes.

    Returns
    -------
    ``IndexSelectionResult`` with selected/rejected indexes and formulation docs.
    """
    try:
        import pulp  # type: ignore[import-untyped]
    except ImportError:
        logger.error("PuLP is not installed — index selection unavailable")
        return IndexSelectionResult(
            solver_status="Not Solved",
            selected_indexes=[],
            rejected_indexes=candidates,
            total_size_bytes=0.0,
            budget_bytes=budget_bytes,
            budget_utilisation_pct=0.0,
            objective_value=0.0,
            formulation={"error": "PuLP not installed"},
        )

    if not candidates:
        return IndexSelectionResult(
            solver_status="Optimal",
            selected_indexes=[],
            rejected_indexes=[],
            total_size_bytes=0.0,
            budget_bytes=budget_bytes,
            budget_utilisation_pct=0.0,
            objective_value=0.0,
            formulation=_build_formulation_doc([], budget_bytes),
        )

    # ── Build the LP ─────────────────────────────────────────────────────────
    prob = pulp.LpProblem("IndexSelection", pulp.LpMaximize)

    # Decision variables: x_i ∈ {0, 1}
    x = {
        c.index_id: pulp.LpVariable(f"x_{c.index_id}", cat=pulp.LpBinary)
        for c in candidates
    }

    # Objective: maximise total cost reduction
    prob += pulp.lpSum(
        c.estimated_cost_reduction * x[c.index_id] for c in candidates
    ), "TotalCostReduction"

    # Constraint: total size ≤ budget
    prob += (
        pulp.lpSum(c.estimated_size_bytes * x[c.index_id] for c in candidates) <= budget_bytes,
        "StorageBudget",
    )

    # ── Solve ────────────────────────────────────────────────────────────────
    solver = pulp.PULP_CBC_CMD(msg=0, timeLimit=30)
    prob.solve(solver)

    status = pulp.LpStatus[prob.status]
    logger.info("Index selection solver status: %s", status)

    # ── Extract results ──────────────────────────────────────────────────────
    selected: list[IndexCandidate] = []
    rejected: list[IndexCandidate] = []
    total_size = 0.0
    obj_value = 0.0

    for c in candidates:
        var = x[c.index_id]
        is_selected = pulp.value(var) is not None and pulp.value(var) >= 0.5
        c_copy = c.model_copy(update={"selected": is_selected})
        if is_selected:
            selected.append(c_copy)
            total_size += c.estimated_size_bytes
            obj_value += c.estimated_cost_reduction
        else:
            rejected.append(c_copy)

    utilisation = (total_size / budget_bytes * 100) if budget_bytes > 0 else 0.0

    return IndexSelectionResult(
        solver_status=status,
        selected_indexes=selected,
        rejected_indexes=rejected,
        total_size_bytes=round(total_size, 2),
        budget_bytes=budget_bytes,
        budget_utilisation_pct=round(utilisation, 2),
        objective_value=round(obj_value, 4),
        formulation=_build_formulation_doc(candidates, budget_bytes),
    )


def _build_formulation_doc(candidates: list[IndexCandidate], budget_bytes: float) -> dict:
    """Return a human-readable description of the mathematical formulation."""
    n = len(candidates)
    return {
        "decision_variables": f"x_i ∈ {{0, 1}} for i = 1..{n} (binary: select index or not)",
        "objective": "Maximise  Σ (cost_reduction_i × x_i)  — total planner cost reduction",
        "constraints": [
            f"Σ (size_i × x_i) ≤ {budget_bytes:.0f} bytes  — storage budget constraint",
        ],
        "algorithm": "Binary Integer Linear Program (0-1 Knapsack) solved by PuLP CBC",
        "num_candidates": n,
        "budget_bytes": budget_bytes,
    }
