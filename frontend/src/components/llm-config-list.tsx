"use client";

import type { LLMConfigResponse } from "@/lib/types";
import { activateLLMConfig, deleteLLMConfig } from "@/lib/api-client";

interface LLMConfigListProps {
  configs: LLMConfigResponse[];
  onRefresh: () => void;
}

const providerLabels: Record<string, string> = {
  anthropic:  "Anthropic (Claude 3.5 Sonnet)",
  openai:     "OpenAI (GPT-4o)",
  gemini:     "Google Gemini (Gemini 1.5 Pro)",
  deepseek:   "DeepSeek (DeepSeek-V3 / R1)",
  xai:        "xAI (Grok 2)",
  qwen:       "Qwen (Alibaba)",
  meta:       "Meta (Llama 3.3)",
  kimi:       "Kimi / Moonshot",
  openrouter: "OpenRouter Gateway",
};

export function LLMConfigList({ configs, onRefresh }: LLMConfigListProps) {
  if (configs.length === 0) {
    return (
      <div className="text-center py-10 rounded-xl border border-(--color-border) bg-(--color-surface)">
        <p className="text-xs text-(--color-text-muted)">No external LLM providers configured.</p>
        <p className="text-[11px] text-(--color-text-faint) mt-1">
          OptimizeQL operates with built-in ML and OR optimization models by default. Add an LLM provider for natural language query advice.
        </p>
      </div>
    );
  }

  const handleActivate = async (id: string) => {
    try {
      await activateLLMConfig(id);
      onRefresh();
    } catch {
      // silent
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLLMConfig(id);
      onRefresh();
    } catch {
      // silent
    }
  };

  return (
    <div className="space-y-3">
      {configs.map((config) => (
        <div
          key={config.id}
          className={`rounded-xl border p-4 transition-all shadow-2xs ${
            config.is_active
              ? "border-teal-500/40 bg-teal-500/5"
              : "border-(--color-border) bg-(--color-surface)"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-1">
                <h4 className="text-xs font-semibold text-(--color-foreground) truncate">
                  {config.name}
                </h4>
                {config.is_active && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    ACTIVE PROVIDER
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-(--color-text-muted)">
                <span className="font-medium">{providerLabels[config.provider] || config.provider}</span>
                <span className="font-mono text-[11px] text-(--color-text-faint)">
                  Key: {config.api_key_preview}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!config.is_active && (
                <button
                  onClick={() => handleActivate(config.id)}
                  className="px-3 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-500/10 border border-teal-500/20 rounded-lg hover:bg-teal-500/20 transition-colors cursor-pointer"
                >
                  Set Active
                </button>
              )}
              <button
                onClick={() => handleDelete(config.id)}
                className="px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default LLMConfigList;
