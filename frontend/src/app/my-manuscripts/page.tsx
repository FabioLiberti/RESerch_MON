"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { useAuth } from "@/lib/auth";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import { cn, formatDate } from "@/lib/utils";
import { getPaperTypeBadge } from "@/lib/paperTypes";
import type { Paper } from "@/lib/types";

interface PaperListResponse {
  items: Paper[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

const DECISION_BADGE: Record<string, { bg: string; label: string }> = {
  pending: { bg: "bg-gray-600 text-white", label: "Pending" },
  accepted: { bg: "bg-emerald-700 text-white", label: "✓ Accepted" },
  accepted_with_revisions: { bg: "bg-amber-600 text-white", label: "✓ Accepted w/ revisions" },
  minor_revisions: { bg: "bg-amber-700 text-white", label: "Minor revisions" },
  major_revisions: { bg: "bg-orange-700 text-white", label: "Major revisions" },
  rejected: { bg: "bg-red-700 text-white", label: "Rejected" },
};

export default function MyManuscriptsPage() {
  const { isAdmin } = useAuth();
  const { data, isLoading } = useSWR<PaperListResponse>(
    "/api/v1/papers?paper_role=my_manuscript&per_page=50&sort_by=created_at&sort_order=desc",
    authFetcher
  );

  // Fetch latest submission status per manuscript
  const { data: statusMap } = useSWR<Record<string, { round_label: string; decision: string | null; decision_at: string | null; deadline: string | null }>>(
    "/api/v1/papers/manuscript-status", authFetcher
  );

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [journal, setJournal] = useState("");
  const [submissionDate, setSubmissionDate] = useState("");
  const [authors, setAuthors] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    setMessage(null);
    try {
      const r = await fetch("/api/v1/papers/my-manuscript", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          title: title.trim(),
          abstract: abstract.trim() || null,
          journal: journal.trim() || null,
          submission_date: submissionDate || null,
          authors: authors.trim() || null,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "Creation failed");
      }
      const res = await r.json();
      setMessage({ type: "success", text: `Paper #${res.paper_id} created: "${res.title}"` });
      setTitle(""); setAbstract(""); setJournal(""); setSubmissionDate(""); setAuthors("");
      setShowForm(false);
      mutate("/api/v1/papers?paper_role=my_manuscript&per_page=50&sort_by=created_at&sort_order=desc");
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed" });
    } finally {
      setCreating(false);
    }
  };

  const manuscripts = data?.items || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Manuscripts</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Papers you have submitted to journals or conferences. Track reviewer feedback and revision progress.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-bold hover:bg-blue-600 transition-colors shrink-0"
          >
            + Add Manuscript
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

      {/* Creation form */}
      {showForm && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6 space-y-4">
          <h2 className="text-sm font-bold">New Manuscript</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Title *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Paper title as submitted"
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Authors (comma-separated)</label>
              <input
                value={authors}
                onChange={e => setAuthors(e.target.value)}
                placeholder="e.g. Fabio Liberti, Co-Author Name"
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Target Journal / Conference</label>
              <input
                value={journal}
                onChange={e => setJournal(e.target.value)}
                placeholder="e.g. IFKAD 2026, IEEE T-AI"
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Submission Date</label>
              <input
                type="date"
                value={submissionDate}
                onChange={e => setSubmissionDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Abstract (optional)</label>
              <textarea
                value={abstract}
                onChange={e => setAbstract(e.target.value)}
                placeholder="Paper abstract..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none resize-y"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={!title.trim() || creating}
              className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-bold hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating..." : "Create Manuscript"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg bg-[var(--secondary)] text-sm hover:bg-[var(--muted)] transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-[var(--muted-foreground)]">
            After creation, go to the paper detail page to upload the PDF and add reviewer feedback via the Review Journal.
          </p>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-[var(--muted)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : manuscripts.length === 0 ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p className="text-sm">No manuscripts yet. Click &quot;+ Add Manuscript&quot; to start tracking your submissions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {manuscripts.map(paper => (
            <div
              key={paper.id}
              className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <a href={`/papers/${paper.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold line-clamp-2 hover:text-[var(--primary)]">
                    {paper.title} ↗
                  </a>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-700 text-white font-bold">
                      MY MANUSCRIPT
                    </span>
                    {paper.paper_type && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded text-white font-bold ${getPaperTypeBadge(paper.paper_type).color}`}>
                        {getPaperTypeBadge(paper.paper_type).badge}
                      </span>
                    )}
                    {(paper as any).has_supplementary && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-600 text-white font-bold" title="Has supplementary file">S</span>
                    )}
                    <NoteIcons paperId={paper.id} />
                    {(() => {
                      const st = statusMap?.[String(paper.id)];
                      if (!st) return null;
                      const dec = st.decision ? DECISION_BADGE[st.decision] : null;
                      return (
                        <>
                          {dec && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${dec.bg}`}>
                              {dec.label}
                            </span>
                          )}
                          <span className="text-[9px] text-[var(--muted-foreground)] italic">
                            {st.round_label}
                          </span>
                        </>
                      );
                    })()}
                    {paper.journal && (
                      <span className="text-xs text-[var(--muted-foreground)]">{paper.journal}</span>
                    )}
                    {paper.publication_date && (
                      <span className="text-xs text-[var(--muted-foreground)]">Submitted: {formatDate(paper.publication_date)}</span>
                    )}
                    {paper.doi && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-700 text-white font-bold">PUBLISHED</span>
                    )}
                    {paper.has_pdf && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-800 text-white">PDF</span>
                    )}
                  </div>
                  {paper.labels && paper.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {paper.labels.map(l => (
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
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/my-manuscripts/${paper.id}`}
                    className="text-[10px] px-2 py-1 rounded bg-blue-700 text-white font-bold hover:bg-blue-600"
                  >
                    Open
                  </Link>
                  {isAdmin && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete manuscript "${paper.title.slice(0, 50)}..."? This removes the paper from the database.`)) return;
                        await fetch(`/api/v1/papers/${paper.id}/toggle-disabled`, {
                          method: "POST",
                          headers: authHeaders(),
                        });
                        mutate("/api/v1/papers?paper_role=my_manuscript&per_page=50&sort_by=created_at&sort_order=desc");
                      }}
                      className="text-[10px] px-2 py-1 rounded bg-red-800 text-white hover:bg-red-700"
                    >
                      Del
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteIcons({ paperId }: { paperId: number }) {
  const { data } = useSWR<{ has_dev_notes: boolean; has_bib_notes: boolean }>(
    `/api/v1/user-notes/has-notes/${paperId}`, authFetcher
  );
  const { data: journal } = useSWR<{ entries: { source_type: string }[] }>(
    `/api/v1/review-journal/${paperId}`, authFetcher
  );
  const hasTutorNotes = journal?.entries?.some(e => e.source_type === "tutor_feedback");

  return (
    <>
      {hasTutorNotes && (
        <span className="text-red-500" title="Has tutor feedback">
          <svg className="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        </span>
      )}
      {data?.has_dev_notes && (
        <span className="text-amber-400" title="Has development notes">
          <svg className="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z"/></svg>
        </span>
      )}
      {data?.has_bib_notes && (
        <span className="text-indigo-400" title="Has bibliography notes">
          <svg className="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        </span>
      )}
    </>
  );
}
