"use client";

import type { ConnectionResponse } from "@/lib/types";

interface ConnectionSelectorProps {
  connections: ConnectionResponse[];
  value: string | null;
  onChange: (id: string | null) => void;
}

export function ConnectionSelector({ connections, value, onChange }: ConnectionSelectorProps) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full px-3 py-2 border border-(--color-border) rounded-lg bg-(--color-surface-muted) text-xs font-mono text-(--color-foreground)
                 focus:outline-none focus:ring-1 focus:ring-teal-500
                 focus:bg-(--color-surface) transition-all cursor-pointer"
    >
      <option value="">No connection (static analysis only)</option>
      {connections.map((conn) => (
        <option key={conn.id} value={conn.id}>
          {conn.name} ({conn.db_type} - {conn.host}:{conn.port}/{conn.database})
        </option>
      ))}
    </select>
  );
}
