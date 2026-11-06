"use client";

import { useState } from "react";
import type { ConnectionCreate } from "@/lib/types";

interface ConnectionFormProps {
  onSubmit: (data: ConnectionCreate) => Promise<void>;
  onCancel: () => void;
}

export function ConnectionForm({ onSubmit, onCancel }: ConnectionFormProps) {
  const [form, setForm] = useState<ConnectionCreate>({
    name: "",
    db_type: "postgresql",
    host: "localhost",
    port: 5432,
    database: "",
    username: "",
    password: "",
    ssl_enabled: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connection");
    } finally {
      setLoading(false);
    }
  };

  const update = <K extends keyof ConnectionCreate>(key: K, value: ConnectionCreate[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="border border-(--color-border) rounded-xl p-5 bg-(--color-surface) space-y-5 shadow-2xs">
      <div className="flex items-center justify-between border-b border-(--color-border) pb-3">
        <div>
          <h3 className="text-sm font-semibold text-(--color-foreground)">Configure New Database Connection</h3>
          <p className="text-xs text-(--color-text-muted)">Credentials are stored securely using Fernet symmetric encryption.</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-(--color-text-faint) hover:text-(--color-foreground) cursor-pointer"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 font-mono">
          ⚠️ {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-(--color-foreground) mb-1">
            Connection Label
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-xs bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
            placeholder="e.g. pg-ecommerce-prod"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-(--color-foreground) mb-1">
            Database Engine
          </label>
          <select
            value={form.db_type}
            onChange={(e) => {
              const type = e.target.value as "postgresql" | "mysql";
              update("db_type", type);
              update("port", type === "postgresql" ? 5432 : 3306);
            }}
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-xs bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
          >
            <option value="postgresql">PostgreSQL (psycopg2-binary)</option>
            <option value="mysql">MySQL (mysql-connector)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-(--color-foreground) mb-1">
            Host / Endpoint
          </label>
          <input
            type="text"
            required
            value={form.host}
            onChange={(e) => update("host", e.target.value)}
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-xs bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
            placeholder="localhost"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-(--color-foreground) mb-1">
            Port
          </label>
          <input
            type="number"
            required
            value={form.port}
            onChange={(e) => update("port", parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-xs bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-(--color-foreground) mb-1">
            Database Name
          </label>
          <input
            type="text"
            required
            value={form.database}
            onChange={(e) => update("database", e.target.value)}
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-xs bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
            placeholder="benchmark_ecommerce"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-(--color-foreground) mb-1">
            Username
          </label>
          <input
            type="text"
            required
            value={form.username}
            onChange={(e) => update("username", e.target.value)}
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-xs bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
            placeholder="postgres"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-(--color-foreground) mb-1">
            Password
          </label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            className="w-full px-3 py-2 border border-(--color-border) rounded-lg text-xs bg-(--color-surface-muted) text-(--color-foreground) focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
            placeholder="••••••••"
          />
        </div>
        <div className="flex items-center pt-5">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-(--color-foreground)">
            <input
              type="checkbox"
              checked={form.ssl_enabled}
              onChange={(e) => update("ssl_enabled", e.target.checked)}
              className="accent-teal-600 rounded"
            />
            <span>Enable SSL / TLS Encryption</span>
          </label>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-(--color-border)">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-(--color-border) bg-(--color-surface) text-xs font-medium rounded-lg text-(--color-foreground) hover:bg-(--color-surface-muted) transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors shadow-2xs cursor-pointer flex items-center gap-2"
        >
          {loading ? "Testing & Saving..." : "Save Connection"}
        </button>
      </div>
    </form>
  );
}

export default ConnectionForm;
