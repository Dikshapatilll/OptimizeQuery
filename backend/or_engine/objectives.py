"""Objective definitions and metric extraction from EXPLAIN plans.

Extracts the four measurable objectives from PostgreSQL EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
plan output and from ML prediction results.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from or_engine.models import AlternativeMetrics, ObjectiveDefinition, ObjectiveName

logger = logging.getLogger(__name__)


# ────────────────────────────  Objective catalogue  ──────────────────────────

OBJECTIVE_DEFINITIONS: list[ObjectiveDefinition] = [
    ObjectiveDefinition(
        name=ObjectiveName.EXECUTION_TIME,
        description="Query execution time in milliseconds (actual or ML-predicted). Lower is better.",
        unit="ms",
        direction="minimize",
        weight=0.40,
    ),
    ObjectiveDefinition(
        name=ObjectiveName.PLANNER_COST,
        description="PostgreSQL planner estimated total cost (dimensionless optimizer cost units). Lower is better.",
        unit="cost units",
        direction="minimize",
        weight=0.30,
    ),
    ObjectiveDefinition(
        name=ObjectiveName.BUFFER_READS,
        description="Shared buffer blocks read from disk (physical disk I/O). Lower is better. Disjoint from memory buffer hits.",
        unit="blocks",
        direction="minimize",
        weight=0.20,
    ),
    ObjectiveDefinition(
        name=ObjectiveName.BUFFER_HITS,
        description="Shared buffer blocks hit in memory cache (logical block touches). Lower touches minimize memory cache churn and buffer lock overhead. Disjoint from disk reads.",
        unit="blocks",
        direction="minimize",
        weight=0.10,
    ),
]


# ────────────────────────────  EXPLAIN JSON helpers  ─────────────────────────


def extract_metrics_from_plan(plan_json_str: str | None) -> AlternativeMetrics:
    """Extract objective metrics from a PostgreSQL EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) plan.

    In PostgreSQL EXPLAIN JSON, the root Plan node reports cumulative buffer counts that
    already aggregate all child subplan activity. Counts are extracted from the root node
    exactly once to prevent double-counting.
    """
    if not plan_json_str:
        return AlternativeMetrics()

    try:
        plan_data = json.loads(plan_json_str) if isinstance(plan_json_str, str) else plan_json_str
    except (json.JSONDecodeError, TypeError):
        logger.warning("Failed to parse EXPLAIN plan JSON")
        return AlternativeMetrics()

    root = _get_root_plan_node(plan_data)
    if root is None:
        return AlternativeMetrics()

    # Planner total cost
    planner_cost = root.get("Total Cost")

    # Actual execution time — from the *top-level* wrapper, not the Plan node
    execution_time_ms = None
    planning_time_ms = None
    top = plan_data[0] if isinstance(plan_data, list) and plan_data else plan_data
    if isinstance(top, dict):
        execution_time_ms = top.get("Execution Time")
        planning_time_ms = top.get("Planning Time")

    # Extract cumulative buffer counts from root plan node directly (subsumes child nodes)
    buffer_reads = int(root.get("Shared Read Blocks", 0) or 0)
    buffer_hits = int(root.get("Shared Hit Blocks", 0) or 0)
    total_accesses = buffer_reads + buffer_hits

    return AlternativeMetrics(
        execution_time_ms=execution_time_ms,
        planner_cost=planner_cost,
        buffer_reads=buffer_reads if buffer_reads > 0 else 0,
        buffer_hits=buffer_hits if buffer_hits > 0 else 0,
        total_buffer_accesses=total_accesses if total_accesses > 0 else 0,
    )


def _get_root_plan_node(data: Any) -> dict | None:
    """Navigate to the root Plan node in a PostgreSQL EXPLAIN JSON structure."""
    if isinstance(data, list) and data:
        data = data[0]
    if isinstance(data, dict):
        return data.get("Plan", data if "Node Type" in data else None)
    return None


def build_baseline_metrics(
    explain_plan_json: str | None,
    explain_execution_time_ms: float | None = None,
    explain_planning_time_ms: float | None = None,
) -> AlternativeMetrics:
    """Build baseline metrics from a raw EXPLAIN plan and optional measured times."""
    metrics = extract_metrics_from_plan(explain_plan_json)

    # Prefer the caller-supplied times (from ExplainResult) if present
    if explain_execution_time_ms is not None and metrics.execution_time_ms is None:
        metrics.execution_time_ms = explain_execution_time_ms
    if explain_planning_time_ms is not None:
        pass  # planning_time is informational, not an objective

    return metrics
