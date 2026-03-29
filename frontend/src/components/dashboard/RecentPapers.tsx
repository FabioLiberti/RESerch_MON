"use client";

import Link from "next/link";
import { formatDate, SOURCE_LABELS, SOURCE_COLORS } from "@/lib/utils";
import type { Paper } from "@/lib/types";

interface RecentPapersProps {
  papers: Paper[] | undefined;
  isLoading: boolean;
}

export default function RecentPapers({ papers, isLoading }: RecentPapersProps) {
  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)]">
          Recent Papers
        </h3>
        <Link
          href="/papers"
          className="text-xs text-[var(--primary)] hover:underline"
        >
          View all
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-[var(--muted)] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !papers || papers.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[var(--muted-foreground)]">
          No papers discovered yet
        </div>
      ) : (
        <div className="space-y-2">
          {papers.slice(0, 8).map((paper) => (
            <Link
              key={paper.id}
              href={`/papers/${paper.id}`}
              className="block p-3 rounded-lg hover:bg-[var(--secondary)] transition-colors"
            >
              <h4 className="text-sm font-medium line-clamp-2">{paper.title}</h4>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-[var(--muted-foreground)]">
                  {formatDate(paper.publication_date)}
                </span>
                {paper.sources.map((src) => (
                  <span
                    key={src}
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${SOURCE_COLORS[src] || "#6b7280"}20`,
                      color: SOURCE_COLORS[src] || "#6b7280",
                    }}
                  >
                    {SOURCE_LABELS[src] || src}
                  </span>
                ))}
                {paper.open_access && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                    OA
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
