"use client";

import React, { useState } from "react";
import type { IndexSelectionResponse, SuggestionItem } from "@/lib/types";
import { selectIndexesWithOR } from "@/lib/api-client";
import { ProvenanceBadge } from "./provenance-badge";

interface IndexBudgetSelectorProps {
  sql: string;
  connectionId?: string | null;
  indexes: SuggestionItem[];
  onClose?: () => void;
}

export function IndexBudgetSelector({
  sql,
  connectionId,
  indexes,
  onClose,
}: IndexBudgetSelectorProps) {
  const [budgetMb, setBudgetMb] = useState<number>(500);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<IndexSelectionResponse | null>(null);
  const [error, setError] = useState<string>("");

  async function handleSolve() {
    setLoading(true);
    setError("");
    try {
      const resp = await selectIndexesWithOR({
        sql,
        connection_id: connectionId,
        budget_mb: budgetMb,
        analysis_result_json: JSON.stringify({ indexes }),
      });
      setResult(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to solve index selection problem");
    } finally {
      setLoading(false);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 space-y-5">
      <div className="flex items-center justify-between border-b border-(--color-border) pb-4">
        <div>
          <h3 className="text-base font-bold text-(--color-foreground) flex items-center gap-2">
            <span>🎯</span> Operations Research: Constrained Index Selection
            <ProvenanceBadge type="estimated" />
          </h3>
          <p className="text-xs text-(--color-text-muted) mt-0.5">
            Solves 0-1 Binary Knapsack Integer Linear Program using PuLP CBC
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-(--color-text-muted) hover:text-(--color-foreground) px-2 py-1 rounded border border-(--color-border) cursor-pointer"
          >
            Close
          </button>
        )}
      </div>

      {/* Budget Slider */}
      <div className="p-4 rounded-lg border border-(--color-border) bg-(--color-surface-muted) space-y-3">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="budget-slider" className="font-semibold text-(--color-foreground)">
            Storage Budget Limit:
          </label>
          <span className="font-mono font-bold text-sm text-teal-600 dark:text-teal-400">
            {budgetMb} MB
          </span>
        </div>
        <input
          id="budget-slider"
          type="range"
          min={10}
          max={2000}
          step={10}
          value={budgetMb}
          onChange={(e) => setBudgetMb(Number(e.target.value))}
          className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-teal-600"
        />
        <div className="flex justify-between text-[10px] text-(--color-text-faint) font-mono">
          <span>10 MB (Strict)</span>
          <span>500 MB (Default)</span>
          <span>2000 MB (Generous)</span>
        </div>

        <button
          onClick={handleSolve}
          disabled={loading || indexes.length === 0}
          className="w-full mt-2 py-2 px-4 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
        >
          {loading ? "Solving Knapsack MILP via CBC..." : `Solve Optimal Selection for ${indexes.length} Suggested Indexes`}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Optimization Results */}
      {result && (
        <div className="space-y-4 pt-2">
          {/* Status and Utilization */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted)">
              <span className="text-[11px] text-(--color-text-muted) block mb-0.5">Solver Status</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                {result.result.solver_status} (Optimal)
              </span>
            </div>
            <div className="p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted)">
              <span className="text-[11px] text-(--color-text-muted) block mb-0.5">Storage Consumed</span>
              <span className="text-sm font-bold font-mono text-(--color-foreground)">
                {formatBytes(result.result.total_size_bytes)} ({result.result.budget_utilisation_pct.toFixed(1)}%)
              </span>
            </div>
            <div className="p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted)">
              <span className="text-[11px] text-(--color-text-muted) block mb-0.5">Objective Value</span>
              <span className="text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400">
                +{result.result.objective_value.toFixed(1)} Cost Reduction
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full ${
                result.result.budget_utilisation_pct > 90 ? "bg-amber-500" : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(100, result.result.budget_utilisation_pct)}%` }}
            />
          </div>

          {/* Selected Indexes */}
          <div>
            <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>✓</span> Approved Indexes ({result.result.selected_indexes.length})
            </h4>
            {result.result.selected_indexes.length > 0 ? (
              <div className="space-y-2">
                {result.result.selected_indexes.map((idx) => (
                  <div
                    key={idx.index_id}
                    className="p-3 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-(--color-foreground)">
                        {idx.sql}
                      </span>
                      <span
                        className="font-mono text-emerald-700 dark:text-emerald-300 font-bold"
                        title={idx.size_provenance || "Estimated size based on catalog statistics"}
                      >
                        {formatBytes(idx.estimated_size_bytes)} (est.)
                      </span>
                    </div>
                    <p className="text-(--color-text-muted) text-[11px]">{idx.explanation}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-(--color-text-muted) italic">
                No indexes fit within the allocated budget. Try increasing the storage limit.
              </p>
            )}
          </div>

          {/* Rejected Indexes */}
          {result.result.rejected_indexes.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span>✕</span> Excluded Indexes Due to Storage Budget ({result.result.rejected_indexes.length})
              </h4>
              <div className="space-y-2">
                {result.result.rejected_indexes.map((idx) => (
                  <div
                    key={idx.index_id}
                    className="p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) text-xs opacity-75 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-(--color-text-muted) line-through">
                        {idx.sql}
                      </span>
                      <span
                        className="font-mono text-red-500 font-medium"
                        title={idx.size_provenance || "Estimated size based on catalog statistics"}
                      >
                        {formatBytes(idx.estimated_size_bytes)} (est.)
                      </span>
                    </div>
                    <p className="text-(--color-text-faint) text-[11px]">{idx.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
