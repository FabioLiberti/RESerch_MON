"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";

interface Reference {
  id: number;
  cited_paper_id: number;
  title: string;
  doi: string | null;
  journal: string | null;
  publication_date: string | null;
  context: string | null;
  context_label: string | null;
  note: string | null;
}

interface RefsResponse {
  manuscript_id: number;
  references: Reference[];
  total: number;
}

const CONTEXT_OPTIONS = [
  { value: "", label: "— no context —" },
  { value: "introduction", label: "Introduction" },
  { value: "related_work", label: "Related Work" },
  { value: "methodology", label: "Methodology" },
  { value: "comparison", label: "Comparison / Baseline" },
  { value: "results", label: "Results" },
  { value: "discussion", label: "Discussion" },
  { value: "other", label: "Other" },
];

const CONTEXT_COLORS: Record<string, string> = {
  introduction: "bg-blue-700",
  related_work: "bg-purple-700",
  methodology: "bg-emerald-700",
  comparison: "bg-amber-700",
  results: "bg-cyan-700",
  discussion: "bg-indigo-700",
  other: "bg-gray-600",
};

export default function ManuscriptBibliography({ paperId }: { paperId: number }) {
  const apiUrl = `/api/v1/paper-references/${paperId}`;
  const { data, isLoading } = useSWR<RefsResponse>(apiUrl, authFetcher);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [addContext, setAddContext] = useState("");
  const [addNote, setAddNote] = useState("");

  const [editingNote, setEditingNote] = useState<Record<number, string>>({});

  // Import from label
  const [showLabelImport, setShowLabelImport] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [labelPapers, setLabelPapers] = useState<any[] | null>(null);
  const [labelLoading, setLabelLoading] = useState(false);
  const [selectedForImport, setSelectedForImport] = useState<Set<number>>(new Set());
  const [importingLabel, setImportingLabel] = useState(false);

  const { data: labels } = useSWR<{ id: number; name: string; color: string }[]>(
    showLabelImport ? "/api/v1/labels" : null,
    authFetcher
  );

  const loadLabelPapers = async (labelName: string) => {
    setLabelLoading(true);
    setSelectedForImport(new Set());
    try {
      const r = await fetch(`/api/v1/papers?label=${encodeURIComponent(labelName)}&per_page=100&sort_by=title&sort_order=asc`, {
        headers: authHeaders(),
      });
      if (r.ok) {
        const d = await r.json();
        const existingIds = new Set((data?.references || []).map(ref => ref.cited_paper_id));
        existingIds.add(paperId);
        setLabelPapers((d.items || []).filter((p: any) => !existingIds.has(p.id)));
      }
    } finally {
      setLabelLoading(false);
    }
  };

  const importSelected = async () => {
    if (selectedForImport.size === 0) return;
    setImportingLabel(true);
    for (const pid of selectedForImport) {
      await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ cited_paper_id: pid, context: null, note: null }),
      }).catch(() => {});
    }
    setSelectedForImport(new Set());
    setLabelPapers(null);
    setShowLabelImport(false);
    setImportingLabel(false);
    mutate(apiUrl);
  };

  const searchPapers = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/v1/papers?q=${encodeURIComponent(searchQuery)}&per_page=10&sort_by=title&sort_order=asc`, {
        headers: authHeaders(),
      });
      if (r.ok) {
        const d = await r.json();
        // Exclude papers already in bibliography and the manuscript itself
        const existingIds = new Set((data?.references || []).map(ref => ref.cited_paper_id));
        existingIds.add(paperId);
        setSearchResults((d.items || []).filter((p: any) => !existingIds.has(p.id)));
      }
    } finally {
      setSearching(false);
    }
  };

  const addReference = async (citedPaperId: number) => {
    await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        cited_paper_id: citedPaperId,
        context: addContext || null,
        note: addNote || null,
      }),
    });
    setAddContext("");
    setAddNote("");
    // Remove from search results
    setSearchResults(prev => prev?.filter(p => p.id !== citedPaperId) || null);
    mutate(apiUrl);
  };

  const updateRef = async (refId: number, patch: Record<string, any>) => {
    await fetch(`/api/v1/paper-references/ref/${refId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    });
    mutate(apiUrl);
  };

  const deleteRef = async (refId: number) => {
    if (!confirm("Remove this paper from the bibliography?")) return;
    await fetch(`/api/v1/paper-references/ref/${refId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    mutate(apiUrl);
  };

  if (isLoading) return <div className="h-16 bg-[var(--muted)] rounded-xl animate-pulse" />;

  const refs = data?.references || [];

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          Bibliography
          {refs.length > 0 && (
            <span className="text-xs font-normal text-[var(--muted-foreground)]">
              {refs.length} paper{refs.length !== 1 ? "s" : ""} cited
            </span>
          )}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowLabelImport(!showLabelImport); setShowSearch(false); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-700 text-white font-bold hover:bg-purple-600 transition-colors"
          >
            Import from Label
          </button>
          <button
            onClick={() => { setShowSearch(!showSearch); setShowLabelImport(false); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-700 text-white font-bold hover:bg-indigo-600 transition-colors"
          >
            + Add Reference
          </button>
        </div>
      </div>

      {/* Import from Label */}
      {showLabelImport && (
        <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted-foreground)]">Label:</span>
            <select
              value={selectedLabel}
              onChange={e => { setSelectedLabel(e.target.value); if (e.target.value) loadLabelPapers(e.target.value); else setLabelPapers(null); }}
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
            >
              <option value="">Select a label...</option>
              {(labels || []).map(l => (
                <option key={l.id} value={l.name}>{l.name}</option>
              ))}
            </select>
          </div>

          {labelLoading && <p className="text-xs text-[var(--muted-foreground)]">Loading papers...</p>}

          {labelPapers && !labelLoading && (
            <>
              {labelPapers.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)] text-center py-2">No new papers found in this label (all already in bibliography).</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--muted-foreground)]">{labelPapers.length} papers available</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedForImport(new Set(labelPapers.map((p: any) => p.id)))}
                        className="text-[10px] px-2 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--muted)]"
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => setSelectedForImport(new Set())}
                        className="text-[10px] px-2 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--muted)]"
                      >
                        Deselect
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {labelPapers.map((paper: any) => (
                      <label key={paper.id} className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${selectedForImport.has(paper.id) ? "bg-purple-500/10" : "hover:bg-[var(--secondary)]"} ${paper.disabled ? "opacity-40" : ""}`}>
                        <input
                          type="checkbox"
                          checked={selectedForImport.has(paper.id)}
                          onChange={() => setSelectedForImport(prev => {
                            const next = new Set(prev);
                            if (next.has(paper.id)) next.delete(paper.id); else next.add(paper.id);
                            return next;
                          })}
                          className="mt-0.5 rounded accent-[var(--primary)]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium line-clamp-1">{paper.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {paper.rating > 0 && (
                              <span className="text-[10px] text-amber-400">{"★".repeat(paper.rating)}{"☆".repeat(5 - paper.rating)}</span>
                            )}
                            {paper.disabled && <span className="text-[9px] px-1 py-0.5 rounded bg-red-800 text-white">DISABLED</span>}
                            {paper.journal && <span className="text-[10px] text-[var(--muted-foreground)]">{paper.journal}</span>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={importSelected}
                    disabled={selectedForImport.size === 0 || importingLabel}
                    className="px-4 py-2 rounded-lg bg-purple-700 text-white text-sm font-bold hover:bg-purple-600 disabled:opacity-50 transition-colors"
                  >
                    {importingLabel ? "Importing..." : `Import ${selectedForImport.size} selected`}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Search to add */}
      {showSearch && (
        <div className="p-4 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-3">
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && searchPapers()}
              placeholder="Search papers in DB by title, DOI, or author..."
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
            />
            <button
              onClick={searchPapers}
              disabled={searching || !searchQuery.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm font-bold hover:bg-indigo-600 disabled:opacity-50"
            >
              {searching ? "..." : "Search"}
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={addContext}
              onChange={e => setAddContext(e.target.value)}
              className="px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
            >
              {CONTEXT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              value={addNote}
              onChange={e => setAddNote(e.target.value)}
              placeholder="Note (optional, e.g. 'Baseline in Table 3')"
              className="flex-1 px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
            />
          </div>

          {/* Search results */}
          {searchResults && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)] text-center py-2">No papers found (or all already in bibliography).</p>
              ) : (
                searchResults.map(paper => (
                  <div key={paper.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium line-clamp-1">{paper.title}</p>
                      {paper.journal && <p className="text-[10px] text-[var(--muted-foreground)]">{paper.journal}</p>}
                    </div>
                    <button
                      onClick={() => addReference(paper.id)}
                      className="text-[10px] px-2 py-1 rounded bg-emerald-700 text-white font-bold hover:bg-emerald-600 shrink-0"
                    >
                      Add
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {refs.length === 0 && !showSearch && (
        <p className="text-sm text-[var(--muted-foreground)] text-center py-4">
          No bibliography references linked yet. Click &quot;+ Add Reference&quot; to link papers from your database.
        </p>
      )}

      {/* References list */}
      {refs.length > 0 && (
        <div className="space-y-2">
          {refs.map(ref => (
            <div key={ref.id} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--secondary)]/30 border border-[var(--border)]">
              <div className="flex-1 min-w-0 space-y-1">
                <Link
                  href={`/papers/${ref.cited_paper_id}`}
                  className="text-sm font-medium hover:text-[var(--primary)] line-clamp-2"
                >
                  {ref.title}
                </Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ref.context && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded text-white font-bold ${CONTEXT_COLORS[ref.context] || "bg-gray-600"}`}>
                      {ref.context_label || ref.context}
                    </span>
                  )}
                  {ref.doi && <span className="text-[10px] text-[var(--muted-foreground)]">DOI: {ref.doi}</span>}
                  {ref.journal && <span className="text-[10px] text-[var(--muted-foreground)] italic">{ref.journal}</span>}
                </div>
                {/* Editable note */}
                <input
                  type="text"
                  value={editingNote[ref.id] ?? ref.note ?? ""}
                  onChange={e => setEditingNote(prev => ({ ...prev, [ref.id]: e.target.value }))}
                  onBlur={e => updateRef(ref.id, { note: e.target.value || null })}
                  placeholder="Add note..."
                  className="w-full px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[10px] focus:outline-none mt-1"
                />
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <select
                  value={ref.context || ""}
                  onChange={e => updateRef(ref.id, { context: e.target.value || null })}
                  className="text-[9px] px-1 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none"
                >
                  {CONTEXT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => deleteRef(ref.id)}
                  className="text-[9px] text-red-400 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
