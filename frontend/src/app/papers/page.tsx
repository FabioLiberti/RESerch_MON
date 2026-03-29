"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { usePapers } from "@/hooks/usePapers";
import { useTopics } from "@/hooks/useAnalytics";
import { formatDate, SOURCE_LABELS, SOURCE_COLORS, cn } from "@/lib/utils";
import type { KeywordCount } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type SourceTab = "all" | "api" | "compendium";

const TABS: { key: SourceTab; label: string; description: string }[] = [
  { key: "all", label: "All Papers", description: "All sources combined" },
  { key: "api", label: "API Sources", description: "PubMed, arXiv, bioRxiv, medRxiv, IEEE" },
  { key: "compendium", label: "Compendium", description: "Curated FL research papers" },
];

// API sources (exclude compendium)
const API_SOURCES = ["pubmed", "semantic_scholar", "arxiv", "biorxiv", "medrxiv", "ieee"];

export default function PapersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [activeTab, setActiveTab] = useState<SourceTab>("all");

  const { data: allKeywords } = useSWR<KeywordCount[]>("/api/v1/papers/keywords/all", fetcher);

  const params: Record<string, string> = {
    page: String(page),
    per_page: "20",
    sort_by: "created_at",
    sort_order: "desc",
  };
  if (search) params.search = search;
  if (topicFilter) params.topic = topicFilter;
  if (keywordFilter) params.keyword = keywordFilter;

  // Apply source filter based on tab + dropdown
  if (activeTab === "compendium") {
    params.source = "compendium";
  } else if (activeTab === "api") {
    if (sourceFilter) {
      params.source = sourceFilter;
    }
    // Note: "api" tab without sourceFilter shows all non-compendium
    // We'll filter client-side if needed, or the backend shows all
  } else {
    if (sourceFilter) params.source = sourceFilter;
  }

  const { data, isLoading } = usePapers(params);
  const { data: topics } = useTopics();

  const switchTab = (tab: SourceTab) => {
    setActiveTab(tab);
    setSourceFilter("");
    setKeywordFilter("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Papers</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            {data?.total ?? 0} papers
            {activeTab === "compendium" && " in Compendium"}
            {activeTab === "api" && " from API sources"}
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

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--secondary)]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            className={cn(
              "flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
              activeTab === tab.key
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
          >
            <span>{tab.label}</span>
            <span className="hidden sm:inline text-[10px] ml-1.5 opacity-60">
              {tab.description}
            </span>
          </button>
        ))}
      </div>

      {/* Compendium banner */}
      {activeTab === "compendium" && (
        <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-purple-300">FedCompendium XL</p>
              <p className="text-xs text-purple-400/70">
                Curated FL papers with educational content, simulations, and learning paths
              </p>
            </div>
          </div>
          <Link
            href="/compendium"
            className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors"
          >
            Open Full Compendium
          </Link>
        </div>
      )}

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
          {(Array.isArray(topics) ? topics : [])
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
            .map((t: any) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
        </select>
        {activeTab !== "compendium" && (
          <select
            value={sourceFilter}
            onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none"
          >
            <option value="">
              {activeTab === "api" ? "All API Sources" : "All Sources"}
            </option>
            {(activeTab === "api" ? API_SOURCES : Object.keys(SOURCE_LABELS))
              .sort((a, b) => (SOURCE_LABELS[a] || a).localeCompare(SOURCE_LABELS[b] || b))
              .map((key) => (
                <option key={key} value={key}>{SOURCE_LABELS[key] || key}</option>
              ))}
          </select>
        )}
        <select
          value={keywordFilter}
          onChange={(e) => { setKeywordFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none max-w-52"
        >
          <option value="">All Keywords</option>
          {(Array.isArray(allKeywords) ? allKeywords : [])
            .filter((k: KeywordCount) => k.count >= 3)
            .sort((a: KeywordCount, b: KeywordCount) => a.keyword.localeCompare(b.keyword))
            .map((k: KeywordCount) => (
              <option key={k.keyword} value={k.keyword}>
                {k.keyword} ({k.count})
              </option>
            ))}
        </select>
        {(search || topicFilter || sourceFilter || keywordFilter) && (
          <button
            onClick={() => {
              setSearch(""); setTopicFilter(""); setSourceFilter(""); setKeywordFilter(""); setPage(1);
            }}
            className="px-3 py-2 rounded-lg text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Active keyword badge */}
      {keywordFilter && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted-foreground)]">Filtered by keyword:</span>
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[var(--primary)]/15 text-[var(--primary)]">
            {keywordFilter}
            <button
              onClick={() => { setKeywordFilter(""); setPage(1); }}
              className="ml-1 hover:text-[var(--foreground)]"
            >
              &times;
            </button>
          </span>
        </div>
      )}

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
              data.items.map((paper) => {
                const isCompendium = paper.sources.includes("compendium");
                return (
                  <tr
                    key={paper.id}
                    className={cn(
                      "border-b border-[var(--border)] hover:bg-[var(--secondary)] transition-colors",
                      isCompendium && "border-l-2 border-l-purple-500/40"
                    )}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/papers/${paper.id}`} className="text-sm hover:text-[var(--primary)]">
                        <span className="line-clamp-2">{paper.title}</span>
                      </Link>
                      {paper.keywords && paper.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {paper.keywords.slice(0, 4).map((kw) => (
                            <button
                              key={kw}
                              onClick={(e) => {
                                e.preventDefault();
                                setKeywordFilter(kw);
                                setPage(1);
                              }}
                              className={cn(
                                "text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition-colors",
                                keywordFilter === kw
                                  ? "bg-[var(--primary)]/20 text-[var(--primary)]"
                                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--primary)]/10 hover:text-[var(--primary)]"
                              )}
                            >
                              {kw}
                            </button>
                          ))}
                          {paper.keywords.length > 4 && (
                            <span className="text-[9px] text-[var(--muted-foreground)]">
                              +{paper.keywords.length - 4}
                            </span>
                          )}
                        </div>
                      )}
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
                );
              })
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
