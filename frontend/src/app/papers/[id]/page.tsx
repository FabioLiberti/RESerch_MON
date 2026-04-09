"use client";

import { use, useState, useEffect, useRef } from "react";
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
          {paper.has_pdf && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-700 text-white font-medium">
              PDF{paper.pdf_pages ? ` (${paper.pdf_pages} pp)` : ""}
            </span>
          )}
          {paper.zotero_key && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-700 text-white font-medium">
              On Zotero
            </span>
          )}
        </div>
      </div>

      {/* Zotero Sync */}
      <SyncPaperToZotero paperId={paperId} hasZoteroKey={!!paper.zotero_key} />

      {/* Labels & Notes */}
      <LabelsAndNotes paperId={paperId} />

      {/* Authors */}
      {paper.authors.length > 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Authors</h3>
          <div className="flex flex-wrap gap-2">
            {paper.authors.map((a, i) => (
              <span
                key={`${a.id}-${i}`}
                className="text-sm px-2 py-1 rounded-lg bg-[var(--secondary)]"
                title={a.affiliation || undefined}
              >
                {a.name}
                {a.orcid && (
                  <>
                    {" "}
                    <a
                      href={`https://orcid.org/${a.orcid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] text-[var(--primary)] hover:underline"
                    >
                      [ORCID]
                    </a>
                  </>
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
              <dd className="flex items-center gap-2">
                {paper.citation_count}
                <RefreshCitationButton paperId={paperId} />
              </dd>
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

        {/* PDF — local file or external link */}
        {paper.has_pdf ? (
          <button
            onClick={() => {
              const token = localStorage.getItem("fl-token");
              fetch(`/api/v1/papers/${paperId}/pdf-file`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              }).then(r => r.blob()).then(blob => {
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank");
              });
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-medium hover:bg-red-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View PDF
          </button>
        ) : paper.pdf_url ? (
          <a
            href={paper.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-medium hover:bg-red-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View PDF (external)
          </a>
        ) : null}

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

        {/* Enrich metadata */}
        {paper.doi && <EnrichButton paperId={paperId} />}

        {/* Disable toggle */}
        <DisableToggle paperId={paperId} initialDisabled={paper.disabled || false} />

        {/* Generate Analysis */}
        <AnalysisButton paperId={paperId} />
      </div>

      {/* Summary Card */}
      <SummaryCard paperId={paperId} />

      {/* Analysis History */}
      <AnalysisHistory paperId={paperId} />
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
  const availableLabels = (allLabels || []).filter((l) => !assignedIds.has(l.id)).sort((a, b) => a.name.localeCompare(b.name));

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
                <div className="absolute left-0 top-8 z-50 w-64 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-xl p-3 space-y-2 max-h-80 overflow-y-auto">
                  {/* Existing labels to assign */}
                  {availableLabels.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-[var(--muted-foreground)] font-medium uppercase">Assign existing</span>
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
                    <span className="text-[10px] text-[var(--muted-foreground)] font-medium uppercase">Create new</span>
                    <input
                      type="text"
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && createAndAssign()}
                      placeholder="New label name..."
                      className="w-full px-2 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs focus:outline-none focus:border-[var(--primary)]"
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

  const [analysisMode, setAnalysisMode] = useState<"quick" | "deep" | "summary">("quick");
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const trigger = async () => {
    setStatus("loading");
    setAnalysisResult(null);
    setStartTime(Date.now());
    try {
      const res = await api.triggerAnalysis([paperId], analysisMode);
      // Check PDF status
      if (res.pdf_status) {
        const pdfInfo = res.pdf_status.find((p: any) => p.id === paperId);
        if (pdfInfo?.status === "no_pdf_url") {
          if (analysisMode === "deep") {
            setStatus("error");
            setUploadMsg("No PDF URL available. Upload the PDF manually.");
            setStartTime(null);
            return;
          }
          setUploadMsg("No PDF available — analyzing from abstract only. Upload PDF for full analysis.");
        }
        if (pdfInfo?.status === "download_failed") {
          if (analysisMode === "deep") {
            setStatus("error");
            setUploadMsg("PDF download failed. Upload the PDF manually.");
            setStartTime(null);
            return;
          }
          setUploadMsg("PDF download failed — analyzing from abstract only. Upload PDF for full analysis.");
        }
      }
      // Check if nothing was analyzed
      if (res.added === 0 && res.skipped > 0) {
        setStatus("error");
        setUploadMsg(null);
        setStartTime(null);
        return;
      }

      const detail = res.details?.[0];
      const engineName = res.engine === "claude" ? "Claude Opus 4.6 (API)" : "Gemma4:e4b (local)";
      const duration = detail?.duration_s || (startTime ? Math.round((Date.now() - startTime) / 1000) : 0);
      const chars = detail?.chars || "?";
      const now = new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setAnalysisResult(
        `${analysisMode.toUpperCase()} analysis completed | Engine: ${engineName} | Output: ${chars} chars | Duration: ${duration}s | Completed: ${now}`
      );
      setStatus("idle");
      setStartTime(null);
      // Refresh history and report data after short delay
      setTimeout(() => {
        mutate(`/api/v1/analysis/${paperId}/history`);
        mutate(`/api/v1/analysis/${paperId}/html`);
      }, 500);
    } catch {
      setStatus("error");
      setStartTime(null);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadMsg("Uploading...");
    try {
      const res = await api.uploadPdf(paperId, file);
      setUploadMsg(`PDF uploaded (${res.size_kb} KB). You can now run Deep Analysis.`);
      setStatus("idle");
      // Refresh paper data so has_pdf updates and View PDF button appears
      mutate(`/api/v1/papers/${paperId}`);
    } catch (err: any) {
      setUploadMsg(`Upload failed: ${err.message}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (hasReport) {
    return (
      <div className="flex flex-wrap gap-2 items-center">
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
        <SyncAnalysisToZotero paperId={paperId} />
        <button
          onClick={trigger}
          disabled={status === "loading"}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--primary)] text-white text-xs font-medium hover:opacity-90 transition-colors disabled:opacity-50"
        >
          {status === "loading" ? (
            <>
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {analysisMode === "deep" ? "Deep" : "Quick"} Analysis via Claude Opus 4.6... {startTime && <ElapsedTimer startTime={startTime} />}
            </>
          ) : (
            "Rigenera Analisi"
          )}
        </button>
        {analysisResult && (
          <div className="w-full mt-2 px-4 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-sm text-gray-300 font-medium">
            {analysisResult}
          </div>
        )}
        <select
          value={analysisMode}
          onChange={(e) => setAnalysisMode(e.target.value as "quick" | "deep")}
          className="px-2 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs"
        >
          <option value="quick">Quick (~5 pages)</option>
          <option value="deep">Deep (~7+ pages)</option>
          <option value="summary">Summary (1 page)</option>
        </select>
        {/* Upload PDF */}
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs cursor-pointer hover:bg-[var(--muted)] transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload PDF
          <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
        </label>
        {uploadMsg && (
          <span className={`text-xs ${uploadMsg.includes("failed") || uploadMsg.includes("ERROR") || uploadMsg.includes("No PDF") ? "text-red-400" : "text-emerald-400"}`}>{uploadMsg}</span>
        )}
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

  return (<>
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
          Analyzing... {startTime && <ElapsedTimer startTime={startTime} />}
        </>
      ) : status === "error" ? (
        <span className="text-red-300">No abstract and no PDF — upload PDF to analyze</span>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Genera Analisi
        </>
      )}
    </button>
    {analysisResult && (
      <span className="text-xs text-emerald-400">{analysisResult}</span>
    )}
    <select
      value={analysisMode}
      onChange={(e) => setAnalysisMode(e.target.value as "quick" | "deep")}
      className="px-2 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs"
    >
      <option value="quick">Quick (abstract)</option>
      <option value="deep">Deep (full PDF)</option>
    </select>
    {/* Upload PDF button */}
    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs cursor-pointer hover:bg-[var(--muted)] transition-colors">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
      Upload PDF
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleUpload}
        className="hidden"
      />
    </label>
    {uploadMsg && (
      <span className={`text-xs ${uploadMsg.includes("failed") || uploadMsg.includes("No PDF") ? "text-red-400" : "text-emerald-400"}`}>
        {uploadMsg}
      </span>
    )}
    </>
  );
}

// --- Analysis History ---

interface AnalysisRun {
  id: number;
  mode: string;
  status: string;
  engine: string;
  chars: number | null;
  cost: number | null;
  started_at: string | null;
  completed_at: string | null;
  duration_s: number | null;
  html_path: string | null;
  pdf_path: string | null;
  md_path: string | null;
  tex_path: string | null;
  version: number;
}

// --- Summary Card (option A: from structured data, zero cost) ---

interface SummaryCardData {
  paper_id: number;
  title: string;
  doi: string | null;
  journal: string | null;
  publication_date: string | null;
  authors: string[];
  keywords: string[];
  problem_addressed: string | null;
  proposed_method: string | null;
  fl_techniques: string[];
  datasets: string[];
  baselines: string[];
  best_metric_name: string | null;
  best_metric_value: number | null;
  best_baseline_name: string | null;
  best_baseline_value: number | null;
  improvement_delta: number | null;
  privacy_mechanism: string | null;
  privacy_formal: boolean | null;
  reproducibility_score: number | null;
  novelty_level: string | null;
  relevance: string | null;
  healthcare_applicable: boolean | null;
  healthcare_evidence: string | null;
  key_findings_summary: string | null;
  limitations_declared: string[];
  limitations_identified: string[];
}

const NOVELTY_COLORS: Record<string, string> = {
  paradigmatic: "bg-purple-700 text-white",
  moderate: "bg-blue-700 text-white",
  incremental: "bg-gray-600 text-white",
};
const RELEVANCE_COLORS: Record<string, string> = {
  "Molto Alta": "bg-emerald-700 text-white",
  "Alta": "bg-blue-700 text-white",
  "Media": "bg-amber-600 text-white",
  "Bassa": "bg-gray-600 text-white",
};

function SummaryCard({ paperId }: { paperId: number }) {
  const { data, error } = useSWR<SummaryCardData>(
    `/api/v1/analysis/${paperId}/summary-card`,
    authFetcher,
    { shouldRetryOnError: false }
  );

  if (error || !data) return null;

  const repScore = data.reproducibility_score;
  const lims = [...(data.limitations_declared || []), ...(data.limitations_identified || [])];

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Summary Card
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const token = localStorage.getItem("fl-token");
              fetch(`/api/v1/analysis/${paperId}/summary-card-pdf`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              }).then(r => r.blob()).then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `summary_card_${paperId}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              });
            }}
            className="text-[10px] px-2 py-1 rounded bg-red-700 text-white hover:bg-red-600"
          >
            PDF
          </button>
          <span className="text-[10px] text-[var(--muted-foreground)]">from structured analysis</span>
        </div>
      </div>

      {/* Problem & Method */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.problem_addressed && (
          <div className="rounded-lg bg-[var(--secondary)] p-3">
            <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">Problem</span>
            <p className="text-xs mt-1">{data.problem_addressed}</p>
          </div>
        )}
        {data.proposed_method && (
          <div className="rounded-lg bg-[var(--secondary)] p-3">
            <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">Method</span>
            <p className="text-xs mt-1 font-medium">{data.proposed_method}</p>
          </div>
        )}
      </div>

      {/* Techniques & Datasets */}
      <div className="flex flex-wrap gap-3">
        {data.fl_techniques.length > 0 && (
          <div>
            <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">FL Techniques</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {data.fl_techniques.map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-700 text-white">{t}</span>
              ))}
            </div>
          </div>
        )}
        {data.datasets.length > 0 && (
          <div>
            <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">Datasets</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {data.datasets.map((d) => (
                <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-teal-700 text-white">{d}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Performance */}
      {data.best_metric_name && (
        <div className="rounded-lg bg-[var(--secondary)] p-3">
          <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">Performance</span>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-xs text-[var(--muted-foreground)]">{data.best_metric_name}:</span>
            <span className="text-sm font-bold">{data.best_metric_value ?? "—"}</span>
            {data.improvement_delta != null && (
              <span className="text-xs text-emerald-400 font-medium">+{data.improvement_delta}</span>
            )}
            {data.best_baseline_name && (
              <span className="text-[10px] text-[var(--muted-foreground)]">vs {data.best_baseline_name}{data.best_baseline_value != null ? ` (${data.best_baseline_value})` : ""}</span>
            )}
          </div>
        </div>
      )}

      {/* Assessment grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="text-center rounded-lg bg-[var(--secondary)] p-2">
          <span className="text-[10px] text-[var(--muted-foreground)] block">Novelty</span>
          {data.novelty_level ? (
            <span className={cn("text-[10px] px-2 py-0.5 rounded font-semibold mt-1 inline-block", NOVELTY_COLORS[data.novelty_level] || "bg-gray-600 text-white")}>
              {data.novelty_level.toUpperCase()}
            </span>
          ) : <span className="text-xs">—</span>}
        </div>
        <div className="text-center rounded-lg bg-[var(--secondary)] p-2">
          <span className="text-[10px] text-[var(--muted-foreground)] block">Relevance</span>
          {data.relevance ? (
            <span className={cn("text-[10px] px-2 py-0.5 rounded font-semibold mt-1 inline-block", RELEVANCE_COLORS[data.relevance] || "bg-gray-600 text-white")}>
              {data.relevance}
            </span>
          ) : <span className="text-xs">—</span>}
        </div>
        <div className="text-center rounded-lg bg-[var(--secondary)] p-2">
          <span className="text-[10px] text-[var(--muted-foreground)] block">Healthcare</span>
          {data.healthcare_applicable ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-700 text-white font-semibold mt-1 inline-block">YES</span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded bg-gray-600 text-white mt-1 inline-block">NO</span>
          )}
          {data.healthcare_evidence && data.healthcare_evidence !== "none" && (
            <span className="text-[9px] text-[var(--muted-foreground)] block">{data.healthcare_evidence}</span>
          )}
        </div>
        <div className="text-center rounded-lg bg-[var(--secondary)] p-2">
          <span className="text-[10px] text-[var(--muted-foreground)] block">Privacy</span>
          <span className="text-[10px] font-medium mt-1 block">{data.privacy_mechanism || "none"}</span>
          {data.privacy_formal && <span className="text-[9px] text-emerald-400">formal</span>}
        </div>
        <div className="text-center rounded-lg bg-[var(--secondary)] p-2">
          <span className="text-[10px] text-[var(--muted-foreground)] block">Reproducibility</span>
          {repScore != null ? (
            <div className="flex items-center justify-center gap-0.5 mt-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={cn("text-sm", i <= repScore ? "text-amber-400" : "text-gray-600")}>★</span>
              ))}
            </div>
          ) : <span className="text-xs">—</span>}
        </div>
      </div>

      {/* Key Findings */}
      {data.key_findings_summary && (
        <div className="rounded-lg bg-[var(--secondary)] p-3">
          <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">Key Findings</span>
          <p className="text-xs mt-1">{data.key_findings_summary}</p>
        </div>
      )}

      {/* Limitations */}
      {lims.length > 0 && (
        <div>
          <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">Limitations</span>
          <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside text-[var(--muted-foreground)]">
            {lims.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}


function AnalysisHistory({ paperId }: { paperId: number }) {
  const { data: history } = useSWR<AnalysisRun[]>(
    `/api/v1/analysis/${paperId}/history`,
    authFetcher,
    { shouldRetryOnError: false }
  );

  if (!history || history.length === 0) return null;

  const engineLabel = (engine: string) => {
    if (engine.includes("claude")) return "Claude Opus 4.6";
    if (engine.includes("gemma")) return "Gemma4:e4b (local)";
    return engine;
  };

  const formatDt = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
      <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-3">Analysis History</h3>
      <div className="space-y-2">
        {history.map((run, idx) => {
          // Superseded = there's a newer entry with the same mode
          const isSuperseded = history.slice(0, idx).some(r => r.mode === run.mode && r.status === "done");
          return (
          <details key={run.id} className={cn("rounded-lg bg-[var(--secondary)]", isSuperseded && "opacity-50")}>
            <summary className="flex items-center justify-between p-3 cursor-pointer">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-[var(--muted-foreground)] font-mono">#{history.length - idx} (ID:{paperId}) v{run.version || 1}</span>
                {isSuperseded ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-gray-600 text-white">SUPERSEDED</span>
                ) : run.status === "done" ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-400 text-gray-800">CURRENT</span>
                ) : null}
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                  run.mode === "deep" ? "bg-purple-700 text-white" : run.mode === "summary" ? "bg-amber-600 text-white" : "bg-blue-700 text-white"
                }`}>
                  {run.mode.toUpperCase()}
                </span>
                <span className="text-xs font-medium">{engineLabel(run.engine)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  run.status === "done" ? "bg-emerald-700 text-white" :
                  run.status === "failed" ? "bg-red-700 text-white" :
                  "bg-amber-700 text-white"
                }`}>
                  {run.status}
                </span>
                {run.duration_s !== null && (
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    {run.duration_s < 60 ? `${run.duration_s}s` : `${Math.floor(run.duration_s / 60)}m ${run.duration_s % 60}s`}
                  </span>
                )}
              </div>
              <div className="flex gap-1.5 ml-3 shrink-0">
                {run.html_path && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      const token = localStorage.getItem("fl-token");
                      const url = isSuperseded
                        ? `/api/v1/analysis/${paperId}/html?queue_id=${run.id}`
                        : `/api/v1/analysis/${paperId}/html`;
                      fetch(url, {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                      }).then(r => r.text()).then(html => {
                        const w = window.open();
                        if (w) { w.document.write(html); w.document.close(); }
                      });
                    }}
                    className="text-[10px] px-2 py-1 rounded bg-emerald-700 text-white hover:bg-emerald-600"
                  >
                    View
                  </button>
                )}
                {run.pdf_path && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      const token = localStorage.getItem("fl-token");
                      const url = isSuperseded
                        ? `/api/v1/analysis/${paperId}/pdf?queue_id=${run.id}`
                        : `/api/v1/analysis/${paperId}/pdf`;
                      fetch(url, {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                      }).then(r => r.blob()).then(blob => {
                        const blobUrl = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = blobUrl;
                        a.download = `analysis_${run.mode}_${paperId}.pdf`;
                        a.click();
                        URL.revokeObjectURL(blobUrl);
                      });
                    }}
                    className="text-[10px] px-2 py-1 rounded bg-red-700 text-white hover:bg-red-600"
                  >
                    PDF
                  </button>
                )}
                {run.md_path && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      const token = localStorage.getItem("fl-token");
                      const url = isSuperseded
                        ? `/api/v1/analysis/${paperId}/md?queue_id=${run.id}`
                        : `/api/v1/analysis/${paperId}/md`;
                      fetch(url, {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                      }).then(r => r.blob()).then(blob => {
                        const blobUrl = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = blobUrl;
                        a.download = `analysis_${run.mode}_${paperId}_v${run.version || 1}.md`;
                        a.click();
                        URL.revokeObjectURL(blobUrl);
                      });
                    }}
                    className="text-[10px] px-2 py-1 rounded bg-gray-700 text-white hover:bg-gray-600"
                  >
                    MD
                  </button>
                )}
                {run.tex_path && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      const token = localStorage.getItem("fl-token");
                      const url = isSuperseded
                        ? `/api/v1/analysis/${paperId}/tex?queue_id=${run.id}`
                        : `/api/v1/analysis/${paperId}/tex`;
                      fetch(url, {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                      }).then(r => r.blob()).then(blob => {
                        const blobUrl = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = blobUrl;
                        a.download = `analysis_${run.mode}_${paperId}_v${run.version || 1}.tex`;
                        a.click();
                        URL.revokeObjectURL(blobUrl);
                      });
                    }}
                    className="text-[10px] px-2 py-1 rounded bg-teal-700 text-white hover:bg-teal-600"
                  >
                    TEX
                  </button>
                )}
              </div>
            </summary>
            <div className="px-3 pb-3 pt-1 text-[10px] text-[var(--muted-foreground)] space-y-1 border-t border-[var(--border)]">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                <span>Engine:</span><span className="text-[var(--foreground)]">{engineLabel(run.engine)}</span>
                <span>Mode:</span><span className="text-[var(--foreground)]">{run.mode.toUpperCase()}</span>
                <span>Start:</span><span className="text-[var(--foreground)]">{formatDt(run.started_at)}</span>
                <span>End:</span><span className="text-[var(--foreground)]">{formatDt(run.completed_at)}</span>
                <span>Duration:</span><span className="text-[var(--foreground)]">{run.duration_s !== null ? (run.duration_s < 60 ? `${run.duration_s} seconds` : `${Math.floor(run.duration_s / 60)}m ${run.duration_s % 60}s`) : "—"}</span>
                {run.chars && <><span>Output:</span><span className="text-[var(--foreground)]">{run.chars.toLocaleString()} chars</span></>}
                {run.cost && <><span>Est. Cost:</span><span className="text-[var(--foreground)]">${run.cost.toFixed(4)}</span></>}
                {run.html_path && <><span>Report:</span><span className="text-[var(--foreground)] font-mono truncate">{run.html_path}</span></>}
              </div>
            </div>
          </details>
          );
        })}
      </div>
    </div>
  );
}


// --- Disable Toggle ---

function DisableToggle({ paperId, initialDisabled }: { paperId: number; initialDisabled: boolean }) {
  const [disabled, setDisabled] = useState(initialDisabled);

  const toggle = async () => {
    const res = await api.toggleDisabled(paperId);
    setDisabled(res.disabled);
  };

  return (
    <button
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
        disabled
          ? "bg-red-800 text-white hover:bg-red-700"
          : "bg-[var(--secondary)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
      }`}
    >
      {disabled ? "DISABLED — Click to Enable" : "Disable Paper"}
    </button>
  );
}


