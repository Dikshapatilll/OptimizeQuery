"use client";

import React, { useState } from "react";
import type {
  AnalysisResult,
  ConfigurationItem,
  ExecutionTimePrediction,
  OROptimizationSummary,
  SuggestionItem,
} from "@/lib/types";
import { useAnalysis } from "@/context/analysis-context";
import { SuggestionCard } from "./suggestion-card";
import { SqlHighlight } from "./sql-highlight";
import { ImpactBadge } from "./impact-badge";
import { IndexBudgetSelector } from "./index-budget-selector";
import { ProvenanceBadge } from "./provenance-badge";

const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortByImpact(items: SuggestionItem[]) {
  return [...items].sort(
    (a, b) => (impactOrder[a.estimated_impact] ?? 3) - (impactOrder[b.estimated_impact] ?? 3),
  );
}

// ── ML Execution-Time Prediction Card ────────────────────────────────────────

function ExecutionTimeSection({ prediction }: { prediction: ExecutionTimePrediction }) {
  const tierClass =
    prediction.latency_tier === "fast"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      : prediction.latency_tier === "moderate"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-2xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-(--color-border) pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-sm">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-(--color-foreground)">
                ML Pre-Execution Latency Prediction
              </h3>
              <ProvenanceBadge type="predicted" />
              <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${tierClass}`}>
                {prediction.latency_tier} tier
              </span>
            </div>
            <p className="text-xs text-(--color-text-muted) mt-0.5">
              Structural AST regression inference ($O(N)$ token time without database locks)
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-2xl font-bold font-mono text-(--color-foreground)">
            ~{prediction.predicted_time_ms.toFixed(2)} ms
          </span>
          <p className="text-[11px] font-mono text-(--color-text-faint)">
            Est. range: {prediction.confidence_range.min_ms.toFixed(1)} – {prediction.confidence_range.max_ms.toFixed(1)} ms
          </p>
        </div>
      </div>

      {/* Model Comparison Breakdown (Random Forest vs XGBoost) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="p-3.5 rounded-lg border border-(--color-border) bg-(--color-surface-muted) flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
            <div>
              <span className="text-xs font-semibold text-(--color-foreground) block">
                XGBoost Regressor
              </span>
              <span className="text-[10px] font-mono text-(--color-text-faint)">
                Gradient-boosted decision trees
              </span>
            </div>
          </div>
          <span className="text-sm font-mono font-bold text-(--color-foreground)">
            {prediction.models.xgboost_ms.toFixed(2)} ms
          </span>
        </div>

        <div className="p-3.5 rounded-lg border border-(--color-border) bg-(--color-surface-muted) flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-500"></span>
            <div>
              <span className="text-xs font-semibold text-(--color-foreground) block">
                Random Forest Regressor
              </span>
              <span className="text-[10px] font-mono text-(--color-text-faint)">
                Ensemble bagging estimator
              </span>
            </div>
          </div>
          <span className="text-sm font-mono font-bold text-(--color-foreground)">
            {prediction.models.random_forest_ms.toFixed(2)} ms
          </span>
        </div>
      </div>

      {/* Key Cost Drivers */}
      {prediction.cost_factors && prediction.cost_factors.length > 0 && (
        <div>
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-(--color-text-faint) block mb-2">
            Identified Latency Drivers (AST Analysis):
          </span>
          <div className="flex flex-wrap gap-2">
            {prediction.cost_factors.map((factor, idx) => (
              <span
                key={idx}
                className="text-xs px-2.5 py-1 rounded-md bg-(--color-surface-muted) text-(--color-text-muted) border border-(--color-border) font-mono"
              >
                &bull; {factor}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Operations Research Multi-Objective Ranking Card ─────────────────────────

function ORRankedAlternativesSection({ orOptimization }: { orOptimization: OROptimizationSummary }) {
  const alts = orOptimization.ranked_alternatives;
  if (!alts || alts.length === 0) return null;

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-2xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-(--color-border) pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold text-sm">
            ⚖️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-(--color-foreground)">
                Operations Research Multi-Objective Ranking
              </h3>
              <ProvenanceBadge type="estimated" />
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400">
                {alts.length} {alts.length === 1 ? "Candidate" : "Candidates"} Evaluated
              </span>
            </div>
            <p className="text-xs text-(--color-text-muted) mt-0.5">
              Evaluated across four weighted measurable objectives using min-max normalization
            </p>
          </div>
        </div>
      </div>

      {/* Weights pill bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-(--color-text-muted) mb-4 p-2.5 rounded-lg bg-(--color-surface-muted) border border-(--color-border)">
        <span className="font-mono text-[11px] font-bold text-(--color-text-faint) uppercase">
          Objective Weights:
        </span>
        {Object.entries(orOptimization.weights_used).map(([k, v]) => (
          <span key={k} className="px-2 py-0.5 rounded bg-(--color-surface) border border-(--color-border) font-mono text-[11px]">
            {k.replace(/_/g, " ")}: <span className="font-bold text-teal-600 dark:text-teal-400">{Math.round(v * 100)}%</span>
          </span>
        ))}
      </div>

      {/* Ranked alternatives list */}
      <div className="space-y-3">
        {alts.map((alt) => (
          <div
            key={`${alt.category}-${alt.rank}`}
            className="p-4 rounded-xl border border-(--color-border) bg-(--color-surface-muted) hover:border-(--color-border-hover) transition-all"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-mono font-bold ${
                  alt.rank === 1
                    ? "bg-teal-600 text-white shadow-xs"
                    : "bg-gray-200 dark:bg-gray-800 text-(--color-text-muted)"
                }`}>
                  #{alt.rank}
                </span>
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-(--color-text-muted) px-2 py-0.5 rounded bg-(--color-surface) border border-(--color-border)">
                  {alt.category}
                </span>
                <ImpactBadge impact={alt.estimated_impact} />
                {alt.is_ml_prediction && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400">
                    ML-Predicted
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold text-(--color-foreground)">
                  Score: {alt.weighted_score.toFixed(4)}
                </span>
                <span className="block text-[10px] font-mono text-(--color-text-faint)">
                  (lower is optimal)
                </span>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-(--color-foreground)">
              {alt.explanation}
            </p>

            {alt.sql && (
              <div className="mt-2.5 p-2 rounded-lg bg-(--color-surface) border border-(--color-border) font-mono text-xs overflow-x-auto text-(--color-foreground)">
                {alt.sql}
              </div>
            )}

            <div className="mt-2 text-[10px] font-mono text-(--color-text-faint)">
              {alt.score_explanation}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Analysis Results Component ──────────────────────────────────────────

export function AnalysisResults({
  result,
  readOnly = false,
}: {
  result: AnalysisResult;
  readOnly?: boolean;
}) {
  const { sql, connectionId, dbType, playgroundMode } = useAnalysis();
  const [showIndexBudgetSelector, setShowIndexBudgetSelector] = useState(false);

  const sortedBottlenecks = sortByImpact(result.bottlenecks || []);
  const sortedIndexes = sortByImpact(result.indexes || []);
  const sortedRewrites = sortByImpact(result.rewrites || []);
  const sortedViews = sortByImpact(result.materialized_views || []);

  return (
    <div className="space-y-6">
      {/* 1. Executive Summary */}
      {result.summary && (
        <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-5 shadow-2xs">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-teal-500"></span>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Optimization Analysis Summary
            </h3>
          </div>
          <p className="text-sm leading-relaxed text-(--color-foreground)">
            {result.summary}
          </p>
          {result.tables_analyzed && result.tables_analyzed.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-teal-500/10">
              <span className="text-xs font-mono text-(--color-text-faint)">Tables:</span>
              {result.tables_analyzed.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded bg-(--color-surface) border border-(--color-border) text-xs font-mono text-(--color-foreground)"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. ML Execution-Time Prediction */}
      {result.execution_time_prediction && (
        <ExecutionTimeSection prediction={result.execution_time_prediction} />
      )}

      {/* 3. Operations Research Multi-Objective Ranking */}
      {result.or_optimization && (
        <ORRankedAlternativesSection orOptimization={result.or_optimization} />
      )}

      {/* 4. Constrained Index Selection with Storage Budget (0/1 Knapsack) */}
      {result.indexes && result.indexes.length > 0 && (
        <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center text-sm font-bold">
                  🎒
                </span>
                <h3 className="text-sm font-semibold text-(--color-foreground)">
                  0/1 Knapsack Storage-Budget Index Selector
                </h3>
              </div>
              <p className="text-xs text-(--color-text-muted) mt-0.5">
                Solves a binary integer linear program using PuLP & CBC to select the optimal index set under a storage cap
              </p>
            </div>
            <button
              onClick={() => setShowIndexBudgetSelector(!showIndexBudgetSelector)}
              className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>{showIndexBudgetSelector ? "▲ Hide Selector" : "▼ Open Index Selector"}</span>
            </button>
          </div>

          {showIndexBudgetSelector && (
            <div className="mt-4 pt-4 border-t border-(--color-border)">
              <IndexBudgetSelector
                sql={sql}
                connectionId={connectionId}
                indexes={result.indexes}
                onClose={() => setShowIndexBudgetSelector(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* 5. Query Bottlenecks */}
      {sortedBottlenecks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <h3 className="text-sm font-semibold text-(--color-foreground)">
              Identified Query Bottlenecks ({sortedBottlenecks.length})
            </h3>
          </div>
          <div className="space-y-3">
            {sortedBottlenecks.map((item, i) => (
              <SuggestionCard
                key={i}
                item={item}
                originalSql={sql}
                connectionId={connectionId}
                querySql={sql}
                dbType={dbType}
                playgroundMode={playgroundMode}
              />
            ))}
          </div>
        </div>
      )}

      {/* 6. Index Recommendations */}
      {sortedIndexes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
            <h3 className="text-sm font-semibold text-(--color-foreground)">
              Index Recommendations ({sortedIndexes.length})
            </h3>
          </div>
          <div className="space-y-3">
            {sortedIndexes.map((item, i) => (
              <SuggestionCard
                key={i}
                item={item}
                originalSql={sql}
                connectionId={connectionId}
                querySql={sql}
                dbType={dbType}
                playgroundMode={playgroundMode}
              />
            ))}
          </div>
        </div>
      )}

      {/* 7. Query Rewrite Recommendations */}
      {sortedRewrites.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-500"></span>
            <h3 className="text-sm font-semibold text-(--color-foreground)">
              Query Rewrite Recommendations ({sortedRewrites.length})
            </h3>
          </div>
          <div className="space-y-3">
            {sortedRewrites.map((item, i) => (
              <SuggestionCard
                key={i}
                item={item}
                originalSql={sql}
                connectionId={connectionId}
                querySql={sql}
                dbType={dbType}
                playgroundMode={playgroundMode}
              />
            ))}
          </div>
        </div>
      )}

      {/* 8. Relational EXPLAIN Plan Inspection */}
      {result.explain_plan && (
        <details className="group rounded-xl border border-(--color-border) bg-(--color-surface) overflow-hidden shadow-2xs">
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-(--color-foreground) hover:bg-(--color-surface-muted) transition-colors flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-(--color-text-faint) transition-transform group-open:rotate-90"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span>Relational Execution Plan (EXPLAIN Tree)</span>
            </div>
            <span className="text-[10px] font-mono text-(--color-text-faint)">
              Raw Database Introspection
            </span>
          </summary>
          <div className="px-4 pb-4 pt-2 border-t border-(--color-border)">
            <SqlHighlight code={result.explain_plan} />
          </div>
        </details>
      )}
    </div>
  );
}

export default AnalysisResults;
