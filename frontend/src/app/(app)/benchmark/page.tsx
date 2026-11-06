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
    label: "W1: Join & Aggregation (orders + users)",
    original: "SELECT u.name, count(o.id) as total_orders FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.name HAVING count(o.id) > 2 ORDER BY total_orders DESC LIMIT 20",
    index: "CREATE INDEX idx_orders_user_id_total ON orders(user_id, total)",
  },
  {
    label: "W2: Range Filter & Multi-Column Sort",
    original: "SELECT * FROM products WHERE price BETWEEN 20 AND 100 AND stock > 50 ORDER BY rating DESC LIMIT 25",
    index: "CREATE INDEX idx_products_price_stock ON products(price, stock)",
  },
  {
    label: "W3: Correlated Subquery Rewrite",
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
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-(--color-border) pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-(--color-foreground)">
              Benchmark Laboratory
            </h1>
            <ProvenanceBadge type="measured" />
          </div>
          <p className="text-xs text-(--color-text-muted) mt-1">
            Empirical multi-trial execution, cold/warm cache separation, transactional rollback index isolation, and ML validation.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-(--color-surface-muted) border border-(--color-border)">
          <button
            onClick={() => setActiveTab("run")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "run"
                ? "bg-(--color-surface) text-teal-600 dark:text-teal-400 shadow-2xs"
                : "text-(--color-text-muted) hover:text-(--color-foreground)"
            }`}
          >
            ⚡ Lab Workspace
          </button>
          <button
            onClick={() => {
              setActiveTab("history");
              loadHistory();
            }}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "history"
                ? "bg-(--color-surface) text-teal-600 dark:text-teal-400 shadow-2xs"
                : "text-(--color-text-muted) hover:text-(--color-foreground)"
            }`}
          >
            📜 History ({history.length})
          </button>
          <button
            onClick={() => setActiveTab("trends")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "trends"
                ? "bg-(--color-surface) text-teal-600 dark:text-teal-400 shadow-2xs"
                : "text-(--color-text-muted) hover:text-(--color-foreground)"
            }`}
          >
            📈 Trends
          </button>
        </div>
      </div>

      {/* TAB 1: RUN BENCHMARK */}
      {activeTab === "run" && (
        <div className="space-y-6">
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
                <span className="font-mono font-semibold text-(--color-text-faint)">
                  Workload Presets:
                </span>
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
                    className="px-2.5 py-1 rounded-md border border-(--color-border) bg-(--color-surface) hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 font-mono text-xs transition-colors cursor-pointer shadow-2xs"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Benchmark Setup Form */}
              <div className="p-6 rounded-xl border border-(--color-border) bg-(--color-surface) space-y-5 shadow-2xs">
                {/* Environment & Target Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-(--color-foreground) mb-1.5">
                      Execution Environment:
                    </label>
                    <select
                      value={selectedConn}
                      onChange={(e) => setSelectedConn(e.target.value)}
                      className="w-full text-xs py-2 px-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
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
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border text-center transition-all cursor-pointer ${
                          targetType === "index"
                            ? "bg-teal-500/10 border-teal-500 text-teal-700 dark:text-teal-300 shadow-2xs"
                            : "border-(--color-border) bg-(--color-surface-muted) text-(--color-text-muted)"
                        }`}
                      >
                        Proposed Index
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetType("rewrite")}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border text-center transition-all cursor-pointer ${
                          targetType === "rewrite"
                            ? "bg-teal-500/10 border-teal-500 text-teal-700 dark:text-teal-300 shadow-2xs"
                            : "border-(--color-border) bg-(--color-surface-muted) text-(--color-text-muted)"
                        }`}
                      >
                        Query Rewrite
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetType("baseline")}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border text-center transition-all cursor-pointer ${
                          targetType === "baseline"
                            ? "bg-teal-500/10 border-teal-500 text-teal-700 dark:text-teal-300 shadow-2xs"
                            : "border-(--color-border) bg-(--color-surface-muted) text-(--color-text-muted)"
                        }`}
                      >
                        Baseline Only
                      </button>
                    </div>
                  </div>
                </div>

                {/* Original SQL */}
                <div>
                  <label className="block text-xs font-semibold text-(--color-foreground) mb-1.5">
                    Original Query SQL (Baseline):
                  </label>
                  <textarea
                    rows={4}
                    value={originalSql}
                    onChange={(e) => setOriginalSql(e.target.value)}
                    placeholder="SELECT * FROM table WHERE ..."
                    className="w-full font-mono text-xs p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y"
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
                      className="w-full font-mono text-xs p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y"
                    />
                  </div>
                )}

                {targetType === "index" && (
                  <div>
                    <label className="block text-xs font-semibold text-(--color-foreground) mb-1.5 flex items-center justify-between">
                      <span>Index Recommendation Statement:</span>
                      <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                        Tested via transactional rollback (zero catalog pollution)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={indexSql}
                      onChange={(e) => setIndexSql(e.target.value)}
                      placeholder="CREATE INDEX idx_name ON table(column);"
                      className="w-full font-mono text-xs py-2 px-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                )}

                {/* Trial count slider */}
                <div className="flex items-center justify-between p-3.5 rounded-lg border border-(--color-border) bg-(--color-surface-muted)">
                  <div className="text-xs">
                    <span className="font-semibold text-(--color-foreground) block">Number of Multi-Trial Repetitions:</span>
                    <span className="text-[11px] text-(--color-text-faint)">
                      Trial 1 measures cold execution; Trials 2..{numRuns} calculate warm median and Student&apos;s t confidence interval.
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={2}
                      max={15}
                      value={numRuns}
                      onChange={(e) => setNumRuns(Number(e.target.value))}
                      className="w-32 accent-teal-600 cursor-pointer"
                    />
                    <span className="font-mono font-bold text-sm text-(--color-foreground) w-6 text-right">
                      {numRuns}
                    </span>
                  </div>
                </div>

                {runError && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 font-mono">
                    ⚠️ {runError}
                  </div>
                )}

                {/* Submit button */}
                <button
                  onClick={handleExecuteBenchmark}
                  disabled={running || !originalSql.trim()}
                  className="w-full py-3 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  {running ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      <span>Executing {numRuns} Trials in Isolated Transaction...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>Execute Controlled Benchmark</span>
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
              placeholder="Search history by query text, environment, or ID..."
              value={searchFilter}
              onChange={(e) => {
                const val = e.target.value;
                startTransition(() => {
                  setSearchFilter(val);
                });
              }}
              className="w-full max-w-md text-xs py-2 px-3 rounded-lg border border-(--color-border) bg-(--color-surface) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
            />
            <button
              onClick={loadHistory}
              disabled={historyLoading}
              className="text-xs px-3.5 py-2 rounded-lg border border-(--color-border) bg-(--color-surface) hover:bg-(--color-surface-muted) text-(--color-foreground) font-medium cursor-pointer transition-colors shadow-2xs"
            >
              {historyLoading ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>

          <div className="rounded-xl border border-(--color-border) overflow-hidden bg-(--color-surface) shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-(--color-surface-muted) text-(--color-text-faint) uppercase font-mono text-[10px] tracking-wider border-b border-(--color-border)">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Environment</th>
                  <th className="py-3 px-4">Original Query</th>
                  <th className="py-3 px-4 text-right">Baseline [MEASURED]</th>
                  <th className="py-3 px-4 text-right">Optimized [MEASURED]</th>
                  <th className="py-3 px-4 text-right">Speedup</th>
                  <th className="py-3 px-4 text-center">Equivalence</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-(--color-text-faint)">
                      No benchmarks match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-(--color-surface-muted) transition-colors">
                      <td className="py-3 px-4 font-mono text-[11px] text-(--color-text-muted) whitespace-nowrap">
                        {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-(--color-surface-muted) text-(--color-text-muted) border border-(--color-border)">
                          {item.environment}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate font-mono text-xs text-(--color-foreground)">
                        {item.original_sql}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        {item.original_exec_time_ms.toFixed(2)} ms
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        {item.optimized_exec_time_ms != null
                          ? `${item.optimized_exec_time_ms.toFixed(2)} ms`
                          : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold">
                        {item.exec_time_improvement_pct != null ? (
                          <span className={item.exec_time_improvement_pct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}>
                            {item.exec_time_improvement_pct > 0 ? "+" : ""}{item.exec_time_improvement_pct.toFixed(1)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.results_match != null ? (
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                            item.results_match
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          }`}>
                            {item.results_match ? "EQUIV MATCH" : "DIFF"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleInspectHistorical(item.id)}
                          className="px-2.5 py-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 rounded transition-colors cursor-pointer"
                        >
                          Inspect &rarr;
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TREND ANALYTICS */}
      {activeTab === "trends" && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-(--color-border) bg-(--color-surface) shadow-2xs">
            <h2 className="text-sm font-semibold text-(--color-foreground) mb-1">
              Historical Execution-Time Latency Trends
            </h2>
            <p className="text-xs text-(--color-text-muted) mb-4">
              Evolution of baseline versus optimized warm median latency across historical runs
            </p>
            <HistoricalTrendChart history={history} />
          </div>
        </div>
      )}
    </div>
  );
}