// --- Enrich Button ---

function EnrichButton({ paperId }: { paperId: number }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);

  const enrich = async () => {
    setStatus("loading");
    try {
      const res = await api.enrichPaper(paperId);
      if (res.status === "enriched") {
        setStatus("done");
        setResult(`Enriched from ${res.source}`);
        // Reload page to show updated data
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setStatus("error");
        setResult("Not found on any source");
      }
    } catch {
      setStatus("error");
      setResult("Enrichment failed");
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={enrich}
        disabled={status === "loading" || status === "done"}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-700 text-white text-sm font-medium hover:bg-cyan-600 transition-colors disabled:opacity-50"
      >
        {status === "loading" ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Enriching...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Enrich Metadata
          </>
        )}
      </button>
      {result && (
        <span className={`text-xs ${status === "done" ? "text-emerald-400" : "text-red-400"}`}>
          {result}
        </span>
      )}
    </div>
  );
}


// --- Sync Paper to Zotero ---

function SyncPaperToZotero({ paperId, hasZoteroKey }: { paperId: number; hasZoteroKey: boolean }) {
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const sync = async () => {
    setStatus("syncing");
    setMsg(null);
    try {
      const res = await api.syncToZotero([paperId]);
      if (res.synced > 0) {
        setStatus("done");
        setMsg("Synced to Zotero");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setStatus("error");
        setMsg("Sync failed");
      }
    } catch (e: any) {
      setStatus("error");
      setMsg(e.message || "Sync failed");
    }
  };

  const remove = async () => {
    if (!confirm("Remove this paper from Zotero? This will delete the Zotero item and all its attachments.")) return;
    setRemoving(true);
    setMsg(null);
    try {
      await api.removeFromZotero(paperId);
      setMsg("Removed from Zotero");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setMsg(e.message || "Remove failed");
    }
    setRemoving(false);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={sync}
        disabled={status === "syncing" || status === "done" || removing}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-700 text-white text-sm font-medium hover:bg-cyan-600 transition-colors disabled:opacity-50"
      >
        {status === "syncing" ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Syncing...
          </>
        ) : status === "done" ? (
          "Synced!"
        ) : hasZoteroKey ? (
          "Update Zotero"
        ) : (
          "Sync to Zotero"
        )}
      </button>
      {hasZoteroKey && (
        <button
          onClick={remove}
          disabled={removing}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-800 text-white text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {removing ? "Removing..." : "Remove from Zotero"}
        </button>
      )}
      {msg && (
        <span className={`text-xs ${msg.includes("Removed") || msg.includes("Synced") ? "text-emerald-400" : "text-red-400"}`}>{msg}</span>
      )}
    </div>
  );
}


