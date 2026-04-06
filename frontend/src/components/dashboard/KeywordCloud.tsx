"use client";

import Link from "next/link";
import useSWR from "swr";
import { authFetcher } from "@/lib/api";
import type { KeywordCount } from "@/lib/types";

// Color intensity based on frequency rank
function getKeywordStyle(count: number, maxCount: number): { bg: string; text: string; size: string } {
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio > 0.6) return { bg: "bg-[var(--primary)]/20", text: "text-[var(--primary)]", size: "text-sm font-medium" };
  if (ratio > 0.3) return { bg: "bg-indigo-500/10", text: "text-indigo-400", size: "text-xs font-medium" };
  if (ratio > 0.15) return { bg: "bg-purple-500/10", text: "text-purple-400", size: "text-xs" };
  return { bg: "bg-[var(--muted)]", text: "text-[var(--muted-foreground)]", size: "text-[11px]" };
}

export default function KeywordCloud() {
  const { data: keywords, isLoading } = useSWR<KeywordCount[]>(
    "/api/v1/papers/keywords/all",
    authFetcher
  );

  if (isLoading) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-4">Top Keywords</h3>
        <div className="h-40 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[var(--muted)] border-t-[var(--primary)] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const topKeywords = (Array.isArray(keywords) ? keywords : [])
    .filter((k) => k.count >= 3)
    .slice(0, 30);

  if (topKeywords.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-4">Top Keywords</h3>
        <div className="h-40 flex items-center justify-center text-[var(--muted-foreground)] text-sm">
          No keywords yet
        </div>
      </div>
    );
  }

  const maxCount = topKeywords[0]?.count || 1;

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)]">Top Keywords</h3>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {topKeywords.length} keywords
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {topKeywords.map((kw) => {
          const style = getKeywordStyle(kw.count, maxCount);
          return (
            <Link
              key={kw.keyword}
              href={`/papers?keyword=${encodeURIComponent(kw.keyword)}`}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md ${style.bg} ${style.text} ${style.size} hover:opacity-80 transition-opacity`}
            >
              {kw.keyword}
              <span className="opacity-50 text-[9px]">{kw.count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
