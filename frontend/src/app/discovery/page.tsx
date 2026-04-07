"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { api, authFetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SOURCE_LABELS, SOURCE_COLORS, formatDate, cn } from "@/lib/utils";
import type { SourceInfo, FetchLogEntry, Paper } from "@/lib/types";
import { usePapers } from "@/hooks/usePapers";

export default function DiscoveryPage() {
  const { data: sources, isLoading } = useSWR<SourceInfo[]>("/api/v1/sources", authFetcher);
  const { data: status } = useSWR("/api/v1/discovery/status", authFetcher, { refreshInterval: 3000 });
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const { data: logs } = useSWR<FetchLogEntry[]>(
    selectedSource ? `/api/v1/sources/${selectedSource}/logs?limit=20` : null,
    authFetcher
  );
  const [triggering, setTriggering] = useState(false);

  const triggerDiscovery = useCallback(async (source?: string) => {
    setTriggering(true);
    try {
      const params: Record<string, string> = { max_per_source: "20" };
      if (source) params.source = source;
      await api.triggerDiscovery(params);
    } catch (e) {
      console.error("Trigger failed:", e);
    }
    setTimeout(() => {
      setTriggering(false);
      mutate("/api/v1/sources");
      mutate("/api/v1/discovery/status");
    }, 2000);
  }, []);

  const isRunning = status?.running || triggering;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Discovery</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Monitor and trigger paper discovery across all sources
          </p>
        </div>
        <button
          onClick={() => triggerDiscovery()}
          disabled={isRunning}
          className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
        >
          {isRunning ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Running...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run Discovery (All)
            </>
          )}
        </button>
      </div>

      {/* Status Banner */}
      {isRunning && (
        <div className="rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/30 p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-[var(--primary)] animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-[var(--primary)]">
            Discovery is running in background. New papers will appear automatically.
          </span>
        </div>
      )}

      {/* Smart Search */}
      <SmartSearchSection />

      {/* Recent Searches */}
      <RecentSearches />

      {/* Source Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-40 bg-[var(--muted)] rounded-xl animate-pulse" />
            ))
          : (sources || []).map((src: SourceInfo) => (
              <div
                key={src.name}
                className={`rounded-xl bg-[var(--card)] border transition-colors cursor-pointer ${
                  selectedSource === src.name
                    ? "border-[var(--primary)]"
                    : "border-[var(--border)] hover:border-[var(--border)]/80"
                } p-5`}
                onClick={() => setSelectedSource(selectedSource === src.name ? null : src.name)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: SOURCE_COLORS[src.name] || "#6b7280" }}
                    />
                    <h3 className="font-medium">{SOURCE_LABELS[src.name] || src.name}</h3>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerDiscovery(src.name);
                    }}
                    disabled={isRunning}
                    className="text-xs px-2 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--border)] disabled:opacity-50 transition-colors"
                  >
                    Fetch
                  </button>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-[var(--muted-foreground)]">Papers</dt>
                    <dd className="font-semibold text-lg">{src.paper_count}</dd>
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

      {/* Fetch Logs + Recent Papers for selected source */}
      {selectedSource && (
        <>
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: SOURCE_COLORS[selectedSource] || "#6b7280" }}
              />
              {SOURCE_LABELS[selectedSource] || selectedSource} — Fetch History
            </h3>

            {!logs || logs.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">No fetch history yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left text-xs text-[var(--muted-foreground)] px-3 py-2">Topic</th>
                      <th className="text-left text-xs text-[var(--muted-foreground)] px-3 py-2">Started</th>
                      <th className="text-center text-xs text-[var(--muted-foreground)] px-3 py-2">Found</th>
                      <th className="text-center text-xs text-[var(--muted-foreground)] px-3 py-2">New</th>
                      <th className="text-center text-xs text-[var(--muted-foreground)] px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log: FetchLogEntry) => (
                      <tr key={log.id} className="border-b border-[var(--border)]/50">
                        <td className="px-3 py-2">{log.query_topic}</td>
                        <td className="px-3 py-2 text-[var(--muted-foreground)]">
                          {formatDate(log.started_at)}
                        </td>
                        <td className="px-3 py-2 text-center">{log.papers_found}</td>
                        <td className="px-3 py-2 text-center font-medium text-[var(--primary)]">
                          {log.papers_new}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              log.status === "success"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : log.status === "failed"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Papers from this source */}
          <SourcePapers sourceName={selectedSource} />
        </>
      )}
    </div>
  );
}

