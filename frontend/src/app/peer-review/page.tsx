"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import useSWR from "swr";
import { authFetcher } from "@/lib/api";

interface PeerReviewItem {
  id: number;
  title: string;
  authors: string | null;
  target_journal: string | null;
  manuscript_id: string | null;
  deadline: string | null;
  recommendation: string | null;
  status: string;
  has_pdf: boolean;
  updated_at: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-600 text-white",
  in_progress: "bg-blue-700 text-white",
  submitted: "bg-emerald-700 text-white",
  archived: "bg-gray-800 text-gray-400",
};

const REC_COLOR: Record<string, string> = {
  accept: "bg-emerald-600 text-white",
  minor_revision: "bg-amber-600 text-white",
  major_revision: "bg-orange-600 text-white",
  reject: "bg-red-700 text-white",
};

const REC_LABEL: Record<string, string> = {
  accept: "Accept",
  minor_revision: "Minor Revision",
  major_revision: "Major Revision",
  reject: "Reject",
};

export default function PeerReviewPage() {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<PeerReviewItem[]>(
    "/api/v1/peer-review",
    authFetcher
  );
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [journal, setJournal] = useState("");
  const [manuscriptId, setManuscriptId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [reviewerRole, setReviewerRole] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const items = data || [];

  const create = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const token = localStorage.getItem("fl-token");
      const fd = new FormData();
      fd.append("title", title);
      if (authors) fd.append("authors", authors);
      if (journal) fd.append("target_journal", journal);
      if (manuscriptId) fd.append("manuscript_id", manuscriptId);
      if (deadline) fd.append("deadline", deadline);
      if (reviewerRole) fd.append("reviewer_role", reviewerRole);
      if (pdfFile) fd.append("pdf", pdfFile);

      const r = await fetch("/api/v1/peer-review", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "Create failed");
      }
      const created = await r.json();
      setShowForm(false);
      setTitle(""); setAuthors(""); setJournal(""); setManuscriptId("");
      setDeadline(""); setReviewerRole(""); setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      mutate();
      router.push(`/peer-review/${created.id}`);
    } catch (e: any) {
      setError(e.message || "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm(`Delete peer review #${id}? This also removes the uploaded PDF and generated review files.`)) return;
    const token = localStorage.getItem("fl-token");
    const r = await fetch(`/api/v1/peer-review/${id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (r.ok) mutate();
    else alert("Delete failed");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Peer Review</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Confidential review of unpublished papers. Isolated from the public bibliography — no Zotero, no LLM, no indexing.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg bg-yellow-400 text-black font-bold border-2 border-red-600 hover:bg-yellow-300 text-sm"
        >
          {showForm ? "Cancel" : "+ New Peer Review"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--primary)]/30 p-6 space-y-3">
          <h3 className="font-medium">New peer review</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Manuscript title *" className="px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm md:col-span-2" />
            <input type="text" value={authors} onChange={e => setAuthors(e.target.value)} placeholder="Authors (comma-separated)" className="px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm md:col-span-2" />
            <input type="text" value={journal} onChange={e => setJournal(e.target.value)} placeholder="Target journal" className="px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm" />
            <input type="text" value={manuscriptId} onChange={e => setManuscriptId(e.target.value)} placeholder="Manuscript ID" className="px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm" />
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} placeholder="Review deadline" className="px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm" />
            <input type="text" value={reviewerRole} onChange={e => setReviewerRole(e.target.value)} placeholder="Reviewer role (e.g. Reviewer 2)" className="px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm" />
            <div className="md:col-span-2">
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">Manuscript PDF (optional, can be uploaded later)</label>
              <input ref={fileInputRef} type="file" accept="application/pdf" onChange={e => setPdfFile(e.target.files?.[0] || null)} className="text-sm" />
            </div>
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-[var(--secondary)] text-sm">Cancel</button>
            <button onClick={create} disabled={creating} className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white font-bold text-sm disabled:opacity-50">
              {creating ? "Creating..." : "Create & Open"}
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="text-sm text-[var(--muted-foreground)]">Loading...</div>}

      {!isLoading && items.length === 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-8 text-center">
          <div className="text-4xl mb-2">📝</div>
          <p className="text-sm font-medium">No peer reviews yet</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">Click "+ New Peer Review" to start one.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--secondary)] border-b border-[var(--border)]">
              <tr className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Manuscript</th>
                <th className="text-left px-4 py-3 font-medium">Journal</th>
                <th className="text-left px-4 py-3 font-medium">Deadline</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Recommendation</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(pr => (
                <tr key={pr.id} className="border-b border-[var(--border)] hover:bg-[var(--secondary)]/50">
                  <td className="px-4 py-3">
                    <Link href={`/peer-review/${pr.id}`} className="font-medium text-[var(--foreground)] hover:text-[var(--primary)] line-clamp-2">
                      {pr.title}
                    </Link>
                    {pr.authors && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5 truncate">{pr.authors}</div>}
                    <div className="flex gap-1 mt-1">
                      {pr.has_pdf && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-800 text-white">PDF</span>}
                      {pr.manuscript_id && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{pr.manuscript_id}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{pr.target_journal || "—"}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{pr.deadline || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${STATUS_COLOR[pr.status] || "bg-gray-600 text-white"}`}>
                      {pr.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {pr.recommendation ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${REC_COLOR[pr.recommendation] || "bg-gray-600 text-white"}`}>
                        {REC_LABEL[pr.recommendation] || pr.recommendation}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--muted-foreground)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link href={`/peer-review/${pr.id}`} className="text-[10px] px-2 py-1 rounded bg-yellow-400 text-black font-bold border-2 border-red-600 hover:bg-yellow-300 mr-1">
                      Open
                    </Link>
                    <button onClick={() => remove(pr.id)} className="text-[10px] px-2 py-1 rounded bg-red-800 text-white hover:bg-red-700">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
