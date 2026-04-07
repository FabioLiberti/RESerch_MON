"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { usePaper } from "@/hooks/usePapers";
import { api, authFetcher } from "@/lib/api";
import { formatDate, SOURCE_LABELS, SOURCE_COLORS, cn } from "@/lib/utils";

export default function PaperDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const paperId = Number(id);
  const { data: paper, isLoading } = usePaper(paperId);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-96 bg-[var(--muted)] rounded" />
        <div className="h-4 w-64 bg-[var(--muted)] rounded" />
        <div className="h-40 bg-[var(--muted)] rounded-xl" />
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="text-center py-20 text-[var(--muted-foreground)]">
        Paper not found
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Back */}
      <Link href="/papers" className="text-sm text-[var(--primary)] hover:underline">
        &larr; Back to papers
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold leading-snug">{paper.title}</h1>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--primary)] hover:underline"
            >
              DOI: {paper.doi}
            </a>
          )}
          <span className="text-xs text-[var(--muted-foreground)]">
            {formatDate(paper.publication_date)}
          </span>
          {paper.journal && (
            <span className="text-xs text-[var(--muted-foreground)] italic">
              {paper.journal}
            </span>
          )}
          {paper.validated && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
              Validated
            </span>
          )}
        </div>
      </div>

      {/* Labels & Notes */}
      <LabelsAndNotes paperId={paperId} />

      {/* Authors */}
      {paper.authors.length > 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Authors</h3>
          <div className="flex flex-wrap gap-2">
            {paper.authors.map((a) => (
              <span
                key={a.id}
                className="text-sm px-2 py-1 rounded-lg bg-[var(--secondary)]"
                title={a.affiliation || undefined}
              >
                {a.name}
                {a.orcid && (
                  <a
                    href={`https://orcid.org/${a.orcid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-[var(--primary)]"
                  >
                    ORCID
                  </a>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Abstract */}
      {paper.abstract && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-3">Abstract</h3>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{paper.abstract}</p>
        </div>
      )}

      {/* Keywords */}
      {paper.keywords && paper.keywords.length > 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-3">Keywords</h3>

          {/* Categorized keywords if available */}
          {paper.keyword_categories && Object.keys(paper.keyword_categories).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(paper.keyword_categories).map(([category, kws]) => (
                <div key={category}>
                  <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">
                    {category}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(kws as string[]).map((kw) => (
                      <Link
                        key={`${category}-${kw}`}
                        href={`/papers?keyword=${encodeURIComponent(kw)}`}
                        className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                          category === "Author Keywords"
                            ? "bg-[var(--primary)]/15 text-[var(--primary)] hover:bg-[var(--primary)]/25"
                            : category === "MeSH Terms"
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : category === "arXiv Categories"
                            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            : category === "IEEE Terms" || category === "INSPEC Terms"
                            ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                            : category === "Fields of Study" || category === "S2 Fields"
                            ? "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
                            : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]"
                        }`}
                      >
                        {kw}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Flat keywords (legacy papers without categories) */
            <div className="flex flex-wrap gap-2">
              {paper.keywords.map((kw) => (
                <Link
                  key={kw}
                  href={`/papers?keyword=${encodeURIComponent(kw)}`}
                  className="text-xs px-2.5 py-1 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors"
                >
                  {kw}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sources */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Sources</h3>
          <div className="space-y-1">
            {paper.source_details.map((s) => (
              <div key={s.source_name} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: SOURCE_COLORS[s.source_name] || "#6b7280" }}
                />
                <span className="text-sm">{SOURCE_LABELS[s.source_name] || s.source_name}</span>
                {s.source_id && (
                  <span className="text-xs text-[var(--muted-foreground)]">#{s.source_id}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Details</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Type</dt>
              <dd className="capitalize">{paper.paper_type.replace("_", " ")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Citations</dt>
              <dd>{paper.citation_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">Open Access</dt>
              <dd>{paper.open_access ? "Yes" : "No"}</dd>
            </div>
            {paper.volume && (
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">Volume</dt>
                <dd>{paper.volume}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {/* Primary: open paper at source */}
        {paper.doi && (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Paper
          </a>
        )}

        {/* PDF link */}
        {paper.pdf_url && (
          <a
            href={paper.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-300 text-sm font-medium hover:bg-red-500/30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View PDF
          </a>
        )}

        {/* Source-specific links */}
        {paper.external_ids?.arxiv_id && (
          <a
            href={`https://arxiv.org/abs/${paper.external_ids.arxiv_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/15 text-red-400 text-sm font-medium hover:bg-red-500/25 transition-colors"
          >
            arXiv
          </a>
        )}

        {paper.external_ids?.pmid && (
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${paper.external_ids.pmid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 text-sm font-medium hover:bg-emerald-500/25 transition-colors"
          >
            PubMed
          </a>
        )}

        {paper.external_ids?.s2_id && (
          <a
            href={`https://www.semanticscholar.org/paper/${paper.external_ids.s2_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/15 text-indigo-400 text-sm font-medium hover:bg-indigo-500/25 transition-colors"
          >
            Semantic Scholar
          </a>
        )}

        {/* Compendium link only for compendium papers */}
        {paper.source_details.some((s: any) => s.source_name === "compendium") && (
          <Link
            href="/compendium"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 text-sm font-medium hover:bg-purple-500/30 transition-colors"
          >
            Open in Compendium
          </Link>
        )}

        {/* Generate Analysis */}
        <AnalysisButton paperId={paperId} />
      </div>
    </div>
  );
}


// --- Labels & Notes Component ---

interface LabelData {
  id: number;
  name: string;
  color: string;
}

function LabelsAndNotes({ paperId }: { paperId: number }) {
  const { data: paperLabels, mutate: mutateLabels } = useSWR<LabelData[]>(
    `/api/v1/labels/paper/${paperId}`, authFetcher
  );
  const { data: allLabels } = useSWR<LabelData[]>("/api/v1/labels", authFetcher);
  const { data: noteData, mutate: mutateNote } = useSWR(
    `/api/v1/labels/note/${paperId}`, authFetcher
  );

  const [noteText, setNoteText] = useState("");
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");

  // Load note text when data arrives
  useEffect(() => {
    if (noteData && !noteLoaded) {
      setNoteText(noteData.text || "");
      setNoteLoaded(true);
    }
  }, [noteData, noteLoaded]);

  const assignLabel = async (labelId: number) => {
    await api.assignLabel(paperId, labelId);
    mutateLabels();
    setShowLabelPicker(false);
  };

  const removeLabel = async (labelId: number) => {
    await api.removeLabel(paperId, labelId);
    mutateLabels();
  };

  const createAndAssign = async () => {
    if (!newLabelName.trim()) return;
    try {
      const label = await api.createLabel({ name: newLabelName, color: newLabelColor });
      await api.assignLabel(paperId, label.id);
      mutateLabels();
      mutate("/api/v1/labels");
      setNewLabelName("");
      setShowLabelPicker(false);
    } catch {
      // Label might already exist
    }
  };

  const saveNote = async () => {
    setSavingNote(true);
    setNoteSaved(false);
    await api.saveNote(paperId, noteText);
    mutateNote();
    setSavingNote(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  const assignedIds = new Set((paperLabels || []).map((l) => l.id));
  const availableLabels = (allLabels || []).filter((l) => !assignedIds.has(l.id));

  const PRESET_COLORS = ["#6366f1", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#3b82f6", "#ec4899", "#14b8a6"];

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-4">
      {/* Labels */}
      <div>
        <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Labels</h3>
        <div className="flex flex-wrap items-center gap-2">
          {(paperLabels || []).map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ backgroundColor: `${label.color}20`, color: label.color }}
            >
              {label.name}
              <button
                onClick={() => removeLabel(label.id)}
                className="ml-0.5 hover:opacity-70"
              >
                &times;
              </button>
            </span>
          ))}

          {/* Add label button */}
          <div className="relative">
            <button
              onClick={() => setShowLabelPicker(!showLabelPicker)}
              className="text-xs px-2 py-1 rounded-full border border-dashed border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
            >
              + Add Label
            </button>

            {showLabelPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowLabelPicker(false)} />
                <div className="absolute left-0 top-8 z-50 w-56 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-xl p-3 space-y-2">
                  {/* Existing labels */}
                  {availableLabels.length > 0 && (
                    <div className="space-y-1">
                      {availableLabels.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => assignLabel(l.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--secondary)] transition-colors text-left"
                        >
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                          <span className="text-xs">{l.name}</span>
                        </button>
                      ))}
                      <div className="border-t border-[var(--border)] my-1" />
                    </div>
                  )}

                  {/* Create new */}
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && createAndAssign()}
                      placeholder="New label name..."
                      className="w-full px-2 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs focus:outline-none focus:border-[var(--primary)]"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setNewLabelColor(c)}
                          className={cn(
                            "w-5 h-5 rounded-full transition-all",
                            newLabelColor === c ? "ring-2 ring-offset-1 ring-[var(--foreground)]" : ""
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={createAndAssign}
                      disabled={!newLabelName.trim()}
                      className="w-full px-2 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      Create & Add
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Note */}
      <div>
        <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Note</h3>
        <textarea
          value={noteText}
          onChange={(e) => { setNoteText(e.target.value); setNoteSaved(false); }}
          placeholder="Add a personal note about this paper..."
          className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] resize-none h-20"
        />
        <div className="flex items-center justify-between mt-2">
          <button
            onClick={saveNote}
            disabled={savingNote}
            className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            {savingNote ? "Saving..." : "Save Note"}
          </button>
          {noteSaved && (
            <span className="text-xs text-emerald-400">Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}


// --- Analysis Button ---

function AnalysisButton({ paperId }: { paperId: number }) {
  const [status, setStatus] = useState<"idle" | "loading" | "queued" | "error">("idle");
  const [startTime, setStartTime] = useState<number | null>(null);

  // Poll for analysis completion
  const { data: analysisStatus } = useSWR(
    status === "queued" ? "/api/v1/analysis/status" : null,
    authFetcher,
    { refreshInterval: 3000 }
  );

  // Check if report exists (endpoint returns HTML, not JSON)
  const htmlFetcher = (url: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("fl-token") : null;
    if (!token) return Promise.reject(new Error("No token"));
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${r.status}`);
      return r.text();
    });
  };

  const { data: existingReport } = useSWR(
    `/api/v1/analysis/${paperId}/html`,
    htmlFetcher,
    {
      shouldRetryOnError: false,
      refreshInterval: status === "queued" ? 5000 : 0,
    }
  );

  const hasReport = existingReport && typeof existingReport === "string" && existingReport.includes("<!DOCTYPE");

  // When report appears, reset status
  useEffect(() => {
    if (hasReport && status === "queued") {
      setStatus("idle");
      setStartTime(null);
    }
  }, [hasReport, status]);

  const trigger = async () => {
    setStatus("loading");
    try {
      await api.triggerAnalysis([paperId]);
      setStatus("queued");
      setStartTime(Date.now());
    } catch {
      setStatus("error");
    }
  };

  if (hasReport) {
    return (
      <div className="flex gap-2">
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          View Analysis
        </Link>
        <button
          onClick={() => {
            const token = localStorage.getItem("fl-token");
            fetch(`/api/v1/analysis/${paperId}/pdf`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
              .then((r) => r.blob())
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `analysis_paper_${paperId}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              });
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-medium hover:bg-red-600 transition-colors"
        >
          Analysis PDF
        </button>
      </div>
    );
  }

  if (status === "queued" && startTime) {
    return (
      <div className="inline-flex items-center gap-3 px-4 py-2 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20">
        <svg className="w-4 h-4 animate-spin text-[var(--primary)]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm text-[var(--primary)]">
          Analyzing with Gemma4...
        </span>
        <span className="text-sm text-[var(--primary)] tabular-nums">
          <ElapsedTimer startTime={startTime} />
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={trigger}
      disabled={status === "loading"}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-colors disabled:opacity-50"
    >
      {status === "loading" ? (
        <>
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Sending...
        </>
      ) : status === "error" ? (
        "Error (Ollama running?)"
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Genera Analisi
        </>
      )}
    </button>
  );
}

// Reuse ElapsedTimer
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
