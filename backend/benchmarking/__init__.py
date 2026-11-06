"""Query Performance Benchmarking Module for OptimizeQL.

Provides controlled benchmarking of original vs optimized queries and index
recommendations, with empirical metrics: actual execution time, planning time,
planner cost, actual rows, shared buffer reads, and shared buffer hits.
"""

from __future__ import annotations
