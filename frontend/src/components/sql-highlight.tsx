"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "@/context/theme-context";

export function SqlHighlight({ code }: { code: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <SyntaxHighlighter
      language="sql"
      style={isDark ? oneDark : oneLight}
      customStyle={{
        margin: 0,
        borderRadius: "0.5rem",
        fontSize: "0.8125rem",
        lineHeight: "1.6",
        padding: "0.875rem 1rem",
        background: isDark ? "#101827" : "#F8FAFC",
        border: isDark ? "1px solid #202B3C" : "1px solid #E2E8F0",
        fontFamily: "var(--font-mono)",
      }}
    >
      {code}
    </SyntaxHighlighter>
  );
}
