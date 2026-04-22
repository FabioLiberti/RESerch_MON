"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { api, authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import { useAuth } from "@/lib/auth";
import { SOURCE_LABELS, SOURCE_COLORS, formatDate, cn } from "@/lib/utils";
import type { SourceInfo, FetchLogEntry, Paper } from "@/lib/types";
import { usePapers } from "@/hooks/usePapers";
import { EXTERNAL_DOCUMENT_TYPES } from "@/lib/paperTypes";

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

      {/* Import Bibliography */}
      <ImportBibliography />

      {/* Add External Document (grey literature) */}
      <AddExternalDocument />

      {/* Recent Searches */}
      <RecentSearches />

      {/* Source Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-40 bg-[var(--muted)] rounded-xl animate-pulse" />
            ))
          : [...(sources || [])].sort((a: SourceInfo, b: SourceInfo) => a.name.localeCompare(b.name)).map((src: SourceInfo) => (
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

// --- Import Bibliography ---

interface BibResult {
  doi: string;
  title: string | null;
  authors: string[];
  year: number | null;
  journal: string | null;
  abstract: string | null;
  status: "found" | "not_found" | "already_in_db" | "error";
  db_paper_id: number | null;
  external_ids: Record<string, string>;
  keywords: string[];
  pdf_url: string | null;
  open_access: boolean;
  citation_count: number;
  publication_date: string | null;
  paper_type: string;
  source: string;
}

function ImportBibliography() {
  const { isAdmin } = useAuth();
  const [bibText, setBibText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState<BibResult[] | null>(null);
  const [stats, setStats] = useState<{ total_dois: number; resolved: number; not_found: number; already_in_db: number } | null>(null);
  const [selectedPapers, setSelectedPapers] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [extractStartTime, setExtractStartTime] = useState<number | null>(null);
  const [selectedLabelId, setSelectedLabelId] = useState<number | undefined>(undefined);
  const { data: allLabels } = useSWR<{ id: number; name: string; color: string }[]>(
    "/api/v1/labels", authFetcher
  );

  if (!isAdmin) return null;

  const doExtract = async () => {
    if (!bibText.trim()) return;
    setExtracting(true);
    setExtractStartTime(Date.now());
    setResults(null);
    setStats(null);
    setMessage(null);
    setSelectedPapers(new Set());

    try {
      const res = await api.bibliographyExtract(bibText);
      setResults(res.results);
      setStats({ total_dois: res.total_dois, resolved: res.resolved, not_found: res.not_found, already_in_db: res.already_in_db });
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Extraction failed" });
    }
    setExtracting(false);
    setExtractStartTime(null);
  };

  const togglePaper = (idx: number) => {
    setSelectedPapers((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAll = () => {
    if (!results) return;
    const selectableIdxs = results.map((r, i) => i).filter((i) => i >= 0);
    const allSelected = selectableIdxs.every((i) => selectedPapers.has(i));
    setSelectedPapers((prev) => {
      const next = new Set(prev);
      selectableIdxs.forEach((i) => (allSelected ? next.delete(i) : next.add(i)));
      return next;
    });
  };

  const savePapers = async () => {
    if (!results || selectedPapers.size === 0) return;
    setSaving(true);
    setMessage(null);
    const toSave = Array.from(selectedPapers).map((i) => results[i]);
    try {
      const res = await api.bibliographySave(toSave, selectedLabelId);
      const parts = [];
      if (res.saved) parts.push(`${res.saved} paper salvati`);
      if (res.labeled) parts.push(`${res.labeled} label assegnate`);
      if (res.skipped) parts.push(`${res.skipped} skipped`);
      setMessage({ type: "success", text: parts.join(", ") });
      setSelectedPapers(new Set());
      setResults((prev) =>
        prev?.map((r, i) =>
          selectedPapers.has(i) && r.status === "found" ? { ...r, status: "already_in_db" as const } : r
        ) || null
      );
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Save failed" });
    }
    setSaving(false);
  };

  const clear = () => {
    setBibText("");
    setResults(null);
    setStats(null);
    setSelectedPapers(new Set());
    setMessage(null);
    setExpanded(false);
  };

  const newCount = results?.filter((r) => r.status === "found").length || 0;

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <h3 className="font-medium flex items-center gap-2 text-sm">
          <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          Import Bibliography
          {results && (
            <span className="text-xs text-[var(--muted-foreground)]">
              ({stats?.total_dois} DOIs, {newCount} new)
            </span>
          )}
        </h3>
        <svg
          className={cn("w-4 h-4 text-[var(--muted-foreground)] transition-transform", expanded && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Textarea */}
          <div>
            <p className="text-xs text-[var(--muted-foreground)] mb-2">
              Paste a bibliography (Harvard, APA, or any format with DOIs). The system will extract DOIs and resolve each paper via Semantic Scholar.
            </p>
            <textarea
              value={bibText}
              onChange={(e) => setBibText(e.target.value)}
              placeholder="Paste bibliography here..."
              className="w-full px-4 py-3 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] resize-none h-32 font-mono"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={doExtract}
              disabled={extracting || !bibText.trim()}
              className="px-5 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {extracting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Extracting & Resolving...
                  {extractStartTime && (
                    <span className="tabular-nums ml-1">
                      <ElapsedTimer startTime={extractStartTime} />
                    </span>
                  )}
                </>
              ) : (
                "Extract & Search"
              )}
            </button>
            {results && (
              <button
                onClick={clear}
                className="px-3 py-2 rounded-lg text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]"
              >
                Clear
              </button>
            )}
          </div>

          {/* Message */}
          {message && (
            <div className={cn(
              "px-4 py-2.5 rounded-lg text-sm",
              message.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border border-red-500/20 text-red-400"
            )}>
              {message.text}
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="flex gap-4 text-sm">
              <span><strong>{stats.total_dois}</strong> DOIs found</span>
              <span className="text-emerald-400"><strong>{stats.resolved}</strong> resolved</span>
              <span className="text-[var(--muted-foreground)]"><strong>{stats.already_in_db}</strong> DB</span>
              {stats.not_found > 0 && (
                <span className="text-red-400"><strong>{stats.not_found}</strong> not found</span>
              )}
            </div>
          )}

          {/* Results */}
          {results && results.length > 0 && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs px-2.5 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--border)] transition-colors"
                >
                  Select all
                </button>
              </div>

              <div className="space-y-1 max-h-[400px] overflow-y-auto overflow-x-hidden">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg transition-colors overflow-hidden",
                      r.status === "already_in_db" ? "opacity-70" :
                      r.status === "not_found" || r.status === "error" ? "opacity-50" :
                      selectedPapers.has(i) ? "bg-[var(--primary)]/5" :
                      "hover:bg-[var(--secondary)]"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPapers.has(i)}
                      onChange={() => togglePaper(i)}
                      className="mt-1 rounded accent-[var(--primary)]"
                    />
                    <div className="flex-1 min-w-0">
                      {r.status === "already_in_db" && r.db_paper_id ? (
                        <a href={`/papers/${r.db_paper_id}`} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-[var(--primary)] line-clamp-2">
                          {r.title || r.doi}
                        </a>
                      ) : r.title ? (
                        <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-[var(--primary)] line-clamp-2">
                          {r.title}
                        </a>
                      ) : (
                        <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]">
                          {r.doi}
                        </a>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-[var(--muted-foreground)] font-mono">{r.doi}</span>
                        {r.authors.length > 0 && (
                          <span className="text-[10px] text-[var(--muted-foreground)] truncate max-w-48">
                            {r.authors.slice(0, 3).join(", ")}{r.authors.length > 3 ? " et al." : ""}
                          </span>
                        )}
                        {r.status === "already_in_db" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-900 text-sky-100 font-semibold">DB</span>
                        )}
                        {r.status === "not_found" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900 text-red-100 font-semibold">not found in S2</span>
                        )}
                        {r.status === "error" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900 text-red-100 font-semibold">error</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Save bar with label selector */}
              {selectedPapers.size > 0 && (
                <BibSaveBar
                  count={selectedPapers.size}
                  saving={saving}
                  onSave={savePapers}
                  allLabels={allLabels || []}
                  selectedLabelId={selectedLabelId}
                  onLabelChange={setSelectedLabelId}
                  selectedPaperIds={
                    results
                      ? Array.from(selectedPapers)
                          .map((i) => results[i]?.db_paper_id)
                          .filter((id): id is number => id !== null && id !== undefined)
                      : []
                  }
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// --- Bib Save Bar with inline label creation ---

function BibSaveBar({ count, saving, onSave, allLabels, selectedLabelId, onLabelChange, selectedPaperIds }: {
  count: number;
  saving: boolean;
  onSave: () => void;
  allLabels: { id: number; name: string; color: string }[];
  selectedLabelId: number | undefined;
  onLabelChange: (id: number | undefined) => void;
  selectedPaperIds?: number[];
}) {
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");

  const createLabel = async () => {
    if (!newName.trim()) return;
    try {
      const label = await api.createLabel({ name: newName, color: newColor });
      onLabelChange(label.id);
      setCreating(false);
      setNewName("");
      mutate("/api/v1/labels");
    } catch { }
  };

  const COLORS = ["#6366f1", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#3b82f6", "#ec4899", "#14b8a6"];

  return (
    <div className="pt-3 border-t border-[var(--border)] flex items-center gap-3 flex-wrap">
      <button
        onClick={onSave}
        disabled={saving}
        className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving..." : `Save ${count} to DB`}
      </button>
      {selectedPaperIds && selectedPaperIds.length > 0 && selectedLabelId && (
        <button
          onClick={async () => {
            setAssigning(true);
            setAssignMsg(null);
            try {
              const res = await api.batchAssignLabel(selectedPaperIds, selectedLabelId);
              setAssignMsg(`${res.assigned} label assegnate`);
            } catch { setAssignMsg("Error"); }
            setAssigning(false);
          }}
          disabled={assigning}
          className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
        >
          {assigning ? "Assigning..." : `Assign Label (${count})`}
        </button>
      )}
      {assignMsg && <span className="text-xs text-emerald-400">{assignMsg}</span>}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--muted-foreground)]">with label:</span>
        <select
          value={selectedLabelId || ""}
          onChange={(e) => onLabelChange(e.target.value ? Number(e.target.value) : undefined)}
          className="px-2 py-1.5 rounded bg-[var(--secondary)] border border-[var(--border)] text-xs"
        >
          <option value="">No label</option>
          {allLabels.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="text-xs px-2 py-1.5 rounded border border-dashed border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
          >
            + New
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createLabel()}
              placeholder="Label name"
              className="px-2 py-1 rounded bg-[var(--secondary)] border border-[var(--border)] text-xs w-28 focus:outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <div className="flex gap-0.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={cn("w-4 h-4 rounded-full", newColor === c && "ring-1 ring-offset-1 ring-white")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button
              onClick={createLabel}
              disabled={!newName.trim()}
              className="text-xs px-2 py-1 rounded bg-[var(--primary)] text-white disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              className="text-xs text-[var(--muted-foreground)]"
            >
              &times;
            </button>
          </div>
        )}
      </div>
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
  error_message?: string | null;
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
              className="flex items-center justify-between p-3 rounded-lg bg-[var(--secondary)] overflow-hidden"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                {statusIcon(job.status)}
                <div className="min-w-0 overflow-hidden">
                  <p className="text-sm font-medium line-clamp-2">
                    {(job as any).mode && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded mr-1.5 font-semibold uppercase ${
                        (job as any).mode === "keywords" ? "bg-blue-700 text-white" :
                        (job as any).mode === "title" ? "bg-purple-700 text-white" :
                        (job as any).mode === "author" ? "bg-emerald-700 text-white" :
                        (job as any).mode === "doi" ? "bg-amber-700 text-white" :
                        (job as any).mode === "bibliography" ? "bg-pink-700 text-white" :
                        "bg-gray-700 text-white"
                      }`}>
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
                    {job.status === "done" && job.total_found > 0 && <span>&middot; {job.total_found} found ({job.total_found - job.already_in_db} new)</span>}
                    {job.status === "done" && job.total_found === 0 && <span className="text-amber-400">&middot; no results</span>}
                    {job.status === "failed" && job.error_message && <span className="text-red-400">&middot; {job.error_message}</span>}
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

const ALL_SOURCES = ["arxiv", "biorxiv", "elsevier", "ieee", "iris_who", "pubmed", "semantic_scholar"];

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

/** Compute the canonical "source" URL (page where the document lives) for a result. */
function getSmartSourceUrl(r: SmartResult): string | null {
  if (r.doi) return `https://doi.org/${r.doi}`;
  if (r.external_ids?.arxiv_id) return `https://arxiv.org/abs/${r.external_ids.arxiv_id}`;
  if (r.external_ids?.s2_id) return `https://www.semanticscholar.org/paper/${r.external_ids.s2_id}`;
  if (r.external_ids?.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${r.external_ids.pmid}`;
  if (r.external_ids?.iris_url) return r.external_ids.iris_url;
  if (r.source === "iris_who" && r.pdf_url) return r.pdf_url;
  return null;
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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Filter & sort options
  const [filterYearFrom, setFilterYearFrom] = useState("");
  const [filterYearTo, setFilterYearTo] = useState("");
  const [filterMinCitations, setFilterMinCitations] = useState("");
  const [sortResults, setSortResults] = useState<"relevance" | "title" | "date" | "citations">("relevance");

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

  // When job completes, load results and clear jobId from localStorage
  if (jobStatus?.status === "done" && jobStatus.results && !results) {
    setResults(jobStatus.results);
    setQueriesUsed(jobStatus.queries_used || {});
    setIsSearching(false);
    localStorage.removeItem("smart-search-job-id");
  }
  if (jobStatus?.status === "failed" && !message) {
    setMessage({ type: "error", text: jobStatus.error_message || "Search failed" });
    setJobId(null);
    setIsSearching(false);
    localStorage.removeItem("smart-search-job-id");
  }

  if (!isAdmin) return null;

  const searching = isSearching || (jobId !== null && !results);

  // Auto-expand when searching
  useEffect(() => {
    if (searching) setSmartExpanded(true);
  }, [searching]);

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
    if (!kws.length || isSearching) return;

    setIsSearching(true);
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
      const filters: Record<string, number | boolean> = {};
      if (filterYearFrom) filters.year_from = parseInt(filterYearFrom);
      if (filterYearTo) filters.year_to = parseInt(filterYearTo);
      if (filterMinCitations) filters.min_citations = parseInt(filterMinCitations);
      const res = await api.smartSearch({
        keywords: kws,
        sources: Array.from(selectedSources),
        max_per_source: maxPerSource,
        mode: searchMode,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      });
      setJobId(res.job_id);
      localStorage.setItem("smart-search-job-id", String(res.job_id));
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Search failed" });
      setIsSearching(false);
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
    setIsSearching(false);
    setSelectedPapers(new Set());
    setMessage(null);
    setQueriesUsed({});
    setKeywords("");
    localStorage.removeItem("smart-search-job-id");
    localStorage.removeItem("smart-search-keywords");
    localStorage.removeItem("smart-search-mode");
    localStorage.removeItem("smart-search-start");
    localStorage.removeItem("smart-search-expanded");
    setSearchMode("keywords");
  };

  const [showInfo, setShowInfo] = useState(false);
  const [smartExpanded, setSmartExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    // Persist expansion state so a page refresh with existing results keeps them visible
    // (incl. the "Clear results & new search" button, which lives inside the expanded block)
    return localStorage.getItem("smart-search-expanded") === "true";
  });

  // Persist expansion state + auto-expand whenever results exist (after search completes OR
  // after SWR re-hydrates an existing job on refresh)
  useEffect(() => {
    if (results && results.length > 0) setSmartExpanded(true);
  }, [results]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("smart-search-expanded", smartExpanded ? "true" : "false");
  }, [smartExpanded]);
  // Apply filters and sorting to results
  const filteredResults = results?.filter(r => {
    if (filterYearFrom || filterYearTo) {
      const yearStr = r.publication_date?.slice(0, 4);
      if (!yearStr) return true; // keep papers without date
      const year = parseInt(yearStr);
      if (filterYearFrom && year < parseInt(filterYearFrom)) return false;
      if (filterYearTo && year > parseInt(filterYearTo)) return false;
    }
    if (filterMinCitations && (r.citation_count || 0) < parseInt(filterMinCitations)) return false;
    return true;
  }) || null;

  const sortedResults = filteredResults ? [...filteredResults].sort((a, b) => {
    if (sortResults === "title") return a.title.localeCompare(b.title);
    if (sortResults === "date") return (b.publication_date || "").localeCompare(a.publication_date || "");
    if (sortResults === "citations") return (b.citation_count || 0) - (a.citation_count || 0);
    return 0; // relevance = original order
  }) : null;

  const newCount = sortedResults?.filter((r) => !r.already_in_db).length || 0;
  const dbCount = sortedResults?.filter((r) => r.already_in_db).length || 0;

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)]">
      <button
        onClick={() => setSmartExpanded(!smartExpanded)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <h3 className="font-medium flex items-center gap-2 text-sm">
          <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Smart Search
          {searching && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)]/20 text-[var(--primary)] animate-pulse">active</span>}
          {results && <span className="text-xs text-[var(--muted-foreground)]">({results.length} results)</span>}
        </h3>
        <svg
          className={cn("w-4 h-4 text-[var(--muted-foreground)] transition-transform", smartExpanded && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {smartExpanded && <div className="px-6 pb-6">

      {/* Search form */}
      <div className="space-y-3">
        {/* Mode selector */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--secondary)] w-fit">
            {([
              { key: "keywords", label: "Keywords" },
              { key: "title", label: "Title" },
              { key: "author", label: "Author" },
              { key: "doi", label: "DOI" },
            ] as const).map((m) => (
              <button
                key={m.key}
                onClick={() => { setSearchMode(m.key); setShowSuggestions(false); }}
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
                        <li><span style={{color: SOURCE_COLORS.pubmed}}>PubMed</span>: &quot;kw1&quot;[Title/Abstract] AND &quot;kw2&quot;[...]</li>
                        <li><span style={{color: SOURCE_COLORS.arxiv}}>arXiv</span>: (ti:&quot;kw1&quot; OR abs:&quot;kw1&quot;) AND ...</li>
                        <li><span style={{color: SOURCE_COLORS.biorxiv}}>bioRxiv</span>: plain text (local keyword filter)</li>
                        <li><span style={{color: SOURCE_COLORS.semantic_scholar}}>S. Scholar</span>: full text search</li>
                        <li><span style={{color: SOURCE_COLORS.ieee}}>IEEE</span>: &quot;kw1&quot; AND &quot;kw2&quot;</li>
                      </ul>
                    </div>
                    <div className="pt-2 border-t border-[var(--border)]">
                      <p className="font-medium text-[var(--foreground)] mb-1">Server-side Filters:</p>
                      <p>Filters are applied <strong>at the source</strong> before results are returned — fewer, more precise results.</p>
                      <table className="w-full text-[10px] mt-1 border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--border)]">
                            <th className="text-left py-0.5">Filter</th>
                            <th className="text-center py-0.5">PubMed</th>
                            <th className="text-center py-0.5">arXiv</th>
                            <th className="text-center py-0.5">S2</th>
                            <th className="text-center py-0.5">IEEE</th>
                            <th className="text-center py-0.5">bioRxiv</th>
                            <th className="text-center py-0.5">Elsevier</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr><td>Year range</td><td className="text-center text-emerald-400">✓</td><td className="text-center text-emerald-400">✓</td><td className="text-center text-emerald-400">✓</td><td className="text-center text-emerald-400">✓</td><td className="text-center text-red-400">—</td><td className="text-center text-emerald-400">✓</td></tr>
                          <tr><td>Min citations</td><td className="text-center text-red-400">—</td><td className="text-center text-red-400">—</td><td className="text-center text-amber-400">post</td><td className="text-center text-red-400">—</td><td className="text-center text-red-400">—</td><td className="text-center text-amber-400">post</td></tr>
                          <tr><td>Open Access</td><td className="text-center text-amber-400">post</td><td className="text-center text-emerald-400">all OA</td><td className="text-center text-emerald-400">✓</td><td className="text-center text-red-400">—</td><td className="text-center text-emerald-400">all OA</td><td className="text-center text-emerald-400">✓</td></tr>
                        </tbody>
                      </table>
                      <p className="mt-1 text-[9px]">✓ = server-side, post = filtered after download, — = not supported</p>
                    </div>
                    <div className="pt-2 border-t border-[var(--border)]">
                      <p className="font-medium text-[var(--foreground)] mb-1">Tips:</p>
                      <ul className="space-y-0.5">
                        <li>2-3 keywords give the best balance</li>
                        <li>4+ keywords may be too restrictive</li>
                        <li>Year filter is the most effective — supported by 5/6 sources</li>
                        <li>Use &quot;Save as Topic&quot; to reuse this search in scheduled Discovery</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Selected keywords tags */}
        {searchMode === "keywords" && keywords.trim() && (
          <div className="flex flex-wrap gap-1.5">
            {keywords.split(",").map((kw) => kw.trim()).filter(Boolean).map((kw, i) => (
              <span
                key={`${kw}-${i}`}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[var(--primary)] text-white font-medium"
              >
                {kw}
                <button
                  onClick={() => {
                    const updated = keywords.split(",").map((s) => s.trim()).filter(Boolean).filter((_, idx) => idx !== i);
                    setKeywords(updated.join(", "));
                  }}
                  className="ml-0.5 hover:opacity-70"
                >
                  &times;
                </button>
              </span>
            ))}
            {keywords.split(",").filter((s) => s.trim()).length > 1 && (
              <button
                onClick={() => setKeywords("")}
                className="text-[10px] px-2 py-1 rounded-full bg-amber-600 text-white font-medium hover:bg-amber-500"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !searching && doSearch()}
              onFocus={() => searchMode === "keywords" && setShowSuggestions(true)}
              placeholder={
                searchMode === "keywords" ? "Keywords separated by comma (e.g. federated learning, blockchain)" :
                searchMode === "title" ? "Paper title or partial title" :
                searchMode === "author" ? "Author name (e.g. Smith, John)" :
                "DOI (e.g. 10.1234/example)"
              }
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
            />
            {searchMode === "keywords" && !showSuggestions && (
              <button
                onClick={() => setShowSuggestions(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-1 rounded bg-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                Browse keywords
              </button>
            )}
          </div>
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

        {/* Keyword suggestions panel */}
        {searchMode === "keywords" && showSuggestions && (
          <KeywordSuggestionsPanel
            currentKeywords={keywords}
            onSelect={(kw) => {
              const current = keywords.split(",").map((s) => s.trim()).filter(Boolean);
              if (!current.some((k) => k.toLowerCase() === kw.toLowerCase())) {
                setKeywords(current.length > 0 ? `${keywords}, ${kw}` : kw);
              }
            }}
            onClose={() => setShowSuggestions(false)}
          />
        )}

        {/* Sources + max */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
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
              <option value={100}>100</option>
              <option value={200}>200 (deep)</option>
              <option value={500}>500 (backfill)</option>
            </select>
          </div>
        </div>

        {/* Server-side filters: applied at source before download */}
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <span className="text-[10px] text-[var(--muted-foreground)] font-bold">Search Filters:</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--muted-foreground)]">Year</span>
            <input type="number" min={1990} max={2030} value={filterYearFrom} onChange={e => setFilterYearFrom(e.target.value)}
              placeholder="from" className="w-16 px-1.5 py-1 rounded bg-[var(--secondary)] border border-[var(--border)] text-[10px] text-center" />
            <span className="text-[10px]">–</span>
            <input type="number" min={1990} max={2030} value={filterYearTo} onChange={e => setFilterYearTo(e.target.value)}
              placeholder="to" className="w-16 px-1.5 py-1 rounded bg-[var(--secondary)] border border-[var(--border)] text-[10px] text-center" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--muted-foreground)]">Min citations</span>
            <input type="number" min={0} value={filterMinCitations} onChange={e => setFilterMinCitations(e.target.value)}
              placeholder="0" className="w-14 px-1.5 py-1 rounded bg-[var(--secondary)] border border-[var(--border)] text-[10px] text-center" />
          </div>
        </div>
      </div>

      {/* Sort selector (shown when results exist) */}
      {results && results.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[10px] text-[var(--muted-foreground)]">Sort by:</span>
          <div className="flex gap-0.5 p-0.5 rounded-lg bg-[var(--secondary)]">
            {([
              { key: "relevance", label: "Relevance" },
              { key: "title", label: "Title A–Z" },
              { key: "date", label: "Date ↓" },
              { key: "citations", label: "Citations ↓" },
            ] as const).map(s => (
              <button key={s.key} onClick={() => setSortResults(s.key)}
                className={cn("px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                  sortResults === s.key ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)]"
                )}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
          {/* Zero results feedback */}
          {results.length === 0 && (
            <div className="px-4 py-6 rounded-xl bg-[var(--secondary)] border border-[var(--border)] text-center space-y-2">
              <p className="text-sm font-medium">No papers found</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                No results were returned by the selected sources for this search.
                {queriesUsed && Object.keys(queriesUsed).length > 0 && (
                  <> Queries sent: {Object.entries(queriesUsed).map(([src, q]) => `${src}`).join(", ")}.</>
                )}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Try different keywords, a broader search mode, or enable more sources.
              </p>
            </div>
          )}

          {/* Results header (only when results exist) */}
          {sortedResults && sortedResults.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{sortedResults.length} papers</span>
              {results && sortedResults.length < results.length && (
                <span className="text-[var(--muted-foreground)]"> (filtered from {results.length})</span>
              )}
              <span className="text-[var(--muted-foreground)]">
                {" "}({newCount} new, {dbCount} DB)
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
          )}

          {/* Results list */}
          <div className="space-y-1 max-h-[500px] overflow-y-auto overflow-x-hidden">
            {(sortedResults || []).map((r, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg transition-colors overflow-hidden",
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
                    <a href={`/papers/${r.db_paper_id}`} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-[var(--primary)] line-clamp-2">
                      {r.title}
                    </a>
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
                  ) : r.external_ids?.iris_url || (r.source === "iris_who" && r.pdf_url) ? (
                    <a href={r.external_ids?.iris_url || r.pdf_url || "#"} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-[var(--primary)] line-clamp-2">
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
                    {r.citation_count > 0 && (
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {r.citation_count} cit.
                      </span>
                    )}
                    {r.already_in_db && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-900 text-sky-100 font-semibold">
                        DB
                      </span>
                    )}
                    {r.open_access && !r.already_in_db && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">OA</span>
                    )}
                    {(() => {
                      const src = getSmartSourceUrl(r);
                      const pdf = r.pdf_url && r.pdf_url !== src ? r.pdf_url : null;
                      return (
                        <>
                          {src && (
                            <a
                              href={src}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-700 text-white hover:bg-emerald-600 font-semibold flex items-center gap-0.5"
                              title="Open source page in new tab"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              Source
                            </a>
                          )}
                          {pdf && (
                            <a
                              href={pdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-700 text-white hover:bg-blue-600 font-semibold flex items-center gap-0.5"
                              title="Open PDF in new tab"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              PDF
                            </a>
                          )}
                        </>
                      );
                    })()}
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
    </div>}
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


// --- Keyword Suggestions Panel ---

interface KwItem { keyword: string; count: number }

function KeywordSuggestionsPanel({
  currentKeywords,
  onSelect,
  onClose,
}: {
  currentKeywords: string;
  onSelect: (kw: string) => void;
  onClose: () => void;
}) {
  const { data } = useSWR<Record<string, KwItem[]>>(
    "/api/v1/papers/keywords/categorized",
    authFetcher
  );
  const [filter, setFilter] = useState("");

  const selected = new Set(
    currentKeywords.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  );

  const CATEGORY_COLORS: Record<string, string> = {
    "Author Keywords": "bg-emerald-700",
    "S2 Fields": "bg-indigo-700",
    "Fields of Study": "bg-blue-700",
    "MeSH Terms": "bg-purple-700",
    "Index Terms": "bg-teal-700",
  };

  if (!data) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
        <div className="h-20 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const filterLower = filter.toLowerCase();

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-[var(--muted-foreground)]">
          Browse existing keywords — click to add to search
        </h4>
        <button
          onClick={onClose}
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          &times; Close
        </button>
      </div>

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter keywords..."
        className="w-full px-3 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs focus:outline-none focus:border-[var(--primary)]"
      />

      <div className="space-y-3 max-h-64 overflow-y-auto">
        {Object.entries(data).map(([category, items]) => {
          const filtered = items.filter((i) =>
            filterLower ? i.keyword.toLowerCase().includes(filterLower) : true
          );
          if (filtered.length === 0) return null;

          const color = CATEGORY_COLORS[category] || "bg-gray-600";

          return (
            <div key={category}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={cn("text-[9px] px-1.5 py-0.5 rounded text-white font-semibold", color)}>
                  {category}
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)]">{filtered.length} keywords</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {filtered.slice(0, 40).map((item) => {
                  const isSelected = selected.has(item.keyword.toLowerCase());
                  return (
                    <button
                      key={item.keyword}
                      onClick={() => !isSelected && onSelect(item.keyword)}
                      disabled={isSelected}
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded transition-colors",
                        isSelected
                          ? "bg-[var(--primary)]/30 text-[var(--primary)] cursor-default"
                          : "bg-gray-700 text-white hover:bg-gray-600"
                      )}
                      title={`${item.count} paper${item.count > 1 ? "s" : ""}`}
                    >
                      {item.keyword}
                      <span className="ml-1 opacity-50">{item.count}</span>
                    </button>
                  );
                })}
                {filtered.length > 40 && (
                  <span className="text-[10px] text-[var(--muted-foreground)] px-1 py-0.5">+{filtered.length - 40} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Add External Document (grey literature) ---

function AddExternalDocument() {
  const { isAdmin } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [resolveUrl, setResolveUrl] = useState("");
  const [resolvedSourceUrl, setResolvedSourceUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [title, setTitle] = useState("");
  const [issuingOrg, setIssuingOrg] = useState("");
  const [paperType, setPaperType] = useState<string>("report");
  const [publicationDate, setPublicationDate] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [abstract, setAbstract] = useState("");
  const [authors, setAuthors] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string; paperId?: number } | null>(null);

  if (!isAdmin) return null;

  const reset = () => {
    setResolveUrl("");
    setResolvedSourceUrl(null);
    setTitle(""); setIssuingOrg(""); setPaperType("report");
    setPublicationDate(""); setPdfUrl(""); setAbstract(""); setAuthors("");
  };

  const autoFetch = async () => {
    if (!resolveUrl.trim()) return;
    setResolving(true);
    setMessage(null);
    try {
      const r = await fetch("/api/v1/papers/resolve-external", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ url: resolveUrl.trim() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "Resolve failed");
      }
      const d = await r.json();
      if (d.title) setTitle(d.title);
      if (d.issuing_organization) setIssuingOrg(d.issuing_organization);
      if (d.paper_type) setPaperType(d.paper_type);
      if (d.publication_date) setPublicationDate(d.publication_date);
      if (d.pdf_url) setPdfUrl(d.pdf_url);
      if (d.abstract) setAbstract(d.abstract);
      if (d.authors) setAuthors(d.authors);
      setResolvedSourceUrl(resolveUrl.trim());
      setMessage({ type: "success", text: `Metadata fetched from ${d.source === "iris" ? "WHO IRIS" : "WHO website"}. Review the source, then save.` });
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Resolve failed" });
    } finally {
      setResolving(false);
    }
  };

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const r = await fetch("/api/v1/papers/external-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          title: title.trim(),
          issuing_organization: issuingOrg.trim() || null,
          paper_type: paperType,
          publication_date: publicationDate || null,
          pdf_url: pdfUrl.trim() || null,
          abstract: abstract.trim() || null,
          authors: authors.trim() || null,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "Creation failed");
      }
      const res = await r.json();
      setMessage({
        type: "success",
        text: `Document #${res.paper_id} created: "${res.title}"`,
        paperId: res.paper_id,
      });
      reset();
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <h3 className="font-medium flex items-center gap-2 text-sm">
          <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Add External Document
          <span className="text-xs text-[var(--muted-foreground)] font-normal">
            (grey literature — WHO, OECD, EU, ISO, ...)
          </span>
        </h3>
        <svg
          className={cn("w-4 h-4 text-[var(--muted-foreground)] transition-transform", expanded && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4">
          <p className="text-xs text-[var(--muted-foreground)]">
            Insert institutional documents without a DOI (technical reports, clinical guidelines,
            white papers, standards). The record is saved as a Paper with <code className="text-[var(--primary)]">paper_role=&quot;bibliography&quot;</code>{" "}
            and appears in the Papers menu alongside peer-reviewed literature.
          </p>

          {/* Auto-fetch from URL */}
          <div className="rounded-lg bg-[var(--secondary)]/50 border border-[var(--border)] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.102m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span className="text-xs font-bold">Auto-fill from WHO / IRIS URL</span>
            </div>
            <div className="flex gap-2">
              <input
                value={resolveUrl}
                onChange={(e) => setResolveUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); autoFetch(); } }}
                placeholder="https://iris.who.int/handle/10665/NNN · 10665/NNN · https://www.who.int/…/publications/…"
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs focus:outline-none focus:border-[var(--primary)] font-mono"
              />
              <button
                onClick={autoFetch}
                disabled={!resolveUrl.trim() || resolving}
                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-bold hover:bg-blue-600 disabled:opacity-50 transition-colors shrink-0"
              >
                {resolving ? "Fetching…" : "Auto-fill"}
              </button>
            </div>
            <p className="text-[10px] text-[var(--muted-foreground)]">
              Supports IRIS handles (via OAI-PMH, rich metadata) and WHO public pages (via citation meta tags).
              Fields below will be pre-populated — review before saving.
            </p>
            {resolvedSourceUrl && (
              <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
                <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">Verify the document:</span>
                <a
                  href={resolvedSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold px-2.5 py-1 rounded bg-emerald-700 text-white hover:bg-emerald-600 flex items-center gap-1 shrink-0"
                  title="Open the source page in a new tab"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open source
                </a>
                {pdfUrl && pdfUrl !== resolvedSourceUrl && (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold px-2.5 py-1 rounded bg-blue-700 text-white hover:bg-blue-600 flex items-center gap-1 shrink-0"
                    title="Open the PDF in a new tab"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Open PDF
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Digital health in the WHO European Region — The ongoing journey to commitment and transformation"
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Issuing Organization</label>
              <input
                value={issuingOrg}
                onChange={(e) => setIssuingOrg(e.target.value)}
                placeholder="e.g. WHO Regional Office for Europe"
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Document Type</label>
              <select
                value={paperType}
                onChange={(e) => setPaperType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              >
                {EXTERNAL_DOCUMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Publication Date</label>
              <input
                type="date"
                value={publicationDate}
                onChange={(e) => setPublicationDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Original URL (PDF or landing page)</label>
              <input
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Authors (comma-separated, optional)</label>
              <input
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
                placeholder="e.g. WHO Regional Office for Europe, Author Name"
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Abstract / Summary (optional)</label>
              <textarea
                value={abstract}
                onChange={(e) => setAbstract(e.target.value)}
                placeholder="Executive summary or abstract..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] resize-y"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!title.trim() || saving}
              className="px-5 py-2 rounded-lg bg-blue-700 text-white text-sm font-bold hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save Document"}
            </button>
            <button
              onClick={reset}
              disabled={saving}
              className="px-3 py-2 rounded-lg text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] disabled:opacity-50"
            >
              Clear form
            </button>
          </div>

          {message && (
            <div className={cn(
              "px-4 py-2.5 rounded-lg text-sm flex items-center justify-between gap-3",
              message.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border border-red-500/20 text-red-400"
            )}>
              <span>{message.text}</span>
              {message.type === "success" && message.paperId && (
                <Link
                  href={`/papers/${message.paperId}`}
                  className="text-xs px-3 py-1 rounded bg-emerald-700 text-white font-bold hover:bg-emerald-600 shrink-0"
                >
                  Open detail →
                </Link>
              )}
            </div>
          )}

          <p className="text-[10px] text-[var(--muted-foreground)]">
            After creation, open the detail page to upload the PDF, tag topics, trigger LLM analysis, or sync to Zotero.
          </p>
        </div>
      )}
    </div>
  );
}
