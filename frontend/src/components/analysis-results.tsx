"use client";

import { useState } from "react";
import type { AnalysisResult, ConfigurationItem, ExecutionTimePrediction, OROptimizationSummary } from "@/lib/types";
import { useAnalysis } from "@/context/analysis-context";
import { SuggestionCard } from "./suggestion-card";
import { SqlHighlight } from "./sql-highlight";
import { ImpactBadge } from "./impact-badge";
import { IndexBudgetSelector } from "./index-budget-selector";
import { ProvenanceBadge } from "./provenance-badge";

const sectionMeta: Record<string, { icon: string; color: string }> = {
  Bottlenecks: { icon: "!!", color: "text-red-500" },
  "Suggested Indexes": { icon: "+", color: "text-blue-500" },
  "Query Rewrites": { icon: "~", color: "text-violet-500" },
  "Materialized Views": { icon: "#", color: "text-amber-500" },
  Statistics: { icon: "S", color: "text-teal-500" },
  Configuration: { icon: "C", color: "text-indigo-500" },
};

const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortByImpact(items: AnalysisResult["indexes"]) {
  return [...items].sort(
    (a, b) => (impactOrder[a.estimated_impact] ?? 3) - (impactOrder[b.estimated_impact] ?? 3),
  );
}

interface SectionProps {
  title: string;
  items: AnalysisResult["indexes"];
  originalSql?: string;
  connectionId?: string | null;
  /** Original SQL query for index simulation */
  querySql?: string;
  /** Database type — "postgresql" enables simulation */
  dbType?: string | null;
  playgroundMode?: boolean;
}

function Section({ title, items, originalSql, connectionId, querySql, dbType, playgroundMode }: SectionProps) {
  if (items.length === 0) return null;
  const meta = sectionMeta[title] || { icon: "*", color: "text-gray-500" };
  const sorted = sortByImpact(items);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2.5 mb-4">
        <span
          className={`w-7 h-7 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-xs font-bold ${meta.color}`}
        >
          {meta.icon}
        </span>
        <h3 className="text-[18px] font-semibold text-(--color-foreground)">{title}</h3>
        <span className="text-[14px] text-(--color-text-faint) font-normal">
          {items.length} {items.length === 1 ? "suggestion" : "suggestions"}
        </span>
      </div>
      <div className="space-y-3 pl-0.5">
        {sorted.map((item, i) => (
          <SuggestionCard
            key={i}
            item={item}
            originalSql={originalSql}
            connectionId={connectionId}
            querySql={querySql}
            dbType={dbType}
            playgroundMode={playgroundMode}
          />
        ))}
      </div>
    </div>
  );
}

function ConfigurationCard({ item }: { item: ConfigurationItem }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-base leading-[1.75] text-(--color-foreground)">{item.explanation}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[12px] font-mono text-(--color-text-muted)">
              {item.parameter}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/30 text-[12px] font-mono text-red-500 dark:text-red-400">
              {item.current_value}
            </span>
            <span className="text-[12px] text-(--color-text-faint)">&rarr;</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-[12px] font-mono text-emerald-600 dark:text-emerald-400">
              {item.recommended_value}
            </span>
          </div>
        </div>
        <ImpactBadge impact={item.estimated_impact} />
      </div>
    </div>
  );
}

