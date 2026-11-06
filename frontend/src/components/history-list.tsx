"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QueryHistoryItem, AnalysisResult } from "@/lib/types";
import { useAnalysis } from "@/context/analysis-context";
import Link from "next/link";

interface HistoryListProps {
  items: QueryHistoryItem[];
}

export function HistoryList({ items }: HistoryListProps) {
  const { loadHistoryResult } = useAnalysis();
  const router = useRouter();
  const [filter, setFilter] = useState("");

  if (items.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl border border-(--color-border) bg-(--color-surface)">
        <div className="w-12 h-12 mx-auto rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 15" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-(--color-foreground)">No Query History Recorded</p>
        <p className="text-xs text-(--color-text-muted) max-w-sm mx-auto mt-1 mb-4">
          Previously analyzed queries, AST decompositions, and recommendations will appear here.
        </p>
        <Link
          href="/analyze"
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-2xs transition-colors"
        >
          Analyze a Query
        </Link>
      </div>
    );
  }

  const handleView = (item: QueryHistoryItem) => {
    if (!item.llm_response) return;
    try {
      const result: AnalysisResult = JSON.parse(item.llm_response);
      loadHistoryResult(item.sql_query, result, item.schema_ddl);
      router.push("/analyze");
    } catch {
      router.push(`/analyze?sql=${encodeURIComponent(item.sql_query)}`);
    }
  };

  const handleReanalyze = (item: QueryHistoryItem) => {
    loadHistoryResult(item.sql_query, null as unknown as AnalysisResult, item.schema_ddl);
    router.push(`/analyze?sql=${encodeURIComponent(item.sql_query)}`);
  };

  const filteredItems = items.filter((item) => {
    if (!filter.trim()) return true;
    return item.sql_query.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div className="space-y-4">
      {/* Search Filter */}
      <div className="flex items-center justify-between gap-4">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter historical queries..."
          className="w-full max-w-sm text-xs py-2 px-3 rounded-lg border border-(--color-border) bg-(--color-surface) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
        />
        <span className="text-xs font-mono text-(--color-text-faint)">
          {filteredItems.length} of {items.length} queries
        </span>
      </div>

      <div className="rounded-xl border border-(--color-border) overflow-hidden bg-(--color-surface) shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-(--color-surface-muted) text-(--color-text-faint) uppercase font-mono text-[10px] tracking-wider border-b border-(--color-border)">
              <tr>
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold">SQL Query</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-(--color-surface-muted) transition-colors">
                  <td className="py-3 px-4 font-mono text-[11px] text-(--color-text-muted) whitespace-nowrap">
                    {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-3 px-4 max-w-lg">
                    <code className="text-xs font-mono text-(--color-foreground) block truncate p-1.5 rounded bg-(--color-surface-muted) border border-(--color-border)">
                      {item.sql_query}
                    </code>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                    {item.llm_response && (
                      <button
                        onClick={() => handleView(item)}
                        className="px-3 py-1 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer shadow-2xs"
                      >
                        Inspect Result
                      </button>
                    )}
                    <button
                      onClick={() => handleReanalyze(item)}
                      className="px-3 py-1 text-xs font-medium rounded-lg border border-(--color-border) bg-(--color-surface) text-(--color-foreground) hover:bg-(--color-surface-muted) transition-colors cursor-pointer"
                    >
                      Re-analyze
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default HistoryList;
