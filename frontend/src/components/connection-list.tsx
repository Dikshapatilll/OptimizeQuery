"use client";

import { useState } from "react";
import type { ConnectionResponse } from "@/lib/types";
import { deleteConnection, testConnection } from "@/lib/api-client";

interface ConnectionListProps {
  connections: ConnectionResponse[];
  onRefresh: () => void;
}

export function ConnectionList({ connections, onRefresh }: ConnectionListProps) {
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  const handleTest = async (id: string) => {
    setTesting(id);
    setTestResult(null);
    try {
      const result = await testConnection(id);
      setTestResult({ id, ok: result.success, msg: result.message });
    } catch (err) {
      setTestResult({ id, ok: false, msg: err instanceof Error ? err.message : "Connection test failed" });
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove connection "${name}"?`)) return;
    try {
      await deleteConnection(id);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (connections.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl border border-(--color-border) bg-(--color-surface)">
        <div className="w-12 h-12 mx-auto rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
            <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-(--color-foreground)">No Database Connections Configured</p>
        <p className="text-xs text-(--color-text-muted) max-w-sm mx-auto mt-1">
          Connect your PostgreSQL or MySQL database to enable live EXPLAIN execution plans, index simulations, and empirical benchmarks.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-(--color-border) overflow-hidden bg-(--color-surface) shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-(--color-surface-muted) text-(--color-text-faint) uppercase font-mono text-[10px] tracking-wider border-b border-(--color-border)">
            <tr>
              <th className="py-3 px-4 font-semibold">Connection Name</th>
              <th className="py-3 px-4 font-semibold">Engine</th>
              <th className="py-3 px-4 font-semibold">Host / Port</th>
              <th className="py-3 px-4 font-semibold">Database</th>
              <th className="py-3 px-4 font-semibold">SSL</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {connections.map((conn) => (
              <tr key={conn.id} className="hover:bg-(--color-surface-muted) transition-colors">
                <td className="py-3 px-4 font-semibold text-(--color-foreground) flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>{conn.name}</span>
                </td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-(--color-surface-muted) text-teal-700 dark:text-teal-300 border border-(--color-border) uppercase">
                    {conn.db_type}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-(--color-text-muted)">
                  {conn.host}:{conn.port}
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-(--color-foreground)">
                  {conn.database}
                </td>
                <td className="py-3 px-4">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                    conn.ssl_enabled
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-gray-100 dark:bg-gray-800 text-(--color-text-faint)"
                  }`}>
                    {conn.ssl_enabled ? "SSL ENCRYPTED" : "OFF"}
                  </span>
                </td>
                <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                  <button
                    onClick={() => handleTest(conn.id)}
                    disabled={testing === conn.id}
                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 hover:bg-teal-500/20 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {testing === conn.id ? "Pinging..." : "Test Ping"}
                  </button>
                  <button
                    onClick={() => handleDelete(conn.id, conn.name)}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    Delete
                  </button>
                  {testResult && testResult.id === conn.id && (
                    <span className={`text-[11px] font-mono ml-2 block sm:inline ${testResult.ok ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-rose-600 dark:text-rose-400 font-bold"}`}>
                      {testResult.msg}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ConnectionList;
