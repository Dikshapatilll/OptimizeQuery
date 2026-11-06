"use client";

import { useEffect, useState } from "react";
import type { LLMConfigCreate, ProviderInfo } from "@/lib/types";
import { listProviders } from "@/lib/api-client";

interface LLMConfigFormProps {
  onSubmit: (data: LLMConfigCreate) => Promise<void>;
  onCancel: () => void;
}

export function LLMConfigForm({ onSubmit, onCancel }: LLMConfigFormProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<LLMConfigCreate["provider"]>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listProviders()
      .then((p) => {
        setProviders(p);
        if (p.length > 0) {
          setProvider(p[0].name as LLMConfigCreate["provider"]);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ name, provider, api_key: apiKey });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-(--color-border) bg-(--color-surface) p-5 space-y-4 shadow-2xs"
    >
      <div className="flex items-center justify-between border-b border-(--color-border) pb-3">
        <h3 className="text-sm font-semibold text-(--color-foreground)">Configure LLM Provider</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-(--color-text-faint) hover:text-(--color-foreground) cursor-pointer"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-(--color-foreground) mb-1">Configuration Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Production Anthropic"
            required
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-xs bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-(--color-foreground) mb-1">Provider Engine</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as LLMConfigCreate["provider"])}
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-xs bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
          >
            {providers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-(--color-foreground) mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            required
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-xs font-mono bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-(--color-border)">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-(--color-border) bg-(--color-surface) text-xs font-medium rounded-lg text-(--color-foreground) hover:bg-(--color-surface-muted) transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !name || !apiKey}
          className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
        >
          {submitting ? "Saving..." : "Save Provider Key"}
        </button>
      </div>
    </form>
  );
}

export default LLMConfigForm;
