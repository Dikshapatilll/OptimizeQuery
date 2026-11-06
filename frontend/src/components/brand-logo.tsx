"use client";

import React from "react";

interface BrandLogoProps {
  variant?: "full" | "mark" | "wordmark" | "icon";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  showBadge?: boolean;
}

const sizeMap = {
  xs: { icon: 20, text: "text-sm", mark: 20 },
  sm: { icon: 24, text: "text-base", mark: 24 },
  md: { icon: 32, text: "text-lg", mark: 32 },
  lg: { icon: 40, text: "text-xl", mark: 40 },
  xl: { icon: 48, text: "text-2xl", mark: 48 },
};

export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Subtle container gradient */}
        <linearGradient id="optql-node-bg" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#101827" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>

        {/* Dynamic optimization vector gradient: Teal to Violet */}
        <linearGradient id="optql-opt-vector" x1="14" y1="14" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0D9488" />
          <stop offset="50%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#7567D8" />
        </linearGradient>

        {/* Node pulse glow */}
        <filter id="optql-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#0D9488" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Rounded container frame */}
      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#optql-node-bg)" stroke="#202B3C" strokeWidth="1.5" />

      {/* Inner query-plan loop forming the body of 'Q' */}
      <circle cx="22" cy="21" r="12.5" stroke="#334155" strokeWidth="2" strokeDasharray="3 3" />

      {/* Relational Query Plan Edge Lines */}
      <path d="M22 8.5L34.5 21" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M34.5 21L22 33.5" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M22 33.5L9.5 21" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.5 21L22 8.5" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />

      {/* Query Plan Relational Nodes */}
      {/* Root/Aggregate Node (Top) */}
      <circle cx="22" cy="8.5" r="3" fill="#0D9488" filter="url(#optql-glow)" />
      <circle cx="22" cy="8.5" r="1.2" fill="#FFFFFF" />

      {/* Filter/Sort Node (Right) */}
      <circle cx="34.5" cy="21" r="2.8" fill="#7567D8" />
      <circle cx="34.5" cy="21" r="1" fill="#FFFFFF" />

      {/* Hash Join Node (Bottom) */}
      <circle cx="22" cy="33.5" r="2.8" fill="#0D9488" />
      <circle cx="22" cy="33.5" r="1" fill="#FFFFFF" />

      {/* Index Scan Node (Left) */}
      <circle cx="9.5" cy="21" r="2.8" fill="#38BDF8" />
      <circle cx="9.5" cy="21" r="1" fill="#FFFFFF" />

      {/* Directional Optimization Vector breaking through to form the 'Q' Tail */}
      <path
        d="M17 16L27 26L38 37"
        stroke="url(#optql-opt-vector)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Arrowhead / terminal optimization glyph */}
      <path
        d="M31 37H38V30"
        stroke="url(#optql-opt-vector)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Center Execution Core */}
      <circle cx="22" cy="21" r="2" fill="#F8FAFC" />
    </svg>
  );
}

export function OptimizeQLLogo({
  variant = "full",
  size = "md",
  className = "",
  showBadge = false,
}: BrandLogoProps) {
  const s = sizeMap[size];

  if (variant === "mark" || variant === "icon") {
    return <LogoMark size={s.mark} className={className} />;
  }

  if (variant === "wordmark") {
    return (
      <span className={`font-bold tracking-tight text-(--color-foreground) ${s.text} ${className}`}>
        <span>Optimize</span>
        <span className="text-teal-600 dark:text-teal-400">QL</span>
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMark size={s.mark} />
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className={`font-bold tracking-tight text-(--color-foreground) ${s.text} leading-none`}>
            <span>Optimize</span>
            <span className="text-teal-600 dark:text-teal-400">QL</span>
          </span>
          {showBadge && (
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
              Enterprise
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono font-medium text-(--color-text-faint) tracking-wider uppercase mt-0.5">
          AI &bull; OR Optimization Engine
        </span>
      </div>
    </div>
  );
}

export default OptimizeQLLogo;
