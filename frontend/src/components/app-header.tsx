"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/context/theme-context";

const routeMeta: Record<string, { section: string; title: string }> = {
  "/": { section: "Workspace", title: "Dashboard" },
  "/dashboard": { section: "Workspace", title: "Dashboard" },
  "/analyze": { section: "Workspace", title: "Analyze Query" },
  "/benchmark": { section: "Workspace", title: "Benchmark Workspace" },
  "/history": { section: "Workspace", title: "Query History" },
  "/connections": { section: "Database", title: "Connections" },
  "/settings": { section: "Configuration", title: "Settings" },
};

export function AppHeader() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const current = routeMeta[pathname] || {
    section: "Platform",
    title: pathname.replace("/", "").charAt(0).toUpperCase() + pathname.slice(2),
  };

  return (
    <header className="h-16 px-6 border-b border-(--color-border) bg-(--color-surface) flex items-center justify-between sticky top-0 z-20">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs">
        <Link href="/" className="font-semibold text-(--color-text-faint) hover:text-(--color-foreground) transition-colors">
          OptimizeQL
        </Link>
        <span className="text-(--color-text-faint)">/</span>
        <span className="text-(--color-text-muted)">{current.section}</span>
        <span className="text-(--color-text-faint)">/</span>
        <span className="font-semibold text-(--color-foreground)">{current.title}</span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Connection status badge */}
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-(--color-surface-muted) border border-(--color-border) text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="font-mono text-[11px] text-(--color-text-muted)">
            PostgreSQL 14.18
          </span>
        </div>

        {/* Quick Analyze CTA */}
        {pathname !== "/analyze" && (
          <Link
            href="/analyze"
            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium transition-colors shadow-2xs flex items-center gap-1.5"
          >
            <span>⚡</span> Analyze SQL
          </Link>
        )}

        {/* Quick Benchmark CTA */}
        {pathname !== "/benchmark" && (
          <Link
            href="/benchmark"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-(--color-border) bg-(--color-surface) text-xs font-medium text-(--color-foreground) hover:bg-(--color-surface-muted) transition-colors"
          >
            <span>🎯</span> Benchmarks
          </Link>
        )}

        {/* Theme quick toggle */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="p-1.5 rounded-lg border border-(--color-border) bg-(--color-surface) text-(--color-text-muted) hover:text-(--color-foreground) hover:bg-(--color-surface-muted) transition-colors cursor-pointer"
        >
          {theme === "dark" ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}

export default AppHeader;
