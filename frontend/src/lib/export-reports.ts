/**
 * Utility functions for exporting benchmark results to CSV and downloadable PDF reports.
 */

import { jsPDF } from "jspdf";
import type { BenchmarkComparisonResult } from "./types";

/**
 * Export benchmark comparison metrics and trial runs to a CSV file.
 */
export function exportBenchmarkCSV(benchmark: BenchmarkComparisonResult): void {
  const orig = benchmark.original_metrics;
  const opt = benchmark.optimized_metrics;

  const rows: string[][] = [
    ["OptimizeQL Query Performance Benchmark Report"],
    ["Benchmark ID", benchmark.benchmark_id],
    ["Generated At", benchmark.created_at],
    ["Environment / Engine", benchmark.environment],
    ["Trials Executed", String(orig.runs_count)],
    ["Original SQL", `"${benchmark.original_sql.replace(/"/g, '""')}"`],
    [
      "Optimized Target",
      benchmark.applied_index_sql
        ? `"Index: ${benchmark.applied_index_sql.replace(/"/g, '""')}"`
        : benchmark.optimized_sql
          ? `"Rewrite: ${benchmark.optimized_sql.replace(/"/g, '""')}"`
          : "N/A",
    ],
    [],
    ["METRIC SUMMARY", "TYPE", "ORIGINAL", "OPTIMIZED", "IMPROVEMENT %"],
    [
      "Warm Median Execution Time (ms)",
      "[MEASURED]",
      orig.warm_median_execution_time_ms.toFixed(4),
      opt ? opt.warm_median_execution_time_ms.toFixed(4) : "N/A",
      benchmark.execution_time_improvement_pct != null
        ? `${benchmark.execution_time_improvement_pct.toFixed(2)}%`
        : "N/A",
    ],
    [
      "Trial 1 (Initial Run) Time (ms)",
      "[MEASURED]",
      orig.cold_execution_time_ms != null ? orig.cold_execution_time_ms.toFixed(4) : "N/A",
      opt?.cold_execution_time_ms != null ? opt.cold_execution_time_ms.toFixed(4) : "N/A",
      "N/A",
    ],
    [
      "Mean Execution Time (ms)",
      "[MEASURED]",
      orig.mean_execution_time_ms.toFixed(4),
      opt ? opt.mean_execution_time_ms.toFixed(4) : "N/A",
      "N/A",
    ],
    [
      "Standard Deviation (ms)",
      "[MEASURED]",
      orig.std_dev_execution_time_ms.toFixed(4),
      opt ? opt.std_dev_execution_time_ms.toFixed(4) : "N/A",
      "N/A",
    ],
    [
      "Planning Time (ms)",
      "[MEASURED]",
      orig.planning_time_ms != null ? orig.planning_time_ms.toFixed(4) : "N/A",
      opt?.planning_time_ms != null ? opt.planning_time_ms.toFixed(4) : "N/A",
      "N/A",
    ],
    [
      "Estimated Planner Cost",
      "[ESTIMATED]",
      orig.estimated_planner_cost != null ? orig.estimated_planner_cost.toFixed(2) : "N/A",
      opt?.estimated_planner_cost != null ? opt.estimated_planner_cost.toFixed(2) : "N/A",
      benchmark.planner_cost_improvement_pct != null
        ? `${benchmark.planner_cost_improvement_pct.toFixed(2)}%`
        : "N/A",
    ],
    [
      "Shared Buffer Read Blocks (Root Aggregate)",
      "[MEASURED]",
      orig.shared_buffer_reads != null ? String(orig.shared_buffer_reads) : "0",
      opt?.shared_buffer_reads != null ? String(opt.shared_buffer_reads) : "0",
      benchmark.buffer_read_improvement_pct != null
        ? `${benchmark.buffer_read_improvement_pct.toFixed(2)}%`
        : "N/A",
    ],
    [
      "Shared Buffer Hit Blocks (Root Aggregate)",
      "[MEASURED]",
      orig.shared_buffer_hits != null ? String(orig.shared_buffer_hits) : "0",
      opt?.shared_buffer_hits != null ? String(opt.shared_buffer_hits) : "0",
      "N/A",
    ],
    [],
    ["RESULT SET EQUIVALENCE"],
    ["Results Match", benchmark.equivalence ? String(benchmark.equivalence.results_match) : "N/A"],
    ["Rows Compared", benchmark.equivalence ? String(benchmark.equivalence.rows_compared) : "N/A"],
    ["Order By Checked", benchmark.equivalence?.order_by_checked ? "Yes (Strict sequence)" : "No (Multiset)"],
    ["Equivalence Note", `"${(benchmark.equivalence?.equivalence_note ?? "Bounded sample check").replace(/"/g, '""')}"`],
    [],
    ["CACHING TELEMETRY"],
    ["Trial 1 Initial Time (ms)", String(benchmark.caching_analysis.cold_time_ms ?? "N/A")],
    ["Warm Median Time (ms)", String(benchmark.caching_analysis.warm_median_time_ms)],
    ["Cache Speedup Factor", `${benchmark.caching_analysis.cache_speedup_factor ?? 1.0}x`],
    ["Summary", `"${benchmark.caching_analysis.caching_effect_summary.replace(/"/g, '""')}"`],
  ];

  // Append ML Comparison if present
  if (benchmark.ml_comparison) {
    rows.push(
      [],
      ["ML PRE-EXECUTION PREDICTION VALIDATION"],
      ["ML Predicted Time (ms)", String(benchmark.ml_comparison.ml_predicted_time_ms)],
      ["Actual Measured Warm Median (ms)", String(benchmark.ml_comparison.actual_measured_time_ms)],
      ["Absolute Prediction Error (ms)", String(benchmark.ml_comparison.prediction_error_ms)],
      ["Relative Error %", `${benchmark.ml_comparison.relative_error_pct}%`],
      ["Accurate within ±30%", String(benchmark.ml_comparison.is_prediction_accurate_within_30pct)],
      ["Provenance Note", `"${benchmark.ml_comparison.provenance_note.replace(/"/g, '""')}"`]
    );
  }

  // Append raw runs table
  rows.push([], ["ORIGINAL QUERY TRIAL RUNS", "TRIAL #", "PHASE", "EXECUTION TIME (ms)", "BUFFER READS", "BUFFER HITS (ROOT)"]);
  orig.raw_runs.forEach((r) => {
    rows.push([
      "Original",
      `Run ${r.run_index}`,
      r.is_cold ? "Initial Run" : "Warm",
      r.execution_time_ms.toFixed(4),
      String(r.buffer_reads ?? 0),
      String(r.buffer_hits ?? 0),
    ]);
  });

  if (opt?.raw_runs?.length) {
    rows.push([], ["OPTIMIZED QUERY TRIAL RUNS", "TRIAL #", "PHASE", "EXECUTION TIME (ms)", "BUFFER READS", "BUFFER HITS (ROOT)"]);
    opt.raw_runs.forEach((r) => {
      rows.push([
        "Optimized",
        `Run ${r.run_index}`,
        r.is_cold ? "Initial Run" : "Warm",
        r.execution_time_ms.toFixed(4),
        String(r.buffer_reads ?? 0),
        String(r.buffer_hits ?? 0),
      ]);
    });
  }

  const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `benchmark-${benchmark.benchmark_id.slice(0, 8)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate a PDF report for a benchmark comparison.
 */
export function exportBenchmarkPDF(benchmark: BenchmarkComparisonResult): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 40;
  let y = 50;

  // Header banner
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, 612, 45, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("OptimizeQL — Query Benchmark Report", margin, 28);

  // Metadata block
  y = 70;
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Benchmark ID: ${benchmark.benchmark_id}`, margin, y);
  doc.text(`Environment: ${benchmark.environment}`, 350, y);
  y += 14;
  doc.text(`Timestamp: ${benchmark.created_at}`, margin, y);
  doc.text(`Trials Executed: ${benchmark.original_metrics.runs_count} runs`, 350, y);

  // Performance Highlights Box
  y += 24;
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, y, 532, 60, 4, 4, "F");

  doc.setTextColor(30, 58, 95);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("KEY PERFORMANCE IMPROVEMENTS", margin + 12, y + 18);

  doc.setFontSize(14);
  const execImp = benchmark.execution_time_improvement_pct;
  const costImp = benchmark.planner_cost_improvement_pct;
  const readsImp = benchmark.buffer_read_improvement_pct;

  doc.setTextColor(execImp && execImp > 0 ? 16 : 180, execImp && execImp > 0 ? 120 : 40, 40);
  doc.text(
    `Latency: ${execImp != null ? (execImp > 0 ? "+" : "") + execImp.toFixed(1) + "%" : "N/A"}`,
    margin + 12,
    y + 42
  );

  doc.setTextColor(costImp && costImp > 0 ? 16 : 180, costImp && costImp > 0 ? 120 : 40, 40);
  doc.text(
    `Planner Cost: ${costImp != null ? (costImp > 0 ? "+" : "") + costImp.toFixed(1) + "%" : "N/A"}`,
    margin + 180,
    y + 42
  );

  doc.setTextColor(readsImp && readsImp > 0 ? 16 : 180, readsImp && readsImp > 0 ? 120 : 40, 40);
  doc.text(
    `Buffer Reads: ${readsImp != null ? (readsImp > 0 ? "+" : "") + readsImp.toFixed(1) + "%" : "N/A"}`,
    margin + 360,
    y + 42
  );

  // Metrics Table
  y += 85;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 58, 95);
  doc.text("Empirical Telemetry Comparison", margin, y);

  y += 15;
  doc.setFontSize(8);
  doc.setFillColor(230, 235, 245);
  doc.rect(margin, y, 532, 18, "F");
  doc.setTextColor(50, 50, 50);
  doc.text("Metric", margin + 6, y + 12);
  doc.text("Provenance", margin + 180, y + 12);
  doc.text("Original", margin + 280, y + 12);
  doc.text("Optimized", margin + 370, y + 12);
  doc.text("Improvement", margin + 460, y + 12);

  const orig = benchmark.original_metrics;
  const opt = benchmark.optimized_metrics;

  const tableData: [string, string, string, string, string][] = [
    [
      "Warm Median Latency",
      "[MEASURED]",
      `${orig.warm_median_execution_time_ms.toFixed(2)} ms`,
      opt ? `${opt.warm_median_execution_time_ms.toFixed(2)} ms` : "N/A",
      execImp != null ? `${execImp.toFixed(1)}%` : "N/A",
    ],
    [
      "Trial 1 Latency (Initial)",
      "[MEASURED]",
      orig.cold_execution_time_ms != null ? `${orig.cold_execution_time_ms.toFixed(2)} ms` : "N/A",
      opt?.cold_execution_time_ms != null ? `${opt.cold_execution_time_ms.toFixed(2)} ms` : "N/A",
      "N/A",
    ],
    [
      "Mean Latency (± StdDev)",
      "[MEASURED]",
      `${orig.mean_execution_time_ms.toFixed(2)} ± ${orig.std_dev_execution_time_ms.toFixed(2)} ms`,
      opt ? `${opt.mean_execution_time_ms.toFixed(2)} ± ${opt.std_dev_execution_time_ms.toFixed(2)} ms` : "N/A",
      "N/A",
    ],
    [
      "Planner Estimated Cost",
      "[ESTIMATED]",
      orig.estimated_planner_cost != null ? orig.estimated_planner_cost.toFixed(1) : "N/A",
      opt?.estimated_planner_cost != null ? opt.estimated_planner_cost.toFixed(1) : "N/A",
      costImp != null ? `${costImp.toFixed(1)}%` : "N/A",
    ],
    [
      "Shared Buffer Read Blocks",
      "[MEASURED]",
      orig.shared_buffer_reads != null ? `${orig.shared_buffer_reads} blocks` : "0",
      opt?.shared_buffer_reads != null ? `${opt.shared_buffer_reads} blocks` : "0",
      readsImp != null ? `${readsImp.toFixed(1)}%` : "N/A",
    ],
    [
      "Shared Buffer Hit Blocks (Root Aggregate)",
      "[MEASURED]",
      orig.shared_buffer_hits != null ? `${orig.shared_buffer_hits} blocks` : "0",
      opt?.shared_buffer_hits != null ? `${opt.shared_buffer_hits} blocks` : "0",
      "N/A",
    ],
  ];

  doc.setFont("helvetica", "normal");
  y += 18;
  tableData.forEach((row, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(250, 250, 252);
      doc.rect(margin, y, 532, 16, "F");
    }
    doc.text(row[0], margin + 6, y + 11);
    doc.text(row[1], margin + 180, y + 11);
    doc.text(row[2], margin + 280, y + 11);
    doc.text(row[3], margin + 370, y + 11);
    doc.text(row[4], margin + 460, y + 11);
    y += 16;
  });

  // Equivalence & Caching Section
  y += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 95);
  doc.text("Result-Set Equivalence & Caching Analysis", margin, y);

  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  const eq = benchmark.equivalence;
  doc.text(
    `Result Equivalence: ${eq ? (eq.results_match ? "VERIFIED BOUNDED MATCH (Sample rows match)" : "MISMATCH DETECTED") : "N/A"} (Rows compared: ${eq?.rows_compared ?? 0})`,
    margin,
    y
  );

  y += 12;
  const ca = benchmark.caching_analysis;
  doc.text(
    `Caching Telemetry: Speedup Factor: ${ca.cache_speedup_factor ?? 1.0}x | Trial 1 (Initial): ${ca.cold_time_ms ?? "N/A"} ms vs Warm Median: ${ca.warm_median_time_ms} ms`,
    margin,
    y
  );

  // ML Prediction Validation Section if available
  if (benchmark.ml_comparison) {
    y += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 95);
    doc.text("Machine Learning Model Validation", margin, y);

    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    const ml = benchmark.ml_comparison;
    doc.text(
      `Pre-execution Predicted: ${ml.ml_predicted_time_ms} ms | Measured Warm Median: ${ml.actual_measured_time_ms} ms`,
      margin,
      y
    );
    y += 12;
    doc.text(
      `Absolute Error: ${ml.prediction_error_ms} ms (Relative: ${ml.relative_error_pct}%) | Within ±30% SLA: ${ml.is_prediction_accurate_within_30pct ? "YES" : "NO"}`,
      margin,
      y
    );
    y += 12;
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`Provenance Note: ${ml.provenance_note}`, margin, y);
  }

  // Footer
  doc.setFontSize(7.5);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "Generated automatically by OptimizeQL Intelligent Query Optimization Framework",
    margin,
    750
  );

  doc.save(`benchmark-${benchmark.benchmark_id.slice(0, 8)}.pdf`);
}
