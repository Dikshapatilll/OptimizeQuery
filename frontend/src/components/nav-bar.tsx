"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/context/theme-context";
import { LogoMark, OptimizeQLLogo } from "./brand-logo";

// ── Icons ────────────────────────────────────────────────────────────────────

function DashboardIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function AnalyzeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 14 15 20 9" />
      <polyline points="14 9 20 9 20 15" />
      <path d="M4 21h16" />
    </svg>
  );
}

function BenchmarkIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function HistoryIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 15" />
    </svg>
  );
}

function ConnectionsIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
    </svg>
  );
}

function SettingsIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function DocsIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SunIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  );
}

function MoonIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function CollapseIcon({ className = "w-4 h-4", collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <svg
      className={`${className} transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  );
}

// ── Navigation Sections ──────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "WORKSPACE",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
      { href: "/analyze", label: "Analyze Query", icon: <AnalyzeIcon /> },
      { href: "/benchmark", label: "Benchmarks", icon: <BenchmarkIcon />, badge: "Lab", badgeColor: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
      { href: "/history", label: "Query History", icon: <HistoryIcon /> },
    ],
  },
  {
    title: "DATABASE",
    items: [
      { href: "/connections", label: "Connections", icon: <ConnectionsIcon /> },
    ],
  },
  {
    title: "CONFIGURATION",
    items: [
      { href: "/settings", label: "Settings", icon: <SettingsIcon /> },
    ],
  },
];

export function NavBar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState<boolean>(false);

  useEffect(() => {
    const stored = localStorage.getItem("optql-sidebar-collapsed");
    if (stored === "true") {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("optql-sidebar-collapsed", String(next));
  };

  const isLinkActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/" || pathname === "/dashboard";
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside
      className={`shrink-0 min-h-screen bg-(--color-surface) border-r border-(--color-border) flex flex-col transition-all duration-200 z-30 select-none ${
        collapsed ? "w-[72px]" : "w-[260px]"
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-(--color-border)">
        <Link
          href="/"
          className="flex items-center gap-3 overflow-hidden group focus:outline-none"
          title="OptimizeQL — Intelligent Query Optimization"
        >
          {collapsed ? (
            <div className="w-10 h-10 flex items-center justify-center">
              <LogoMark size={32} />
            </div>
          ) : (
            <OptimizeQLLogo variant="full" size="md" />
          )}
        </Link>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navSections.map((sec) => (
          <div key={sec.title} className="space-y-1">
            {!collapsed && (
              <p className="px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-(--color-text-faint)">
                {sec.title}
              </p>
            )}
            <nav className="space-y-0.5">
              {sec.items.map((item) => {
                const active = isLinkActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all group relative ${
                      active
                        ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 font-semibold"
                        : "text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-(--color-foreground)"
                    } ${collapsed ? "justify-center px-0 py-2.5" : ""}`}
                  >
                    {/* Active left indicator line */}
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-teal-600 dark:bg-teal-400 rounded-r" />
                    )}

                    <span className={`shrink-0 ${active ? "text-teal-600 dark:text-teal-400" : "text-(--color-text-faint) group-hover:text-(--color-foreground)"}`}>
                      {item.icon}
                    </span>

                    {!collapsed && (
                      <>
                        <span className="truncate flex-1">{item.label}</span>
                        {item.badge && (
                          <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded ${item.badgeColor || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Database Engine Status Pill */}
      {!collapsed && (
        <div className="px-3 py-2 mx-3 mb-2 rounded-lg bg-(--color-surface-muted) border border-(--color-border)">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold text-(--color-foreground) truncate">
                PostgreSQL Engine
              </span>
              <span className="text-[9px] font-mono text-(--color-text-faint) truncate">
                Telemetry: EXPLAIN BUFFERS
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Footer Controls */}
      <div className="p-3 border-t border-(--color-border) space-y-1">
        {/* API Docs Link */}
        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noopener noreferrer"
          title={collapsed ? "API Docs" : undefined}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-(--color-foreground) transition-colors ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <DocsIcon className="w-4 h-4 shrink-0 text-(--color-text-faint)" />
          {!collapsed && <span>API Docs</span>}
        </a>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={collapsed ? (theme === "dark" ? "Light Mode" : "Dark Mode") : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-(--color-foreground) transition-colors cursor-pointer ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <span className="w-4 h-4 shrink-0 text-(--color-text-faint)">
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </span>
          {!collapsed && (
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          )}
        </button>

        {/* Collapse Sidebar Toggle */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-(--color-foreground) transition-colors cursor-pointer ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <CollapseIcon className="w-4 h-4 shrink-0 text-(--color-text-faint)" collapsed={collapsed} />
          {!collapsed && <span>Collapse Sidebar</span>}
        </button>
      </div>
    </aside>
  );
}

export default NavBar;
