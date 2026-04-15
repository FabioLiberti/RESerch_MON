"use client";

import { use, useMemo, useState } from "react";
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
  const { data: paper } = useSWR<any>(`/api/v1/papers/${paperId}`, authFetcher);
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
      const c = r.citation_count || 0;
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

  const totalCitations = refs.reduce((s, r) => s + (r.citation_count || 0), 0);
  const avgCitations = refs.length > 0 ? (totalCitations / refs.length).toFixed(1) : "0";
  const maxCitation = refs.length > 0 ? Math.max(...refs.map(r => r.citation_count || 0)) : 0;

  const barMax = (entries: [string, number][]) => Math.max(...entries.map(e => e[1]), 1);

  // --- Filters + Sorting ---
  const [filterKeyword, setFilterKeyword] = useState("");
  const [filterLabel, setFilterLabel] = useState("");
  const [filterCitation, setFilterCitation] = useState("");
  const [filterRating, setFilterRating] = useState("");
  const [sortField, setSortField] = useState<"title" | "citations" | "rating" | "year">("citations");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filteredRefs = useMemo(() => {
    return refs.filter(r => {
      if (filterKeyword && !r.keywords.includes(filterKeyword)) return false;
      if (filterLabel && !r.labels.some(l => l.name === filterLabel)) return false;
      if (filterRating) {
        if (filterRating === "none" && r.rating != null) return false;
        if (filterRating !== "none" && r.rating !== Number(filterRating)) return false;
      }
      if (filterCitation) {
        const c = r.citation_count || 0;
        if (filterCitation === "0" && c !== 0) return false;
        if (filterCitation === "1-10" && (c < 1 || c > 10)) return false;
        if (filterCitation === "11-50" && (c < 11 || c > 50)) return false;
        if (filterCitation === "51-100" && (c < 51 || c > 100)) return false;
        if (filterCitation === "100+" && c <= 100) return false;
      }
      return true;
    });
  }, [refs, filterKeyword, filterLabel, filterCitation, filterRating]);

  const sortedRefs = useMemo(() => {
    const list = [...filteredRefs];
    const mul = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sortField === "title") return mul * a.title.localeCompare(b.title);
      if (sortField === "citations") return mul * ((a.citation_count || 0) - (b.citation_count || 0));
      if (sortField === "rating") return mul * ((a.rating || 0) - (b.rating || 0));
      if (sortField === "year") return mul * ((a.publication_date || "").localeCompare(b.publication_date || ""));
      return 0;
    });
    return list;
  }, [filteredRefs, sortField, sortDir]);

  const hasFilters = filterKeyword || filterLabel || filterCitation || filterRating;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <Link href={`/my-manuscripts/${paperId}`} className="text-xs text-[var(--primary)] hover:underline">
          &larr; Back to Manuscript
        </Link>
        <h1 className="text-xl font-bold mt-1">Bibliography Analysis</h1>
        {paper && (
          <div className="mt-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] p-3">
            <a href={`/papers/${paperId}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold hover:text-[var(--primary)] line-clamp-2">
              {paper.title} ↗
            </a>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {paper.paper_role === "my_manuscript" && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-700 text-white font-bold">MY MANUSCRIPT</span>}
              {paper.paper_type && (
                <span className="text-[9px] px-1.5 py-0.5 rounded text-white font-bold" style={{ backgroundColor: paper.paper_type === "extended_abstract" ? "#dc2626" : "#7c3aed" }}>
                  {paper.paper_type.replace(/_/g, " ").toUpperCase()}
                </span>
              )}
              {paper.journal && <span className="text-xs text-[var(--muted-foreground)] italic">{paper.journal}</span>}
              {paper.publication_date && <span className="text-xs text-[var(--muted-foreground)]">Submitted: {paper.publication_date}</span>}
            </div>
          </div>
        )}
        <p className="text-sm text-[var(--muted-foreground)] mt-2">
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

      {/* Filters + filtered paper list */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-4">
        <h3 className="text-sm font-bold">Filter References</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Keyword</label>
            <select value={filterKeyword} onChange={e => setFilterKeyword(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs focus:outline-none">
              <option value="">All keywords</option>
              {[...keywordCounts].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 100).map(([kw]) => (
                <option key={kw} value={kw}>{kw}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Label</label>
            <select value={filterLabel} onChange={e => setFilterLabel(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs focus:outline-none">
              <option value="">All labels</option>
              {[...labelCounts].sort((a, b) => a[0].localeCompare(b[0])).map(([name]) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Citations</label>
            <select value={filterCitation} onChange={e => setFilterCitation(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs focus:outline-none">
              <option value="">All</option>
              <option value="0">0 citations</option>
              <option value="1-10">1–10</option>
              <option value="11-50">11–50</option>
              <option value="51-100">51–100</option>
              <option value="100+">100+</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Rating</label>
            <select value={filterRating} onChange={e => setFilterRating(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs focus:outline-none">
              <option value="">All</option>
              {[5, 4, 3, 2, 1].map(r => (
                <option key={r} value={String(r)}>{"★".repeat(r)}{"☆".repeat(5 - r)}</option>
              ))}
              <option value="none">No rating</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--muted-foreground)]">
            {hasFilters ? `${sortedRefs.length} of ${refs.length} references match` : `${refs.length} references`}
          </span>
          {hasFilters && (
            <button onClick={() => { setFilterKeyword(""); setFilterLabel(""); setFilterCitation(""); setFilterRating(""); }}
              className="text-[10px] text-red-400 hover:underline">Clear all filters</button>
          )}
        </div>

        {/* Filtered results table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                {([
                  { key: "title" as const, label: "Title", w: "" },
                  { key: "citations" as const, label: "Citations", w: "w-20" },
                  { key: "rating" as const, label: "Rating", w: "w-16" },
                  { key: "year" as const, label: "Year", w: "w-16" },
                ] as const).map(col => (
                  <th key={col.key} className={`text-left py-2 pr-2 ${col.w}`}>
                    <button onClick={() => toggleSort(col.key)} className="hover:text-[var(--foreground)] transition-colors">
                      {col.label} {sortField === col.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                ))}
                <th className="text-left py-2 w-24">Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {sortedRefs.map(r => (
                <tr key={r.id} className="hover:bg-[var(--secondary)] transition-colors">
                  <td className="py-2 pr-2">
                    <a href={`/papers/${r.cited_paper_id}`} target="_blank" rel="noopener noreferrer"
                      className="hover:text-[var(--primary)] line-clamp-1">
                      {r.title}
                    </a>
                    {r.labels.length > 0 && (
                      <div className="flex gap-1 mt-0.5">
                        {r.labels.map(l => (
                          <span key={l.name} className="text-[8px] px-1 py-0.5 rounded-full" style={{ backgroundColor: `${l.color}25`, color: l.color }}>{l.name}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-2 font-mono">{r.citation_count || 0}</td>
                  <td className="py-2 pr-2 text-amber-400">{r.rating ? "★".repeat(r.rating) : "—"}</td>
                  <td className="py-2 pr-2 font-mono">{r.publication_date?.slice(0, 4) || "—"}</td>
                  <td className="py-2 capitalize text-[var(--muted-foreground)]">{r.context?.replace("_", " ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