// --- Sync Analysis to Zotero ---

function SyncAnalysisToZotero({ paperId }: { paperId: number }) {
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const sync = async () => {
    setStatus("syncing");
    setMsg(null);
    try {
      const res = await api.syncAnalysisToZotero(paperId);
      setStatus("done");
      if (res.status === "already_synced") {
        setMsg("Already synced to Zotero");
      } else {
        setMsg(`Uploaded: ${res.filenames?.join(", ") || res.filename}`);
      }
    } catch (e: any) {
      setStatus("error");
      setMsg(e.message || "Sync failed");
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={sync}
        disabled={status === "syncing" || status === "done"}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-700 text-white text-sm font-medium hover:bg-cyan-600 transition-colors disabled:opacity-50"
      >
        {status === "syncing" ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Syncing...
          </>
        ) : status === "done" ? (
          "Synced to Zotero"
        ) : (
          "Sync Analysis to Zotero"
        )}
      </button>
      {msg && (
        <span className={`text-xs ${status === "done" ? "text-emerald-400" : "text-red-400"}`}>
          {msg}
        </span>
      )}
    </div>
  );
}


// Reuse ElapsedTimer
function RefreshCitationButton({ paperId }: { paperId: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await api.refreshCitationsSingle(paperId);
      if (res.status === "updated") {
        setResult(`${res.old} -> ${res.new}`);
        // Refresh paper data
        mutate(`/api/v1/papers/${paperId}`);
      } else if (res.status === "unchanged") {
        setResult("up to date");
      } else {
        setResult(res.status);
      }
    } catch {
      setResult("error");
    }
    setLoading(false);
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={refresh}
        disabled={loading}
        className="p-0.5 rounded hover:bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
        title="Refresh citation count from Semantic Scholar"
      >
        <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
      {result && <span className="text-[10px] text-emerald-400">{result}</span>}
    </span>
  );
}


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
