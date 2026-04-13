"use client";

import { use, useState, useEffect, useRef } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { usePaper } from "@/hooks/usePapers";
import { api, authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import { formatDate, SOURCE_LABELS, SOURCE_COLORS, cn } from "@/lib/utils";
import ReviewJournal from "@/components/ReviewJournal";
import SubmissionTimeline from "@/components/SubmissionTimeline";

// --- Editable Header (title + metadata editing for my_manuscript/reviewing papers) ---
function EditableHeader({ paper, paperId }: { paper: any; paperId: number }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(paper.title);
  const [journal, setJournal] = useState(paper.journal || "");
  const [pubDate, setPubDate] = useState(paper.publication_date || "");
  const [abstract, setAbstract] = useState(paper.abstract || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/v1/papers/${paperId}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          title: title.trim() || null,
          journal: journal.trim() || null,
          publication_date: pubDate || null,
          abstract: abstract.trim() || null,
        }),
      });
      if (r.ok) {
        mutate(`/api/v1/papers/${paperId}`);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
        <div>
          <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Journal / Conference</label>
            <input value={journal} onChange={e => setJournal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Submission / Publication Date</label>
            <input type="date" value={pubDate} onChange={e => setPubDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Abstract</label>
          <textarea value={abstract} onChange={e => setAbstract(e.target.value)} rows={3}
            className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none resize-y" />
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-600 disabled:opacity-50">
            {saving ? "..." : "Save"}
          </button>
          <button onClick={() => setEditing(false)}
            className="px-4 py-2 rounded-lg bg-[var(--secondary)] text-xs hover:bg-[var(--muted)]">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <h1 className="text-2xl font-bold leading-snug flex-1">{paper.title}</h1>
      {(paper.paper_role === "my_manuscript" || paper.paper_role === "reviewing") && (
        <button
          onClick={() => setEditing(true)}
          className="text-[10px] px-2 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--muted)] text-[var(--muted-foreground)] shrink-0 mt-1"
          title="Edit paper metadata"
        >
          Edit
        </button>
      )}
    </div>
  );
}

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
    <div className="max-w-4xl space-y-6 overflow-hidden">
      {/* Back */}
      <Link href="/papers" className="text-sm text-[var(--primary)] hover:underline">
        &larr; Back to papers
      </Link>

      {/* Header */}
      <EditableHeader paper={paper} paperId={paperId} />
      <div>
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
          {paper.paper_role === "reviewing" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-600 text-white font-bold">
              REVIEWING
            </span>
          )}
          {paper.paper_role === "my_manuscript" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold">
              MY MANUSCRIPT
            </span>
          )}
          {(paper.paper_role === "my_manuscript" || paper.paper_role === "reviewing") && !paper.doi && (
            <button
              onClick={() => {
                const doi = prompt("Enter the DOI assigned upon publication:");
                if (!doi) return;
                fetch(`/api/v1/papers/${paperId}/mark-published?doi=${encodeURIComponent(doi.trim())}`, {
                  method: "POST",
                  headers: authHeaders(),
                }).then(r => {
                  if (r.ok) {
                    mutate(`/api/v1/papers/${paperId}`);
                  } else {
                    r.json().then(e => alert(e.detail || "Failed")).catch(() => alert("Failed"));
                  }
                });
              }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-700 text-white font-bold hover:bg-emerald-600 transition-colors cursor-pointer"
              title="Mark this paper as published by assigning its DOI"
            >
              Mark as Published
            </button>
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
      <div className="flex items-center gap-2 flex-wrap">
        <SyncPaperToZotero paperId={paperId} hasZoteroKey={!!paper.zotero_key} />
        {paper.zotero_key && (
          <>
            <a
              href={`zotero://select/library/items/${paper.zotero_key}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-700 text-white text-xs font-medium hover:bg-amber-600 transition-colors"
              title="Open in Zotero desktop app"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open in Zotero
            </a>
            <a
              href={`https://www.zotero.org/users/14445641/items/${paper.zotero_key}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-900 text-white text-xs font-medium hover:bg-amber-800 transition-colors"
              title="Open on zotero.org (web)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.6 9h16.8M3.6 15h16.8M11 3a17 17 0 000 18M13 3a17 17 0 010 18" />
              </svg>
              Web
            </a>
          </>
        )}
        {/* spacer pushes review buttons to the far right */}
        <div className="ml-auto" />
        {/* Peer Review link — only shown when this paper has a linked peer review */}
        {paper.peer_review_id && (
          <Link
            href={`/peer-review/${paper.peer_review_id}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-transform hover:scale-105"
            style={{
              backgroundColor: "#06b6d4",
              color: "#ffffff",
              border: "3px solid #0e7490",
              boxShadow: "0 2px 8px rgba(14, 116, 144, 0.4)",
            }}
            title="Open the peer review form for this manuscript"
          >
            Peer Review
          </Link>
        )}
        <Link
          href={`/paper-quality/${paperId}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-transform hover:scale-105"
          style={{
            backgroundColor: "#fde047",          // bright lime/yellow background
            color: "#1e1b4b",                    // very dark indigo text
            border: "3px solid #7c3aed",         // bold purple border
            boxShadow: "0 2px 8px rgba(124, 58, 237, 0.4)",
          }}
          title="Open the scientific quality assessment for this paper"
        >
          Quality Review
        </Link>
      </div>

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
              <dt className="text-[var(--muted-foreground)]">Rating</dt>
              <dd><RatingWidget paperId={paperId} initialRating={paper.rating} /></dd>
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
              fetch(`/api/v1/papers/${paperId}/pdf-file`, {
                headers: authHeaders(),
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

        {/* Citation Network */}
        <Link
          href={`/network?tab=citations&paper_id=${paperId}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Citation Network
        </Link>

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

        {/* Tutor check decision */}
        <TutorCheckWidget paperId={paperId} initial={paper.tutor_check || null} />

        {/* Generate Analysis */}
        <AnalysisButton paperId={paperId} />
      </div>

      {/* Summary Card */}
      <SummaryCard paperId={paperId} />

      {/* Submission Timeline — shown for my_manuscript and reviewing papers */}
      {paper.paper_role !== "bibliography" && (
        <SubmissionTimeline paperId={paperId} />
      )}

      {/* Analysis History */}
      <AnalysisHistory paperId={paperId} hasZoteroKey={!!paper.zotero_key} hasPaperPdf={!!paper.has_pdf} />

      {/* Review Journal — shown for reviewing/my_manuscript papers, or any paper that has entries */}
      {(paper.paper_role !== "bibliography" || paper.peer_review_id) && (
        <ReviewJournal paperId={paperId} />
      )}
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

  const [analysisMode, setAnalysisMode] = useState<"quick" | "deep" | "summary" | "extended">("quick");
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
            fetch(`/api/v1/analysis/${paperId}/pdf`, {
              headers: authHeaders(),
            })
              .then((r) => r.blob())
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `analysis_${paperId}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              });
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-medium hover:bg-red-600 transition-colors"
        >
          Analysis PDF
        </button>
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
              {analysisMode.toUpperCase()} Analysis via Claude Opus 4.6... {startTime && <ElapsedTimer startTime={startTime} />}
            </>
          ) : (
            "Rigenera Analisi"
          )}
        </button>
        {analysisResult && (
          <div className="w-full mt-2 px-4 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-sm text-gray-800 font-medium">
            {analysisResult}
          </div>
        )}
        <select
          value={analysisMode}
          onChange={(e) => setAnalysisMode(e.target.value as "quick" | "deep" | "summary" | "extended")}
          className="px-2 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs"
        >
          <option value="quick">Quick (~5 pages)</option>
          <option value="deep">Deep (~7+ pages)</option>
          <option value="summary">Summary (1 page)</option>
          <option value="extended">Extended Abstract (2 pages)</option>
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
      onChange={(e) => setAnalysisMode(e.target.value as "quick" | "deep" | "summary" | "extended")}
      className="px-2 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs"
    >
      <option value="quick">Quick (~5 pages)</option>
      <option value="deep">Deep (~7+ pages)</option>
      <option value="summary">Summary (1 page)</option>
      <option value="extended">Extended Abstract (2 pages)</option>
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
  zotero_synced: boolean;
  validation_status: string | null;
  validation_score: number | null;
  validation_notes: string | null;
  validation_rubric: RubricItem[] | null;
  validated_at: string | null;
  validated_by: string | null;
}

interface RubricItem {
  section: string;
  score: number | null;
  missing: boolean;
  note: string;
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
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-5 space-y-4 overflow-hidden" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
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
              fetch(`/api/v1/analysis/${paperId}/summary-card-pdf`, {
                headers: authHeaders(),
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
          <div className="rounded-lg bg-[var(--secondary)] p-3 min-w-0">
            <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">Problem</span>
            <p className="text-xs mt-1 break-words">{data.problem_addressed}</p>
          </div>
        )}
        {data.proposed_method && (
          <div className="rounded-lg bg-[var(--secondary)] p-3 min-w-0">
            <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">Method</span>
            <p className="text-xs mt-1 font-medium break-words">{data.proposed_method}</p>
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 overflow-hidden">
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
          <p className="text-xs mt-1 break-words">{data.key_findings_summary}</p>
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


function AnalysisHistory({ paperId, hasZoteroKey, hasPaperPdf }: { paperId: number; hasZoteroKey: boolean; hasPaperPdf: boolean }) {
  const { data: history, mutate: mutateHistory } = useSWR<AnalysisRun[]>(
    `/api/v1/analysis/${paperId}/history`,
    authFetcher,
    { shouldRetryOnError: false }
  );
  const [reviewing, setReviewing] = useState<AnalysisRun | null>(null);
  const [diffing, setDiffing] = useState<AnalysisRun | null>(null);

  // Auto-open review modal when URL has ?review={queue_id} (from /review queue page)
  useEffect(() => {
    if (typeof window === "undefined" || !history) return;
    const params = new URLSearchParams(window.location.search);
    const reviewId = params.get("review");
    if (reviewId) {
      const target = history.find(r => String(r.id) === reviewId);
      if (target) {
        setReviewing(target);
        // Clean URL so refresh doesn't re-open
        const url = new URL(window.location.href);
        url.searchParams.delete("review");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [history]);

  if (!history || history.length === 0) return null;

  const validationBadge = (run: AnalysisRun) => {
    if (!run.validation_status) return null;
    const cls = run.validation_status === "validated"
      ? "bg-emerald-700 text-white"
      : run.validation_status === "rejected"
      ? "bg-red-700 text-white"
      : run.validation_status === "needs_revision"
      ? "bg-orange-600 text-white"
      : "bg-gray-600 text-white";
    const label = run.validation_status === "validated"
      ? "✓ VALIDATED"
      : run.validation_status === "rejected"
      ? "✗ REJECTED"
      : run.validation_status === "needs_revision"
      ? "⟳ REVISION"
      : "PENDING";
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${cls}`} title={`By ${run.validated_by || "?"} on ${run.validated_at || ""}${run.validation_score ? ` — Score ${run.validation_score}/5` : ""}`}>
        {label}{run.validation_score ? ` ${run.validation_score}/5` : ""}
      </span>
    );
  };

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
                <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                  #{history.length - idx} (ID:{paperId}) v{run.version || 1}
                  {run.zotero_synced && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-700 text-white font-medium" title="Synced to Zotero">✓Z</span>}
                </span>
                {isSuperseded ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-gray-600 text-white">SUPERSEDED</span>
                ) : run.status === "done" ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-400 text-gray-800">CURRENT</span>
                ) : null}
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                  run.mode === "deep" ? "bg-purple-700 text-white" : run.mode === "summary" ? "bg-amber-600 text-white" : run.mode === "extended" ? "bg-red-700 text-white" : "bg-blue-700 text-white"
                }`}>
                  {run.mode === "extended" ? "EXT.ABS" : run.mode.toUpperCase()}
                </span>
                <span className="text-xs font-medium">{engineLabel(run.engine)}</span>
                {run.status === "failed" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-700 text-white">FAILED</span>
                )}
                {run.duration_s !== null && (
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    {run.duration_s < 60 ? `${run.duration_s}s` : `${Math.floor(run.duration_s / 60)}m ${run.duration_s % 60}s`}
                  </span>
                )}
                {validationBadge(run)}
              </div>
              <div className="flex gap-1.5 ml-3 shrink-0">
                {run.status === "done" && (
                  <button
                    onClick={(e) => { e.preventDefault(); setReviewing(run); }}
                    className="text-[10px] px-2 py-1 rounded bg-yellow-400 text-black font-bold border-2 border-red-600 hover:bg-yellow-300"
                  >
                    Review
                  </button>
                )}
                {run.status === "done" && (run.version || 1) > 1 && (
                  <button
                    onClick={(e) => { e.preventDefault(); setDiffing(run); }}
                    className="text-[10px] px-2 py-1 rounded bg-fuchsia-700 text-white font-bold hover:bg-fuchsia-600"
                    title="Compare with previous version"
                  >
                    Diff
                  </button>
                )}
                {run.html_path && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      fetch(`/api/v1/analysis/${paperId}/html?queue_id=${run.id}`, {
                        headers: authHeaders(),
                      }).then(r => r.text()).then(html => {
                        const blob = new Blob([html], { type: "text/html" });
                        window.open(URL.createObjectURL(blob), '_blank');
                      });
                    }}
                    className="text-[10px] px-2 py-1 rounded bg-gray-300 text-gray-800 hover:bg-gray-400 font-bold"
                  >
                    View
                  </button>
                )}
                {run.pdf_path && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      const url = `/api/v1/analysis/${paperId}/pdf?queue_id=${run.id}`;
                      fetch(url, {
                        headers: authHeaders(),
                      }).then(r => r.blob()).then(blob => {
                        const blobUrl = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = blobUrl;
                        a.download = `analysis_${run.mode}_${paperId}_v${run.version || 1}.pdf`;
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
                      const url = `/api/v1/analysis/${paperId}/md?queue_id=${run.id}`;
                      fetch(url, {
                        headers: authHeaders(),
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
                      const url = `/api/v1/analysis/${paperId}/tex?queue_id=${run.id}`;
                      fetch(url, {
                        headers: authHeaders(),
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
      {reviewing && (
        <ReviewModal
          run={reviewing}
          paperId={paperId}
          hasZoteroKey={hasZoteroKey}
          hasPaperPdf={hasPaperPdf}
          onClose={() => setReviewing(null)}
          onSaved={() => { setReviewing(null); mutateHistory(); }}
        />
      )}
      {diffing && (
        <DiffModal
          run={diffing}
          paperId={paperId}
          onClose={() => setDiffing(null)}
        />
      )}
    </div>
  );
}


// --- Review Modal (side-by-side: analysis on left, rubric on right) ---

function ReviewModal({ run, paperId, hasZoteroKey, hasPaperPdf: hasPaperPdfProp, onClose, onSaved }: {
  run: AnalysisRun;
  paperId: number;
  hasZoteroKey: boolean;
  hasPaperPdf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<string>(run.validation_status || "validated");
  const [notes, setNotes] = useState<string>(run.validation_notes || "");
  const [generalScore, setGeneralScore] = useState<number | null>(null);
  const [rubric, setRubric] = useState<RubricItem[]>([]);
  const [reviewerScore, setReviewerScore] = useState<number | null>(run.validation_score || null);
  // If a saved validation_score exists, treat it as "manually set" so the auto-recompute
  // useEffect doesn't overwrite it when re-opening an existing review.
  const [reviewerScoreEdited, setReviewerScoreEdited] = useState(
    run.validation_score !== null && run.validation_score !== undefined
  );
  const [statusEdited, setStatusEdited] = useState(!!run.validation_status);
  const [analysisHtml, setAnalysisHtml] = useState<string>("");
  // Markdown split by section — source of truth for the inline section editor
  const [sectionsMd, setSectionsMd] = useState<Record<string, string>>({});
  // Pending edits keyed by section name. Empty = no pending edits.
  const [editedSections, setEditedSections] = useState<Record<string, string>>({});
  // Which section is currently being edited in the inline textarea
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [hasPaperPdf, setHasPaperPdf] = useState(hasPaperPdfProp);
  const [paperPdfBlobUrl, setPaperPdfBlobUrl] = useState<string | null>(null);
  const [paperPdfLoading, setPaperPdfLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"abstract" | "paper">("abstract");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Load rubric (existing or template) and analysis HTML in parallel
  useEffect(() => {
    const auth = authHeaders();

    Promise.all([
      fetch(`/api/v1/analysis/queue/${run.id}/rubric-template`, { headers: auth }).then(r => r.json()),
      fetch(`/api/v1/analysis/${paperId}/html?queue_id=${run.id}`, { headers: auth }).then(r => r.text()),
      fetch(`/api/v1/analysis/${paperId}/md?queue_id=${run.id}`, { headers: auth }).then(r => r.ok ? r.text() : ""),
    ])
      .then(([rubricRes, html, md]) => {
        setRubric(rubricRes.items || []);
        setGeneralScore(rubricRes.general_score ?? null);
        setAnalysisHtml(html);
        // Parse markdown into sections by H2 headers (## Section)
        const parsed: Record<string, string> = {};
        if (md) {
          // Strip YAML front-matter
          let body = md;
          if (body.startsWith("---")) {
            const end = body.indexOf("---", 3);
            if (end > 0) body = body.slice(end + 3).replace(/^\n+/, "");
          }
          let current: string | null = null;
          let buffer: string[] = [];
          for (const line of body.split("\n")) {
            if (line.startsWith("## ")) {
              if (current !== null) parsed[current] = buffer.join("\n").trim();
              current = line.slice(3).trim();
              buffer = [];
            } else if (current !== null) {
              buffer.push(line);
            }
          }
          if (current !== null) parsed[current] = buffer.join("\n").trim();
        }
        setSectionsMd(parsed);
      })
      .catch((e) => setError(`Load failed: ${e.message}`))
      .finally(() => setLoading(false));

    // hasPaperPdf comes from the parent (paper.has_pdf). No HEAD probe needed:
    // the /pdf-file endpoint doesn't expose HEAD (FastAPI only registered GET → 405).
  }, [run.id, paperId]);

  // Lazy-load the paper PDF as blob URL the first time the user opens the tab
  useEffect(() => {
    if (activeTab !== "paper" || !hasPaperPdf || paperPdfBlobUrl || paperPdfLoading) return;
    setPaperPdfLoading(true);
    fetch(`/api/v1/papers/${paperId}/pdf-file`, {
      headers: authHeaders(),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => setPaperPdfBlobUrl(URL.createObjectURL(blob)))
      .catch(() => setHasPaperPdf(false))
      .finally(() => setPaperPdfLoading(false));
  }, [activeTab, hasPaperPdf, paperPdfBlobUrl, paperPdfLoading, paperId]);

  // Revoke blob URL on unmount to free memory
  useEffect(() => {
    return () => {
      if (paperPdfBlobUrl) URL.revokeObjectURL(paperPdfBlobUrl);
    };
  }, [paperPdfBlobUrl]);

  // Auto score from rubric (per-item scores + general_score)
  const computedScore = (() => {
    const values: number[] = [];
    for (const r of rubric) {
      if (r.missing) values.push(1);
      else if (r.score !== null && r.score >= 1 && r.score <= 5) values.push(r.score);
    }
    if (generalScore !== null && generalScore >= 1 && generalScore <= 5) values.push(generalScore);
    if (values.length === 0) return null;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.max(1, Math.min(5, Math.round(avg)));
  })();

  // If user hasn't manually edited reviewer score, keep it in sync with computed
  useEffect(() => {
    if (!reviewerScoreEdited && computedScore !== null) {
      setReviewerScore(computedScore);
    }
  }, [computedScore, reviewerScoreEdited]);

  // Auto-suggest status from reviewer score (unless user has manually picked one)
  // 5: validated · 4: validated · 3: needs_revision · 2: needs_revision · 1: rejected
  useEffect(() => {
    if (statusEdited || reviewerScore === null) return;
    if (reviewerScore >= 4)      setStatus("validated");
    else if (reviewerScore >= 2) setStatus("needs_revision");
    else                          setStatus("rejected");
  }, [reviewerScore, statusEdited]);

  const updateItem = (idx: number, patch: Partial<RubricItem>) => {
    setRubric(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const auth = authHeaders();

      // Step 0: if there are pending in-place edits on the analysis sections,
      // fork the analysis first and redirect the rest of the save to the new version.
      let targetQueueId = run.id;
      const editCount = Object.keys(editedSections).length;
      if (editCount > 0) {
        setSavePhase(`Forking analysis (v+1) with ${editCount} edit${editCount > 1 ? "s" : ""}...`);
        const forkRes = await fetch(`/api/v1/analysis/queue/${run.id}/fork`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify({
            edits: Object.entries(editedSections).map(([section, text]) => ({ section, text })),
          }),
        });
        if (!forkRes.ok) {
          const err = await forkRes.json().catch(() => ({}));
          throw new Error(err.detail || "Fork failed");
        }
        const forkData = await forkRes.json();
        targetQueueId = forkData.queue_id;
      }

      // Step 1: persist the review on the (possibly new) target queue id
      setSavePhase("Saving review...");
      const res = await fetch(`/api/v1/analysis/queue/${targetQueueId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({
          status,
          notes: notes || null,
          rubric,
          general_score: generalScore,
          score: reviewerScore,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Save failed");
      }

      // Step 2: ALWAYS sync to Zotero — create the paper if it isn't there yet,
      // then upload the Extended Abstract analysis attachment.
      // The backend /zotero/sync calls add_paper() when zotero_key is null.
      // The validation report is intentionally kept LOCAL only.
      setSavePhase(hasZoteroKey ? "Updating metadata on Zotero..." : "Creating paper on Zotero...");
      try {
        const syncRes = await fetch(`/api/v1/zotero/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify({ paper_ids: [paperId] }),
        });
        if (!syncRes.ok) {
          const err = await syncRes.json().catch(() => ({}));
          throw new Error(err.detail || `Zotero paper sync failed (${syncRes.status})`);
        }

        setSavePhase("Uploading Extended Abstract to Zotero...");
        const aRes = await fetch(`/api/v1/zotero/sync-analysis/${paperId}`, {
          method: "POST",
          headers: auth,
        });
        if (!aRes.ok) {
          const err = await aRes.json().catch(() => ({}));
          // 404 "No Extended Abstract" is informational, not an error: the paper
          // metadata has been synced regardless. Tolerate it silently.
          if (aRes.status !== 404 || !String(err.detail || "").includes("Extended Abstract")) {
            throw new Error(err.detail || `Zotero analysis sync failed (${aRes.status})`);
          }
        }

        // Force the parent paper detail to re-fetch so zotero_key / badges update
        mutate(`/api/v1/papers/${paperId}`);
      } catch (zErr: any) {
        // Review IS saved locally — surface Zotero failure but don't lose the save
        setError(`Review saved, but Zotero sync failed: ${zErr.message}. You can retry from "Update Zotero" on the paper detail.`);
        setSaving(false);
        setSavePhase("");
        return;
      }

      onSaved();
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
      setSavePhase("");
    }
  };

  const modeLabel = run.mode === "extended" ? "Extended Abstract" : run.mode.charAt(0).toUpperCase() + run.mode.slice(1);

  // Open the validation report PDF (regenerated server-side, only if at least one validated)
  const viewValidationReport = () => {
    fetch(`/api/v1/analysis/${paperId}/validation-report`, {
      headers: authHeaders(),
    })
      .then(r => {
        if (!r.ok) throw new Error("Validation report not available — save at least one review first");
        return r.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      })
      .catch(e => alert(e.message));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2" onClick={onClose}>
      <div
        className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full h-[95vh] max-w-[1800px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold">Review — {modeLabel} (v{run.version || 1})</h3>
            <span className="text-xs text-[var(--muted-foreground)]">Paper ID: {paperId}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={viewValidationReport}
              className="text-[10px] px-2 py-1 rounded bg-teal-700 text-white hover:bg-teal-600 font-bold"
              title="Open the latest validation report PDF"
            >
              View Validation PDF
            </button>
            <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl leading-none px-2">✕</button>
          </div>
        </div>

        {/* Body: side-by-side */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT: Tabbed preview (Extended Abstract / Paper PDF) */}
          <div className="flex-1 border-r border-[var(--border)] flex flex-col overflow-hidden bg-white">
            {/* Tab bar */}
            <div className="flex shrink-0 border-b border-gray-300 bg-gray-100">
              <button
                onClick={() => setActiveTab("abstract")}
                className={`px-4 py-2 text-xs font-bold transition-colors ${
                  activeTab === "abstract"
                    ? "bg-white text-gray-900 border-b-2 border-indigo-600"
                    : "text-gray-600 hover:bg-gray-200"
                }`}
              >
                📄 {modeLabel} (analysis)
              </button>
              <button
                onClick={() => setActiveTab("paper")}
                disabled={!hasPaperPdf}
                className={`px-4 py-2 text-xs font-bold transition-colors ${
                  activeTab === "paper"
                    ? "bg-white text-gray-900 border-b-2 border-indigo-600"
                    : "text-gray-600 hover:bg-gray-200"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
                title={hasPaperPdf ? "Open the original paper PDF" : "No local PDF available for this paper"}
              >
                📕 Original Paper PDF
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {activeTab === "abstract" ? (
                loading ? (
                  <div className="h-full flex items-center justify-center text-gray-500">Loading analysis...</div>
                ) : (
                  <iframe
                    title="Analysis preview"
                    srcDoc={analysisHtml}
                    className="w-full h-full border-0"
                    sandbox="allow-same-origin"
                  />
                )
              ) : !hasPaperPdf ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">No local PDF available for this paper</div>
              ) : paperPdfLoading || !paperPdfBlobUrl ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">Loading paper PDF...</div>
              ) : (
                <iframe
                  title="Original paper PDF"
                  src={`${paperPdfBlobUrl}#view=FitH`}
                  className="w-full h-full border-0"
                />
              )}
            </div>
          </div>

          {/* RIGHT: Rubric + status + notes */}
          <div className="w-[44%] min-w-[440px] flex flex-col overflow-hidden">
            <div className="overflow-y-auto p-4 flex-1 space-y-4">
              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: "validated", l: "✓ Validate", c: "bg-emerald-700 hover:bg-emerald-600" },
                    { v: "needs_revision", l: "⟳ Revision", c: "bg-orange-600 hover:bg-orange-500" },
                    { v: "rejected", l: "✗ Reject", c: "bg-red-700 hover:bg-red-600" },
                  ].map(opt => (
                    <button
                      key={opt.v}
                      onClick={() => { setStatus(opt.v); setStatusEdited(true); }}
                      className={`px-3 py-2 rounded text-xs font-bold text-white ${opt.c} ${status === opt.v ? "ring-2 ring-white/60" : "opacity-60"}`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
                {!statusEdited && reviewerScore !== null && (
                  <p className="text-[9px] text-[var(--muted-foreground)] mt-1 italic">auto-selected from reviewer score · click to override</p>
                )}
              </div>

              {/* Computed + Reviewer scores */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-3 py-2 rounded bg-[var(--secondary)] border border-[var(--border)]">
                  <span className="text-xs font-medium text-[var(--muted-foreground)]">Computed score</span>
                  <span className="text-sm">
                    {computedScore !== null ? (
                      <>
                        <span className="text-amber-400">{"★".repeat(computedScore)}</span>
                        <span className="text-gray-600">{"★".repeat(5 - computedScore)}</span>
                        <span className="ml-2 text-[var(--foreground)] font-bold">{computedScore}/5</span>
                      </>
                    ) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 rounded bg-[var(--secondary)] border-2 border-red-600">
                  <div>
                    <div className="text-xs font-bold text-red-500">Reviewer score (saved)</div>
                    <div className="text-[9px] text-[var(--muted-foreground)]">final · stored as validation_score</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          onClick={() => { setReviewerScore(n); setReviewerScoreEdited(true); }}
                          className={`text-xl leading-none px-0.5 ${n <= (reviewerScore || 0) ? "text-red-500" : "text-gray-700"} hover:scale-110 transition-transform`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <span className="text-sm text-red-500 font-bold">{reviewerScore || "—"}/5</span>
                    {reviewerScoreEdited && (
                      <button
                        onClick={() => { setReviewerScoreEdited(false); setReviewerScore(computedScore); }}
                        className="text-[9px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline"
                        title="Reset to computed"
                      >
                        reset
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Rubric */}
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">
                  Rubric ({rubric.filter(r => r.score !== null && !r.missing).length}/{rubric.length} scored · {rubric.filter(r => r.missing).length} missing
                  {Object.keys(editedSections).length > 0 && <> · <span className="text-fuchsia-400">{Object.keys(editedSections).length} edited</span></>})
                </label>
                <div className="space-y-1.5">
                  {rubric.map((item, idx) => {
                    const hasEdit = editedSections[item.section] !== undefined;
                    const sectionAvailable = sectionsMd[item.section] !== undefined;
                    const isEditing = editingSection === item.section;
                    return (
                    <div key={item.section} className={`rounded border bg-[var(--secondary)] p-2 ${hasEdit ? "border-fuchsia-600" : "border-[var(--border)]"}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[var(--foreground)] flex-1">
                          {item.section}
                          {hasEdit && <span className="ml-1 text-[9px] text-fuchsia-400 font-bold">● EDITED</span>}
                        </span>
                        {/* Per-item star score */}
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              onClick={() => updateItem(idx, { score: n, missing: false })}
                              disabled={item.missing}
                              className={`text-base leading-none px-0.5 ${
                                !item.missing && item.score !== null && n <= item.score
                                  ? "text-amber-400"
                                  : "text-gray-700"
                              } hover:scale-110 transition-transform disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                        {sectionAvailable && (
                          <button
                            onClick={() => setEditingSection(isEditing ? null : item.section)}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              isEditing ? "bg-fuchsia-700 text-white" : hasEdit ? "bg-fuchsia-900 text-fuchsia-200 border border-fuchsia-600" : "bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600"
                            }`}
                            title="Edit this section's markdown (creates a new version on save)"
                          >
                            ✏ EDIT
                          </button>
                        )}
                        <button
                          onClick={() => updateItem(idx, { missing: !item.missing, score: item.missing ? item.score : null })}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            item.missing ? "bg-red-700 text-white" : "bg-gray-700 text-gray-400 border border-gray-600"
                          }`}
                          title="Mark section as missing from analysis (auto score=1)"
                        >
                          MISSING
                        </button>
                      </div>
                      {isEditing && (
                        <div className="mt-2 space-y-1">
                          <textarea
                            value={editedSections[item.section] ?? sectionsMd[item.section] ?? ""}
                            onChange={(e) => setEditedSections(prev => ({ ...prev, [item.section]: e.target.value }))}
                            rows={10}
                            className="w-full px-2 py-1 rounded bg-[var(--card)] border border-fuchsia-600 text-[11px] font-mono text-[var(--foreground)] resize-y"
                            placeholder="Edit the markdown content of this section..."
                          />
                          <div className="flex gap-2 items-center">
                            <button
                              onClick={() => {
                                // Discard: remove from editedSections
                                setEditedSections(prev => {
                                  const next = { ...prev };
                                  delete next[item.section];
                                  return next;
                                });
                                setEditingSection(null);
                              }}
                              className="text-[9px] px-2 py-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
                            >
                              Discard
                            </button>
                            <button
                              onClick={() => setEditingSection(null)}
                              className="text-[9px] px-2 py-0.5 rounded bg-fuchsia-700 text-white font-bold hover:bg-fuchsia-600"
                            >
                              Keep edit (collapse)
                            </button>
                            <span className="text-[9px] text-[var(--muted-foreground)] italic">
                              persisted as v+1 on Save Review
                            </span>
                          </div>
                        </div>
                      )}
                      <input
                        type="text"
                        value={item.note}
                        onChange={(e) => updateItem(idx, { note: e.target.value })}
                        placeholder="Note for this section (optional)"
                        className="mt-1.5 w-full px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[10px] text-[var(--foreground)]"
                      />
                    </div>
                    );
                  })}
                </div>
              </div>

              {/* General notes (with its own score) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-[var(--muted-foreground)]">General notes</label>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-[var(--muted-foreground)] mr-1">score</span>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setGeneralScore(generalScore === n ? null : n)}
                        className={`text-base leading-none px-0.5 ${
                          generalScore !== null && n <= generalScore ? "text-amber-400" : "text-gray-700"
                        } hover:scale-110 transition-transform`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Overall validation notes (visible in the validation report PDF)..."
                  className="w-full px-3 py-2 rounded bg-[var(--secondary)] border border-[var(--border)] text-xs text-[var(--foreground)] resize-none"
                />
              </div>

              {error && <div className="text-xs text-red-400">{error}</div>}
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--border)] p-3 flex justify-end gap-2 shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded bg-[var(--secondary)] border border-[var(--border)] text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || loading}
                className="px-4 py-2 rounded bg-indigo-700 text-white text-xs font-bold hover:bg-indigo-600 disabled:opacity-50 min-w-[180px]"
              >
                {saving ? (savePhase || "Saving...") : (hasZoteroKey ? "Save & Sync Zotero" : "Save & Push to Zotero")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// --- Diff Modal (compare with previous version) ---

interface DiffSection {
  section: string;
  status: "unchanged" | "modified" | "added" | "removed";
  prev_text: string;
  curr_text: string;
}

interface DiffData {
  current: { id: number; version: number; mode: string };
  previous: { id: number; version: number; mode: string };
  sections: DiffSection[];
  summary: { modified: number; unchanged: number; added: number; removed: number };
}

function DiffModal({ run, paperId, onClose }: { run: AnalysisRun; paperId: number; onClose: () => void }) {
  const [data, setData] = useState<DiffData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [llmSummaries, setLlmSummaries] = useState<Record<string, string>>({});
  const [llmLoading, setLlmLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v1/analysis/${paperId}/diff?queue_id=${run.id}`, {
      headers: authHeaders(),
    })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.detail || "Diff load failed");
        }
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [run.id, paperId]);

  const requestLlmSummary = async (sec: DiffSection) => {
    if (llmSummaries[sec.section] || llmLoading === sec.section) return;
    setLlmLoading(sec.section);
    try {
      const r = await fetch("/api/v1/analysis/diff/llm-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          section: sec.section,
          prev_text: sec.prev_text,
          curr_text: sec.curr_text,
        }),
      });
      if (!r.ok) throw new Error("LLM call failed");
      const d = await r.json();
      setLlmSummaries((prev) => ({ ...prev, [sec.section]: d.summary }));
    } catch (e: any) {
      setLlmSummaries((prev) => ({ ...prev, [sec.section]: `Error: ${e.message}` }));
    } finally {
      setLlmLoading(null);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "modified": return "bg-amber-600 text-white";
      case "added":    return "bg-emerald-600 text-white";
      case "removed":  return "bg-red-700 text-white";
      default:         return "bg-gray-600 text-white";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] shrink-0">
          <div>
            <h3 className="text-base font-semibold">Compare versions — {run.mode.toUpperCase()}</h3>
            {data && (
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                v{data.previous.version} → v{data.current.version} ·
                {" "}<span className="text-amber-400">{data.summary.modified} modified</span> ·
                {" "}<span className="text-emerald-400">{data.summary.added} added</span> ·
                {" "}<span className="text-red-400">{data.summary.removed} removed</span> ·
                {" "}{data.summary.unchanged} unchanged
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl leading-none px-2">✕</button>
        </div>

        <div className="overflow-y-auto p-4 flex-1">
          {loading && <div className="text-sm text-[var(--muted-foreground)]">Loading diff...</div>}
          {error && <div className="text-sm text-red-400">{error}</div>}
          {data && (
            <div className="space-y-2">
              {data.sections.map((sec) => {
                const isExpanded = expandedSection === sec.section;
                const isChanged = sec.status !== "unchanged";
                return (
                  <div key={sec.section} className="rounded-lg border border-[var(--border)] bg-[var(--secondary)] overflow-hidden">
                    <button
                      onClick={() => isChanged && setExpandedSection(isExpanded ? null : sec.section)}
                      className={`w-full flex items-center justify-between px-3 py-2 ${isChanged ? "cursor-pointer hover:bg-[var(--muted)]" : "cursor-default opacity-60"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${statusColor(sec.status)}`}>
                          {sec.status.toUpperCase()}
                        </span>
                        <span className="text-sm font-medium text-[var(--foreground)]">{sec.section}</span>
                      </div>
                      {isChanged && (
                        <span className="text-[var(--muted-foreground)] text-xs">{isExpanded ? "▾" : "▸"}</span>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-[var(--border)] p-3 space-y-3">
                        <div>
                          <button
                            onClick={() => requestLlmSummary(sec)}
                            disabled={llmLoading === sec.section}
                            className="text-[10px] px-2 py-1 rounded bg-indigo-700 text-white font-bold hover:bg-indigo-600 disabled:opacity-50"
                          >
                            {llmLoading === sec.section ? "Analyzing..." : "🤖 Summarize changes"}
                          </button>
                          {llmSummaries[sec.section] && (
                            <div className="mt-2 p-2 rounded bg-indigo-900/30 border border-indigo-700/40 text-[11px] text-[var(--foreground)] whitespace-pre-wrap">
                              {llmSummaries[sec.section]}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Previous (v{data.previous.version})</div>
                            <div className="p-2 rounded bg-red-900/20 border border-red-800/40 text-[11px] text-[var(--foreground)] whitespace-pre-wrap max-h-60 overflow-y-auto">
                              {sec.prev_text || <span className="opacity-50">— empty —</span>}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Current (v{data.current.version})</div>
                            <div className="p-2 rounded bg-emerald-900/20 border border-emerald-800/40 text-[11px] text-[var(--foreground)] whitespace-pre-wrap max-h-60 overflow-y-auto">
                              {sec.curr_text || <span className="opacity-50">— empty —</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// --- Tutor Check Widget ---
// Four-state decision: ✓ OK / ? Review / ✗ No / — (not set).
// Independent from rating (paper quality) and from validation (meta-validation
// of the LLM analysis). Surfaces as colored Zotero tag and as a row badge.

function TutorCheckWidget({ paperId, initial }: { paperId: number; initial: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  const [saving, setSaving] = useState(false);

  const save = async (next: string | null) => {
    setSaving(true);
    try {
      const url = next
        ? `/api/v1/papers/${paperId}/tutor-check?check=${next}`
        : `/api/v1/papers/${paperId}/tutor-check`;
      const r = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
      });
      if (r.ok) {
        const data = await r.json();
        setValue(data.tutor_check);
      }
    } finally {
      setSaving(false);
    }
  };

  const options: { v: string | null; label: string; cls: string }[] = [
    { v: "ok",     label: "✓ OK",     cls: "bg-emerald-700 hover:bg-emerald-600 border-emerald-400 text-white" },
    { v: "review", label: "? Review", cls: "bg-amber-600 hover:bg-amber-500 border-amber-300 text-white" },
    { v: "no",     label: "✗ NO",     cls: "bg-red-700 hover:bg-red-600 border-red-400 text-white" },
    { v: null,     label: "—",        cls: "bg-[var(--secondary)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]" },
  ];

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--secondary)] border border-[var(--border)]">
      <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-bold mr-1">Tutor check</span>
      {options.map((opt) => (
        <button
          key={opt.label}
          onClick={() => save(opt.v)}
          disabled={saving}
          className={`px-2 py-1 rounded text-[10px] font-bold border-2 transition-transform hover:scale-105 disabled:opacity-50 ${opt.cls} ${value === opt.v ? "ring-2 ring-white/60" : "opacity-60"}`}
          title={
            opt.v === "ok" ? "Approved — share with tutor" :
            opt.v === "review" ? "Discuss before sharing" :
            opt.v === "no" ? "Do not share" :
            "Clear (not checked)"
          }
        >
          {opt.label}
        </button>
      ))}
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
      // Step 1: sync paper metadata, tags, extra field, validation summary
      const res = await api.syncToZotero([paperId]);
      if (res.synced <= 0) {
        setStatus("error");
        setMsg("Paper sync failed");
        return;
      }

      // Step 2: sync the Extended Abstract attachment (if present)
      let analysisMsg = "";
      try {
        const ares = await api.syncAnalysisToZotero(paperId);
        if (ares.status === "uploaded" && ares.count > 0) {
          const files = (ares.filenames || []).join(", ");
          analysisMsg = ` · ${ares.count} attachment${ares.count > 1 ? "s" : ""}: ${files}`;
        } else if (ares.status === "already_synced") {
          analysisMsg = " · attachments already synced";
        } else if (ares.status === "no_attachments") {
          analysisMsg = " · no Extended Abstract yet (metadata only)";
        }
      } catch (e: any) {
        // Analysis sync failure is non-fatal — paper metadata still synced
        const msg = String(e?.message || "");
        if (!msg.includes("No Extended Abstract") && !msg.includes("No analysis report")) {
          analysisMsg = ` · attachments: ${msg || "failed"}`;
        } else {
          analysisMsg = " · no Extended Abstract yet (metadata only)";
        }
      }

      setStatus("idle");
      setMsg(`Synced to Zotero${analysisMsg}`);
      mutate(`/api/v1/papers/${paperId}`);
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
        disabled={status === "syncing" || removing}
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


function RatingWidget({ paperId, initialRating }: { paperId: number; initialRating: number | null }) {
  const [rating, setRating] = useState(initialRating || 0);
  const [hover, setHover] = useState(0);

  const setRate = async (value: number) => {
    const newRating = value === rating ? 0 : value; // Click same star to clear
    setRating(newRating);
    await api.ratePaper(paperId, newRating);
    mutate(`/api/v1/papers/${paperId}`);
  };

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => setRate(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="text-lg leading-none transition-colors"
          title={star === rating ? "Click to clear" : `${star} star${star > 1 ? "s" : ""}`}
        >
          <span className={star <= (hover || rating) ? "text-amber-400" : "text-gray-600"}>★</span>
        </button>
      ))}
    </div>
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
