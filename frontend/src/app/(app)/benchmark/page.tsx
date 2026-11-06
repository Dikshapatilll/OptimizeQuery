"use client";

import React, { useEffect, useState, useTransition } from "react";
import type {
  BenchmarkComparisonResult,
  BenchmarkHistoryItem,
  ConnectionResponse,
} from "@/lib/types";
import {
  getBenchmarkDetail,
  getBenchmarkHistory,
  listConnections,
  runBenchmark,
} from "@/lib/api-client";
import { BenchmarkDetail } from "@/components/benchmark-detail";
import { HistoricalTrendChart } from "@/components/benchmark-charts";
import { ProvenanceBadge } from "@/components/provenance-badge";

const PRESET_QUERIES = [
  {
    label: "Customer Orders Lookup (High Join Overhead)",
    original: "SELECT u.name, count(o.id) as total_orders FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.name HAVING count(o.id) > 2 ORDER BY total_orders DESC LIMIT 20",
    index: "CREATE INDEX idx_orders_user_id ON orders(user_id)",
  },
  {
    label: "Product Filter & Range Scan",
    original: "SELECT * FROM products WHERE price BETWEEN 20 AND 100 AND stock > 50 ORDER BY rating DESC LIMIT 25",
    index: "CREATE INDEX idx_products_price_stock ON products(price, stock)",
  },
  {
    label: "Subquery Exists Rewrite",
    original: "SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE total > 150)",
    rewrite: "SELECT u.* FROM users u WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.total > 150)",
  },
];

