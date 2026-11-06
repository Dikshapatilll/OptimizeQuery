"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SqlEditor } from "@/components/sql-editor";
import { ConnectionSelector } from "@/components/connection-selector";
import { ModelSelector } from "@/components/model-selector";
import { AnalysisResults } from "@/components/analysis-results";
import ModeSelector from "@/components/mode-selector";
import PlaygroundPanel, {
  type SchemaStatus,
} from "@/components/playground-panel";
import { listConnections, analyzeQuery, createShareLink } from "@/lib/api-client";
import { saveAnalysis } from "@/lib/local-history";
import { useAnalysis } from "@/context/analysis-context";
import type { AnalyzeMode, ConnectionResponse } from "@/lib/types";

const QUERY_PRESETS = [
  {
    label: "W1: Join & Aggregation",
    desc: "Orders + Users nested scan bottleneck",
    sql: "SELECT u.name, count(o.id) as total_orders, sum(o.total) as total_spent FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.name HAVING count(o.id) > 2 ORDER BY total_orders DESC LIMIT 20",
  },
  {
    label: "W2: Filter & Range Scan",
    desc: "Multi-column status and response sort",
    sql: "SELECT * FROM access_logs WHERE status_code = 200 AND resp > 0.5 ORDER BY resp DESC LIMIT 50",
  },
  {
    label: "W3: Correlated Subquery",
    desc: "Scalar subqueries executing per row",
    sql: "SELECT u.id, u.name, (SELECT sum(o.total) FROM orders o WHERE o.user_id = u.id) as total_spent, (SELECT count(o.id) FROM orders o WHERE o.user_id = u.id) as order_count FROM users u WHERE u.status = 'active' ORDER BY total_spent DESC LIMIT 25",
  },
];

