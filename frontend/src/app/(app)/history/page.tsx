"use client";

import { useEffect, useState } from "react";
import { HistoryList } from "@/components/history-list";
import { getHistory } from "@/lib/api-client";
import { getLocalHistory } from "@/lib/local-history";
import type { QueryHistoryItem } from "@/lib/types";

const IS_HOSTED = !!(process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes("localhost"));

export default function HistoryPage() {
  const [items, setItems] = useState<QueryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (IS_HOSTED) {
      setItems(getLocalHistory());
      setLoading(false);
    } else {
      getHistory()
        .then(setItems)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="border-b border-(--color-border) pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-(--color-foreground)">
          Query History
        </h1>
        <p className="text-xs text-(--color-text-muted) mt-1">
          Historical repository of analyzed SQL queries, structural AST representations, and optimization suggestions.
        </p>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-10 bg-(--color-surface) rounded-lg border border-(--color-border)"></div>
          <div className="h-64 bg-(--color-surface) rounded-xl border border-(--color-border)"></div>
        </div>
      ) : (
        <HistoryList items={items} />
      )}
    </div>
  );
}
