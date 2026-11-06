"use client";

import React from "react";

export type MetricProvenanceType = "measured" | "estimated" | "predicted";

interface ProvenanceBadgeProps {
  type: MetricProvenanceType;
  size?: "sm" | "xs";
  className?: string;
}

const config: Record<
  MetricProvenanceType,
  { label: string; textClass: string; bgClass: string; title: string }
> = {
  measured: {
    label: "MEASURED",
    textClass: "text-emerald-700 dark:text-emerald-300",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800",
    title: "Ground-truth value measured empirically via query execution and buffer telemetry.",
  },
  estimated: {
    label: "ESTIMATED",
    textClass: "text-indigo-700 dark:text-indigo-300",
    bgClass: "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800",
    title: "Estimated cost or cardinality derived from the database query planner model.",
  },
  predicted: {
    label: "PREDICTED",
    textClass: "text-blue-700 dark:text-blue-300",
    bgClass: "bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800",
    title: "Inferred pre-execution by machine learning regressor (Random Forest / XGBoost).",
  },
};

export function ProvenanceBadge({ type, size = "xs", className = "" }: ProvenanceBadgeProps) {
  const item = config[type];
  const sizeClasses = size === "xs" ? "text-[10px] px-1.5 py-0.2" : "text-xs px-2 py-0.5";

  return (
    <span
      title={item.title}
      className={`inline-flex items-center font-mono font-semibold tracking-wider rounded border uppercase ${item.bgClass} ${item.textClass} ${sizeClasses} ${className}`}
    >
      {item.label}
    </span>
  );
}
