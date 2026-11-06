"use client";

import React, { useState } from "react";
import Editor from "@monaco-editor/react";
import { useTheme } from "@/context/theme-context";

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
}

export function SqlEditor({ value, onChange, height = "220px" }: SqlEditorProps) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    onChange("");
  };

  return (
    <div className="rounded-xl overflow-hidden border border-(--color-border) bg-(--color-surface) shadow-2xs transition-all focus-within:border-teal-500/60 focus-within:ring-1 focus-within:ring-teal-500/30">
      {/* Editor Frame Header */}
      <div className="h-9 px-4 bg-(--color-surface-muted) border-b border-(--color-border) flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400/80"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80"></span>
          </div>
          <span className="mx-2 text-(--color-border)">|</span>
          <span className="font-mono font-semibold text-[11px] text-(--color-text-muted) flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            workspace_query.sql
          </span>
        </div>

        <div className="flex items-center gap-2">
          {value && (
            <>
              <button
                type="button"
                onClick={handleCopy}
                className="px-2 py-0.5 rounded text-[11px] font-mono text-(--color-text-muted) hover:text-(--color-foreground) hover:bg-(--color-surface) transition-colors cursor-pointer"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="px-2 py-0.5 rounded text-[11px] font-mono text-(--color-text-faint) hover:text-rose-500 hover:bg-(--color-surface) transition-colors cursor-pointer"
              >
                Clear
              </button>
            </>
          )}
          <span className="font-mono text-[10px] text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded font-semibold uppercase">
            SQL &bull; AST
          </span>
        </div>
      </div>

      {/* Monaco Editor Container */}
      <div className="relative">
        <Editor
          height={height}
          language="sql"
          theme={theme === "dark" ? "vs-dark" : "vs"}
          value={value}
          onChange={(val) => onChange(val ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: "line",
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: { vertical: "auto", horizontal: "hidden" },
            suggest: { showKeywords: true },
            folding: true,
            glyphMargin: false,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
            fontFamily: "var(--font-mono)",
          }}
        />
        {!value && (
          <div className="absolute top-3 left-12 pointer-events-none text-xs text-(--color-text-faint) font-mono">
            SELECT * FROM orders WHERE ... (Paste or write your SQL query to inspect and optimize)
          </div>
        )}
      </div>
    </div>
  );
}

export default SqlEditor;
