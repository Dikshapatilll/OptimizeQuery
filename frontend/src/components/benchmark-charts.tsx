"use client";

import React from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { AggregateBenchmarkMetrics, BenchmarkComparisonResult, BenchmarkHistoryItem } from "@/lib/types";

interface LatencyComparisonProps {
  original: AggregateBenchmarkMetrics;
  optimized?: AggregateBenchmarkMetrics | null;
}

export function LatencyComparisonChart({ original, optimized }: LatencyComparisonProps) {
  const data = [
    {
      name: "Initial Run Latency (Trial 1)",
      Original: Number((original.cold_execution_time_ms ?? original.warm_median_execution_time_ms).toFixed(2)),
      Optimized: optimized ? Number((optimized.cold_execution_time_ms ?? optimized.warm_median_execution_time_ms).toFixed(2)) : 0,
    },
    {
      name: "Warm Median Latency",
      Original: Number(original.warm_median_execution_time_ms.toFixed(2)),
      Optimized: optimized ? Number(optimized.warm_median_execution_time_ms.toFixed(2)) : 0,
    },
    {
      name: "Mean Latency",
      Original: Number(original.mean_execution_time_ms.toFixed(2)),
      Optimized: optimized ? Number(optimized.mean_execution_time_ms.toFixed(2)) : 0,
    },
  ];

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={240} minWidth={0}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis unit=" ms" tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: unknown) => [`${value} ms`]}
            contentStyle={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
          />
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
          <Bar dataKey="Original" fill="#ef4444" radius={[4, 4, 0, 0]} />
          {optimized && <Bar dataKey="Optimized" fill="#10b981" radius={[4, 4, 0, 0]} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface CostAndBufferChartProps {
  original: AggregateBenchmarkMetrics;
  optimized?: AggregateBenchmarkMetrics | null;
}

export function PlannerCostChart({ original, optimized }: CostAndBufferChartProps) {
  const origCost = Number((original.estimated_planner_cost ?? 0).toFixed(2));
  const optCost = optimized ? Number((optimized.estimated_planner_cost ?? 0).toFixed(2)) : null;
  const costReductionPct = optCost && origCost > 0 ? Number(((1 - optCost / origCost) * 100).toFixed(1)) : null;

  const data = [
    {
      name: "Estimated Planner Cost",
      Original: origCost,
      ...(optCost !== null ? { Optimized: optCost } : {}),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="w-full">
        <ResponsiveContainer width="100%" height={220} minWidth={0}>
          <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [
                `${Number(value).toLocaleString()} cost units`,
                name === "Original" ? "Original Query Cost" : "Optimized Query Cost",
              ]}
              contentStyle={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
            />
            <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
            <Bar dataKey="Original" fill="#6366f1" radius={[4, 4, 0, 0]} />
            {optCost !== null && <Bar dataKey="Optimized" fill="#10b981" radius={[4, 4, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs text-(--color-text-muted) flex items-center justify-between px-1">
        <span>ℹ️ Planner cost is an internal optimizer cost unit estimate and not execution time in milliseconds.</span>
        {costReductionPct !== null && (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {costReductionPct > 0 ? `-${costReductionPct}% cost reduction` : `+${Math.abs(costReductionPct)}% cost change`}
          </span>
        )}
      </div>
    </div>
  );
}

export function SharedBufferBlocksChart({ original, optimized }: CostAndBufferChartProps) {
  const data = [
    {
      category: "Shared Buffer Read Blocks",
      Original: original.shared_buffer_reads ?? 0,
      Optimized: optimized ? (optimized.shared_buffer_reads ?? 0) : 0,
    },
    {
      category: "Shared Buffer Hit Blocks",
      Original: original.shared_buffer_hits ?? 0,
      Optimized: optimized ? (optimized.shared_buffer_hits ?? 0) : 0,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="w-full">
        <ResponsiveContainer width="100%" height={220} minWidth={0}>
          <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="category" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [
                `${Number(value).toLocaleString()} blocks (8 KiB/block)`,
                name === "Original" ? "Original Accesses" : "Optimized Accesses",
              ]}
              contentStyle={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
            />
            <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
            <Bar dataKey="Original" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            {optimized && <Bar dataKey="Optimized" fill="#3b82f6" radius={[4, 4, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs text-(--color-text-muted) px-1">
        <span>📦 Authoritative root-level shared buffer blocks accessed (8 KiB/block). True query consumption is measured at the plan root, clearly distinguished from recursive node diagnostic sums.</span>
      </div>
    </div>
  );
}

export function CostAndBufferChart({ original, optimized }: CostAndBufferChartProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="p-3 rounded-lg border border-(--color-border) bg-(--color-surface)">
        <h4 className="text-xs font-semibold text-(--color-foreground) mb-2">Estimated Planner Cost</h4>
        <PlannerCostChart original={original} optimized={optimized} />
      </div>
      <div className="p-3 rounded-lg border border-(--color-border) bg-(--color-surface)">
        <h4 className="text-xs font-semibold text-(--color-foreground) mb-2">Shared Buffer Block Accesses</h4>
        <SharedBufferBlocksChart original={original} optimized={optimized} />
      </div>
    </div>
  );
}

interface TrialRunVarianceProps {
  original: AggregateBenchmarkMetrics;
  optimized?: AggregateBenchmarkMetrics | null;
}

export function TrialRunVarianceChart({ original, optimized }: TrialRunVarianceProps) {
  const maxRuns = Math.max(original.raw_runs.length, optimized?.raw_runs?.length ?? 0);
  const data = [];

  for (let i = 0; i < maxRuns; i++) {
    const origRun = original.raw_runs[i];
    const optRun = optimized?.raw_runs?.[i];
    data.push({
      trial: `Trial ${i + 1}${i === 0 ? " (Initial Run)" : ""}`,
      Original: origRun ? Number(origRun.execution_time_ms.toFixed(2)) : null,
      Optimized: optRun ? Number(optRun.execution_time_ms.toFixed(2)) : null,
    });
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={240} minWidth={0}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="trial" tick={{ fontSize: 11 }} />
          <YAxis unit=" ms" tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: unknown) => [`${value} ms`]}
            contentStyle={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
          />
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
          <Line type="monotone" dataKey="Original" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
          {optimized && <Line type="monotone" dataKey="Optimized" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface MLAccuracyChartProps {
  benchmark: BenchmarkComparisonResult;
}

export function MLAccuracyChart({ benchmark }: MLAccuracyChartProps) {
  if (!benchmark.ml_comparison) return null;

  const ml = benchmark.ml_comparison;
  const data = [
    {
      name: "Pre-execution Estimate",
      Latency: ml.ml_predicted_time_ms,
      type: "ML Prediction",
    },
    {
      name: "Empirical Measurement",
      Latency: ml.actual_measured_time_ms,
      type: "Actual Warm Median",
    },
  ];

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={200} minWidth={0}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis unit=" ms" tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: unknown) => [`${value} ms`]}
            contentStyle={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
          />
          <Bar dataKey="Latency" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface HistoricalTrendChartProps {
  history: BenchmarkHistoryItem[];
}

export function HistoricalTrendChart({ history }: HistoricalTrendChartProps) {
  if (!history || history.length === 0) return null;

  // Reverse so chronological order (oldest to newest)
  const data = [...history]
    .slice(0, 15)
    .reverse()
    .map((item, idx) => ({
      index: `#${idx + 1}`,
      OriginalTime: Number(item.original_exec_time_ms.toFixed(2)),
      OptimizedTime: item.optimized_exec_time_ms ? Number(item.optimized_exec_time_ms.toFixed(2)) : null,
      ImprovementPct: item.exec_time_improvement_pct ?? 0,
    }));

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={240} minWidth={0}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="index" tick={{ fontSize: 11 }} />
          <YAxis unit=" ms" tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [
              name === "ImprovementPct" ? `${value}%` : `${value} ms`,
              name === "OriginalTime" ? "Original" : name === "OptimizedTime" ? "Optimized" : "Improvement %",
            ]}
            contentStyle={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
          />
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
          <Line type="monotone" dataKey="OriginalTime" stroke="#ef4444" strokeWidth={2} name="Original Latency (ms)" />
          <Line type="monotone" dataKey="OptimizedTime" stroke="#10b981" strokeWidth={2} name="Optimized Latency (ms)" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
