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
import PaperInfoBox from "@/components/PaperInfoBox";

type SourceTab = "all" | "api" | "compendium";

const TABS: { key: SourceTab; label: string; description: string }[] = [
  { key: "all", label: "All Papers", description: "All sources combined" },
  { key: "api", label: "API Sources", description: "PubMed, arXiv, bioRxiv, medRxiv, IEEE" },
  { key: "compendium", label: "Compendium", description: "Curated FL research papers" },
];

// API sources (exclude compendium)
const API_SOURCES = ["arxiv", "biorxiv", "elsevier", "ieee", "medrxiv", "pubmed", "semantic_scholar"];

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
  const [pdfFilter, setPdfFilter] = useState("");
  const [zoteroFilter, setZoteroFilter] = useState("");
  const [disabledFilter, setDisabledFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");
  const [flTechFilter, setFlTechFilter] = useState("");
  const [datasetFilter, setDatasetFilter] = useState("");
  const [methodTagFilter, setMethodTagFilter] = useState("");
  const [validationFilter, setValidationFilter] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [tutorCheckFilter, setTutorCheckFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [minCitationsFilter, setMinCitationsFilter] = useState("");
  const [zoteroSyncing, setZoteroSyncing] = useState(false);

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
  const [refreshingCitations, setRefreshingCitations] = useState(false);
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
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

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
  const { data: allFlTechniques } = useSWR<{ name: string; count: number }[]>("/api/v1/papers/fl-techniques/all", authFetcher);
  const { data: allDatasets } = useSWR<{ name: string; count: number }[]>("/api/v1/papers/datasets/all", authFetcher);
  const { data: allMethodTags } = useSWR<{ name: string; count: number }[]>("/api/v1/papers/method-tags/all", authFetcher);

  const params: Record<string, string> = {
    page: String(page),
    per_page: "20",
    sort_by: sortBy,
    sort_order: sortOrder,
  };
  if (search) params.search = search;
  if (authorFilter) params.author = authorFilter;
  if (doiFilter) params.doi = doiFilter;
  if (topicFilter) params.topic = topicFilter;
  if (keywordFilter) params.keyword = keywordFilter;
  if (labelFilter) params.label = labelFilter;
  if (pdfFilter === "yes") params.has_pdf = "true";
  if (zoteroFilter === "yes") params.on_zotero = "true";
  if (zoteroFilter === "no") params.on_zotero = "false";
  if (disabledFilter === "yes") params.disabled = "true";
  else if (disabledFilter === "no") params.disabled = "false";
  if (ratingFilter) params.min_rating = ratingFilter;
  if (flTechFilter) params.fl_technique = flTechFilter;
  if (datasetFilter) params.dataset = datasetFilter;
  if (methodTagFilter) params.method_tag = methodTagFilter;
  if (validationFilter) params.validation = validationFilter;
  if (qualityFilter) params.quality = qualityFilter;
  if (tutorCheckFilter) params.tutor_check = tutorCheckFilter;
  if (roleFilter) params.paper_role = roleFilter;
  if (typeFilter) params.paper_type = typeFilter;
  if (minCitationsFilter) params.min_citations = minCitationsFilter;

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
  const { data: typeStats } = useSWR<{ type: string; count: number }[]>("/api/v1/papers/type-stats", authFetcher);

  const switchTab = (tab: SourceTab) => {
    setActiveTab(tab);
    setSourceFilter("");
    setKeywordFilter("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Papers</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            <span className="font-semibold text-[var(--foreground)]">{data?.total ?? 0}</span> papers
            {activeTab === "compendium" && " in Compendium"}
            {activeTab === "api" && " from API sources"}
            {typeFilter && ` · type: ${typeFilter.replace(/_/g, " ")}`}
            {(search || authorFilter || doiFilter || topicFilter || sourceFilter || keywordFilter || labelFilter) && (
              <span className="ml-1">(filtered)</span>
            )}
            {selectedIds.size > 0 && (
              <span className="ml-2 text-[var(--primary)]">· {selectedIds.size} selected</span>
            )}
          </p>
          {typeStats && typeStats.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {typeStats.filter(t => t.count > 0).map(t => (
                <button key={t.type}
                  onClick={() => { setTypeFilter(typeFilter === t.type ? "" : t.type); setPage(1); }}
                  className={cn(
                    "text-[9px] px-2 py-0.5 rounded-full font-medium transition-colors",
                    typeFilter === t.type ? "bg-[var(--primary)] text-white" : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  )}>
                  {t.type.replace(/_/g, " ")} ({t.count.toLocaleString()})
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
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
      {(() => null)()}
      {/* Helper for active filter highlight */}
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {(() => {
          const active = "border-blue-500 bg-blue-500/10 text-blue-300 ring-1 ring-blue-500/30";
          const normal = "border-[var(--border)] bg-[var(--secondary)]";
          const cls = (v: string) => `px-4 py-2 rounded-lg border text-sm focus:outline-none ${v ? active : normal}`;
          const inputCls = (v: string) => `${cls(v)} focus:border-[var(--primary)]`;
          return (
            <>
        <input
          type="text"
          placeholder="Search title/abstract..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className={`${inputCls(search)} w-48`}
        />
        <input
          type="text"
          placeholder="Author..."
          value={authorFilter}
          onChange={(e) => { setAuthorFilter(e.target.value); setPage(1); }}
          className={`${inputCls(authorFilter)} w-36`}
        />
        <input
          type="text"
          placeholder="DOI..."
          value={doiFilter}
          onChange={(e) => { setDoiFilter(e.target.value); setPage(1); }}
          className={`${inputCls(doiFilter)} w-40`}
        />
        <select
          value={topicFilter}
          onChange={(e) => { setTopicFilter(e.target.value); setPage(1); }}
          className={cls(topicFilter)}
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
            className={cls(sourceFilter)}
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
        <div className="relative">
          <input
            type="text"
            value={keywordFilter}
            onChange={(e) => { setKeywordFilter(e.target.value); setPage(1); }}
            placeholder="Keyword..."
            list="kw-datalist"
            className={`${cls(keywordFilter)} max-w-52 px-2 py-1.5`}
          />
          {keywordFilter && (
            <button onClick={() => { setKeywordFilter(""); setPage(1); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]">&times;</button>
          )}
          <datalist id="kw-datalist">
            {(Array.isArray(allKeywords) ? allKeywords : [])
              .filter((k: KeywordCount) => k.count >= 2)
              .sort((a: KeywordCount, b: KeywordCount) => a.keyword.localeCompare(b.keyword))
              .map((k: KeywordCount) => (
                <option key={k.keyword} value={k.keyword}>{k.keyword} ({k.count})</option>
              ))}
          </datalist>
        </div>
        {(allLabels || []).length > 0 && (
          <div className="relative">
            <input
              type="text"
              value={labelFilter}
              onChange={(e) => { setLabelFilter(e.target.value); setPage(1); }}
              placeholder="Label..."
              list="label-datalist"
              className={`${cls(labelFilter)} max-w-44 px-2 py-1.5`}
            />
            {labelFilter && (
              <button onClick={() => { setLabelFilter(""); setPage(1); }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]">&times;</button>
            )}
            <datalist id="label-datalist">
              {(allLabels || []).sort((a, b) => a.name.localeCompare(b.name)).map((l) => (
                <option key={l.id} value={l.name} />
              ))}
            </datalist>
          </div>
        )}
        <select
          value={pdfFilter}
          onChange={(e) => { setPdfFilter(e.target.value); setPage(1); }}
          className={cls(pdfFilter)}
        >
          <option value="">PDF: All</option>
          <option value="yes">With PDF</option>
        </select>
        <select
          value={zoteroFilter}
          onChange={(e) => { setZoteroFilter(e.target.value); setPage(1); }}
          className={cls(zoteroFilter)}
        >
          <option value="">Zotero: All</option>
          <option value="yes">On Zotero</option>
          <option value="no">Not on Zotero</option>
        </select>
        <select
          value={disabledFilter}
          onChange={(e) => { setDisabledFilter(e.target.value); setPage(1); }}
          className={cls(disabledFilter)}
        >
          <option value="">Status: All</option>
          <option value="no">Active</option>
          <option value="yes">Disabled</option>
        </select>
        <select
          value={ratingFilter}
          onChange={(e) => { setRatingFilter(e.target.value); setPage(1); }}
          className={cls(ratingFilter)}
        >
          <option value="">Rating: All</option>
          <option value="1">★ 1+</option>
          <option value="2">★★ 2+</option>
          <option value="3">★★★ 3+</option>
          <option value="4">★★★★ 4+</option>
          <option value="5">★★★★★ 5</option>
        </select>
        <select
          value={minCitationsFilter}
          onChange={(e) => { setMinCitationsFilter(e.target.value); setPage(1); }}
          className={cls(minCitationsFilter)}
        >
          <option value="">Citations: All</option>
          <option value="1">1+ citations</option>
          <option value="5">5+ citations</option>
          <option value="10">10+ citations</option>
          <option value="50">50+ citations</option>
          <option value="100">100+ citations</option>
          <option value="500">500+ citations</option>
        </select>
        {(allFlTechniques || []).length > 0 && (
          <select
            value={flTechFilter}
            onChange={(e) => { setFlTechFilter(e.target.value); setPage(1); }}
            className={`${cls(flTechFilter)} max-w-48`}
          >
            <option value="">FL Technique: All</option>
            {[...(allFlTechniques || [])].sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
              <option key={t.name} value={t.name}>{t.name} ({t.count})</option>
            ))}
          </select>
        )}
        {(allDatasets || []).length > 0 && (
          <select
            value={datasetFilter}
            onChange={(e) => { setDatasetFilter(e.target.value); setPage(1); }}
            className={`${cls(datasetFilter)} max-w-48`}
          >
            <option value="">Dataset: All</option>
            {[...(allDatasets || [])].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
              <option key={d.name} value={d.name}>{d.name} ({d.count})</option>
            ))}
          </select>
        )}
        {(allMethodTags || []).length > 0 && (
          <select
            value={methodTagFilter}
            onChange={(e) => { setMethodTagFilter(e.target.value); setPage(1); }}
            className={`${cls(methodTagFilter)} max-w-52`}
          >
            <option value="">Method: All</option>
            {[...(allMethodTags || [])].sort((a, b) => a.name.localeCompare(b.name)).map((m) => (
              <option key={m.name} value={m.name}>{m.name} ({m.count})</option>
            ))}
          </select>
        )}
        <select
          value={validationFilter}
          onChange={(e) => { setValidationFilter(e.target.value); setPage(1); }}
          className={`${cls(validationFilter)} max-w-44`}
        >
          <option value="">Validation: All</option>
          <option value="any">Reviewed (any)</option>
          <option value="validated">Validated</option>
          <option value="needs_revision">Needs revision</option>
          <option value="rejected">Rejected</option>
          <option value="pending">Pending review</option>
        </select>
        <select
          value={qualityFilter}
          onChange={(e) => { setQualityFilter(e.target.value); setPage(1); }}
          className={`${cls(qualityFilter)} max-w-44`}
        >
          <option value="">Quality: All</option>
          <option value="any">Has assessment (any grade)</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="adequate">Adequate</option>
          <option value="weak">Weak</option>
          <option value="unreliable">Unreliable</option>
          <option value="none">Not assessed yet</option>
        </select>
        <select
          value={tutorCheckFilter}
          onChange={(e) => { setTutorCheckFilter(e.target.value); setPage(1); }}
          className={`${cls(tutorCheckFilter)} max-w-44`}
        >
          <option value="">Tutor check: All</option>
          <option value="ok">✓ OK</option>
          <option value="review">? Review</option>
          <option value="no">✗ NO</option>
          <option value="none">Not checked</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className={`${cls(roleFilter)} max-w-44`}
        >
          <option value="">Role: All</option>
          <option value="bibliography">Bibliography</option>
          <option value="reviewing">Reviewing</option>
          <option value="my_manuscript">My Manuscript</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className={cls(typeFilter)}
        >
          <option value="">Type: All</option>
          <option value="journal_article">Journal Article</option>
          <option value="preprint">Preprint</option>
          <option value="conference">Conference</option>
          <option value="review">Review</option>
        </select>
        <select
          value={`${sortBy}:${sortOrder}`}
          onChange={(e) => { const [s, o] = e.target.value.split(":"); setSortBy(s); setSortOrder(o); setPage(1); }}
          className="px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none"
        >
          <option value="created_at:desc">Newest added</option>
          <option value="created_at:asc">Oldest added</option>
          <option value="publication_date:desc">Pub date (newest)</option>
          <option value="publication_date:asc">Pub date (oldest)</option>
          <option value="citation_count:desc">Most cited</option>
          <option value="citation_count:asc">Least cited</option>
          <option value="rating:desc">Best rated</option>
          <option value="rating:asc">Worst rated</option>
          <option value="title:asc">Title A-Z</option>
          <option value="title:desc">Title Z-A</option>
        </select>
        {(search || authorFilter || doiFilter || topicFilter || sourceFilter || keywordFilter || labelFilter || pdfFilter || zoteroFilter || disabledFilter || ratingFilter || flTechFilter || datasetFilter || methodTagFilter || validationFilter || qualityFilter || tutorCheckFilter || roleFilter) && (
          <button
            onClick={() => {
              setSearch(""); setAuthorFilter(""); setDoiFilter(""); setTopicFilter(""); setSourceFilter(""); setKeywordFilter(""); setLabelFilter(""); setPdfFilter(""); setZoteroFilter(""); setDisabledFilter(""); setRatingFilter(""); setFlTechFilter(""); setDatasetFilter(""); setMethodTagFilter(""); setValidationFilter(""); setQualityFilter(""); setTutorCheckFilter(""); setRoleFilter(""); setTypeFilter(""); setMinCitationsFilter(""); setPage(1);
            }}
            className="px-3 py-2 rounded-lg text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
          >
            Clear filters
          </button>
        )}
            </>
          );
        })()}
      </div>

      {/* Analysis message */}
      {analysisMsg && (
        <div className={`px-4 py-3 rounded-lg text-sm flex items-center justify-between ${
          zoteroSyncing
            ? "bg-cyan-900/20 border-2 border-cyan-500 text-cyan-200"
            : "bg-[var(--primary)]/10 border border-[var(--primary)]/20 text-[var(--primary)]"
        }`}>
          <span className="flex items-center gap-2">
            {zoteroSyncing && (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {analysisMsg}
          </span>
          {!zoteroSyncing && (
            <button onClick={() => setAnalysisMsg(null)} className="text-xs opacity-60 hover:opacity-100">&times;</button>
          )}
        </div>
      )}

      {/* Selection bar */}
      {selectedIds.size > 0 && isAdmin && (
        <div className="px-4 py-3 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 space-y-2">
          <span className="text-sm font-medium block">
            {selectedIds.size} paper selezionat{selectedIds.size === 1 ? "o" : "i"}
          </span>
          <div className="flex gap-2 flex-wrap">
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
              <option value="quick">Quick (~5 pages)</option>
              <option value="deep">Deep (~7+ pages)</option>
              <option value="summary">Summary (1 page)</option>
              <option value="extended">Extended Abstract (2 pages)</option>
            </select>
            <Link
              href={`/comparison?ids=${Array.from(selectedIds).join(",")}`}
              className="px-4 py-1.5 text-xs rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-500 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Confronta ({selectedIds.size})
            </Link>
            <button
              onClick={async () => {
                setRefreshingCitations(true);
                setAnalysisMsg(null);
                try {
                  const res = await api.refreshCitationsBatch(Array.from(selectedIds));
                  setAnalysisMsg(`Citations: ${res.updated} updated / ${res.total} checked`);
                } catch (e: any) {
                  setAnalysisMsg(e.message || "Citation refresh failed");
                }
                setRefreshingCitations(false);
              }}
              disabled={refreshingCitations}
              className="px-3 py-1.5 text-xs rounded-lg bg-indigo-700 text-white font-medium hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1.5"
            >
              {refreshingCitations ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Refreshing...
                </>
              ) : (
                `Refresh Citations (${selectedIds.size})`
              )}
            </button>
            <button
              onClick={async () => {
                const count = selectedIds.size;
                if (!count) return;
                setZoteroSyncing(true);
                setAnalysisMsg(`Syncing ${count} paper${count > 1 ? "s" : ""} to Zotero — this may take a few minutes (metadata + tags + PDF upload per paper)...`);
                try {
                  const res = await api.syncToZotero(Array.from(selectedIds));
                  setAnalysisMsg(`Zotero: ${res.synced}/${count} synced${res.failed ? ` · ${res.failed} failed` : ""}`);
                } catch (e: any) {
                  setAnalysisMsg(e.message || "Zotero sync failed");
                } finally {
                  setZoteroSyncing(false);
                }
              }}
              disabled={zoteroSyncing}
              className="px-3 py-1.5 text-xs rounded-lg bg-cyan-700 text-white font-medium hover:bg-cyan-600 disabled:opacity-50 flex items-center gap-1.5"
            >
              {zoteroSyncing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Syncing {selectedIds.size}...
                </>
              ) : (
                `Sync to Zotero (${selectedIds.size})`
              )}
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
              {[
                { key: "title", label: "Title", align: "text-left", hide: "" },
                { key: "publication_date", label: "Date", align: "text-left", hide: "hidden sm:table-cell", w: "w-28" },
                { key: null, label: "Sources", align: "text-left", hide: "hidden md:table-cell", w: "w-32" },
                { key: null, label: "Type", align: "text-left", hide: "hidden lg:table-cell", w: "w-24" },
                { key: "citation_count", label: "Citations", align: "text-center", hide: "hidden sm:table-cell", w: "w-20" },
                { key: null, label: "PDF", align: "text-center", hide: "hidden md:table-cell", w: "w-16" },
              ].map(col => (
                <th key={col.label} className={`${col.align} text-xs font-medium px-4 py-3 ${col.w || ""} ${col.hide}`}>
                  {col.key ? (
                    <button
                      onClick={() => {
                        if (sortBy === col.key) setSortOrder(sortOrder === "desc" ? "asc" : "desc");
                        else { setSortBy(col.key); setSortOrder("desc"); }
                      }}
                      className={`hover:text-[var(--foreground)] transition-colors inline-flex items-center gap-1 ${sortBy === col.key ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}
                    >
                      {col.label}
                      {sortBy === col.key ? (
                        <span className="text-[var(--primary)]">{sortOrder === "asc" ? "▲" : "▼"}</span>
                      ) : (
                        <span className="opacity-30">⇅</span>
                      )}
                    </button>
                  ) : (
                    <span className="text-[var(--muted-foreground)]">{col.label}</span>
                  )}
                </th>
              ))}
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
                      selectedIds.has(paper.id) && "bg-[var(--primary)]/5",
                      paper.disabled && "opacity-40"
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
                      <div className="flex items-start gap-1.5">
                        <a href={`/papers/${paper.id}`} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-[var(--primary)] flex-1">
                          <span className="line-clamp-2">{paper.title}</span>
                        </a>
                        <PaperInfoBox createdAt={paper.created_at} createdVia={paper.created_via} sources={paper.sources} />
                      </div>
                      {paper.labels && paper.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {[...paper.labels].sort((a, b) => a.name.localeCompare(b.name)).map((l) => (
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
                      {paper.paper_role && paper.paper_role !== "bibliography" && (
                        <div className="flex items-center gap-1 mt-1">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                            paper.paper_role === "reviewing" ? "bg-cyan-700 text-white" : "bg-blue-700 text-white"
                          }`}>
                            {paper.paper_role === "reviewing" ? "REVIEWING" : "MY MANUSCRIPT"}
                          </span>
                        </div>
                      )}
                      {paper.analyses && paper.analyses.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {paper.analyses.map((a) => {
                            // Only the Extended Abstract is shareable with tutors.
                            // Quick, Deep and Summary are local-only working notes —
                            // even if the legacy DB flag still says zotero_synced,
                            // we never show ✓Z for them.
                            const shareable = a.mode === "extended";
                            return (
                              <span
                                key={a.mode}
                                className={`text-[9px] px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-0.5 ${
                                  a.mode === "deep" ? "bg-purple-700 text-white" : a.mode === "summary" ? "bg-amber-600 text-white" : a.mode === "extended" ? "bg-red-700 text-white" : "bg-blue-700 text-white"
                                }`}
                              >
                                {a.mode === "extended" ? "EXT.ABS" : (a.mode || "quick").toUpperCase()}
                                {shareable && a.zotero_synced && <span title="Synced to Zotero">✓Z</span>}
                              </span>
                            );
                          })}
                          {/* Review circle: R inside a colored circle reflecting the EXT.ABS review outcome. */}
                          {(() => {
                            const ext = paper.analyses.find(a => a.mode === "extended");
                            if (!ext) return null;
                            const s = ext.validation_status;
                            const score = ext.validation_score;
                            const bg = !s
                              ? "bg-white text-gray-800 border-gray-400"
                              : s === "validated"
                              ? "bg-emerald-500 text-white border-emerald-700"
                              : s === "needs_revision"
                              ? "bg-orange-500 text-white border-orange-700"
                              : "bg-red-600 text-white border-red-800";
                            const title = !s
                              ? "EXT.ABS not yet reviewed"
                              : `EXT.ABS review: ${s}${score ? ` · score ${score}/5` : ""}`;
                            return (
                              <span
                                className={`inline-flex items-center justify-center w-4 h-4 rounded-full border-2 text-[10px] font-black leading-none ${bg}`}
                                title={title}
                              >
                                R
                              </span>
                            );
                          })()}
                          {/* Tutor check circle: T inside a colored circle reflecting the tutor-check decision */}
                          {(() => {
                            const c = paper.tutor_check;
                            const bg = !c
                              ? "bg-white text-gray-800 border-gray-400"
                              : c === "ok"
                              ? "bg-emerald-500 text-white border-emerald-700"
                              : c === "review"
                              ? "bg-amber-500 text-white border-amber-700"
                              : "bg-red-600 text-white border-red-800";
                            const title = !c
                              ? "Tutor check: not yet set"
                              : c === "ok"
                              ? "Tutor check: ✓ OK (share with tutor)"
                              : c === "review"
                              ? "Tutor check: ? Review before sharing"
                              : "Tutor check: ✗ Do not share";
                            return (
                              <span
                                className={`inline-flex items-center justify-center w-4 h-4 rounded-full border-2 text-[10px] font-black leading-none ${bg}`}
                                title={title}
                              >
                                T
                              </span>
                            );
                          })()}
                          {/* Quality circle: Q inside a colored circle reflecting the paper-quality grade */}
                          {(() => {
                            const g = paper.quality_grade;
                            const bg = !g
                              ? "bg-white text-gray-800 border-gray-400"
                              : g === "excellent" || g === "good"
                              ? "bg-emerald-500 text-white border-emerald-700"
                              : g === "adequate" || g === "weak"
                              ? "bg-orange-500 text-white border-orange-700"
                              : "bg-red-600 text-white border-red-800";
                            const title = !g
                              ? "Paper Quality not yet assessed — click to start"
                              : `Paper Quality: ${g}`;
                            return (
                              <Link
                                href={`/paper-quality/${paper.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className={`inline-flex items-center justify-center w-4 h-4 rounded-full border-2 text-[10px] font-black leading-none ${bg} hover:opacity-80`}
                                title={title}
                              >
                                Q
                              </Link>
                            );
                          })()}
                        </div>
                      )}
                      {(paper.rating || paper.on_zotero || paper.has_note || paper.disabled) && (
                        <div className="flex items-center gap-1 mt-1">
                          {paper.rating && paper.rating > 0 && (
                            <span className="text-[10px] text-amber-400" title={`Rating: ${paper.rating}/5`}>
                              {"★".repeat(paper.rating)}{"☆".repeat(5 - paper.rating)}
                            </span>
                          )}
                          {paper.on_zotero && paper.zotero_key && (
                            <a
                              href={`zotero://select/library/items/${paper.zotero_key}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-700 text-white hover:bg-cyan-600"
                              title="Open in Zotero desktop"
                            >
                              ZOTERO ↗
                            </a>
                          )}
                          {paper.on_zotero && !paper.zotero_key && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-700 text-white" title="On Zotero">
                              ZOTERO
                            </span>
                          )}
                          {paper.has_note && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-700 text-white" title="Has note">
                              NOTE
                            </span>
                          )}
                          {paper.disabled && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-800 text-white" title="Paper disabled">
                              DISABLED
                            </span>
                          )}
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
                    <td className="px-4 py-3 text-xs text-[var(--muted-foreground)] hidden sm:table-cell">
                      {formatDate(paper.publication_date)}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
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
                    <td className="px-4 py-3 text-xs text-[var(--muted-foreground)] capitalize hidden lg:table-cell">
                      {paper.paper_type.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-center text-xs hidden sm:table-cell">{paper.citation_count}</td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
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
