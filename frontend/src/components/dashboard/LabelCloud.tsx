"use client";

import Link from "next/link";
import useSWR from "swr";
import { authFetcher } from "@/lib/api";

interface LabelInfo {
  id: number;
  name: string;
  color: string;
  paper_count?: number;
}

export default function LabelCloud() {
  const { data: labels, isLoading } = useSWR<LabelInfo[]>(
    "/api/v1/labels",
    authFetcher
  );

  if (isLoading) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-4">Top Labels</h3>
        <div className="h-40 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[var(--muted)] border-t-[var(--primary)] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const topLabels = (Array.isArray(labels) ? labels : [])
    .filter((l) => (l.paper_count || 0) > 0)
    .sort((a, b) => (b.paper_count || 0) - (a.paper_count || 0))
    .slice(0, 20);

  if (topLabels.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-4">Top Labels</h3>
        <div className="h-40 flex items-center justify-center text-[var(--muted-foreground)] text-sm">
          No labels yet
        </div>
      </div>
    );
  }

  const maxCount = topLabels[0]?.paper_count || 1;

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)]">Top Labels</h3>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {topLabels.length} labels
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {topLabels.map((label) => {
          const count = label.paper_count || 0;
          const ratio = maxCount > 0 ? count / maxCount : 0;
          const size = ratio > 0.5 ? "text-sm font-medium" : ratio > 0.2 ? "text-xs font-medium" : "text-[11px]";
          return (
            <Link
              key={label.id}
              href={`/papers?label=${encodeURIComponent(label.name)}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:opacity-80 transition-opacity ${size}`}
              style={{
                backgroundColor: `${label.color}20`,
                color: label.color,
              }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
              {label.name}
              <span className="opacity-50 text-[9px]">{count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
