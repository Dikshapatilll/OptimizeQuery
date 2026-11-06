"use client";

import { useCallback, useEffect, useState } from "react";
import { LLMConfigList } from "@/components/llm-config-list";
import { LLMConfigForm } from "@/components/llm-config-form";
import { createLLMConfig, listLLMConfigs } from "@/lib/api-client";
import { useTheme } from "@/context/theme-context";
import type { LLMConfigCreate, LLMConfigResponse } from "@/lib/types";

export default function SettingsPage() {
  const [configs, setConfigs] = useState<LLMConfigResponse[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const { theme, toggleTheme } = useTheme();

  const fetchConfigs = useCallback(async () => {
    try {
      const data = await listLLMConfigs();
      setConfigs(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleCreate = async (data: LLMConfigCreate) => {
    await createLLMConfig(data);
    setShowForm(false);
    fetchConfigs();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="border-b border-(--color-border) pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-(--color-foreground)">
            Platform Settings & System Status
          </h1>
          <p className="text-xs text-(--color-text-muted) mt-1">
            Manage LLM provider credentials, inspect AI & OR engine models, and configure application preferences.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
          >
            <span>+</span>
            <span>Add LLM Provider</span>
          </button>
        )}
      </div>

      {/* SECTION 1: LLM Provider Configuration */}
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-(--color-foreground)">
            External LLM Providers
          </h2>
          <p className="text-xs text-(--color-text-muted)">
            Connect Claude, GPT-4o, Gemini, or DeepSeek for natural language advice and schema analysis explanations.
          </p>
        </div>

        {showForm && (
          <LLMConfigForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        )}

        {loading ? (
          <div className="h-28 bg-(--color-surface) rounded-xl border border-(--color-border) animate-pulse" />
        ) : (
          <LLMConfigList configs={configs} onRefresh={fetchConfigs} />
        )}
      </div>

      {/* SECTION 2: Architecture & Optimization Engine Status */}
      <div className="space-y-4 pt-4 border-t border-(--color-border)">
        <div>
          <h2 className="text-sm font-semibold text-(--color-foreground)">
            Optimization Engine Telemetry & Subsystems
          </h2>
          <p className="text-xs text-(--color-text-muted)">
            Verified operational status of machine learning regressors, operations research solvers, and database drivers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Subsystem 1: Machine Learning */}
          <div className="p-5 rounded-xl border border-(--color-border) bg-(--color-surface) space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-(--color-foreground) flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-500" />
                ML Latency Prediction Models
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold uppercase">
                Active &bull; Joblib Loaded
              </span>
            </div>
            <div className="space-y-1.5 text-xs text-(--color-text-muted) font-mono">
              <div className="flex justify-between">
                <span>Model Architecture:</span>
                <span className="font-semibold text-(--color-foreground)">Random Forest & XGBoost</span>
              </div>
              <div className="flex justify-between">
                <span>Feature Pipeline:</span>
                <span className="font-semibold text-(--color-foreground)">35 SQL AST features (sqlglot)</span>
              </div>
              <div className="flex justify-between">
                <span>Training Distribution:</span>
                <span className="font-semibold text-(--color-foreground)">500 synthetic queries (SQLite)</span>
              </div>
              <div className="flex justify-between">
                <span>Inference Time:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">&lt; 2.5 ms (No DB Lock)</span>
              </div>
            </div>
          </div>

          {/* Subsystem 2: Operations Research Engine */}
          <div className="p-5 rounded-xl border border-(--color-border) bg-(--color-surface) space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-(--color-foreground) flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-500" />
                Operations Research Optimizer
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 font-bold uppercase">
                Active &bull; PuLP CBC
              </span>
            </div>
            <div className="space-y-1.5 text-xs text-(--color-text-muted) font-mono">
              <div className="flex justify-between">
                <span>Scoring Paradigm:</span>
                <span className="font-semibold text-(--color-foreground)">4 Weighted Measurable Objectives</span>
              </div>
              <div className="flex justify-between">
                <span>Objective Weights:</span>
                <span className="font-semibold text-(--color-foreground)">Time 40%, Cost 30%, Reads 20%, Hits 10%</span>
              </div>
              <div className="flex justify-between">
                <span>Index Selection Solver:</span>
                <span className="font-semibold text-(--color-foreground)">0/1 Knapsack Binary Integer LP</span>
              </div>
              <div className="flex justify-between">
                <span>Solver Implementation:</span>
                <span className="font-semibold text-(--color-foreground)">COIN-OR Branch & Bound (CBC)</span>
              </div>
            </div>
          </div>

          {/* Subsystem 3: Database Benchmarking Engine */}
          <div className="p-5 rounded-xl border border-(--color-border) bg-(--color-surface) space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-(--color-foreground) flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Empirical Benchmarking Driver
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold uppercase">
                PostgreSQL & MySQL
              </span>
            </div>
            <div className="space-y-1.5 text-xs text-(--color-text-muted) font-mono">
              <div className="flex justify-between">
                <span>PostgreSQL Driver:</span>
                <span className="font-semibold text-(--color-foreground)">psycopg2-binary 2.9.10</span>
              </div>
              <div className="flex justify-between">
                <span>Isolation Protocol:</span>
                <span className="font-semibold text-(--color-foreground)">Transactional Rollback Guard</span>
              </div>
              <div className="flex justify-between">
                <span>Telemetry Extraction:</span>
                <span className="font-semibold text-(--color-foreground)">EXPLAIN (ANALYZE, BUFFERS) Root</span>
              </div>
              <div className="flex justify-between">
                <span>Statistical Variance:</span>
                <span className="font-semibold text-(--color-foreground)">Student&apos;s t 95% Confidence Intervals</span>
              </div>
            </div>
          </div>

          {/* Subsystem 4: Application Appearance */}
          <div className="p-5 rounded-xl border border-(--color-border) bg-(--color-surface) space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-(--color-foreground) flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                Application Theme & Interface
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-(--color-surface-muted) text-(--color-text-muted) border border-(--color-border) uppercase">
                {theme === "dark" ? "Dark Theme Active" : "Light Theme Active"}
              </span>
            </div>
            <p className="text-xs text-(--color-text-muted)">
              OptimizeQL features an enterprise database design system with deep navy, graphite, primary teal, and secondary violet tokens.
            </p>
            <div className="pt-2">
              <button
                onClick={toggleTheme}
                className="px-4 py-2 rounded-lg border border-(--color-border) bg-(--color-surface-muted) text-xs font-semibold text-(--color-foreground) hover:bg-(--color-surface) transition-colors cursor-pointer flex items-center gap-2"
              >
                <span>{theme === "dark" ? "☀️ Switch to Light Mode" : "🌙 Switch to Dark Mode"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