function ExecutionTimeCard({ prediction }: { prediction: ExecutionTimePrediction }) {
  const tierBadge =
    prediction.latency_tier === "fast"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
      : prediction.latency_tier === "moderate"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300"
        : "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300";

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 mb-4 hover:shadow-xs transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-(--color-border) pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
            ⚡
          </div>
          <div>
            <h3 className="text-base font-semibold text-(--color-foreground) flex items-center gap-2">
              ML Query Execution Time Prediction
              <ProvenanceBadge type="predicted" />
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider ${tierBadge}`}>
                {prediction.latency_tier}
              </span>
            </h3>
            <p className="text-xs text-(--color-text-muted) mt-0.5">
              Pre-execution estimation powered by Random Forest & XGBoost models
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right sm:self-center">
          <span className="text-2xl font-bold text-(--color-foreground) tracking-tight">
            ~{prediction.predicted_time_ms.toFixed(2)} ms
          </span>
          <p className="text-[11px] text-(--color-text-faint)">
            Est. range: {prediction.confidence_range.min_ms.toFixed(1)} – {prediction.confidence_range.max_ms.toFixed(1)} ms
          </p>
        </div>
      </div>

      {/* Model comparison breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            <span className="text-xs font-medium text-(--color-text-muted)">XGBoost Regressor:</span>
          </div>
          <span className="text-xs font-mono font-semibold text-(--color-foreground)">
            {prediction.models.xgboost_ms.toFixed(2)} ms
          </span>
        </div>
        <div className="p-3 rounded-lg border border-(--color-border) bg-(--color-surface-muted) flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-xs font-medium text-(--color-text-muted)">Random Forest Regressor:</span>
          </div>
          <span className="text-xs font-mono font-semibold text-(--color-foreground)">
            {prediction.models.random_forest_ms.toFixed(2)} ms
          </span>
        </div>
      </div>

      {/* Cost factors identified before execution */}
      {prediction.cost_factors.length > 0 && (
        <div>
          <span className="text-xs font-medium text-(--color-text-faint) uppercase tracking-wider block mb-1.5">
            Key Execution Drivers:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {prediction.cost_factors.map((factor, idx) => (
              <span
                key={idx}
                className="text-xs px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-(--color-text-muted) border border-(--color-border)"
              >
                • {factor}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ORRankedAlternativesCard({ orOptimization }: { orOptimization: OROptimizationSummary }) {
  const alts = orOptimization.ranked_alternatives;
  if (!alts || alts.length === 0) return null;

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 mb-4 hover:shadow-xs transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-(--color-border) pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
            ⚖️
          </div>
          <div>
            <h3 className="text-base font-semibold text-(--color-foreground) flex items-center gap-2">
              Operations Research Multi-Objective Ranking
              <ProvenanceBadge type="estimated" />
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                {alts.length} {alts.length === 1 ? "Alternative" : "Alternatives"}
              </span>
            </h3>
            <p className="text-xs text-(--color-text-muted) mt-0.5">
              Weighted multi-objective scoring across Execution Time, Cost, and Shared Buffers
            </p>
          </div>
        </div>
      </div>

      {/* Weights breakdown bar */}
      <div className="flex flex-wrap gap-2 text-[11px] text-(--color-text-muted) mb-3 px-1">
        <span className="font-medium text-(--color-text-faint)">Objective Weights:</span>
        {Object.entries(orOptimization.weights_used).map(([k, v]) => (
          <span key={k} className="px-2 py-0.5 rounded bg-(--color-surface-muted) border border-(--color-border) font-mono">
            {k}: {Math.round(v * 100)}%
          </span>
        ))}
      </div>

      {/* Ranked alternatives list */}
      <div className="space-y-2.5">
        {alts.map((alt) => (
          <div
            key={`${alt.category}-${alt.rank}`}
            className="p-3.5 rounded-lg border border-(--color-border) bg-(--color-surface-muted) hover:border-(--color-border-hover) transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                  alt.rank === 1
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 ring-2 ring-amber-400/50"
                    : "bg-gray-100 dark:bg-gray-800 text-(--color-text-muted)"
                }`}>
                  #{alt.rank}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-(--color-text-muted) px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                  {alt.category}
                </span>
                <ImpactBadge impact={alt.estimated_impact} />
                {alt.is_ml_prediction && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-mono">
                    ML-Predicted Time
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-semibold text-(--color-foreground)">
                  Score: {alt.weighted_score.toFixed(4)}
                </span>
                <span className="block text-[10px] text-(--color-text-faint)">
                  (lower is better)
                </span>
              </div>
            </div>

            <p className="text-xs text-(--color-foreground) mt-2 leading-relaxed">
              {alt.explanation}
            </p>

            {alt.sql && (
              <div className="mt-2 text-xs font-mono bg-black/5 dark:bg-white/5 p-2 rounded overflow-x-auto text-(--color-text-muted)">
                {alt.sql}
              </div>
            )}

            {/* Score breakdown & explanation */}
            <div className="mt-2.5 pt-2 border-t border-(--color-border)/50 flex flex-col gap-1 text-[11px] text-(--color-text-muted)">
              <div className="font-mono text-[10px] text-(--color-text-faint)">
                {alt.score_explanation}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function highestImpact(items: AnalysisResult["indexes"]): number {
  if (items.length === 0) return 99;
  return Math.min(...items.map((i) => impactOrder[i.estimated_impact] ?? 3));
}

export function AnalysisResults({ result, readOnly = false }: { result: AnalysisResult; readOnly?: boolean }) {
  const { sql, connectionId, dbType, playgroundMode } = useAnalysis();
  const [showIndexBudgetSelector, setShowIndexBudgetSelector] = useState(false);

  const hasAnySuggestions =
    result.bottlenecks.length > 0 ||
    result.indexes.length > 0 ||
    result.rewrites.length > 0 ||
    result.materialized_views.length > 0 ||
    (result.statistics?.length ?? 0) > 0 ||
    (result.configuration?.length ?? 0) > 0;

  // Sort sections so the one with the highest-impact item comes first
  const sections: { title: string; items: AnalysisResult["indexes"] }[] = [
    { title: "Bottlenecks", items: result.bottlenecks },
    { title: "Suggested Indexes", items: result.indexes },
    { title: "Query Rewrites", items: result.rewrites },
    { title: "Materialized Views", items: result.materialized_views },
    { title: "Statistics", items: result.statistics ?? [] },
  ].sort((a, b) => highestImpact(a.items) - highestImpact(b.items));

  const configItems = result.configuration ?? [];

  return (
    <div className="space-y-2">
      {/* Query execution error — shown before summary */}
      {result.explain_error && (
        <div className="rounded-lg overflow-hidden border border-red-200 mb-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
            </svg>
            <span className="text-[13px] font-semibold">Query Execution Error</span>
          </div>
          <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20">
            <pre className="font-mono text-[13px] leading-relaxed text-red-800 dark:text-red-300 whitespace-pre-wrap">{result.explain_error}</pre>
          </div>
        </div>
      )}

      {/* Summary box */}
      {result.summary && (
        <div className="bg-[#eef2f9] dark:bg-blue-950/30 border border-[#c8d4e8] dark:border-blue-900/50 rounded-xl p-5 mb-4">
          <h3 className="text-[14px] font-semibold text-[#1e3a5f] dark:text-blue-400 mb-1.5">Summary</h3>
          <p className="text-base leading-[1.75] text-(--color-foreground)">{result.summary}</p>
        </div>
      )}

      {/* ML Query Execution Time Prediction */}
      {result.execution_time_prediction && (
        <ExecutionTimeCard prediction={result.execution_time_prediction} />
      )}

      {/* Operations Research Multi-Objective Ranking */}
      {result.or_optimization && (
        <ORRankedAlternativesCard orOptimization={result.or_optimization} />
      )}

      {/* Constrained Index Selection with Storage Budget */}
      {result.indexes.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowIndexBudgetSelector(!showIndexBudgetSelector)}
            className="w-full py-2.5 px-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/40 hover:bg-blue-100/60 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center justify-between transition-colors shadow-2xs cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span>🎯</span> Solve Constrained Index Selection with Storage Budget Limit ({result.indexes.length} candidates)
            </span>
            <span>{showIndexBudgetSelector ? "▲ Hide" : "▼ Open Optimizer"}</span>
          </button>

          {showIndexBudgetSelector && (
            <div className="mt-3">
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

      {/* Tables analyzed */}
      {result.tables_analyzed.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pb-2">
          <span className="text-[14px] text-(--color-text-faint) mr-1">Tables:</span>
          {result.tables_analyzed.map((t) => (
            <span
              key={t}
              className="px-2.5 py-0.5 bg-gray-50 dark:bg-gray-800 border border-(--color-border) rounded-md text-[14px] font-mono text-(--color-text-muted)"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* EXPLAIN plan — collapsible */}
      {result.explain_plan && (
        <details className="group rounded-xl border border-(--color-border) bg-(--color-surface-muted) overflow-hidden">
          <summary className="cursor-pointer px-4 py-3 text-[14px] font-medium text-(--color-text-muted) hover:text-(--color-foreground) transition-colors flex items-center gap-2">
            <svg
              className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-90"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            EXPLAIN Plan
          </summary>
          <div className="px-4 pb-4">
            <SqlHighlight code={result.explain_plan} />
          </div>
        </details>
      )}

      {/* Suggestion sections — sorted by highest impact */}
      {sections.map((s) => (
        <Section
          key={s.title}
          title={s.title}
          items={s.items}
          originalSql={!readOnly && s.title === "Query Rewrites" ? sql : undefined}
          connectionId={!readOnly && (s.title === "Query Rewrites" || s.title === "Suggested Indexes") ? connectionId : undefined}
          querySql={!readOnly && s.title === "Suggested Indexes" ? sql : undefined}
          dbType={!readOnly && s.title === "Suggested Indexes" ? dbType : undefined}
          playgroundMode={!readOnly && (s.title === "Query Rewrites" || s.title === "Suggested Indexes") ? playgroundMode : undefined}
        />
      ))}

      {/* Configuration section — different card shape */}
      {configItems.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-indigo-500">
              C
            </span>
            <h3 className="text-[18px] font-semibold text-(--color-foreground)">Configuration</h3>
            <span className="text-[14px] text-(--color-text-faint) font-normal">
              {configItems.length} {configItems.length === 1 ? "suggestion" : "suggestions"}
            </span>
          </div>
          <div className="space-y-3 pl-0.5">
            {[...configItems]
              .sort(
                (a, b) =>
                  (impactOrder[a.estimated_impact] ?? 3) -
                  (impactOrder[b.estimated_impact] ?? 3),
              )
              .map((item, i) => (
                <ConfigurationCard key={i} item={item} />
              ))}
          </div>
        </div>
      )}

      {!hasAnySuggestions && (
        <div className="text-center py-8">
          <p className="text-base text-(--color-text-faint)">No optimization suggestions found.</p>
          <p className="text-[14px] text-(--color-text-faint) opacity-60 mt-1">The query looks well-optimized.</p>
        </div>
      )}
    </div>
  );
}