// --- Recent Searches ---

interface RecentJob {
  job_id: number;
  status: string;
  keywords: string[];
  total_found: number;
  already_in_db: number;
  created_at: string | null;
  completed_at: string | null;
}

function RecentSearches() {
  const { isAdmin } = useAuth();
  const { data: jobs, mutate: mutateJobs } = useSWR<RecentJob[]>(
    isAdmin ? "/api/v1/smart-search/recent" : null,
    authFetcher,
    { refreshInterval: 3000 }
  );

  const hasActive = (jobs || []).some((j) => j.status === "pending" || j.status === "running");
  const [open, setOpen] = useState(false);

  // Auto-open when there's an active job
  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  if (!isAdmin || !jobs || jobs.length === 0) return null;

  const resumeJob = async (jobId: number) => {
    try {
      await api.smartSearchResume(jobId);
      await mutateJobs();
    } catch (e) {
      console.error("Resume failed:", e);
    }
  };

  const deleteJob = async (jobId: number) => {
    try {
      await api.smartSearchDelete(jobId);
      await mutateJobs();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  const viewJob = (job: RecentJob) => {
    // Scroll to top and set the job in localStorage for SmartSearch to pick up
    localStorage.setItem("smart-search-job-id", String(job.job_id));
    localStorage.setItem("smart-search-keywords", job.keywords.join(", "));
    // Soft reload by navigating to same page
    window.location.href = "/discovery";
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "done": return <span className="text-emerald-400">&#10003;</span>;
      case "failed": return <span className="text-red-400">&#10007;</span>;
      case "running": return (
        <svg className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      );
      default: return <span className="text-amber-400">&#9679;</span>;
    }
  };

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <h3 className="font-medium flex items-center gap-2 text-sm">
          Recent Searches
          {hasActive && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)]/20 text-[var(--primary)] animate-pulse">
              active
            </span>
          )}
          <span className="text-xs text-[var(--muted-foreground)]">({jobs.length})</span>
        </h3>
        <svg
          className={cn("w-4 h-4 text-[var(--muted-foreground)] transition-transform", open && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-6 pb-4 space-y-1">
          {jobs.map((job) => (
            <div
              key={job.job_id}
              className="flex items-center justify-between p-3 rounded-lg bg-[var(--secondary)]"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {statusIcon(job.status)}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {(job as any).mode && (job as any).mode !== "keywords" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] mr-1.5 font-normal">
                        {(job as any).mode}
                      </span>
                    )}
                    {job.keywords.join(", ")}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)] flex-wrap">
                    {(job as any).sources && (
                      <span>
                        {((job as any).sources as string[]).map((s: string) => SOURCE_LABELS[s] || s).join(", ")}
                      </span>
                    )}
                    {job.status === "done" && <span>&middot; {job.total_found} found ({job.total_found - job.already_in_db} new)</span>}
                    {job.status === "running" && job.created_at && (
                      <span className="flex items-center gap-1">
                        <ElapsedTimer startTime={new Date(job.created_at).getTime()} />
                      </span>
                    )}
                    {job.created_at && <span>&middot; {formatDate(job.created_at)}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 ml-3 shrink-0">
                {job.status === "done" && (
                  <button
                    onClick={() => viewJob(job)}
                    className="text-[10px] px-2 py-1 rounded bg-[var(--primary)]/15 text-[var(--primary)] hover:bg-[var(--primary)]/25 transition-colors"
                  >
                    View
                  </button>
                )}
                {(job.status === "pending" || job.status === "failed") && (
                  <button
                    onClick={() => resumeJob(job.job_id)}
                    className="text-[10px] px-2 py-1 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
                  >
                    {job.status === "failed" ? "Retry" : "Resume"}
                  </button>
                )}
                {job.status !== "running" && (
                  <button
                    onClick={() => deleteJob(job.job_id)}
                    className="text-[10px] px-2 py-1 rounded hover:bg-red-500/15 text-[var(--muted-foreground)] hover:text-red-400 transition-colors"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// --- Elapsed Timer ---
function ElapsedTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return <span className="font-mono">{mins}:{secs.toString().padStart(2, "0")}</span>;
}

// --- Smart Search Component ---

const ALL_SOURCES = ["pubmed", "arxiv", "biorxiv", "semantic_scholar", "ieee"];

interface SmartResult {
  title: string;
  abstract: string | null;
  doi: string | null;
  source: string;
  authors: string[];
  publication_date: string | null;
  journal: string | null;
  paper_type: string;
  open_access: boolean;
  pdf_url: string | null;
  citation_count: number;
  keywords: string[];
  external_ids: Record<string, string>;
  already_in_db: boolean;
  db_paper_id: number | null;
}

function SmartSearchSection() {
  const { isAdmin } = useAuth();

  // Restore state from localStorage on mount
  const [keywords, setKeywords] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("smart-search-keywords") || "";
  });
  const [selectedSources, setSelectedSources] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set(["pubmed", "arxiv", "biorxiv"]);
    const saved = localStorage.getItem("smart-search-sources");
    return saved ? new Set(JSON.parse(saved)) : new Set(["pubmed", "arxiv", "biorxiv"]);
  });
  const [maxPerSource, setMaxPerSource] = useState(10);
  const [searchMode, setSearchMode] = useState<string>(() => {
    if (typeof window === "undefined") return "keywords";
    return localStorage.getItem("smart-search-mode") || "keywords";
  });
  const [jobId, setJobId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("smart-search-job-id");
    return saved ? Number(saved) : null;
  });
  const [results, setResults] = useState<SmartResult[] | null>(null);
  const [queriesUsed, setQueriesUsed] = useState<Record<string, string>>({});
  const [selectedPapers, setSelectedPapers] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [savingTopic, setSavingTopic] = useState(false);

  // Poll for job status when a job is active
  const { data: jobStatus, error: jobError } = useSWR(
    jobId ? `/api/v1/smart-search/status/${jobId}` : null,
    authFetcher,
    {
      refreshInterval: jobId && !results ? 2000 : 0,
      shouldRetryOnError: false,
    }
  );

  // Job not found (deleted or expired) — clear state
  if (jobError && jobId) {
    setJobId(null);
    localStorage.removeItem("smart-search-job-id");
  }

  // When job completes, load results
  if (jobStatus?.status === "done" && jobStatus.results && !results) {
    setResults(jobStatus.results);
    setQueriesUsed(jobStatus.queries_used || {});
  }
  if (jobStatus?.status === "failed" && !message) {
    setMessage({ type: "error", text: jobStatus.error_message || "Search failed" });
    setJobId(null);
    localStorage.removeItem("smart-search-job-id");
  }

  if (!isAdmin) return null;

  const searching = jobId !== null && !results;

  const toggleSource = (src: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  const doSearch = async () => {
    const kws = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    if (!kws.length) return;

    setResults(null);
    setMessage(null);
    setSelectedPapers(new Set());
    setQueriesUsed({});

    // Persist search state
    localStorage.setItem("smart-search-keywords", keywords);
    localStorage.setItem("smart-search-sources", JSON.stringify(Array.from(selectedSources)));
    localStorage.setItem("smart-search-mode", searchMode);
    localStorage.setItem("smart-search-start", String(Date.now()));

    try {
      const res = await api.smartSearch({
        keywords: kws,
        sources: Array.from(selectedSources),
        max_per_source: maxPerSource,
        mode: searchMode,
      });
      setJobId(res.job_id);
      localStorage.setItem("smart-search-job-id", String(res.job_id));
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Search failed" });
    }
  };

  const togglePaper = (idx: number) => {
    setSelectedPapers((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAllNew = () => {
    if (!results) return;
    const newIdxs = results.map((r, i) => (!r.already_in_db ? i : -1)).filter((i) => i >= 0);
    const allSelected = newIdxs.every((i) => selectedPapers.has(i));
    setSelectedPapers((prev) => {
      const next = new Set(prev);
      newIdxs.forEach((i) => (allSelected ? next.delete(i) : next.add(i)));
      return next;
    });
  };

  const savePapers = async () => {
    if (!results || selectedPapers.size === 0 || !jobId) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await api.smartSave(jobId, Array.from(selectedPapers));
      setMessage({
        type: "success",
        text: `${res.saved} paper salvati nel DB${res.skipped ? ` (${res.skipped} già presenti)` : ""}`,
      });
      setSelectedPapers(new Set());
      const savedIds = res.saved_ids || {};
      setResults((prev) =>
        prev?.map((r, i) =>
          selectedPapers.has(i)
            ? { ...r, already_in_db: true, db_paper_id: savedIds[String(i)] || r.db_paper_id }
            : r
        ) || null
      );
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Save failed" });
    }
    setSaving(false);
  };

  const saveAsTopic = async () => {
    if (!topicName.trim()) return;
    setSavingTopic(true);
    const kws = keywords.split(",").map((k) => k.trim()).filter(Boolean);

    try {
      await api.smartSaveAsTopic({ name: topicName, keywords: kws });
      setMessage({ type: "success", text: `Topic "${topicName}" creato per future discovery` });
      setShowTopicForm(false);
      setTopicName("");
      mutate("/api/v1/topics");
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to create topic" });
    }
    setSavingTopic(false);
  };

  const newSearch = () => {
    setJobId(null);
    setResults(null);
    setSelectedPapers(new Set());
    setMessage(null);
    setQueriesUsed({});
    setKeywords("");
    localStorage.removeItem("smart-search-job-id");
    localStorage.removeItem("smart-search-keywords");
    localStorage.removeItem("smart-search-mode");
    localStorage.removeItem("smart-search-start");
    setSearchMode("keywords");
  };

  const [showInfo, setShowInfo] = useState(false);
  const newCount = results?.filter((r) => !r.already_in_db).length || 0;
  const dbCount = results?.filter((r) => r.already_in_db).length || 0;

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      <h3 className="font-medium mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Smart Search
        {/* Info button */}
        <div className="relative">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="w-5 h-5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--border)] flex items-center justify-center text-xs font-semibold transition-colors"
          >
            i
          </button>
          {showInfo && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowInfo(false)} />
              <div className="absolute left-0 top-8 z-50 w-80 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-xl p-4 space-y-3 text-xs">
                <p className="font-medium text-sm text-[var(--foreground)]">Search Rules</p>
                <div className="space-y-2 text-[var(--secondary-foreground)]">
                  <p><strong>Keywords separated by comma</strong> — each keyword is combined with AND logic across all sources.</p>
                  <p>Example: <code className="bg-[var(--muted)] px-1 py-0.5 rounded">federated learning, blockchain</code> searches papers containing <em>both</em> terms.</p>
                  <p>For OR logic, write terms as a single keyword: <code className="bg-[var(--muted)] px-1 py-0.5 rounded">OMOP OHDSI</code></p>
                  <div className="pt-2 border-t border-[var(--border)]">
                    <p className="font-medium text-[var(--foreground)] mb-1">Auto-generated queries per source:</p>
                    <ul className="space-y-1 text-[10px] font-mono">
                      <li><span style={{color: SOURCE_COLORS.pubmed}}>PubMed</span>: "kw1"[Title/Abstract] AND "kw2"[...]</li>
                      <li><span style={{color: SOURCE_COLORS.arxiv}}>arXiv</span>: (ti:"kw1" OR abs:"kw1") AND ...</li>
                      <li><span style={{color: SOURCE_COLORS.biorxiv}}>bioRxiv</span>: plain text (local keyword filter)</li>
                      <li><span style={{color: SOURCE_COLORS.semantic_scholar}}>S. Scholar</span>: full text search</li>
                      <li><span style={{color: SOURCE_COLORS.ieee}}>IEEE</span>: "kw1" AND "kw2"</li>
                    </ul>
                  </div>
                  <div className="pt-2 border-t border-[var(--border)]">
                    <p className="font-medium text-[var(--foreground)] mb-1">Tips:</p>
                    <ul className="space-y-0.5">
                      <li>2-3 keywords give the best balance</li>
                      <li>4+ keywords may be too restrictive</li>
                      <li>Use "Save as Topic" to reuse this search in scheduled Discovery</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </h3>

      {/* Search form */}
      <div className="space-y-3">
        {/* Mode selector */}
        <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--secondary)] w-fit">
          {([
            { key: "keywords", label: "Keywords" },
            { key: "title", label: "Title" },
            { key: "author", label: "Author" },
            { key: "doi", label: "DOI" },
          ] as const).map((m) => (
            <button
              key={m.key}
              onClick={() => setSearchMode(m.key)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                searchMode === m.key
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder={
              searchMode === "keywords" ? "Keywords separated by comma (e.g. federated learning, blockchain)" :
              searchMode === "title" ? "Paper title or partial title" :
              searchMode === "author" ? "Author name (e.g. Smith, John)" :
              "DOI (e.g. 10.1234/example)"
            }
            className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
          />
          <button
            onClick={doSearch}
            disabled={searching || !keywords.trim()}
            className="px-5 py-2.5 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2 shrink-0"
          >
            {searching ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Searching...
              </>
            ) : (
              "Search"
            )}
          </button>
        </div>

        {/* Sources + max */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--muted-foreground)]">Sources:</span>
            {ALL_SOURCES.map((src) => {
              const unsupported: Record<string, string[]> = {
                title: ["biorxiv"],
                author: ["biorxiv"],
                doi: ["biorxiv", "arxiv", "ieee"],
              };
              const disabled = (unsupported[searchMode] || []).includes(src);
              return (
                <label key={src} className={cn("flex items-center gap-1.5", disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer")}>
                  <input
                    type="checkbox"
                    checked={!disabled && selectedSources.has(src)}
                    onChange={() => !disabled && toggleSource(src)}
                    disabled={disabled}
                    className="rounded accent-[var(--primary)]"
                  />
                  <span className="text-xs" style={{ color: SOURCE_COLORS[src] || "#6b7280" }}>
                    {SOURCE_LABELS[src] || src}
                  </span>
                  {disabled && <span className="text-[9px] text-[var(--muted-foreground)]">(n/a)</span>}
                </label>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted-foreground)]">Max per source:</span>
            <select
              value={maxPerSource}
              onChange={(e) => setMaxPerSource(Number(e.target.value))}
              className="px-2 py-1 rounded bg-[var(--secondary)] border border-[var(--border)] text-xs"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={cn(
          "mt-4 px-4 py-2.5 rounded-lg text-sm",
          message.type === "success"
            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
            : "bg-red-500/10 border border-red-500/20 text-red-400"
        )}>
          {message.text}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="mt-5 space-y-3">
          {/* Results header */}
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{results.length} papers</span>
              <span className="text-[var(--muted-foreground)]">
                {" "}({newCount} new, {dbCount} already in DB)
              </span>
            </div>
            <div className="flex gap-2">
              {newCount > 0 && (
                <button
                  onClick={selectAllNew}
                  className="text-xs px-2.5 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--border)] transition-colors"
                >
                  Select all new
                </button>
              )}
            </div>
          </div>

          {/* Results list */}
          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {results.map((r, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg transition-colors",
                  r.already_in_db
                    ? "opacity-70"
                    : selectedPapers.has(i)
                    ? "bg-[var(--primary)]/5"
                    : "hover:bg-[var(--secondary)]"
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedPapers.has(i)}
                  onChange={() => togglePaper(i)}
                  disabled={r.already_in_db}
                  className="mt-1 rounded accent-[var(--primary)]"
                />
                <div className="flex-1 min-w-0">
                  {r.already_in_db && r.db_paper_id ? (
                    <Link href={`/papers/${r.db_paper_id}`} className="text-sm hover:text-[var(--primary)] line-clamp-2">
                      {r.title}
                    </Link>
                  ) : r.doi ? (
                    <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-[var(--primary)] line-clamp-2">
                      {r.title}
                    </a>
                  ) : r.external_ids?.arxiv_id ? (
                    <a href={`https://arxiv.org/abs/${r.external_ids.arxiv_id}`} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-[var(--primary)] line-clamp-2">
                      {r.title}
                    </a>
                  ) : r.external_ids?.s2_id ? (
                    <a href={`https://www.semanticscholar.org/paper/${r.external_ids.s2_id}`} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-[var(--primary)] line-clamp-2">
                      {r.title}
                    </a>
                  ) : r.external_ids?.pmid ? (
                    <a href={`https://pubmed.ncbi.nlm.nih.gov/${r.external_ids.pmid}`} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-[var(--primary)] line-clamp-2">
                      {r.title}
                    </a>
                  ) : (
                    <p className="text-sm line-clamp-2">{r.title}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${SOURCE_COLORS[r.source] || "#6b7280"}20`,
                        color: SOURCE_COLORS[r.source] || "#6b7280",
                      }}
                    >
                      {SOURCE_LABELS[r.source] || r.source}
                    </span>
                    {r.publication_date && (
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {formatDate(r.publication_date)}
                      </span>
                    )}
                    {r.authors.length > 0 && (
                      <span className="text-[10px] text-[var(--muted-foreground)] truncate max-w-48">
                        {r.authors.slice(0, 3).join(", ")}{r.authors.length > 3 ? " et al." : ""}
                      </span>
                    )}
                    {r.already_in_db && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-900 text-sky-100 font-semibold">
                        already in DB
                      </span>
                    )}
                    {r.open_access && !r.already_in_db && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">OA</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action bar */}
          {(selectedPapers.size > 0 || results.length > 0) && (
            <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
              <div className="flex gap-2">
                {selectedPapers.size > 0 && (
                  <button
                    onClick={savePapers}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : `Save ${selectedPapers.size} to DB`}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {!showTopicForm ? (
                  <button
                    onClick={() => {
                      setShowTopicForm(true);
                      setTopicName(keywords.split(",").map((k) => k.trim()).filter(Boolean).join(" + "));
                    }}
                    className="px-3 py-2 rounded-lg bg-[var(--secondary)] text-sm hover:bg-[var(--border)] transition-colors"
                  >
                    Save as Topic
                  </button>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={topicName}
                      onChange={(e) => setTopicName(e.target.value)}
                      placeholder="Topic name"
                      className="px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] w-48"
                    />
                    <button
                      onClick={saveAsTopic}
                      disabled={savingTopic || !topicName.trim()}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {savingTopic ? "..." : "Create"}
                    </button>
                    <button
                      onClick={() => setShowTopicForm(false)}
                      className="px-2 py-2 rounded-lg text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Queries used (collapsible) */}
          {Object.keys(queriesUsed).length > 0 && (
            <details className="text-xs text-[var(--muted-foreground)]">
              <summary className="cursor-pointer hover:text-[var(--foreground)]">
                View generated queries
              </summary>
              <div className="mt-2 space-y-1 p-3 rounded-lg bg-[var(--secondary)] font-mono">
                {Object.entries(queriesUsed).map(([src, q]) => (
                  <div key={src}>
                    <span style={{ color: SOURCE_COLORS[src] || "#6b7280" }}>{src}:</span>{" "}
                    <span className="text-[var(--foreground)]">{q}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* New Search button */}
          <div className="pt-2">
            <button
              onClick={newSearch}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Clear results &amp; new search
            </button>
          </div>
        </div>
      )}

      {/* Searching banner with timer */}
      {searching && (() => {
        const startStr = typeof window !== "undefined" ? localStorage.getItem("smart-search-start") : null;
        const startTime = startStr ? Number(startStr) : Date.now();
        return (
          <div className="mt-4 px-4 py-3 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4 animate-spin text-[var(--primary)]" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-[var(--primary)]">
                Searching across {selectedSources.size} sources... You can navigate away, results will be here when you return.
              </span>
            </div>
            <span className="text-sm text-[var(--primary)] tabular-nums">
              <ElapsedTimer startTime={startTime} />
            </span>
          </div>
        );
      })()}
    </div>
  );
}


function SourcePapers({ sourceName }: { sourceName: string }) {
  const { data, isLoading } = usePapers({
    source: sourceName,
    per_page: "10",
    sort_by: "created_at",
    sort_order: "desc",
  });

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      <h3 className="font-medium mb-4 flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: SOURCE_COLORS[sourceName] || "#6b7280" }}
        />
        {SOURCE_LABELS[sourceName] || sourceName} — Recent Papers
        {data && (
          <span className="text-xs text-[var(--muted-foreground)] ml-1">
            ({data.total} total)
          </span>
        )}
      </h3>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-[var(--muted)] rounded animate-pulse" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <p className="text-sm text-[var(--muted-foreground)]">No papers from this source yet</p>
      ) : (
        <div className="space-y-1">
          {data.items.map((paper: Paper) => (
            <Link
              key={paper.id}
              href={`/papers/${paper.id}`}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--secondary)] transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm group-hover:text-[var(--primary)] transition-colors line-clamp-1">
                  {paper.title}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {formatDate(paper.publication_date)}
                  </span>
                  {paper.doi && (
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      DOI: {paper.doi}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                {paper.has_pdf && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">PDF</span>
                )}
                {paper.open_access && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">OA</span>
                )}
                <svg className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}

      {data && data.total > 10 && (
        <Link
          href={`/papers?source=${sourceName}`}
          className="block text-center text-xs text-[var(--primary)] hover:underline mt-4 pt-3 border-t border-[var(--border)]"
        >
          View all {data.total} papers from {SOURCE_LABELS[sourceName] || sourceName}
        </Link>
      )}
    </div>
  );
}