export default function BenchmarkPage() {
  const [activeTab, setActiveTab] = useState<"run" | "history" | "trends">("run");
  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [selectedConn, setSelectedConn] = useState<string>("");

  // Benchmark form state
  const [targetType, setTargetType] = useState<"rewrite" | "index" | "baseline">("index");
  const [originalSql, setOriginalSql] = useState<string>(PRESET_QUERIES[0].original);
  const [optimizedSql, setOptimizedSql] = useState<string>("");
  const [indexSql, setIndexSql] = useState<string>(PRESET_QUERIES[0].index ?? "");
  const [numRuns, setNumRuns] = useState<number>(5);

  // Execution state
  const [running, setRunning] = useState<boolean>(false);
  const [currentResult, setCurrentResult] = useState<BenchmarkComparisonResult | null>(null);
  const [runError, setRunError] = useState<string>("");

  // History state
  const [history, setHistory] = useState<BenchmarkHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    listConnections()
      .then((conns) => setConnections(conns))
      .catch(() => {});
    loadHistory();
  }, []);

  function loadHistory() {
    setHistoryLoading(true);
    getBenchmarkHistory(50)
      .then((data) => setHistory(data))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }

  async function handleExecuteBenchmark() {
    setRunning(true);
    setRunError("");
    setCurrentResult(null);

    try {
      const resp = await runBenchmark({
        original_sql: originalSql,
        optimized_sql: targetType === "rewrite" ? optimizedSql : null,
        index_sql: targetType === "index" ? indexSql : null,
        connection_id: selectedConn || null,
        num_runs: numRuns,
        save_to_history: true,
      });
      setCurrentResult(resp);
      loadHistory();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Benchmark execution failed");
    } finally {
      setRunning(false);
    }
  }

  async function handleInspectHistorical(id: string) {
    try {
      const detail = await getBenchmarkDetail(id);
      setCurrentResult(detail);
      setActiveTab("run");
    } catch (err) {
      alert("Failed to load benchmark detail: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  const filteredHistory = history.filter((item) => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return (
      item.original_sql.toLowerCase().includes(term) ||
      (item.optimized_sql && item.optimized_sql.toLowerCase().includes(term)) ||
      (item.applied_index_sql && item.applied_index_sql.toLowerCase().includes(term)) ||
      item.environment.toLowerCase().includes(term)
    );
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Page Header */}
      <div className="border-b border-(--color-border) pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-(--color-foreground) flex items-center gap-3">
              <span>⚡</span> Query Performance Benchmarking
              <ProvenanceBadge type="measured" />
            </h1>
            <p className="text-sm text-(--color-text-muted) mt-1">
              Empirical multi-trial execution, cold/warm cache separation, transactional index isolation, and ML validation.
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-6 mt-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab("run")}
            className={`pb-3 transition-colors cursor-pointer ${
              activeTab === "run"
                ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 font-semibold"
                : "text-(--color-text-muted) hover:text-(--color-foreground)"
            }`}
          >
            Run Benchmark
          </button>
          <button
            onClick={() => {
              setActiveTab("history");
              loadHistory();
            }}
            className={`pb-3 transition-colors cursor-pointer ${
              activeTab === "history"
                ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 font-semibold"
                : "text-(--color-text-muted) hover:text-(--color-foreground)"
            }`}
          >
            Benchmark History ({history.length})
          </button>
          <button
            onClick={() => setActiveTab("trends")}
            className={`pb-3 transition-colors cursor-pointer ${
              activeTab === "trends"
                ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 font-semibold"
                : "text-(--color-text-muted) hover:text-(--color-foreground)"
            }`}
          >
            Trend Analytics
          </button>
        </div>
      </div>

      {/* TAB 1: RUN BENCHMARK */}
      {activeTab === "run" && (
        <div className="space-y-8">
          {/* Active Result View */}
          {currentResult ? (
            <BenchmarkDetail
              benchmark={currentResult}
              onBack={() => setCurrentResult(null)}
            />
          ) : (
            <div className="space-y-6">
              {/* Presets Bar */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-(--color-text-muted)">Load Benchmark Preset:</span>
                {PRESET_QUERIES.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setOriginalSql(p.original);
                      if (p.index) {
                        setTargetType("index");
                        setIndexSql(p.index);
                        setOptimizedSql("");
                      } else if (p.rewrite) {
                        setTargetType("rewrite");
                        setOptimizedSql(p.rewrite);
                        setIndexSql("");
                      }
                    }}
                    className="px-2.5 py-1 rounded-md border border-(--color-border) bg-(--color-surface) hover:bg-(--color-surface-muted) text-(--color-foreground) font-medium transition-colors cursor-pointer shadow-2xs"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Benchmark Setup Form */}
              <div className="p-6 rounded-2xl border border-(--color-border) bg-(--color-surface) space-y-6 shadow-xs">
                {/* Environment & Target Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-(--color-foreground) mb-1.5">
                      Target Execution Environment:
                    </label>
                    <select
                      value={selectedConn}
                      onChange={(e) => setSelectedConn(e.target.value)}
                      className="w-full text-xs py-2 px-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Controlled Benchmark Sandbox (SQLite 71k rows)</option>
                      {connections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.db_type} - {c.database})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-(--color-foreground) mb-1.5">
                      Optimization Target Type:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setTargetType("index")}
                        className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-colors cursor-pointer ${
                          targetType === "index"
                            ? "bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold"
                            : "border-(--color-border) bg-(--color-surface-muted) text-(--color-text-muted)"
                        }`}
                      >
                        Proposed Index
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetType("rewrite")}
                        className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-colors cursor-pointer ${
                          targetType === "rewrite"
                            ? "bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold"
                            : "border-(--color-border) bg-(--color-surface-muted) text-(--color-text-muted)"
                        }`}
                      >
                        Query Rewrite
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetType("baseline")}
                        className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-colors cursor-pointer ${
                          targetType === "baseline"
                            ? "bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold"
                            : "border-(--color-border) bg-(--color-surface-muted) text-(--color-text-muted)"
                        }`}
                      >
                        Single Baseline
                      </button>
                    </div>
                  </div>
                </div>

                {/* Original SQL */}
                <div>
                  <label className="block text-xs font-semibold text-(--color-foreground) mb-1.5">
                    Original Query SQL:
                  </label>
                  <textarea
                    rows={4}
                    value={originalSql}
                    onChange={(e) => setOriginalSql(e.target.value)}
                    placeholder="SELECT * FROM table WHERE ..."
                    className="w-full font-mono text-xs p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                </div>

                {/* Target Specific Inputs */}
                {targetType === "rewrite" && (
                  <div>
                    <label className="block text-xs font-semibold text-(--color-foreground) mb-1.5">
                      Optimized Rewritten SQL:
                    </label>
                    <textarea
                      rows={4}
                      value={optimizedSql}
                      onChange={(e) => setOptimizedSql(e.target.value)}
                      placeholder="SELECT * FROM table WHERE ..."
                      className="w-full font-mono text-xs p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    />
                  </div>
                )}

                {targetType === "index" && (
                  <div>
                    <label className="block text-xs font-semibold text-(--color-foreground) mb-1.5 flex items-center justify-between">
                      <span>Index Recommendation Statement:</span>
                      <span className="text-[11px] font-normal text-emerald-600 dark:text-emerald-400">
                        Tested with transactional rollback (zero catalog persistence)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={indexSql}
                      onChange={(e) => setIndexSql(e.target.value)}
                      placeholder="CREATE INDEX idx_name ON table(column);"
                      className="w-full font-mono text-xs py-2 px-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* Trial count slider */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted)">
                  <div className="text-xs">
                    <span className="font-semibold text-(--color-foreground) block">Number of Benchmark Trials:</span>
                    <span className="text-[11px] text-(--color-text-muted)">
                      Run 1 is cold cache; Trials 2..{numRuns} calculate warm median.
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={2}
                      max={15}
                      value={numRuns}
                      onChange={(e) => setNumRuns(Number(e.target.value))}
                      className="w-32 accent-blue-600 cursor-pointer"
                    />
                    <span className="font-mono font-bold text-sm text-(--color-foreground) w-6 text-right">
                      {numRuns}
                    </span>
                  </div>
                </div>

                {runError && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400">
                    {runError}
                  </div>
                )}

                {/* Submit button */}
                <button
                  onClick={handleExecuteBenchmark}
                  disabled={running || !originalSql.trim()}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {running ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Executing {numRuns} Trials Under Controlled Environment...
                    </>
                  ) : (
                    <>
                      <span>⚡</span> Execute Controlled Benchmark
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BENCHMARK HISTORY */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <input
              type="text"
              placeholder="Search history by query text or environment..."
              value={searchFilter}
              onChange={(e) => {
                const val = e.target.value;
                startTransition(() => {
                  setSearchFilter(val);
                });
              }}
              className="w-full max-w-md text-xs py-2 px-3 rounded-lg border border-(--color-border) bg-(--color-surface) text-(--color-foreground) focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={loadHistory}
              disabled={historyLoading}
              className="text-xs px-3 py-2 rounded-lg border border-(--color-border) bg-(--color-surface) hover:bg-(--color-surface-muted) text-(--color-foreground) font-medium cursor-pointer"
            >
              {historyLoading ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>

          <div className="rounded-xl border border-(--color-border) overflow-hidden bg-(--color-surface)">
            <table className="w-full text-left text-xs">
              <thead className="bg-(--color-surface-muted) text-(--color-text-muted) uppercase tracking-wider font-semibold border-b border-(--color-border)">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Environment</th>
                  <th className="py-3 px-4">Query Sample</th>
                  <th className="py-3 px-4">Original Latency</th>
                  <th className="py-3 px-4">Optimized Latency</th>
                  <th className="py-3 px-4">Improvement</th>
                  <th className="py-3 px-4">Equivalence</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {filteredHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5">
                    <td className="py-3 px-4 font-mono text-(--color-text-muted)">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-(--color-text-muted)">
                        {item.environment}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-(--color-foreground) max-w-xs truncate" title={item.original_sql}>
                      {item.original_sql}
                    </td>
                    <td className="py-3 px-4 font-mono text-(--color-foreground)">
                      {item.original_exec_time_ms.toFixed(2)} ms
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-600 dark:text-emerald-400">
                      {item.optimized_exec_time_ms ? `${item.optimized_exec_time_ms.toFixed(2)} ms` : "—"}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {item.exec_time_improvement_pct != null ? (
                        <span
                          className={`font-semibold ${
                            item.exec_time_improvement_pct > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : item.exec_time_improvement_pct < 0
                                ? "text-red-500"
                                : "text-(--color-text-muted)"
                          }`}
                        >
                          {item.exec_time_improvement_pct > 0 ? "+" : ""}
                          {item.exec_time_improvement_pct.toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {item.results_match != null ? (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            item.results_match
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                              : "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300"
                          }`}
                        >
                          {item.results_match ? "MATCH" : "DIFF"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleInspectHistorical(item.id)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                      >
                        Inspect &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-(--color-text-muted)">
                      No benchmark history records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TREND ANALYTICS */}
      {activeTab === "trends" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-(--color-border) bg-(--color-surface)">
            <h3 className="text-base font-bold text-(--color-foreground) mb-4 flex items-center gap-2">
              <span>📈</span> Benchmark Speedup Progression Over Time
            </h3>
            <p className="text-xs text-(--color-text-muted) mb-4">
              Historical latency tracking across recent benchmark runs (Original vs Optimized Warm Median).
            </p>
            <HistoricalTrendChart history={history} />
          </div>
        </div>
      )}
    </div>
  );
}