function AnalyzePageInner() {
  const searchParams = useSearchParams();
  const {
    sql,
    setSql,
    connectionId,
    setConnectionId,
    setDbType,
    setPlaygroundMode,
    result,
    setResult,
    loading,
    setLoading,
    error,
    setError,
    historySchemaDDL,
  } = useAnalysis();

  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [model, setModel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selected-model") ?? "";
    }
    return "";
  });

  const [mode, setMode] = useState<AnalyzeMode>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("playground-mode") as AnalyzeMode | null;
      if (stored === "connect" || stored === "playground" || stored === "none") return stored;
    }
    return "playground";
  });

  const [schemaDDL, setSchemaDDL] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("playground-schema-ddl") ?? "";
    }
    return "";
  });
  const [playgroundQuery, setPlaygroundQuery] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("playground-query-sql") ?? "";
    }
    return "";
  });
  const [schemaStatus, setSchemaStatus] = useState<SchemaStatus>({
    state: "empty",
  });
  const [playgroundSubTab, setPlaygroundSubTab] = useState<"schema" | "query" | "data">("schema");
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const autoAnalyzeRef = useRef(false);

  const handleModelChange = (m: string) => {
    setModel(m);
    localStorage.setItem("selected-model", m);
  };

  const handleModeChange = (m: AnalyzeMode) => {
    setMode(m);
    localStorage.setItem("playground-mode", m);
    setResult(null);
    setError("");
  };

  useEffect(() => {
    const sqlParam = searchParams.get("sql");
    if (sqlParam) setSql(sqlParam);
  }, [searchParams, setSql]);

  useEffect(() => {
    if (historySchemaDDL) {
      setSchemaDDL(historySchemaDDL);
      setMode("playground");
    }
  }, [historySchemaDDL]);

  const isHosted = !!(process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes("localhost"));

  useEffect(() => {
    if (isHosted) return;
    listConnections()
      .then((conns) => {
        setConnections(conns);
        if (conns.length > 0 && !localStorage.getItem("playground-mode")) {
          setMode("connect");
        }
      })
      .catch(() => {});
  }, [isHosted]);

  // Handle keyboard shortcut (Cmd+Enter or Ctrl+Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (mode === "playground") {
          handlePlaygroundAnalyze();
        } else {
          handleAnalyze();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const handleAnalyze = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setPlaygroundMode(false);
    try {
      const res = await analyzeQuery({
        sql: sql.trim(),
        connection_id: connectionId,
        model: model || null,
      });
      setResult(res);
      if (isHosted) saveAnalysis(sql.trim(), res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSchema = useCallback(async () => {
    if (!schemaDDL.trim()) return;
    setSchemaStatus({ state: "loading" });

    try {
      const pglite = await import("@/lib/pglite-service");
      await pglite.reset();
      const { tables, error: ddlError } = await pglite.executeDDL(schemaDDL);

      if (ddlError) {
        setSchemaStatus({ state: "error", message: ddlError });
        return;
      }
      if (tables.length === 0) {
        setSchemaStatus({
          state: "error",
          message: "No tables created. Check your DDL syntax.",
        });
        return;
      }
      await pglite.resetPlannerSettings();
      setSchemaStatus({ state: "ready", tables });
    } catch (err) {
      setSchemaStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Failed to load schema",
      });
    }
  }, [schemaDDL]);

  const handlePlaygroundAnalyze = async () => {
    if (!playgroundQuery.trim()) return;
    if (schemaStatus.state !== "ready") {
      setError("Load your schema first before analyzing.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setPlaygroundMode(true);
    setDbType("postgresql");
    setSql(playgroundQuery.trim());

    try {
      const pglite = await import("@/lib/pglite-service");
      const pgInstance = await pglite.getDB();
      for (const t of schemaStatus.tables || []) {
        await pgInstance.exec(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`);
      }
      const { emptyTables } = await pglite.generateAndInsertData(
        schemaDDL,
        schemaStatus.tables || [],
        10000,
        playgroundQuery,
      );
      if (emptyTables.length > 0) {
        setError(
          `Data generation failed for table(s): ${emptyTables.join(", ")}. ` +
          `Check that your DDL column types and constraints are compatible.`,
        );
        setLoading(false);
        return;
      }
      await pglite.resetPlannerSettings();

      const explainResult = await pglite.runExplainAnalyze(playgroundQuery);
      const tableSchemas = await pglite.getTableSchemas(schemaStatus.tables);

      const res = await analyzeQuery({
        sql: playgroundQuery.trim(),
        model: model || null,
        client_explain: explainResult,
        client_table_schemas: tableSchemas,
        client_db_type: "postgresql",
      });
      setResult(res);
      if (isHosted) saveAnalysis(playgroundQuery.trim(), res, schemaDDL);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    const pglite = await import("@/lib/pglite-service");
    await pglite.reset();
    setSchemaStatus({ state: "empty" });
    setResult(null);
    setError("");
  };

  const handleShare = async () => {
    if (!result) return;
    setSharing(true);
    setShareUrl(null);
    try {
      const link = await createShareLink({
        schema_ddl: mode === "playground" ? schemaDDL || null : null,
        sql_query: mode === "playground" ? playgroundQuery.trim() : sql.trim(),
        llm_response: JSON.stringify(result),
      });
      const url = `${window.location.origin}/p/${link.id}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
    } catch {
      setError("Failed to create share link");
    } finally {
      setSharing(false);
    }
  };

  const onAnalyze = mode === "playground" ? handlePlaygroundAnalyze : handleAnalyze;
  const analyzeDisabled =
    mode === "playground"
      ? loading || !playgroundQuery.trim() || schemaStatus.state !== "ready"
      : loading || !sql.trim();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header & Mode Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-(--color-foreground)">
            SQL Analysis Workspace
          </h1>
          <p className="text-xs text-(--color-text-muted) mt-1">
            Introspect query plans, estimate pre-execution latency via ML, and compute OR-ranked recommendations.
          </p>
        </div>
        <ModeSelector mode={mode} onChange={handleModeChange} />
      </div>

      {/* Preset Query Chips */}
      {mode !== "playground" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono font-semibold text-(--color-text-faint)">
            Query Presets:
          </span>
          {QUERY_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setSql(preset.sql);
                setResult(null);
              }}
              title={preset.desc}
              className="px-2.5 py-1 rounded-md text-xs font-mono bg-(--color-surface) border border-(--color-border) text-(--color-text-muted) hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer shadow-2xs"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="space-y-4">
        {mode === "playground" ? (
          <PlaygroundPanel
            schemaDDL={schemaDDL}
            onSchemaDDLChange={setSchemaDDL}
            querySql={playgroundQuery}
            onQuerySqlChange={setPlaygroundQuery}
            schemaStatus={schemaStatus}
            onLoadSchema={handleLoadSchema}
            onReset={handleReset}
            onSubTabChange={setPlaygroundSubTab}
          />
        ) : (
          <SqlEditor value={sql} onChange={setSql} />
        )}

        {(mode === "connect" || playgroundSubTab === "query" || mode === "none") && (
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between p-4 rounded-xl border border-(--color-border) bg-(--color-surface) shadow-2xs">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto flex-1">
              {mode === "connect" && (
                <div className="w-full sm:w-64">
                  <ConnectionSelector
                    connections={connections}
                    value={connectionId}
                    onChange={(id) => {
                      setConnectionId(id);
                      const conn = connections.find((c) => c.id === id);
                      setDbType(conn?.db_type ?? null);
                    }}
                  />
                </div>
              )}
              {!isHosted && (
                <div className="w-full sm:w-56">
                  <ModelSelector value={model} onChange={handleModelChange} />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <span className="hidden md:inline text-[11px] font-mono text-(--color-text-faint)">
                Press ⌘+Enter to analyze
              </span>
              <button
                onClick={onAnalyze}
                disabled={analyzeDisabled}
                className="w-full sm:w-auto px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg
                           disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Extracting AST & Scoring...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Analyze Query</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div className="pt-6 border-t border-(--color-border) space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-(--color-foreground)">
              Analysis & Optimization Output
            </h2>
            <div className="flex items-center gap-2">
              {shareUrl && (
                <span className="text-xs font-mono text-teal-600 dark:text-teal-400">
                  Link copied to clipboard!
                </span>
              )}
              <button
                onClick={handleShare}
                disabled={sharing}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-(--color-border) bg-(--color-surface) hover:bg-(--color-surface-muted) text-(--color-foreground) transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <span>🔗</span>
                <span>{sharing ? "Sharing..." : "Share Link"}</span>
              </button>
            </div>
          </div>

          <AnalysisResults result={result} />
        </div>
      )}
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense>
      <AnalyzePageInner />
    </Suspense>
  );
}
