"use client";

import { useState, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { SOURCE_LABELS, SOURCE_COLORS, formatDate } from "@/lib/utils";
import type { SourceInfo, FetchLogEntry } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DiscoveryPage() {
  const { data: sources, isLoading } = useSWR<SourceInfo[]>("/api/v1/sources", fetcher);
  const { data: status } = useSWR("/api/v1/discovery/status", fetcher, { refreshInterval: 3000 });
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const { data: logs } = useSWR<FetchLogEntry[]>(
    selectedSource ? `/api/v1/sources/${selectedSource}/logs?limit=20` : null,
    fetcher
  );
  const [triggering, setTriggering] = useState(false);

  const triggerDiscovery = useCallback(async (source?: string) => {
    setTriggering(true);
    try {
      const params: Record<string, string> = { max_per_source: "20" };
      if (source) params.source = source;
      await api.triggerDiscovery(params);
    } catch (e) {
      console.error("Trigger failed:", e);
    }
    setTimeout(() => {
      setTriggering(false);
      mutate("/api/v1/sources");
      mutate("/api/v1/discovery/status");
    }, 2000);
  }, []);

  const isRunning = status?.running || triggering;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Discovery</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Monitor and trigger paper discovery across all sources
          </p>
        </div>
        <button
          onClick={() => triggerDiscovery()}
          disabled={isRunning}
          className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
        >
          {isRunning ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Running...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run Discovery (All)
            </>
          )}
        </button>
      </div>

      {/* Status Banner */}
      {isRunning && (
        <div className="rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/30 p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-[var(--primary)] animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-[var(--primary)]">
            Discovery is running in background. New papers will appear automatically.
          </span>
        </div>
      )}

      {/* Source Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-40 bg-[var(--muted)] rounded-xl animate-pulse" />
            ))
          : (sources || []).map((src: SourceInfo) => (
              <div
                key={src.name}
                className={`rounded-xl bg-[var(--card)] border transition-colors cursor-pointer ${
                  selectedSource === src.name
                    ? "border-[var(--primary)]"
                    : "border-[var(--border)] hover:border-[var(--border)]/80"
                } p-5`}
                onClick={() => setSelectedSource(selectedSource === src.name ? null : src.name)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: SOURCE_COLORS[src.name] || "#6b7280" }}
                    />
                    <h3 className="font-medium">{SOURCE_LABELS[src.name] || src.name}</h3>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerDiscovery(src.name);
                    }}
                    disabled={isRunning}
                    className="text-xs px-2 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--border)] disabled:opacity-50 transition-colors"
                  >
                    Fetch
                  </button>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-[var(--muted-foreground)]">Papers</dt>
                    <dd className="font-semibold text-lg">{src.paper_count}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[var(--muted-foreground)]">Last fetch</dt>
                    <dd className="text-xs">{src.last_fetch ? formatDate(src.last_fetch) : "Never"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[var(--muted-foreground)]">Status</dt>
                    <dd>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          src.last_status === "success"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : src.last_status === "failed"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {src.last_status}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
      </div>

      {/* Fetch Logs */}
      {selectedSource && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: SOURCE_COLORS[selectedSource] || "#6b7280" }}
            />
            {SOURCE_LABELS[selectedSource] || selectedSource} — Fetch History
          </h3>

          {!logs || logs.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No fetch history yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left text-xs text-[var(--muted-foreground)] px-3 py-2">Topic</th>
                    <th className="text-left text-xs text-[var(--muted-foreground)] px-3 py-2">Started</th>
                    <th className="text-center text-xs text-[var(--muted-foreground)] px-3 py-2">Found</th>
                    <th className="text-center text-xs text-[var(--muted-foreground)] px-3 py-2">New</th>
                    <th className="text-center text-xs text-[var(--muted-foreground)] px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: FetchLogEntry) => (
                    <tr key={log.id} className="border-b border-[var(--border)]/50">
                      <td className="px-3 py-2">{log.query_topic}</td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)]">
                        {formatDate(log.started_at)}
                      </td>
                      <td className="px-3 py-2 text-center">{log.papers_found}</td>
                      <td className="px-3 py-2 text-center font-medium text-[var(--primary)]">
                        {log.papers_new}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            log.status === "success"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : log.status === "failed"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
