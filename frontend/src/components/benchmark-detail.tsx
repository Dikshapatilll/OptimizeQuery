"use client";

import React, { useState } from "react";
import type { BenchmarkComparisonResult } from "@/lib/types";
import { ProvenanceBadge } from "./provenance-badge";
import {
  LatencyComparisonChart,
  CostAndBufferChart,
  TrialRunVarianceChart,
  MLAccuracyChart,
} from "./benchmark-charts";
import { exportBenchmarkCSV, exportBenchmarkPDF } from "@/lib/export-reports";

interface BenchmarkDetailProps {
  benchmark: BenchmarkComparisonResult;
  onBack?: () => void;
}

export function BenchmarkDetail({ benchmark, onBack }: BenchmarkDetailProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "charts" | "trials" | "ml">("summary");
  const orig = benchmark.original_metrics;
  const opt = benchmark.optimized_metrics;
  const execImp = benchmark.execution_time_improvement_pct;
  const costImp = benchmark.planner_cost_improvement_pct;
  const readsImp = benchmark.buffer_read_improvement_pct;

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-(--color-border) pb-4">
        <div>
          {onBack && (
            <button
              onClick={onBack}
              className="text-xs text-(--color-text-muted) hover:text-(--color-foreground) flex items-center gap-1.5 mb-2 transition-colors cursor-pointer"
            >
              &larr; Back to Benchmark History
            </button>
          )}
          <h2 className="text-xl font-bold text-(--color-foreground) flex items-center gap-2.5">
            Benchmark Comparison Results
            <span className="text-xs font-mono font-normal px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-(--color-text-muted)">
              {benchmark.environment}
            </span>
          </h2>
          <p className="text-xs text-(--color-text-muted) mt-0.5 font-mono">
            ID: {benchmark.benchmark_id} &bull; Timestamp: {new Date(benchmark.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportBenchmarkCSV(benchmark)}
            className="px-3 py-1.5 rounded-lg border border-(--color-border) bg-(--color-surface) text-xs font-medium text-(--color-foreground) hover:bg-(--color-surface-muted) transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <span>📥</span> Export CSV
          </button>
          <button
            onClick={() => exportBenchmarkPDF(benchmark)}
            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <span>📄</span> Download PDF Report
          </button>
        </div>
      </div>

      {/* KPI Improvement cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-(--color-border) bg-(--color-surface) shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider">
              Latency Speedup
            </span>
            <ProvenanceBadge type="measured" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono ${
                execImp != null && execImp > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : execImp != null && execImp < 0
                    ? "text-red-500"
                    : "text-(--color-foreground)"
              }`}
            >
              {execImp != null ? `${execImp > 0 ? "+" : ""}${execImp.toFixed(1)}%` : "N/A"}
            </span>
            {opt && (
              <span className="text-xs font-mono text-(--color-text-faint)">
                {orig.warm_median_execution_time_ms.toFixed(2)} ms &rarr; {opt.warm_median_execution_time_ms.toFixed(2)} ms
              </span>
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-(--color-border) bg-(--color-surface) shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider">
              Planner Cost Reduction
            </span>
            <ProvenanceBadge type="estimated" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono ${
                costImp != null && costImp > 0
                  ? "text-violet-600 dark:text-violet-400"
                  : costImp != null && costImp < 0
                    ? "text-red-500"
                    : "text-(--color-foreground)"
              }`}
            >
              {costImp != null ? `${costImp > 0 ? "+" : ""}${costImp.toFixed(1)}%` : "N/A"}
            </span>
            {opt?.estimated_planner_cost != null && orig.estimated_planner_cost != null && (
              <span className="text-xs font-mono text-(--color-text-faint)">
                {orig.estimated_planner_cost.toFixed(1)} &rarr; {opt.estimated_planner_cost.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-(--color-border) bg-(--color-surface) shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider">
              Buffer Read Reduction
            </span>
            <ProvenanceBadge type="measured" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono ${
                readsImp != null && readsImp > 0
                  ? "text-teal-600 dark:text-teal-400"
                  : readsImp != null && readsImp < 0
                    ? "text-red-500"
                    : "text-(--color-foreground)"
              }`}
            >
              {readsImp != null ? `${readsImp > 0 ? "+" : ""}${readsImp.toFixed(1)}%` : "N/A"}
            </span>
            {opt?.shared_buffer_reads != null && orig.shared_buffer_reads != null && (
              <span className="text-xs font-mono text-(--color-text-faint)">
                {orig.shared_buffer_reads} &rarr; {opt.shared_buffer_reads} blocks
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="border-b border-(--color-border) flex gap-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("summary")}
          className={`pb-2.5 transition-colors cursor-pointer ${
            activeTab === "summary"
              ? "border-b-2 border-teal-600 text-teal-600 dark:text-teal-400 font-bold"
              : "text-(--color-text-muted) hover:text-(--color-foreground)"
          }`}
        >
          Detailed Telemetry
        </button>
        <button
          onClick={() => setActiveTab("charts")}
          className={`pb-2.5 transition-colors cursor-pointer ${
            activeTab === "charts"
              ? "border-b-2 border-teal-600 text-teal-600 dark:text-teal-400 font-bold"
              : "text-(--color-text-muted) hover:text-(--color-foreground)"
          }`}
        >
          Visual Analytics
        </button>
        <button
          onClick={() => setActiveTab("trials")}
          className={`pb-2.5 transition-colors cursor-pointer ${
            activeTab === "trials"
              ? "border-b-2 border-teal-600 text-teal-600 dark:text-teal-400 font-bold"
              : "text-(--color-text-muted) hover:text-(--color-foreground)"
          }`}
        >
          Trial Observations ({orig.runs_count})
        </button>
        {benchmark.ml_comparison && (
          <button
            onClick={() => setActiveTab("ml")}
            className={`pb-2.5 transition-colors cursor-pointer ${
              activeTab === "ml"
                ? "border-b-2 border-teal-600 text-teal-600 dark:text-teal-400 font-bold"
                : "text-(--color-text-muted) hover:text-(--color-foreground)"
            }`}
          >
            ML Prediction Validation
          </button>
        )}
      </div>

      {/* Tab 1: Detailed Telemetry Table */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-(--color-border) overflow-hidden bg-(--color-surface)">
            <table className="w-full text-left text-xs">
              <thead className="bg-(--color-surface-muted) text-(--color-text-muted) uppercase tracking-wider font-semibold border-b border-(--color-border)">
                <tr>
                  <th className="py-3 px-4">Metric</th>
                  <th className="py-3 px-4">Provenance</th>
                  <th className="py-3 px-4">Original Query</th>
                  <th className="py-3 px-4">Optimized Target</th>
                  <th className="py-3 px-4">Improvement %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                <tr className="hover:bg-gray-50/50 dark:hover:bg-white/5">
                  <td className="py-3 px-4 font-medium text-(--color-foreground)">Warm Median Execution Time</td>
                  <td className="py-3 px-4"><ProvenanceBadge type="measured" /></td>
                  <td className="py-3 px-4 font-mono">{orig.warm_median_execution_time_ms.toFixed(4)} ms</td>
                  <td className="py-3 px-4 font-mono">{opt ? `${opt.warm_median_execution_time_ms.toFixed(4)} ms` : "—"}</td>
                  <td className="py-3 px-4 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {execImp != null ? `${execImp.toFixed(2)}%` : "—"}
                  </td>
                </tr>
                <tr className="hover:bg-gray-50/50 dark:hover:bg-white/5">
                  <td className="py-3 px-4 font-medium text-(--color-foreground)">Trial 1 Latency (Initial Run)</td>
                  <td className="py-3 px-4"><ProvenanceBadge type="measured" /></td>
                  <td className="py-3 px-4 font-mono">{orig.cold_execution_time_ms != null ? `${orig.cold_execution_time_ms.toFixed(4)} ms` : "—"}</td>
                  <td className="py-3 px-4 font-mono">{opt?.cold_execution_time_ms != null ? `${opt.cold_execution_time_ms.toFixed(4)} ms` : "—"}</td>
                  <td className="py-3 px-4 font-mono">—</td>
                </tr>
                <tr className="hover:bg-gray-50/50 dark:hover:bg-white/5">
                  <td className="py-3 px-4 font-medium text-(--color-foreground)">Mean ± Std. Deviation</td>
                  <td className="py-3 px-4"><ProvenanceBadge type="measured" /></td>
                  <td className="py-3 px-4 font-mono">{orig.mean_execution_time_ms.toFixed(2)} ± {orig.std_dev_execution_time_ms.toFixed(2)} ms</td>
                  <td className="py-3 px-4 font-mono">{opt ? `${opt.mean_execution_time_ms.toFixed(2)} ± ${opt.std_dev_execution_time_ms.toFixed(2)} ms` : "—"}</td>
                  <td className="py-3 px-4 font-mono">—</td>
                </tr>
                <tr className="hover:bg-gray-50/50 dark:hover:bg-white/5">
                  <td className="py-3 px-4 font-medium text-(--color-foreground)">Planning Time</td>
                  <td className="py-3 px-4"><ProvenanceBadge type="measured" /></td>
                  <td className="py-3 px-4 font-mono">{orig.planning_time_ms != null ? `${orig.planning_time_ms.toFixed(4)} ms` : "—"}</td>
                  <td className="py-3 px-4 font-mono">{opt?.planning_time_ms != null ? `${opt.planning_time_ms.toFixed(4)} ms` : "—"}</td>
                  <td className="py-3 px-4 font-mono">—</td>
                </tr>
                <tr className="hover:bg-gray-50/50 dark:hover:bg-white/5">
                  <td className="py-3 px-4 font-medium text-(--color-foreground)">Estimated Planner Cost</td>
                  <td className="py-3 px-4"><ProvenanceBadge type="estimated" /></td>
                  <td className="py-3 px-4 font-mono">{orig.estimated_planner_cost != null ? orig.estimated_planner_cost.toFixed(2) : "—"}</td>
                  <td className="py-3 px-4 font-mono">{opt?.estimated_planner_cost != null ? opt.estimated_planner_cost.toFixed(2) : "—"}</td>
                  <td className="py-3 px-4 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                    {costImp != null ? `${costImp.toFixed(2)}%` : "—"}
                  </td>
                </tr>
                <tr className="hover:bg-gray-50/50 dark:hover:bg-white/5">
                  <td className="py-3 px-4 font-medium text-(--color-foreground)">Shared Buffer Read Blocks (Root Aggregate)</td>
                  <td className="py-3 px-4"><ProvenanceBadge type="measured" /></td>
                  <td className="py-3 px-4 font-mono">{orig.shared_buffer_reads ?? 0} blocks</td>
                  <td className="py-3 px-4 font-mono">{opt ? `${opt.shared_buffer_reads ?? 0} blocks` : "—"}</td>
                  <td className="py-3 px-4 font-mono font-semibold text-teal-600 dark:text-teal-400">
                    {readsImp != null ? `${readsImp.toFixed(2)}%` : "—"}
                  </td>
                </tr>
                <tr className="hover:bg-gray-50/50 dark:hover:bg-white/5">
                  <td className="py-3 px-4 font-medium text-(--color-foreground)">Shared Buffer Hit Blocks (Root Aggregate)</td>
                  <td className="py-3 px-4"><ProvenanceBadge type="measured" /></td>
                  <td className="py-3 px-4 font-mono">{orig.shared_buffer_hits ?? 0} blocks</td>
                  <td className="py-3 px-4 font-mono">{opt ? `${opt.shared_buffer_hits ?? 0} blocks` : "—"}</td>
                  <td className="py-3 px-4 font-mono">—</td>
                </tr>
                <tr className="hover:bg-gray-50/50 dark:hover:bg-white/5">
                  <td className="py-3 px-4 font-medium text-(--color-foreground)">Actual Rows Processed</td>
                  <td className="py-3 px-4"><ProvenanceBadge type="measured" /></td>
                  <td className="py-3 px-4 font-mono">{orig.actual_rows != null ? orig.actual_rows : "—"}</td>
                  <td className="py-3 px-4 font-mono">{opt?.actual_rows != null ? opt.actual_rows : "—"}</td>
                  <td className="py-3 px-4 font-mono">—</td>
                </tr>
              </tbody>
            </table>
            <div className="px-4 py-2.5 bg-(--color-surface-muted) border-t border-(--color-border) text-[11px] text-(--color-text-muted) flex items-center gap-1.5">
              <span>ℹ️</span>
              <span>Buffer metrics reflect authoritative root plan-node accesses (8 KiB per block), distinguishing true query resource consumption from recursive diagnostic node sums that double-count nested plan operations.</span>
            </div>
          </div>

          {/* Equivalence and Caching details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-(--color-border) bg-(--color-surface)">
              <h3 className="text-sm font-semibold text-(--color-foreground) mb-2 flex items-center gap-2">
                <span>🔍</span> Result-Set Equivalence Verification
              </h3>
              {benchmark.equivalence ? (
                <div className="text-xs space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-(--color-text-muted)">Status:</span>
                    <span
                      className={`font-semibold px-2 py-0.5 rounded ${
                        benchmark.equivalence.results_match
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                          : "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300"
                      }`}
                    >
                      {benchmark.equivalence.results_match ? "VERIFIED BOUNDED MATCH" : "MISMATCH"}
                    </span>
                    {benchmark.equivalence.order_by_checked && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 text-[10px] font-mono">
                        ORDER BY Verified
                      </span>
                    )}
                  </div>
                  <p className="text-(--color-text-muted)">
                    Rows compared: <span className="font-mono">{benchmark.equivalence.rows_compared}</span> (Original: {benchmark.equivalence.original_row_count}, Optimized: {benchmark.equivalence.optimized_row_count})
                  </p>
                  {benchmark.equivalence.equivalence_note && (
                    <p className="text-[11px] text-(--color-text-faint) italic">
                      {benchmark.equivalence.equivalence_note}
                    </p>
                  )}
                  {benchmark.equivalence.first_diff && (
                    <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-[11px] font-mono text-red-700 dark:text-red-300">
                      First diff at row {benchmark.equivalence.first_diff.row_number}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-(--color-text-muted)">
                  No query rewrite was supplied for equivalence diffing (single query or index benchmark).
                </p>
              )}
            </div>

            <div className="p-4 rounded-xl border border-(--color-border) bg-(--color-surface)">
              <h3 className="text-sm font-semibold text-(--color-foreground) mb-2 flex items-center gap-2">
                <span>⚡</span> Caching Effects & Buffer Analysis
              </h3>
              <p className="text-xs text-(--color-foreground) leading-relaxed">
                {benchmark.caching_analysis.caching_effect_summary}
              </p>
              {benchmark.caching_analysis.cache_speedup_factor != null && (
                <div className="mt-3 text-xs font-mono text-(--color-text-muted) flex items-center gap-4">
                  <span>Speedup: <strong>{benchmark.caching_analysis.cache_speedup_factor}x</strong></span>
                  <span>Initial Run: {benchmark.caching_analysis.cold_time_ms} ms</span>
                  <span>Warm: {benchmark.caching_analysis.warm_median_time_ms} ms</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Visual Charts */}
      {activeTab === "charts" && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-(--color-border) bg-(--color-surface)">
            <h3 className="text-sm font-semibold text-(--color-foreground) mb-3 flex items-center gap-2">
              <span>📊</span> Latency Comparison: Initial Run vs Warm Median (ms)
            </h3>
            <LatencyComparisonChart original={orig} optimized={opt} />
          </div>

          <div className="p-4 rounded-xl border border-(--color-border) bg-(--color-surface)">
            <h3 className="text-sm font-semibold text-(--color-foreground) mb-3 flex items-center gap-2">
              <span>📈</span> Multi-trial Execution Variance & Warmup Effect
            </h3>
            <TrialRunVarianceChart original={orig} optimized={opt} />
          </div>

          <div className="p-4 rounded-xl border border-(--color-border) bg-(--color-surface)">
            <h3 className="text-sm font-semibold text-(--color-foreground) mb-3 flex items-center gap-2">
              <span>💾</span> Planner Cost and Shared Buffer Blocks Comparison
            </h3>
            <CostAndBufferChart original={orig} optimized={opt} />
          </div>
        </div>
      )}

      {/* Tab 3: Individual Trial Runs */}
      {activeTab === "trials" && (
        <div className="rounded-xl border border-(--color-border) overflow-hidden bg-(--color-surface)">
          <table className="w-full text-left text-xs">
            <thead className="bg-(--color-surface-muted) text-(--color-text-muted) uppercase tracking-wider font-semibold border-b border-(--color-border)">
              <tr>
                <th className="py-3 px-4">Trial</th>
                <th className="py-3 px-4">Cache Phase</th>
                <th className="py-3 px-4">Original Time (ms)</th>
                <th className="py-3 px-4">Optimized Time (ms)</th>
                <th className="py-3 px-4">Buffer Reads</th>
                <th className="py-3 px-4">Buffer Hits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {orig.raw_runs.map((r, i) => {
                const optRun = opt?.raw_runs?.[i];
                return (
                  <tr key={r.run_index} className="hover:bg-gray-50/50 dark:hover:bg-white/5 font-mono">
                    <td className="py-2.5 px-4 font-semibold">Trial #{r.run_index}</td>
                    <td className="py-2.5 px-4 font-sans">
                      {r.is_cold ? (
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 text-[10px] uppercase font-bold">
                          Initial (Trial 1)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-(--color-text-muted) text-[10px] uppercase">
                          Warm Trial
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-(--color-foreground)">{r.execution_time_ms.toFixed(4)} ms</td>
                    <td className="py-2.5 px-4 text-emerald-600 dark:text-emerald-400">
                      {optRun ? `${optRun.execution_time_ms.toFixed(4)} ms` : "—"}
                    </td>
                    <td className="py-2.5 px-4 text-(--color-text-muted)">{r.buffer_reads ?? 0}</td>
                    <td className="py-2.5 px-4 text-(--color-text-muted)">{r.buffer_hits ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: ML Prediction Validation */}
      {activeTab === "ml" && benchmark.ml_comparison && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-(--color-border) bg-(--color-surface)">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-(--color-foreground) flex items-center gap-2">
                <span>🤖</span> Pre-Execution ML Model Validation
              </h3>
              <ProvenanceBadge type="predicted" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted)">
                <span className="text-[11px] text-(--color-text-muted) uppercase block mb-1">
                  ML Predicted Latency
                </span>
                <span className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  {benchmark.ml_comparison.ml_predicted_time_ms.toFixed(2)} ms
                </span>
              </div>
              <div className="p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted)">
                <span className="text-[11px] text-(--color-text-muted) uppercase block mb-1">
                  Actual Measured Latency
                </span>
                <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {benchmark.ml_comparison.actual_measured_time_ms.toFixed(2)} ms
                </span>
              </div>
              <div className="p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted)">
                <span className="text-[11px] text-(--color-text-muted) uppercase block mb-1">
                  Prediction Relative Error
                </span>
                <span className="text-xl font-bold font-mono text-(--color-foreground)">
                  {benchmark.ml_comparison.relative_error_pct.toFixed(1)}%
                </span>
                <span className="text-[10px] block mt-0.5 text-(--color-text-muted)">
                  {benchmark.ml_comparison.is_prediction_accurate_within_30pct ? "Within ±30% Target SLA" : "Outside target threshold"}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300">
              {benchmark.ml_comparison.provenance_note}
            </div>

            <div className="mt-4">
              <MLAccuracyChart benchmark={benchmark} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
