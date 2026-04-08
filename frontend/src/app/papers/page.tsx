"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { usePapers } from "@/hooks/usePapers";
import { useTopics } from "@/hooks/useAnalytics";
import { formatDate, SOURCE_LABELS, SOURCE_COLORS, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { api, authFetcher } from "@/lib/api";
import type { KeywordCount } from "@/lib/types";

type SourceTab = "all" | "api" | "compendium";

const TABS: { key: SourceTab; label: string; description: string }[] = [
  { key: "all", label: "All Papers", description: "All sources combined" },
  { key: "api", label: "API Sources", description: "PubMed, arXiv, bioRxiv, medRxiv, IEEE" },
  { key: "compendium", label: "Compendium", description: "Curated FL research papers" },
];

// API sources (exclude compendium)
const API_SOURCES = ["pubmed", "semantic_scholar", "arxiv", "biorxiv", "medrxiv", "ieee"];

export default function PapersPage() {
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [doiFilter, setDoiFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");

  // Sync URL params with state
  useEffect(() => {
    const label = searchParams.get("label");
    const topic = searchParams.get("topic");
    const keyword = searchParams.get("keyword");
    const source = searchParams.get("source");
    if (label !== null) { setLabelFilter(label); setPage(1); }
    if (topic !== null) { setTopicFilter(topic); setPage(1); }
    if (keyword !== null) { setKeywordFilter(keyword); setPage(1); }
    if (source !== null) { setSourceFilter(source); setPage(1); }
  }, [searchParams]);
  const [activeTab, setActiveTab] = useState<SourceTab>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisMsg, setAnalysisMsg] = useState<string | null>(null);
  const { isAdmin } = useAuth();

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!data?.items) return;
    const allOnPage = data.items.map((p) => p.id);
    const allSelected = allOnPage.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      allOnPage.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const [analysisMode, setAnalysisMode] = useState<"quick" | "deep">("quick");

  const triggerAnalysis = async () => {
    if (selectedIds.size === 0) return;
    setAnalyzing(true);
    setAnalysisMsg(null);
    try {
      const res = await api.triggerAnalysis(Array.from(selectedIds), analysisMode);
      setAnalysisMsg(`${res.added} paper in coda per ${analysisMode} analysis${res.skipped ? ` (${res.skipped} già analizzati)` : ""}`);
      setSelectedIds(new Set());
    } catch (e: any) {
      setAnalysisMsg(e.message || "Errore avvio analisi");
    }
    setAnalyzing(false);
  };

  const { data: allKeywords } = useSWR<KeywordCount[]>("/api/v1/papers/keywords/all", authFetcher);
  const { data: allLabels } = useSWR<{ id: number; name: string; color: string }[]>("/api/v1/labels", authFetcher);

  const params: Record<string, string> = {
    page: String(page),
    per_page: "20",
    sort_by: "created_at",
    sort_order: "desc",
  };
  if (search) params.search = search;
  if (authorFilter) params.author = authorFilter;
  if (doiFilter) params.doi = doiFilter;
  if (topicFilter) params.topic = topicFilter;
  if (keywordFilter) params.keyword = keywordFilter;
  if (labelFilter) params.label = labelFilter;

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
            <span className="font-semibold text-[var(--foreground)]">{data?.total ?? 0}</span> papers
            {activeTab === "compendium" && " in Compendium"}
            {activeTab === "api" && " from API sources"}
            {(search || authorFilter || doiFilter || topicFilter || sourceFilter || keywordFilter || labelFilter) && (
              <span className="ml-1">(filtered)</span>
            )}
            {selectedIds.size > 0 && (
              <span className="ml-2 text-[var(--primary)]">· {selectedIds.size} selected</span>
            )}
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
          placeholder="Search title/abstract..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] w-48"
        />
        <input
          type="text"
          placeholder="Author..."
          value={authorFilter}
          onChange={(e) => { setAuthorFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] w-36"
        />
        <input
          type="text"
          placeholder="DOI..."
          value={doiFilter}
          onChange={(e) => { setDoiFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] w-40"
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
        {(allLabels || []).length > 0 && (
          <select
            value={labelFilter}
            onChange={(e) => { setLabelFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none max-w-44"
          >
            <option value="">All Labels</option>
            {(allLabels || []).map((l) => (
              <option key={l.id} value={l.name}>{l.name}</option>
            ))}
          </select>
        )}
        {(search || authorFilter || doiFilter || topicFilter || sourceFilter || keywordFilter || labelFilter) && (
          <button
            onClick={() => {
              setSearch(""); setAuthorFilter(""); setDoiFilter(""); setTopicFilter(""); setSourceFilter(""); setKeywordFilter(""); setLabelFilter(""); setPage(1);
            }}
            className="px-3 py-2 rounded-lg text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Analysis message */}
      {analysisMsg && (
        <div className="px-4 py-3 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 text-sm text-[var(--primary)] flex items-center justify-between">
          <span>{analysisMsg}</span>
          <button onClick={() => setAnalysisMsg(null)} className="text-xs opacity-60 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* Selection bar */}
      {selectedIds.size > 0 && isAdmin && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20">
          <span className="text-sm font-medium">
            {selectedIds.size} paper selezionat{selectedIds.size === 1 ? "o" : "i"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--secondary)] hover:bg-[var(--border)] transition-colors"
            >
              Deselect All
            </button>
            <button
              onClick={triggerAnalysis}
              disabled={analyzing}
              className="px-4 py-1.5 text-xs rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {analyzing ? (
                <>
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Invio...
                </>
              ) : (
                `Genera Analisi (${selectedIds.size})`
              )}
            </button>
            <select
              value={analysisMode}
              onChange={(e) => setAnalysisMode(e.target.value as "quick" | "deep")}
              className="px-2 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs"
            >
              <option value="quick">Quick (abstract)</option>
              <option value="deep">Deep (full PDF)</option>
            </select>
            <button
              onClick={async () => {
                setAnalysisMsg(null);
                try {
                  const res = await api.syncToZotero(Array.from(selectedIds));
                  setAnalysisMsg(`Zotero: ${res.synced} synced${res.failed ? `, ${res.failed} failed` : ""}`);
                } catch (e: any) {
                  setAnalysisMsg(e.message || "Zotero sync failed");
                }
              }}
              className="px-3 py-1.5 text-xs rounded-lg bg-cyan-700 text-white font-medium hover:bg-cyan-600"
            >
              Sync to Zotero
            </button>
          </div>
        </div>
      )}

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
              {isAdmin && (
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={!!data?.items?.length && data.items.every((p) => selectedIds.has(p.id))}
                    onChange={toggleSelectAll}
                    className="rounded border-[var(--border)] accent-[var(--primary)]"
                  />
                </th>
              )}
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
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-4">
                    <div className="h-4 bg-[var(--muted)] rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : !data?.items?.length ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-4 py-12 text-center text-[var(--muted-foreground)]">
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
                      isCompendium && "border-l-2 border-l-purple-500/40",
                      selectedIds.has(paper.id) && "bg-[var(--primary)]/5"
                    )}
                  >
                    {isAdmin && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(paper.id)}
                          onChange={() => toggleSelect(paper.id)}
                          className="rounded border-[var(--border)] accent-[var(--primary)]"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link href={`/papers/${paper.id}`} className="text-sm hover:text-[var(--primary)]">
                        <span className="line-clamp-2">{paper.title}</span>
                      </Link>
                      {paper.labels && paper.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {paper.labels.map((l) => (
                            <span
                              key={l.id}
                              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: `${l.color}20`, color: l.color }}
                            >
                              {l.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {paper.analyses && paper.analyses.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {paper.analyses.map((a, i) => (
                            <span
                              key={i}
                              className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                a.mode === "deep" ? "bg-purple-700 text-white" : "bg-blue-700 text-white"
                              }`}
                            >
                              {a.mode === "deep" ? "DEEP" : "QUICK"}
                            </span>
                          ))}
                        </div>
                      )}
                      {paper.keywords && paper.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
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
