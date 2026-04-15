"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { authFetcher } from "@/lib/api";

interface Reference {
  id: number;
  cited_paper_id: number;
  title: string;
  doi: string | null;
  journal: string | null;
  publication_date: string | null;
  citation_count: number;
  rating: number | null;
  disabled: boolean;
  context: string | null;
  note: string | null;
  keywords: string[];
  labels: { name: string; color: string }[];
}

interface RefsResponse {
  manuscript_id: number;
  references: Reference[];
  total: number;
}

export default function BibliographyAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const paperId = Number(id);
  const { data } = useSWR<RefsResponse>(`/api/v1/paper-references/${paperId}`, authFetcher);
  const refs = data?.references || [];

  // --- Computed analytics ---

  const keywordCounts = useMemo(() => {
    const map: Record<string, number> = {};
    refs.forEach(r => r.keywords.forEach(k => { map[k] = (map[k] || 0) + 1; }));
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [refs]);

  const labelCounts = useMemo(() => {
    const map: Record<string, { count: number; color: string }> = {};
    refs.forEach(r => r.labels.forEach(l => {
      if (!map[l.name]) map[l.name] = { count: 0, color: l.color };
      map[l.name].count++;
    }));
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  }, [refs]);

  const citationBuckets = useMemo(() => {
    const buckets = { "0": 0, "1-10": 0, "11-50": 0, "51-100": 0, "100+": 0 };
    refs.forEach(r => {
      const c = r.citation_count;
      if (c === 0) buckets["0"]++;
      else if (c <= 10) buckets["1-10"]++;
      else if (c <= 50) buckets["11-50"]++;
      else if (c <= 100) buckets["51-100"]++;
      else buckets["100+"]++;
    });
    return buckets;
  }, [refs]);

  const ratingDist = useMemo(() => {
    const dist: Record<string, number> = { "No rating": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    refs.forEach(r => { dist[r.rating ? String(r.rating) : "No rating"]++; });
    return dist;
  }, [refs]);

  const yearDist = useMemo(() => {
    const map: Record<string, number> = {};
    refs.forEach(r => {
      const y = r.publication_date?.slice(0, 4) || "Unknown";
      map[y] = (map[y] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [refs]);

  const contextDist = useMemo(() => {
    const map: Record<string, number> = { "(none)": 0 };
    refs.forEach(r => {
      const c = r.context || "(none)";
      map[c] = (map[c] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [refs]);

  const totalCitations = refs.reduce((s, r) => s + r.citation_count, 0);
  const avgCitations = refs.length > 0 ? (totalCitations / refs.length).toFixed(1) : "0";
  const maxCitation = refs.length > 0 ? Math.max(...refs.map(r => r.citation_count)) : 0;

  const barMax = (entries: [string, number][]) => Math.max(...entries.map(e => e[1]), 1);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <Link href={`/my-manuscripts/${paperId}`} className="text-xs text-[var(--primary)] hover:underline">
          &larr; Back to Manuscript
        </Link>
        <h1 className="text-xl font-bold mt-1">Bibliography Analysis</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
          {refs.length} references &middot; {totalCitations} total citations &middot; avg {avgCitations} &middot; max {maxCitation}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
          <div className="text-2xl font-bold">{refs.length}</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">References</div>
        </div>
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
          <div className="text-2xl font-bold">{keywordCounts.length}</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">Unique Keywords</div>
        </div>
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
          <div className="text-2xl font-bold">{labelCounts.length}</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">Labels Used</div>
        </div>
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
          <div className="text-2xl font-bold">{avgCitations}</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">Avg Citations</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Keywords */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-sm font-bold mb-3">Keywords ({keywordCounts.length})</h3>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {keywordCounts.slice(0, 50).map(([kw, count]) => (
              <div key={kw} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs truncate">{kw}</span>
                    <span className="text-[9px] text-[var(--muted-foreground)] shrink-0">{count}</span>
                  </div>
                  <div className="h-1 rounded-full bg-[var(--secondary)] mt-0.5">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(count / barMax(keywordCounts)) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Labels */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-sm font-bold mb-3">Labels ({labelCounts.length})</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {labelCounts.map(([name, { count, color }]) => (
              <div key={name} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs flex-1 truncate">{name}</span>
                <span className="text-[9px] text-[var(--muted-foreground)]">{count}</span>
                <div className="w-20 h-1.5 rounded-full bg-[var(--secondary)]">
                  <div className="h-full rounded-full" style={{ width: `${(count / (labelCounts[0]?.[1]?.count || 1)) * 100}%`, backgroundColor: color }} />
                </div>
              </div>
            ))}
            {labelCounts.length === 0 && <p className="text-xs text-[var(--muted-foreground)]">No labels assigned</p>}
          </div>
        </div>

        {/* Citations distribution */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-sm font-bold mb-3">Citation Distribution</h3>
          <div className="space-y-2">
            {Object.entries(citationBuckets).map(([bucket, count]) => (
              <div key={bucket} className="flex items-center gap-3">
                <span className="text-xs w-16 text-right font-mono">{bucket}</span>
                <div className="flex-1 h-5 rounded bg-[var(--secondary)] overflow-hidden">
                  <div className="h-full rounded bg-emerald-600 flex items-center justify-end pr-1 text-[9px] text-white font-bold transition-all"
                    style={{ width: `${refs.length > 0 ? (count / refs.length) * 100 : 0}%`, minWidth: count > 0 ? "24px" : "0" }}>
                    {count > 0 && count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rating distribution */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-sm font-bold mb-3">Rating Distribution</h3>
          <div className="space-y-2">
            {Object.entries(ratingDist).map(([rating, count]) => (
              <div key={rating} className="flex items-center gap-3">
                <span className="text-xs w-20 text-right">
                  {rating === "No rating" ? rating : `${"★".repeat(Number(rating))}${"☆".repeat(5 - Number(rating))}`}
                </span>
                <div className="flex-1 h-5 rounded bg-[var(--secondary)] overflow-hidden">
                  <div className="h-full rounded bg-amber-600 flex items-center justify-end pr-1 text-[9px] text-white font-bold transition-all"
                    style={{ width: `${refs.length > 0 ? (count / refs.length) * 100 : 0}%`, minWidth: count > 0 ? "24px" : "0" }}>
                    {count > 0 && count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Year distribution */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-sm font-bold mb-3">Year Distribution</h3>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {yearDist.map(([year, count]) => (
              <div key={year} className="flex items-center gap-3">
                <span className="text-xs w-12 text-right font-mono">{year}</span>
                <div className="flex-1 h-4 rounded bg-[var(--secondary)] overflow-hidden">
                  <div className="h-full rounded bg-purple-600 flex items-center justify-end pr-1 text-[8px] text-white font-bold transition-all"
                    style={{ width: `${(count / barMax(yearDist)) * 100}%`, minWidth: count > 0 ? "20px" : "0" }}>
                    {count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Context distribution */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-sm font-bold mb-3">Context Distribution</h3>
          <div className="space-y-2">
            {contextDist.map(([ctx, count]) => (
              <div key={ctx} className="flex items-center gap-3">
                <span className="text-xs w-28 text-right truncate capitalize">{ctx.replace("_", " ")}</span>
                <div className="flex-1 h-5 rounded bg-[var(--secondary)] overflow-hidden">
                  <div className="h-full rounded bg-cyan-600 flex items-center justify-end pr-1 text-[9px] text-white font-bold transition-all"
                    style={{ width: `${(count / barMax(contextDist)) * 100}%`, minWidth: count > 0 ? "24px" : "0" }}>
                    {count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
