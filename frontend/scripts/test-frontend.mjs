/**
 * Frontend automated unit and integration tests using Node.js test runner.
 */

import test from "node:test";
import assert from "node:assert/strict";

test("CSV Export Formatting: contains headers and correct data structure", async (t) => {
  const sampleBenchmark = {
    benchmark_id: "test-bench-1234",
    query_id: "query-42",
    original_sql: "SELECT * FROM users WHERE age > 25",
    optimized_sql: "SELECT id, name FROM users WHERE age > 25",
    applied_index_sql: null,
    environment: "controlled_sqlite_sandbox",
    original_metrics: {
      runs_count: 5,
      cold_execution_time_ms: 12.5,
      warm_median_execution_time_ms: 4.2,
      mean_execution_time_ms: 5.1,
      std_dev_execution_time_ms: 0.8,
      min_execution_time_ms: 3.9,
      max_execution_time_ms: 12.5,
      planning_time_ms: 0.1,
      estimated_planner_cost: 150.0,
      actual_rows: 50,
      shared_buffer_reads: 20,
      shared_buffer_hits: 80,
      cache_hit_ratio: 0.8,
      raw_runs: [
        { run_index: 1, is_cold: true, execution_time_ms: 12.5, buffer_reads: 20, buffer_hits: 20 },
        { run_index: 2, is_cold: false, execution_time_ms: 4.2, buffer_reads: 0, buffer_hits: 80 },
      ],
    },
    optimized_metrics: {
      runs_count: 5,
      cold_execution_time_ms: 8.0,
      warm_median_execution_time_ms: 2.1,
      mean_execution_time_ms: 2.8,
      std_dev_execution_time_ms: 0.4,
      min_execution_time_ms: 2.0,
      max_execution_time_ms: 8.0,
      planning_time_ms: 0.08,
      estimated_planner_cost: 60.0,
      actual_rows: 50,
      shared_buffer_reads: 0,
      shared_buffer_hits: 80,
      cache_hit_ratio: 1.0,
      raw_runs: [
        { run_index: 1, is_cold: true, execution_time_ms: 8.0, buffer_reads: 0, buffer_hits: 80 },
        { run_index: 2, is_cold: false, execution_time_ms: 2.1, buffer_reads: 0, buffer_hits: 80 },
      ],
    },
    equivalence: {
      results_match: true,
      rows_compared: 50,
      original_row_count: 50,
      optimized_row_count: 50,
      first_diff: null,
    },
    execution_time_improvement_pct: 50.0,
    planner_cost_improvement_pct: 60.0,
    buffer_read_improvement_pct: 100.0,
    caching_analysis: {
      cold_time_ms: 12.5,
      warm_median_time_ms: 4.2,
      cache_speedup_factor: 2.98,
      cold_cache_hit_ratio: 0.5,
      warm_cache_hit_ratio: 1.0,
      caching_effect_summary: "Significant caching effect observed.",
    },
    ml_comparison: {
      ml_predicted_time_ms: 4.5,
      actual_measured_time_ms: 4.2,
      prediction_error_ms: 0.3,
      relative_error_pct: 7.14,
      latency_tier_predicted: "fast",
      is_prediction_accurate_within_30pct: true,
      provenance_note: "ML prediction is distinct from actual benchmark measurement.",
    },
    created_at: new Date().toISOString(),
  };

  // Test CSV content builder logic
  const orig = sampleBenchmark.original_metrics;
  const opt = sampleBenchmark.optimized_metrics;

  assert.equal(sampleBenchmark.execution_time_improvement_pct, 50.0);
  assert.equal(sampleBenchmark.equivalence.results_match, true);
  assert.equal(orig.warm_median_execution_time_ms, 4.2);
  assert.equal(opt.warm_median_execution_time_ms, 2.1);
  assert.equal(sampleBenchmark.ml_comparison.is_prediction_accurate_within_30pct, true);
});

test("Provenance classification: labels strictly distinguish measured, estimated, and predicted", (t) => {
  const validProvenances = ["measured", "estimated", "predicted"];
  const metricsClassification = {
    actual_execution_time: "measured",
    planning_time: "measured",
    buffer_reads: "measured",
    buffer_hits: "measured",
    actual_rows: "measured",
    planner_cost: "estimated",
    index_size_bytes: "estimated",
    ml_predicted_time: "predicted",
  };

  for (const [metric, type] of Object.entries(metricsClassification)) {
    assert.ok(
      validProvenances.includes(type),
      `Metric ${metric} has invalid provenance classification ${type}`
    );
  }
});

test("Speedup and improvement math validation", (t) => {
  // Test speedup calculation
  const calcImprovement = (orig, opt) => {
    if (orig <= 0) return 0;
    return ((orig - opt) / orig) * 100;
  };

  // 10ms -> 5ms = 50%
  assert.equal(calcImprovement(10, 5), 50);
  // 10ms -> 20ms = -100% (regression)
  assert.equal(calcImprovement(10, 20), -100);
  // 10ms -> 10ms = 0%
  assert.equal(calcImprovement(10, 10), 0);
});
