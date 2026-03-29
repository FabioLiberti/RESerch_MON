"use client";

import { useState } from "react";
import Link from "next/link";
import { usePapers } from "@/hooks/usePapers";
import { useTopics } from "@/hooks/useAnalytics";
import { formatDate, SOURCE_LABELS, SOURCE_COLORS } from "@/lib/utils";

export default function PapersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const params: Record<string, string> = {
    page: String(page),
    per_page: "20",
    sort_by: "created_at",
    sort_order: "desc",
  };
  if (search) params.search = search;
  if (topicFilter) params.topic = topicFilter;
  if (sourceFilter) params.source = sourceFilter;

  const { data, isLoading } = usePapers(params);
  const { data: topics } = useTopics();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Papers</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            {data?.total ?? 0} papers discovered
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/v1/exports/json"
            className="px-3 py-1.5 text-sm rounded-lg bg-[var(--secondary)] hover:bg-[var(--border)] transition-colors"
          >
            Export JSON
          </a>
          <a
            href="/api/v1/exports/xlsx"
            className="px-3 py-1.5 text-sm rounded-lg bg-[var(--secondary)] hover:bg-[var(--border)] transition-colors"
          >
            Export XLSX
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search papers..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] w-64"
        />
        <select
          value={topicFilter}
          onChange={(e) => { setTopicFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none"
        >
          <option value="">All Topics</option>
          {(Array.isArray(topics) ? topics : []).map((t: any) => (
            <option key={t.id} value={t.name}>{t.name}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none"
        >
          <option value="">All Sources</option>
          {Object.entries(SOURCE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left text-xs font-medium text-[var(--muted-foreground)] px-4 py-3">Title</th>
              <th className="text-left text-xs font-medium text-[var(--muted-foreground)] px-4 py-3 w-28">Date</th>
              <th className="text-left text-xs font-medium text-[var(--muted-foreground)] px-4 py-3 w-32">Sources</th>
              <th className="text-left text-xs font-medium text-[var(--muted-foreground)] px-4 py-3 w-24">Type</th>
              <th className="text-center text-xs font-medium text-[var(--muted-foreground)] px-4 py-3 w-20">Citations</th>
              <th className="text-center text-xs font-medium text-[var(--muted-foreground)] px-4 py-3 w-16">PDF</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-[var(--border)]">
                  <td colSpan={6} className="px-4 py-4">
                    <div className="h-4 bg-[var(--muted)] rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : !data?.items?.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-[var(--muted-foreground)]">
                  No papers found
                </td>
              </tr>
            ) : (
              data.items.map((paper) => (
                <tr
                  key={paper.id}
                  className="border-b border-[var(--border)] hover:bg-[var(--secondary)] transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link href={`/papers/${paper.id}`} className="text-sm hover:text-[var(--primary)]">
                      <span className="line-clamp-2">{paper.title}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                    {formatDate(paper.publication_date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
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
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted-foreground)] capitalize">
                    {paper.paper_type.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-center text-xs">{paper.citation_count}</td>
                  <td className="px-4 py-3 text-center">
                    {paper.has_pdf ? (
                      <span className="text-[var(--success)]">&#10003;</span>
                    ) : paper.open_access ? (
                      <span className="text-[var(--warning)]">OA</span>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg bg-[var(--secondary)] disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-[var(--muted-foreground)]">
            Page {page} of {data.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
            disabled={page >= data.pages}
            className="px-3 py-1.5 text-sm rounded-lg bg-[var(--secondary)] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
