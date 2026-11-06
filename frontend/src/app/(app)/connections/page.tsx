"use client";

import { useCallback, useEffect, useState } from "react";
import { ConnectionList } from "@/components/connection-list";
import { ConnectionForm } from "@/components/connection-form";
import { createConnection, listConnections } from "@/lib/api-client";
import type { ConnectionCreate, ConnectionResponse } from "@/lib/types";

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchConnections = useCallback(async () => {
    try {
      const data = await listConnections();
      setConnections(data);
    } catch {
      // silently fail — user will see empty list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleCreate = async (data: ConnectionCreate) => {
    await createConnection(data);
    setShowForm(false);
    fetchConnections();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-(--color-border) pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-(--color-foreground)">
            Database Connections
          </h1>
          <p className="text-xs text-(--color-text-muted) mt-1">
            Configure live PostgreSQL and MySQL connections for plan extraction, index simulations, and empirical benchmarks.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
          >
            <span>+</span>
            <span>Add Connection</span>
          </button>
        )}
      </div>

      {showForm && (
        <ConnectionForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-40 bg-(--color-surface) rounded-xl border border-(--color-border)"></div>
        </div>
      ) : (
        <ConnectionList connections={connections} onRefresh={fetchConnections} />
      )}
    </div>
  );
}
