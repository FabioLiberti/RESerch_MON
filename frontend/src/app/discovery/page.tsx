"use client";

import { useSources } from "@/hooks/useAnalytics";
import { SOURCE_LABELS, SOURCE_COLORS, formatDate } from "@/lib/utils";
import type { SourceInfo } from "@/lib/types";

export default function DiscoveryPage() {
  const { data: sources, isLoading } = useSources();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Discovery</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Monitor paper fetching across all sources
        </p>
      </div>

      {/* Source Health Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-32 bg-[var(--muted)] rounded-xl animate-pulse" />
            ))
          : (sources || []).map((src: SourceInfo) => (
              <div
                key={src.name}
                className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: SOURCE_COLORS[src.name] || "#6b7280" }}
                  />
                  <h3 className="font-medium">{SOURCE_LABELS[src.name] || src.name}</h3>
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-[var(--muted-foreground)]">Papers</dt>
                    <dd className="font-medium">{src.paper_count}</dd>
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
    </div>
  );
}
