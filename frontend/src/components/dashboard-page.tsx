"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { getDashboardStats, getBenchmarkHistory } from "@/lib/api-client";
import { useAnalysis } from "@/context/analysis-context";
import { useTheme } from "@/context/theme-context";
import { ProvenanceBadge } from "./provenance-badge";
import type { DashboardStats, AnalysisResult, BenchmarkHistoryItem } from "@/lib/types";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const CATEGORY_META: Record<string, { label: string; barColor: string; dotColor: string }> = {
  indexes:            { label: "B-Tree Indexes",     barColor: "bg-teal-500",    dotColor: "bg-teal-500" },
  rewrites:           { label: "Query Rewrites",     barColor: "bg-violet-500",  dotColor: "bg-violet-500" },
  bottlenecks:        { label: "Query Bottlenecks",  barColor: "bg-rose-500",    dotColor: "bg-rose-500" },
  materialized_views: { label: "Materialized Views", barColor: "bg-amber-500",   dotColor: "bg-amber-500" },
  configuration:      { label: "Engine Config",      barColor: "bg-sky-500",     dotColor: "bg-sky-500" },
  statistics:         { label: "Planner Stats",      barColor: "bg-slate-400",   dotColor: "bg-slate-400" },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { loadHistoryResult } = useAnalysis();
  const { theme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    Promise.allSettled([
      getDashboardStats(),
      getBenchmarkHistory(10),
    ])
      .then(([statsRes, benchRes]) => {
        if (statsRes.status === "fulfilled") setStats(statsRes.value);
        if (benchRes.status === "fulfilled") setBenchmarks(benchRes.value);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleRecentClick = (item: DashboardStats["recent_analyses"][0]) => {
    if (item.llm_response) {
      try {
        const result: AnalysisResult = JSON.parse(item.llm_response);
        loadHistoryResult(item.sql_query, result);
        router.push("/analyze");
        return;
      } catch {
        // fallback
      }
    }
    router.push(`/analyze?sql=${encodeURIComponent(item.sql_query)}`);
  };

  const isDark = theme === "dark";

  // Compute actual measured speedup from benchmark history if available
  const benchmarksWithImprovement = benchmarks.filter((b) => b.exec_time_improvement_pct != null);
  const avgImprovement = benchmarksWithImprovement.length > 0
    ? benchmarksWithImprovement.reduce((acc, b) => acc + (b.exec_time_improvement_pct ?? 0), 0) / benchmarksWithImprovement.length
    : null;
  const maxImprovement = benchmarksWithImprovement.length > 0
    ? Math.max(...benchmarksWithImprovement.map((b) => b.exec_time_improvement_pct ?? 0))
    : null;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-(--color-border) rounded w-1/4"></div>
          <div className="h-4 bg-(--color-border) rounded w-1/3"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-(--color-surface) rounded-xl border border-(--color-border)"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!stats || stats.total_queries === 0) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-(--color-foreground)">
            Performance Dashboard
          </h1>
          <p className="text-sm text-(--color-text-muted) mt-1">
            Enterprise database telemetry, machine learning predictions, and empirical query benchmarks.
          </p>
        </div>

        <div className="text-center py-20 rounded-xl border border-(--color-border) bg-(--color-surface)">
          <div className="w-14 h-14 mx-auto rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 14 15 20 9" />
              <polyline points="14 9 20 9 20 15" />
              <path d="M4 21h16" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-(--color-foreground) mb-2">No Query Telemetry Recorded</h3>
          <p className="text-sm text-(--color-text-muted) max-w-md mx-auto mb-6">
            Execute your first query analysis or benchmark to populate live optimization metrics, ML inference comparisons, and buffer cache telemetry.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/analyze"
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-2xs"
            >
              Analyze SQL Query &rarr;
            </Link>
            <Link
              href="/benchmark"
              className="px-4 py-2 border border-(--color-border) bg-(--color-surface) hover:bg-(--color-surface-muted) text-(--color-foreground) text-xs font-semibold rounded-lg transition-colors shadow-2xs"
            >
              Open Benchmark Lab
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const maxCategory = Math.max(...stats.top_categories.map((c) => c.count), 1);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-(--color-foreground)">
            Performance Dashboard
          </h1>
          <p className="text-xs text-(--color-text-muted) mt-1">
            Real-time telemetry, machine learning predictions, and empirical query benchmarks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/benchmark"
            className="px-3.5 py-1.5 rounded-lg border border-(--color-border) bg-(--color-surface) text-xs font-medium text-(--color-foreground) hover:bg-(--color-surface-muted) transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <span>🎯</span> Benchmark Lab
          </Link>
          <Link
            href="/analyze"
            className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <span>⚡</span> Analyze Query
          </Link>
        </div>
      </div>

      {/* Top Telemetry KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Queries Analyzed */}
        <div className="p-5 rounded-xl border border-(--color-border) bg-(--color-surface) shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-(--color-text-faint)">
              Total Analyzed
            </span>
            <span className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono text-(--color-foreground)">
              {stats.total_queries}
            </span>
            <span className="text-xs font-medium text-(--color-text-muted)">
              {stats.streak_days}d streak
            </span>
          </div>
          <p className="text-[11px] text-(--color-text-faint) mt-2">
            Introspected execution plans & AST features
          </p>
        </div>

        {/* Card 2: Total Suggestions */}
        <div className="p-5 rounded-xl border border-(--color-border) bg-(--color-surface) shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-(--color-text-faint)">
              Recommendations
            </span>
            <span className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono text-(--color-foreground)">
              {stats.total_suggestions}
            </span>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
              {stats.high_impact_count} high impact
            </span>
          </div>
          <p className="text-[11px] text-(--color-text-faint) mt-2">
            Indexes, rewrites & OR scored alternatives
          </p>
        </div>

        {/* Card 3: Measured Latency Reduction */}
        <div className="p-5 rounded-xl border border-(--color-border) bg-(--color-surface) shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-(--color-text-faint)">
              Measured Speedup
            </span>
            <ProvenanceBadge type="measured" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {maxImprovement != null ? `+${maxImprovement.toFixed(1)}%` : "Verified"}
            </span>
            <span className="text-xs text-(--color-text-muted)">
              {avgImprovement != null ? `avg +${avgImprovement.toFixed(1)}%` : "Telemetry"}
            </span>
          </div>
          <p className="text-[11px] text-(--color-text-faint) mt-2">
            Empirical multi-trial warm median reduction
          </p>
        </div>

        {/* Card 4: Benchmark Experiments */}
        <div className="p-5 rounded-xl border border-(--color-border) bg-(--color-surface) shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-(--color-text-faint)">
              Benchmark Runs
            </span>
            <span className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 15" />
              </svg>
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono text-(--color-foreground)">
              {benchmarks.length}
            </span>
            <span className="text-xs font-mono text-(--color-text-muted)">
              Rollback safe
            </span>
          </div>
          <p className="text-[11px] text-(--color-text-faint) mt-2">
            Isolated transaction trials with buffer tracking
          </p>
        </div>
      </div>

      {/* Middle Row: Query Activity Trends (2/3) + Optimization Breakdown (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Query Activity Trend Chart */}
        <div className="lg:col-span-2 rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-(--color-foreground)">Query Optimization Activity</h2>
              <p className="text-xs text-(--color-text-muted)">Daily volume of SQL executions and plan analyses</p>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-(--color-surface-muted) text-(--color-text-muted) border border-(--color-border)">
              Last 30 Days
            </span>
          </div>

          {stats.queries_by_date.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.queries_by_date} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="barTealGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0D9488" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#0D9488" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1E293B" : "#E2E8F0"} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fill: isDark ? "#94A3B8" : "#64748B", fontSize: 11, fontFamily: "monospace" }}
                  axisLine={{ stroke: isDark ? "#334155" : "#CBD5E1" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: isDark ? "#94A3B8" : "#64748B", fontSize: 11, fontFamily: "monospace" }}
                  axisLine={{ stroke: isDark ? "#334155" : "#CBD5E1" }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? "#101827" : "#FFFFFF",
                    borderColor: isDark ? "#202B3C" : "#CBD5E1",
                    borderRadius: "0.5rem",
                    color: isDark ? "#F8FAFC" : "#101827",
                    fontSize: 12,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                  }}
                  labelFormatter={(label) => formatDate(String(label))}
                />
                <Bar
                  dataKey="count"
                  name="Queries Analyzed"
                  fill="url(#barTealGradient)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-xs text-(--color-text-faint)">
              No historical trend data recorded yet.
            </div>
          )}
        </div>

        {/* Right: Optimization Distribution Breakdown */}
        <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-(--color-foreground)">Optimization Breakdown</h2>
            <p className="text-xs text-(--color-text-muted) mb-4">Distribution by recommendation category</p>
            <div className="space-y-3.5">
              {stats.top_categories.map((cat) => {
                const meta = CATEGORY_META[cat.category] || {
                  label: cat.category,
                  barColor: "bg-teal-500",
                  dotColor: "bg-teal-500",
                };
                const pct = Math.round((cat.count / maxCategory) * 100);
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${meta.dotColor}`} />
                        <span className="font-medium text-(--color-foreground)">{meta.label}</span>
                      </div>
                      <span className="font-mono font-semibold text-(--color-foreground)">
                        {cat.count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-(--color-surface-muted) overflow-hidden">
                      <div
                        className={`h-full rounded-full ${meta.barColor} transition-all duration-300`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-(--color-border)">
            <Link
              href="/analyze"
              className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center justify-between"
            >
              <span>Explore Recommendation Engine</span>
              <span>&rarr;</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Most Optimized Tables */}
      {stats.most_analyzed_tables.length > 0 && (
        <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-(--color-foreground)">Most Analyzed Database Tables</h2>
              <p className="text-xs text-(--color-text-muted)">Relational entities with the highest index & filter traffic</p>
            </div>
            <span className="text-xs font-mono text-(--color-text-faint)">
              {stats.most_analyzed_tables.length} tables
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.most_analyzed_tables.map((t) => (
              <span
                key={t.table_name}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono
                           bg-(--color-surface-muted) text-(--color-foreground) border border-(--color-border)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-500">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
                </svg>
                <span className="font-semibold">{t.table_name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold">
                  {t.count}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Row: Recent Benchmarks & Recent Query Analyses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Recent Empirical Benchmarks */}
        <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-(--color-foreground)">Recent Benchmark Experiments</h2>
              <p className="text-xs text-(--color-text-muted)">Verified PostgreSQL execution runs with rollback isolation</p>
            </div>
            <Link href="/benchmark" className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-medium">
              View All &rarr;
            </Link>
          </div>

          {benchmarks.length > 0 ? (
            <div className="space-y-2.5">
              {benchmarks.slice(0, 5).map((item) => (
                <Link
                  key={item.id}
                  href={`/benchmark`}
                  className="block p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) hover:border-(--color-border-hover) transition-all"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <code className="text-xs font-mono text-(--color-foreground) truncate flex-1 font-semibold">
                      {item.original_sql}
                    </code>
                    {item.results_match != null && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                        item.results_match
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }`}>
                        {item.results_match ? "EQUIV MATCH" : "DIFF"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-(--color-text-muted)">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px]">
                        {item.original_exec_time_ms.toFixed(2)} ms
                        {item.optimized_exec_time_ms != null && (
                          <> &rarr; {item.optimized_exec_time_ms.toFixed(2)} ms</>
                        )}
                      </span>
                      {item.exec_time_improvement_pct != null && (
                        <span className={`font-mono font-bold ${item.exec_time_improvement_pct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                          ({item.exec_time_improvement_pct > 0 ? "+" : ""}{item.exec_time_improvement_pct.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-(--color-text-faint)">
                      {timeAgo(item.created_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-(--color-text-faint)">
              No benchmark executions recorded yet.
            </div>
          )}
        </div>

        {/* Right: Recent Analyses */}
        <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-(--color-foreground)">Recent Query Introspections</h2>
              <p className="text-xs text-(--color-text-muted)">Latest analyzed queries with generated recommendations</p>
            </div>
            <Link href="/history" className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-medium">
              View History &rarr;
            </Link>
          </div>

          {stats.recent_analyses.length > 0 ? (
            <div className="space-y-2.5">
              {stats.recent_analyses.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleRecentClick(item)}
                  className="w-full text-left p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) hover:border-(--color-border-hover) hover:bg-(--color-surface) transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <code className="text-xs font-mono text-(--color-foreground) truncate flex-1">
                      {item.sql_query}
                    </code>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 font-semibold shrink-0">
                      {item.suggestion_count} {item.suggestion_count === 1 ? "tip" : "tips"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-(--color-text-faint)">
                    <span className="text-[11px]">Click to inspect AST & recommendations</span>
                    <span className="text-[11px]">{timeAgo(item.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-(--color-text-faint)">
              No queries analyzed yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
