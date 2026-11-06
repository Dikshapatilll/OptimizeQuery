"""Unit tests for the OR scoring engine — normalisation, weighting, ranking."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from or_engine.models import AlternativeMetrics, DEFAULT_WEIGHTS, ObjectiveName
from or_engine.scoring import normalise_and_score


def _alt(
    category: str = "index",
    impact: str = "high",
    exec_ms: float | None = None,
    cost: float | None = None,
    reads: int | None = None,
    hits: int | None = None,
    sql: str | None = "CREATE INDEX ...",
    explanation: str = "test",
) -> dict:
    """Helper to build an alternative dict."""
    return {
        "category": category,
        "sql": sql,
        "explanation": explanation,
        "estimated_impact": impact,
        "raw_metrics": AlternativeMetrics(
            execution_time_ms=exec_ms,
            planner_cost=cost,
            buffer_reads=reads,
            buffer_hits=hits,
        ),
    }


class TestNormalisation:
    """Test min-max normalisation logic."""

    def test_single_alternative_scores_zero(self):
        """A single alternative should have normalised score 0 (all min == max)."""
        alts = [_alt(exec_ms=100.0, cost=500.0, reads=10, hits=5)]
        scored = normalise_and_score(alts)
        assert len(scored) == 1
        assert scored[0].weighted_score == 0.0
        assert scored[0].rank == 1

    def test_two_alternatives_ranking(self):
        """Better alternative (lower exec, lower cost) should rank first."""
        alts = [
            _alt(exec_ms=200.0, cost=1000.0, reads=50, hits=10, impact="low"),
            _alt(exec_ms=50.0, cost=200.0, reads=10, hits=50, impact="high"),
        ]
        scored = normalise_and_score(alts)
        assert scored[0].rank == 1
        assert scored[0].raw_metrics.execution_time_ms == 50.0
        assert scored[1].rank == 2
        assert scored[1].raw_metrics.execution_time_ms == 200.0

    def test_equal_alternatives_score_equal(self):
        """Identical alternatives should get the same score."""
        alts = [
            _alt(exec_ms=100.0, cost=500.0, reads=20, hits=30),
            _alt(exec_ms=100.0, cost=500.0, reads=20, hits=30),
        ]
        scored = normalise_and_score(alts)
        assert scored[0].weighted_score == scored[1].weighted_score

    def test_empty_alternatives(self):
        """Empty list should return empty result."""
        assert normalise_and_score([]) == []

    def test_missing_metrics_handled(self):
        """Alternatives with None metrics should not crash."""
        alts = [
            _alt(exec_ms=100.0, cost=None, reads=None, hits=None),
            _alt(exec_ms=200.0, cost=None, reads=None, hits=None),
        ]
        scored = normalise_and_score(alts)
        assert len(scored) == 2
        # Only execution_time contributes to score
        assert scored[0].raw_metrics.execution_time_ms == 100.0


class TestWeighting:
    """Test custom weight vectors."""

    def test_custom_weights_applied(self):
        """Custom weights should change ranking when they emphasise different objectives."""
        alts = [
            _alt(exec_ms=200.0, cost=100.0, reads=5, hits=50),   # fast cost, slow exec
            _alt(exec_ms=50.0, cost=800.0, reads=40, hits=10),   # fast exec, high cost
        ]
        # Weight execution_time heavily
        scored_exec = normalise_and_score(
            alts, weights={ObjectiveName.EXECUTION_TIME: 0.9, ObjectiveName.PLANNER_COST: 0.1}
        )
        assert scored_exec[0].raw_metrics.execution_time_ms == 50.0

        # Weight planner_cost heavily
        scored_cost = normalise_and_score(
            alts, weights={ObjectiveName.EXECUTION_TIME: 0.1, ObjectiveName.PLANNER_COST: 0.9}
        )
        assert scored_cost[0].raw_metrics.planner_cost == 100.0

    def test_zero_weight_objective_ignored(self):
        """An objective with weight=0 should not contribute to the score."""
        alts = [
            _alt(exec_ms=100.0, cost=100.0),
            _alt(exec_ms=200.0, cost=50.0),
        ]
        scored = normalise_and_score(
            alts, weights={ObjectiveName.EXECUTION_TIME: 0.0, ObjectiveName.PLANNER_COST: 1.0}
        )
        # Planner cost is the only factor; 50 < 100 so second alt wins
        assert scored[0].raw_metrics.planner_cost == 50.0


class TestScoreBreakdown:
    """Test that score breakdown and explanation are populated."""

    def test_breakdown_has_all_objectives(self):
        alts = [_alt(exec_ms=100.0, cost=500.0, reads=10, hits=20)]
        scored = normalise_and_score(alts)
        assert ObjectiveName.EXECUTION_TIME in scored[0].score_breakdown
        assert ObjectiveName.PLANNER_COST in scored[0].score_breakdown
        assert scored[0].score_explanation  # non-empty

    def test_ml_prediction_flag(self):
        """ML prediction metadata should be preserved."""
        alts = [
            {
                "category": "index",
                "sql": "CREATE INDEX ...",
                "explanation": "test",
                "estimated_impact": "high",
                "raw_metrics": AlternativeMetrics(execution_time_ms=50.0),
                "ml_predicted_time_ms": 50.0,
                "is_ml_prediction": True,
            }
        ]
        scored = normalise_and_score(alts)
        assert scored[0].is_ml_prediction is True
        assert scored[0].ml_predicted_time_ms == 50.0


class TestEmpiricalWorkloadRegression:
    """Regression tests using the 3 real empirical workload metric sets."""

    def test_workload_1_multi_table_join(self):
        """W1: Multi-Table JOIN with Aggregation.

        Index on foreign key order_items(order_id) drops latency by 75.7% and cost by 41.0%,
        though buffer accesses increase from 3,200 to 11,312 due to bitmap index scanning.
        Multi-objective score must rank optimized as Rank 1 and document the trade-off.
        """
        baseline = AlternativeMetrics(
            execution_time_ms=11.333,
            planner_cost=1632.51,
            buffer_reads=0,
            buffer_hits=3200,
            total_buffer_accesses=3200,
        )
        opt_alt = _alt(
            category="index",
            impact="high",
            exec_ms=2.749,
            cost=963.71,
            reads=0,
            hits=11312,
            sql="CREATE INDEX idx_order_items_order ON order_items(order_id);",
            explanation="B-tree index on foreign-key column order_items(order_id)",
        )
        opt_alt["raw_metrics"].total_buffer_accesses = 11312

        scored = normalise_and_score([opt_alt], baseline=baseline)
        assert len(scored) == 1
        top = scored[0]
        assert top.rank == 1

        # Check detailed breakdown structure
        assert len(top.detailed_breakdown) == 4
        details_by_name = {d.objective: d for d in top.detailed_breakdown}

        # Execution time: normalized penalty = 0.0 (fastest)
        exec_d = details_by_name["execution_time"]
        assert exec_d.original_value == 11.333
        assert exec_d.optimized_value == 2.749
        assert exec_d.direction == "minimize"
        assert exec_d.normalized_penalty == 0.0
        assert exec_d.weighted_contribution == 0.0

        # Planner cost: normalized penalty = 0.0 (lowest cost)
        cost_d = details_by_name["planner_cost"]
        assert cost_d.original_value == 1632.51
        assert cost_d.optimized_value == 963.71
        assert cost_d.direction == "minimize"
        assert cost_d.normalized_penalty == 0.0
        assert cost_d.weighted_contribution == 0.0

        # Buffer hits: normalized penalty = 1.0 (touches more cache blocks)
        acc_d = details_by_name["buffer_hits"]
        assert acc_d.original_value == 3200.0
        assert acc_d.optimized_value == 11312.0
        assert acc_d.direction == "minimize"
        assert acc_d.normalized_penalty == 1.0
        assert acc_d.weighted_contribution == 0.10

        # Final score = 0.1000 (well ahead of unoptimized baseline score 0.7000)
        assert round(top.weighted_score, 4) == 0.1000

    def test_workload_2_range_filter(self):
        """W2: Range Filter with Composite Index.

        Composite index on access_logs(status_code, response_time_ms) reduces:
        - Latency: 5.4925 ms -> 0.017 ms (-99.69%)
        - Cost: 1248.63 -> 64.16 (-94.86%)
        - Buffer Hits: 1353 -> 104 (-92.31%)
        All 4 objectives achieve minimum penalty 0.0 -> score 0.0000.
        """
        baseline = AlternativeMetrics(
            execution_time_ms=5.4925,
            planner_cost=1248.63,
            buffer_reads=0,
            buffer_hits=1353,
            total_buffer_accesses=1353,
        )
        opt_alt = _alt(
            category="index",
            impact="high",
            exec_ms=0.017,
            cost=64.16,
            reads=0,
            hits=104,
            sql="CREATE INDEX idx_access_logs_status_resp ON access_logs(status_code, response_time_ms);",
            explanation="Composite index on access_logs",
        )
        opt_alt["raw_metrics"].total_buffer_accesses = 104

        scored = normalise_and_score([opt_alt], baseline=baseline)
        top = scored[0]
        assert top.rank == 1
        assert top.weighted_score == 0.0000

        details = {d.objective: d for d in top.detailed_breakdown}
        assert details["buffer_hits"].original_value == 1353.0
        assert details["buffer_hits"].optimized_value == 104.0
        assert details["buffer_hits"].normalized_penalty == 0.0

    def test_workload_3_correlated_subquery_rewrite(self):
        """W3: Correlated Subquery Rewrite.

        Rewriting correlated subquery to LEFT JOIN ... GROUP BY reduces:
        - Latency: 625.5005 ms -> 2.269 ms (-99.64%)
        - Cost: 413569.24 -> 698.26 (-99.83%)
        - Buffer Hits: 827,152 -> 1,407 (-99.83%)
        Eliminating 10,000 repetitive scans drops memory accesses by 825,745 blocks.
        Preferred design rewards this massive reduction with penalty 0.0000.
        """
        baseline = AlternativeMetrics(
            execution_time_ms=625.5005,
            planner_cost=413569.24,
            buffer_reads=0,
            buffer_hits=827152,
            total_buffer_accesses=827152,
        )
        opt_alt = _alt(
            category="rewrite",
            impact="high",
            exec_ms=2.269,
            cost=698.26,
            reads=0,
            hits=1407,
            sql="SELECT u.id, u.name, COALESCE(o.cnt, 0) FROM users u LEFT JOIN ...",
            explanation="Correlated subquery rewritten to hash join",
        )
        opt_alt["raw_metrics"].total_buffer_accesses = 1407

        scored = normalise_and_score([opt_alt], baseline=baseline)
        top = scored[0]
        assert top.rank == 1
        assert top.weighted_score == 0.0000

        details = {d.objective: d for d in top.detailed_breakdown}
        assert details["buffer_hits"].original_value == 827152.0
        assert details["buffer_hits"].optimized_value == 1407.0
        assert details["buffer_hits"].normalized_penalty == 0.0

    def test_nested_plan_buffer_extraction_no_double_counting(self):
        """Verify that extract_metrics_from_plan extracts from root without summing child nodes."""
        from or_engine.objectives import extract_metrics_from_plan

        # Nested plan: Root has 550 hits, children have 550, 547, 319, 219, 9
        nested_plan = json.dumps([
            {
                "Plan": {
                    "Node Type": "Limit",
                    "Total Cost": 1632.51,
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
                "Execution Time": 54.18,
                "Planning Time": 1.25,
            }
        ])

        metrics = extract_metrics_from_plan(nested_plan)
        # Root aggregate is exactly 550 hits and 12 reads
        assert metrics.buffer_hits == 550
        assert metrics.buffer_reads == 12
        assert metrics.total_buffer_accesses == 562
        # Verify it did NOT sum (which would be 550 + 550 + 547 + 319 + 219 = 2185)
        assert metrics.buffer_hits < 2000


class TestWeightSensitivityAnalysis:
    """Evaluate ranking stability under reasonable variations in objective weights."""

    def test_w1_tradeoff_stability_across_weight_regimes(self):
        """W1 trade-off: Optimized is faster (-75.7%) and cheaper (-41.0%), but incurs more buffer touches (+253%).

        Optimized remains Rank 1 across all realistic database engineering weight regimes:
        - Default: 0.40 exec, 0.30 cost, 0.20 reads, 0.10 hits
        - Latency-Heavy: 0.70 exec, 0.10 cost, 0.10 reads, 0.10 hits
        - Cost-Heavy: 0.10 exec, 0.70 cost, 0.10 reads, 0.10 hits
        - I/O-Heavy: 0.20 exec, 0.20 cost, 0.50 reads, 0.10 hits
        - Cache-Heavy: 0.25 exec, 0.25 cost, 0.10 reads, 0.40 hits
        """
        baseline = AlternativeMetrics(
            execution_time_ms=11.333,
            planner_cost=1632.51,
            buffer_reads=0,
            buffer_hits=3200,
        )
        opt_alt = _alt(
            category="index",
            impact="high",
            exec_ms=2.749,
            cost=963.71,
            reads=0,
            hits=11312,
        )

        regimes = [
            ("Default", {ObjectiveName.EXECUTION_TIME: 0.40, ObjectiveName.PLANNER_COST: 0.30, ObjectiveName.BUFFER_READS: 0.20, ObjectiveName.BUFFER_HITS: 0.10}),
            ("Latency-Heavy", {ObjectiveName.EXECUTION_TIME: 0.70, ObjectiveName.PLANNER_COST: 0.10, ObjectiveName.BUFFER_READS: 0.10, ObjectiveName.BUFFER_HITS: 0.10}),
            ("Cost-Heavy", {ObjectiveName.EXECUTION_TIME: 0.10, ObjectiveName.PLANNER_COST: 0.70, ObjectiveName.BUFFER_READS: 0.10, ObjectiveName.BUFFER_HITS: 0.10}),
            ("I/O-Heavy", {ObjectiveName.EXECUTION_TIME: 0.20, ObjectiveName.PLANNER_COST: 0.20, ObjectiveName.BUFFER_READS: 0.50, ObjectiveName.BUFFER_HITS: 0.10}),
            ("Cache-Heavy", {ObjectiveName.EXECUTION_TIME: 0.25, ObjectiveName.PLANNER_COST: 0.25, ObjectiveName.BUFFER_READS: 0.10, ObjectiveName.BUFFER_HITS: 0.40}),
        ]

        for name, weights in regimes:
            scored = normalise_and_score([opt_alt], weights=weights, baseline=baseline)
            assert scored[0].rank == 1, f"Failed in regime {name}"
            # Score must strictly be lower than the unoptimized baseline reference score
            # Score(opt) = weights[hits] * 1.0; Score(baseline) = weights[exec]*1.0 + weights[cost]*1.0
            opt_score = scored[0].weighted_score
            w_exec = weights[ObjectiveName.EXECUTION_TIME]
            w_cost = weights[ObjectiveName.PLANNER_COST]
            w_hits = weights[ObjectiveName.BUFFER_HITS]
            baseline_score = w_exec + w_cost
            assert opt_score < baseline_score, f"Optimized did not beat baseline in {name}: {opt_score} vs {baseline_score}"

    def test_w2_and_w3_pareto_dominance_stability(self):
        """W2 and W3 improve across all dimensions, making them Pareto-dominant in all weight regimes."""
        w2_baseline = AlternativeMetrics(execution_time_ms=5.493, planner_cost=1248.63, buffer_reads=0, buffer_hits=1353)
        w2_opt = _alt(exec_ms=0.017, cost=64.16, reads=0, hits=104)

        w3_baseline = AlternativeMetrics(execution_time_ms=625.501, planner_cost=413569.24, buffer_reads=0, buffer_hits=827152)
        w3_opt = _alt(exec_ms=2.269, cost=698.26, reads=0, hits=1407)

        random_weights = [
            {ObjectiveName.EXECUTION_TIME: 0.1, ObjectiveName.PLANNER_COST: 0.1, ObjectiveName.BUFFER_READS: 0.1, ObjectiveName.BUFFER_HITS: 0.7},
            {ObjectiveName.EXECUTION_TIME: 0.8, ObjectiveName.PLANNER_COST: 0.1, ObjectiveName.BUFFER_READS: 0.05, ObjectiveName.BUFFER_HITS: 0.05},
            {ObjectiveName.EXECUTION_TIME: 0.25, ObjectiveName.PLANNER_COST: 0.25, ObjectiveName.BUFFER_READS: 0.25, ObjectiveName.BUFFER_HITS: 0.25},
        ]

        for w in random_weights:
            scored_w2 = normalise_and_score([w2_opt], weights=w, baseline=w2_baseline)
            assert scored_w2[0].rank == 1
            assert scored_w2[0].weighted_score == 0.0

            scored_w3 = normalise_and_score([w3_opt], weights=w, baseline=w3_baseline)
            assert scored_w3[0].rank == 1
            assert scored_w3[0].weighted_score == 0.0


class TestRootLevelConsistentScoring:
    """Validate OR scoring behavior using certified root-level PostgreSQL plan metrics."""

    def test_w1_root_level_scoring_with_buffer_hit_penalty(self):
        """W1 root metrics: baseline=550 hits, opt=2215 hits (warm) / 2116 hits + 99 reads (initial).

        Because buffer_hits direction='minimize', the index alternative touches more
        shared memory blocks in nested loop scans and incurs a 1.0 normalized penalty
        on buffer_hits (contribution = 0.10 * 1.0 = 0.10).
        Despite this, execution time and planner cost drop to 0.0 penalty, giving a
        composite score of 0.10 vs baseline score of 0.70.
        """
        w1_baseline = AlternativeMetrics(
            execution_time_ms=11.333,
            planner_cost=1632.51,
            buffer_reads=0,
            buffer_hits=550,
        )
        w1_opt = _alt(
            category="index",
            impact="high",
            exec_ms=2.749,
            cost=963.71,
            reads=0,
            hits=2215,
        )
        scored = normalise_and_score([w1_opt], baseline=w1_baseline)
        assert len(scored) == 1
        alt = scored[0]
        assert alt.rank == 1
        assert round(alt.weighted_score, 4) == 0.1000

        # Detailed breakdown check
        breakdown_by_obj = {d.objective: d for d in alt.detailed_breakdown}
        assert breakdown_by_obj["execution_time"].normalized_penalty == 0.0
        assert breakdown_by_obj["planner_cost"].normalized_penalty == 0.0
        assert breakdown_by_obj["buffer_reads"].normalized_penalty == 0.0
        assert breakdown_by_obj["buffer_hits"].normalized_penalty == 1.0
        assert round(breakdown_by_obj["buffer_hits"].weighted_contribution, 4) == 0.1000

    def test_w2_and_w3_root_level_pareto_dominance(self):
        """W2 and W3 root-level metrics strictly dominate baseline across all objectives."""
        # W2 root metrics: 451 baseline hits vs 52 optimized hits
        w2_baseline = AlternativeMetrics(
            execution_time_ms=5.4925,
            planner_cost=1248.63,
            buffer_reads=0,
            buffer_hits=451,
        )
        w2_opt = _alt(
            category="index",
            impact="high",
            exec_ms=0.017,
            cost=64.16,
            reads=0,
            hits=52,
        )
        scored_w2 = normalise_and_score([w2_opt], baseline=w2_baseline)
        assert scored_w2[0].weighted_score == 0.0

        # W3 root metrics: 141,525 baseline hits vs 271 optimized hits
        w3_baseline = AlternativeMetrics(
            execution_time_ms=625.5005,
            planner_cost=413569.24,
            buffer_reads=0,
            buffer_hits=141525,
        )
        w3_opt = _alt(
            category="rewrite",
            impact="high",
            exec_ms=2.269,
            cost=698.26,
            reads=0,
            hits=271,
        )
        scored_w3 = normalise_and_score([w3_opt], baseline=w3_baseline)
        assert scored_w3[0].weighted_score == 0.0
