"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";

interface RubricItem {
  dimension: string;
  score: number | null;
  comment: string;
}

interface PeerReviewDetail {
  id: number;
  title: string;
  authors: string | null;
  target_journal: string | null;
  manuscript_id: string | null;
  deadline: string | null;
  reviewer_role: string | null;
  pdf_path: string | null;
  has_pdf: boolean;
  rubric: { items: RubricItem[] };
  comments_to_authors: string | null;
  confidential_comments: string | null;
  recommendation: string | null;
  status: string;
}

const REC_OPTIONS = [
  { v: "accept", l: "Accept", c: "bg-emerald-700 hover:bg-emerald-600" },
  { v: "minor_revision", l: "Minor Revision", c: "bg-amber-600 hover:bg-amber-500" },
  { v: "major_revision", l: "Major Revision", c: "bg-orange-600 hover:bg-orange-500" },
  { v: "reject", l: "Reject", c: "bg-red-700 hover:bg-red-600" },
];

export default function PeerReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const id = parseInt(idStr, 10);

  const [pr, setPr] = useState<PeerReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local form state
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [journal, setJournal] = useState("");
  const [manuscriptId, setManuscriptId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [reviewerRole, setReviewerRole] = useState("");
  const [rubric, setRubric] = useState<RubricItem[]>([]);
  const [commentsAuthors, setCommentsAuthors] = useState("");
  const [commentsEditor, setCommentsEditor] = useState("");
  const [recommendation, setRecommendation] = useState<string>("");
  const [status, setStatus] = useState<string>("draft");

  const reload = async () => {
    const token = localStorage.getItem("fl-token");
    const r = await fetch(`/api/v1/peer-review/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) {
      setError("Not found");
      setLoading(false);
      return;
    }
    const d: PeerReviewDetail = await r.json();
    setPr(d);
    setTitle(d.title || "");
    setAuthors(d.authors || "");
    setJournal(d.target_journal || "");
    setManuscriptId(d.manuscript_id || "");
    setDeadline(d.deadline || "");
    setReviewerRole(d.reviewer_role || "");
    setRubric(d.rubric?.items || []);
    setCommentsAuthors(d.comments_to_authors || "");
    setCommentsEditor(d.confidential_comments || "");
    setRecommendation(d.recommendation || "");
    setStatus(d.status || "draft");
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load PDF as blob (auth required)
  useEffect(() => {
    if (!pr?.has_pdf || pdfBlobUrl || pdfLoading) return;
    setPdfLoading(true);
    const token = localStorage.getItem("fl-token");
    fetch(`/api/v1/peer-review/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((blob) => setPdfBlobUrl(URL.createObjectURL(blob)))
      .catch(() => {})
      .finally(() => setPdfLoading(false));
  }, [pr?.has_pdf, id, pdfBlobUrl, pdfLoading]);

  useEffect(() => () => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
  }, [pdfBlobUrl]);

  const updateRubricItem = (idx: number, patch: Partial<RubricItem>) => {
    setRubric(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      const token = localStorage.getItem("fl-token");
      const r = await fetch(`/api/v1/peer-review/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title,
          authors: authors || null,
          target_journal: journal || null,
          manuscript_id: manuscriptId || null,
          deadline: deadline || null,
          reviewer_role: reviewerRole || null,
          rubric: { items: rubric },
          comments_to_authors: commentsAuthors || null,
          confidential_comments: commentsEditor || null,
          recommendation: recommendation || "",
          status,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "Save failed");
      }
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const uploadPdf = async (file: File) => {
    const token = localStorage.getItem("fl-token");
    const fd = new FormData();
    fd.append("pdf", file);
    const r = await fetch(`/api/v1/peer-review/${id}/upload-pdf`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (r.ok) {
      // Force reload and force PDF re-fetch
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
      await reload();
    } else {
      alert("Upload failed");
    }
  };

  const downloadReview = async (kind: "pdf" | "txt") => {
    // Save first to persist any pending edits
    await save();
    const token = localStorage.getItem("fl-token");
    const r = await fetch(`/api/v1/peer-review/${id}/review-${kind}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) {
      alert(`Could not generate ${kind.toUpperCase()}`);
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `peer_review_${id}.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="text-sm text-[var(--muted-foreground)]">Loading...</div>;
  if (error || !pr) return <div className="text-sm text-red-400">{error || "Not found"}</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link href="/peer-review" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            ← Peer Review Queue
          </Link>
          <h1 className="text-xl font-bold mt-1 truncate">{title || "Untitled peer review"}</h1>
          <p className="text-xs text-[var(--muted-foreground)]">
            #{id} · {journal || "no journal"} {deadline ? `· deadline ${deadline}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => downloadReview("txt")} className="px-3 py-2 rounded-lg bg-gray-700 text-white text-xs font-medium hover:bg-gray-600">
            ⬇ TXT
          </button>
          <button onClick={() => downloadReview("pdf")} className="px-3 py-2 rounded-lg bg-red-700 text-white text-xs font-medium hover:bg-red-600">
            ⬇ PDF
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : saveMsg || "Save"}
          </button>
        </div>
      </div>

      {/* Side-by-side layout */}
      <div className="flex gap-4 h-[calc(100vh-200px)]">
        {/* LEFT: Paper PDF */}
        <div className="flex-1 rounded-xl border border-[var(--border)] overflow-hidden bg-white flex flex-col">
          <div className="p-2 border-b border-gray-300 bg-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-800">📄 Manuscript PDF</span>
            <label className="text-[10px] px-2 py-1 rounded bg-indigo-700 text-white font-bold cursor-pointer hover:bg-indigo-600">
              {pr.has_pdf ? "Replace PDF" : "Upload PDF"}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPdf(f);
                }}
                className="hidden"
              />
            </label>
          </div>
          <div className="flex-1 overflow-hidden">
            {!pr.has_pdf ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                No manuscript PDF uploaded yet.
              </div>
            ) : pdfLoading || !pdfBlobUrl ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                Loading manuscript PDF...
              </div>
            ) : (
              <iframe
                title="Manuscript PDF"
                src={`${pdfBlobUrl}#view=FitH`}
                className="w-full h-full border-0"
              />
            )}
          </div>
        </div>

        {/* RIGHT: Review form */}
        <div className="w-[44%] min-w-[480px] rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-y-auto p-4 space-y-4">
          {/* Metadata */}
          <details className="rounded border border-[var(--border)] bg-[var(--secondary)] p-2" open>
            <summary className="text-xs font-bold cursor-pointer">Manuscript metadata</summary>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title *" className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-xs" />
              <input type="text" value={authors} onChange={e => setAuthors(e.target.value)} placeholder="Authors" className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-xs" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={journal} onChange={e => setJournal(e.target.value)} placeholder="Journal" className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-xs" />
                <input type="text" value={manuscriptId} onChange={e => setManuscriptId(e.target.value)} placeholder="Manuscript ID" className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-xs" />
                <input type="text" value={reviewerRole} onChange={e => setReviewerRole(e.target.value)} placeholder="Role (e.g. Reviewer 2)" className="px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-xs" />
              </div>
            </div>
          </details>

          {/* Recommendation */}
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Recommendation</label>
            <div className="grid grid-cols-2 gap-2">
              {REC_OPTIONS.map(opt => (
                <button
                  key={opt.v}
                  onClick={() => setRecommendation(opt.v)}
                  className={`px-3 py-2 rounded text-xs font-bold text-white ${opt.c} ${recommendation === opt.v ? "ring-2 ring-white/60" : "opacity-60"}`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Status</label>
            <div className="flex gap-1">
              {["draft", "in_progress", "submitted", "archived"].map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex-1 px-2 py-1 rounded text-[10px] font-bold ${status === s ? "bg-[var(--primary)] text-white" : "bg-[var(--secondary)] text-[var(--muted-foreground)]"}`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Rubric */}
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">
              Evaluation by dimension ({rubric.filter(r => r.score).length}/{rubric.length} scored)
            </label>
            <div className="space-y-1.5">
              {rubric.map((item, idx) => (
                <div key={item.dimension} className="rounded border border-[var(--border)] bg-[var(--secondary)] p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--foreground)] flex-1">{item.dimension}</span>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          onClick={() => updateRubricItem(idx, { score: n })}
                          className={`text-base leading-none px-0.5 ${item.score !== null && n <= item.score ? "text-amber-400" : "text-gray-700"} hover:scale-110 transition-transform`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={item.comment}
                    onChange={e => updateRubricItem(idx, { comment: e.target.value })}
                    rows={2}
                    placeholder="Comment on this dimension..."
                    className="mt-1.5 w-full px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[10px] text-[var(--foreground)] resize-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Comments to authors */}
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">
              Comments to authors <span className="opacity-60">(visible to authors)</span>
            </label>
            <textarea
              value={commentsAuthors}
              onChange={e => setCommentsAuthors(e.target.value)}
              rows={6}
              placeholder="Main review comments that will be sent to the authors..."
              className="w-full px-3 py-2 rounded bg-[var(--secondary)] border border-[var(--border)] text-xs text-[var(--foreground)] resize-y"
            />
          </div>

          {/* Confidential comments */}
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">
              Confidential comments to editor <span className="opacity-60">(not visible to authors)</span>
            </label>
            <textarea
              value={commentsEditor}
              onChange={e => setCommentsEditor(e.target.value)}
              rows={4}
              placeholder="Confidential notes for the editor..."
              className="w-full px-3 py-2 rounded bg-red-950/30 border border-red-700/50 text-xs text-[var(--foreground)] resize-y"
            />
          </div>

          {saveMsg && <div className="text-xs text-emerald-400">{saveMsg}</div>}
          {error && <div className="text-xs text-red-400">{error}</div>}
        </div>
      </div>
    </div>
  );
}
