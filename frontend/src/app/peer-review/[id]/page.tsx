"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { authFetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { authHeaders } from "@/lib/authHeaders";
import ReviewJournal from "@/components/ReviewJournal";

interface RubricItem {
  key?: string;
  dimension: string;
  score: number | null;
  comment: string;
}

interface TemplateDim {
  key: string;
  label: string;
  description: string;
  type: string;
}

interface TemplateRec {
  value: string;
  label: string;
}

interface TemplateExtra {
  key: string;
  label: string;
  type: "boolean" | "choice" | "score" | "text";
  description: string;
  choices: { value: string; label: string }[];
}

interface Template {
  id: string;
  name: string;
  journal: string;
  description: string;
  dimensions: TemplateDim[];
  recommendations: TemplateRec[];
  extras: TemplateExtra[];
}

interface PeerReviewDetail {
  id: number;
  template_id: string;
  template: Template;
  title: string;
  authors: string | null;
  target_journal: string | null;
  manuscript_id: string | null;
  deadline: string | null;
  reviewer_role: string | null;
  pdf_path: string | null;
  has_pdf: boolean;
  rubric: { template_id?: string; items: RubricItem[]; extras?: Record<string, any> };
  comments_to_authors: string | null;
  confidential_comments: string | null;
  private_notes: string | null;
  recommendation: string | null;
  status: string;
  paper_id: number | null;
}

// Recommendation button colors (keyed by recommendation value)
const REC_COLORS: Record<string, string> = {
  accept: "bg-emerald-700 hover:bg-emerald-600",
  minor_revision: "bg-amber-600 hover:bg-amber-500",
  major_revision: "bg-orange-600 hover:bg-orange-500",
  reject_resubmit: "bg-orange-700 hover:bg-orange-600",
  reject: "bg-red-700 hover:bg-red-600",
};

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
  const [switchingTemplate, setSwitchingTemplate] = useState(false);
  const [llmSuggesting, setLlmSuggesting] = useState(false);
  const [llmSuggestionApplied, setLlmSuggestionApplied] = useState<{ cost: number; tokens: { input: number; output: number } } | null>(null);
  const { isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // List of all available templates (for the inline switcher)
  const { data: allTemplates } = useSWR<{ id: string; name: string; journal: string; description: string }[]>(
    "/api/v1/peer-review/templates",
    authFetcher
  );

  // Local form state
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [journal, setJournal] = useState("");
  const [manuscriptId, setManuscriptId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [reviewerRole, setReviewerRole] = useState("");
  const [rubric, setRubric] = useState<RubricItem[]>([]);
  const [extras, setExtras] = useState<Record<string, any>>({});
  const [commentsAuthors, setCommentsAuthors] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [commentsEditor, setCommentsEditor] = useState("");
  const [recommendation, setRecommendation] = useState<string>("");
  const [status, setStatus] = useState<string>("draft");

  const reload = async () => {
    const r = await fetch(`/api/v1/peer-review/${id}`, {
      headers: authHeaders(),
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
    // Reconcile stored rubric items with the template's current dimension
    // order. Any missing dimension → added with null score; any legacy
    // dimension not in the template → kept at the end.
    const tpl = d.template;
    const storedItems = d.rubric?.items || [];
    const byKey: Record<string, RubricItem> = {};
    for (const it of storedItems) {
      const k = (it.key || it.dimension || "").toLowerCase();
      if (k) byKey[k] = it;
    }
    const reconciled: RubricItem[] = tpl.dimensions.map(dim => {
      const existing = byKey[dim.key.toLowerCase()] || byKey[dim.label.toLowerCase()];
      return {
        key: dim.key,
        dimension: dim.label,
        score: existing?.score ?? null,
        comment: existing?.comment ?? "",
      };
    });
    setRubric(reconciled);
    setExtras(d.rubric?.extras || {});
    setCommentsAuthors(d.comments_to_authors || "");
    setPrivateNotes(d.private_notes || "");
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
    fetch(`/api/v1/peer-review/${id}/pdf`, {
      headers: authHeaders(),
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
      const r = await fetch(`/api/v1/peer-review/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          title,
          authors: authors || null,
          target_journal: journal || null,
          manuscript_id: manuscriptId || null,
          deadline: deadline || null,
          reviewer_role: reviewerRole || null,
          rubric: { template_id: pr?.template_id, items: rubric, extras },
          comments_to_authors: commentsAuthors || null,
          confidential_comments: commentsEditor || null,
          private_notes: privateNotes || null,
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

  const switchTemplate = async (newId: string) => {
    if (!pr || newId === pr.template_id) return;
    const newTemplate = allTemplates?.find(t => t.id === newId);
    const ok = confirm(
      `Switch this peer review to "${newTemplate?.name || newId}"?\n\n` +
      `The current rubric scores and comments will be RESET to the new template's blank rubric. ` +
      `Recommendation, comments to authors, and confidential comments are preserved.\n\n` +
      `Continue?`
    );
    if (!ok) return;

    setSwitchingTemplate(true);
    try {
      const r = await fetch(`/api/v1/peer-review/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ template_id: newId }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "Switch failed");
      }
      // Recommendation may now be invalid for the new template — clear it locally
      // (the user will pick a new one); rubric is reset server-side.
      setRecommendation("");
      await reload();
    } catch (e: any) {
      alert(`Switch failed: ${e.message}`);
    } finally {
      setSwitchingTemplate(false);
    }
  };

  const llmSuggestReview = async () => {
    if (!pr) return;
    if (!pr.has_pdf) {
      alert("Upload the manuscript PDF first.");
      return;
    }
    const ok = confirm(
      "AI-assisted review (Claude Opus 4.6, extended reasoning)\n\n" +
      "This will read the entire manuscript PDF and produce a complete suggested review " +
      "(rubric scores, structured assessments, comments to authors, confidential comments to editor). " +
      "The suggestion is a STARTING POINT — you must read it carefully and edit any field before saving.\n\n" +
      "Estimated cost: ~$0.40-1.00 per review (Opus 4.6 + extended thinking).\n" +
      "Estimated time: 30-90 seconds.\n\n" +
      "Continue?"
    );
    if (!ok) return;

    setLlmSuggesting(true);
    setLlmSuggestionApplied(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/peer-review/${id}/llm-suggest`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `LLM call failed (HTTP ${r.status})`);
      }
      const sug = await r.json();

      // Reconcile rubric items with the current template's dimensions order.
      const tpl = pr.template;
      const sugItemsByKey: Record<string, any> = {};
      for (const it of (sug.rubric?.items || [])) {
        if (it.key) sugItemsByKey[it.key] = it;
      }
      const newRubric: RubricItem[] = tpl.dimensions.map((dim) => {
        const src = sugItemsByKey[dim.key] || {};
        return {
          key: dim.key,
          dimension: dim.label,
          score: src.score ?? null,
          comment: src.comment ?? "",
        };
      });
      setRubric(newRubric);

      // Extras: shallow merge over current values
      setExtras({ ...(extras || {}), ...(sug.rubric?.extras || {}) });

      // Recommendation, comments
      if (sug.recommendation) setRecommendation(sug.recommendation);
      if (sug.comments_to_authors) setCommentsAuthors(sug.comments_to_authors);
      if (sug.confidential_comments) setCommentsEditor(sug.confidential_comments);

      const meta = sug._meta || {};
      setLlmSuggestionApplied({
        cost: meta.cost_usd || 0,
        tokens: { input: meta.input_tokens || 0, output: meta.output_tokens || 0 },
      });
    } catch (e: any) {
      setError(e.message || "LLM suggestion failed");
    } finally {
      setLlmSuggesting(false);
    }
  };

  const uploadPdf = async (file: File) => {
    const fd = new FormData();
    fd.append("pdf", file);
    const r = await fetch(`/api/v1/peer-review/${id}/upload-pdf`, {
      method: "POST",
      headers: authHeaders(),
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

  const downloadReview = async (kind: "pdf" | "txt" | "md" | "tex") => {
    // Save first to persist any pending edits
    await save();
    const r = await fetch(`/api/v1/peer-review/${id}/review-${kind}`, {
      headers: authHeaders(),
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
          {isAdmin && (
            <button
              onClick={llmSuggestReview}
              disabled={llmSuggesting || !pr.has_pdf}
              className="px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-700 to-purple-700 text-white text-xs font-bold border border-indigo-400 hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50"
              title="Admin only — Claude Opus 4.6 with extended reasoning. ~$0.40-1.00 per call. Requires manuscript PDF."
            >
              {llmSuggesting ? "Drafting review (extended reasoning)…" : "AI Suggest Review (Opus)"}
            </button>
          )}
          <button onClick={() => downloadReview("txt")} className="px-3 py-2 rounded-lg bg-gray-700 text-white text-xs font-medium hover:bg-gray-600">
            TXT
          </button>
          <button onClick={() => downloadReview("md")} className="px-3 py-2 rounded-lg bg-gray-700 text-white text-xs font-medium hover:bg-gray-600">
            MD
          </button>
          <button onClick={() => downloadReview("tex")} className="px-3 py-2 rounded-lg bg-teal-700 text-white text-xs font-medium hover:bg-teal-600">
            TEX
          </button>
          <button onClick={() => downloadReview("pdf")} className="px-3 py-2 rounded-lg bg-red-700 text-white text-xs font-medium hover:bg-red-600">
            PDF
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
            <span className="text-xs font-bold text-gray-800">Manuscript PDF</span>
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

          {/* Banner shown after a successful LLM suggestion is applied */}
          {llmSuggestionApplied && (
            <div className="rounded border-2 border-indigo-500 bg-indigo-900/20 p-2 text-[10px]">
              <div className="font-bold text-indigo-300 uppercase tracking-wider mb-1">
                AI suggestion applied
              </div>
              <div className="text-[var(--foreground)]">
                The fields below have been pre-populated by Claude Opus 4.6 with extended reasoning.
                <strong className="text-amber-300"> Read carefully and edit every field before saving.</strong>
              </div>
              <div className="text-[var(--muted-foreground)] mt-1">
                Tokens: {llmSuggestionApplied.tokens.input.toLocaleString()} input · {llmSuggestionApplied.tokens.output.toLocaleString()} output · cost ~${llmSuggestionApplied.cost.toFixed(4)}
              </div>
              <button
                onClick={() => setLlmSuggestionApplied(null)}
                className="mt-1 text-[9px] text-indigo-400 hover:text-indigo-200 underline"
              >
                dismiss
              </button>
            </div>
          )}

          {/* Private notes — for the reviewer only, never sent to journal */}
          <details className="rounded border-2 border-amber-700/50 bg-amber-900/10 p-2" open={!!privateNotes}>
            <summary className="text-xs font-bold cursor-pointer text-amber-400 flex items-center gap-2">
              Private notes
              <span className="text-[9px] font-normal text-[var(--muted-foreground)] italic">(only for you · never in exported files)</span>
              {privateNotes && <span className="text-[9px] px-1 rounded bg-amber-600 text-white">●</span>}
            </summary>
            <textarea
              value={privateNotes}
              onChange={(e) => setPrivateNotes(e.target.value)}
              rows={4}
              placeholder="Quick notes for yourself: things to check, contacts, deadlines, internal references..."
              className="mt-2 w-full px-2 py-1 rounded bg-[var(--card)] border border-amber-700/50 text-xs text-[var(--foreground)] resize-y"
            />
          </details>

          {/* Template selector — switching resets the rubric, see confirm() */}
          <div className="rounded border border-indigo-700/50 bg-indigo-900/20 p-2">
            <div className="text-[10px] text-indigo-300 uppercase tracking-wider mb-1">Review template</div>
            <select
              value={pr.template_id}
              disabled={switchingTemplate}
              onChange={(e) => switchTemplate(e.target.value)}
              className="w-full px-2 py-1 rounded bg-[var(--card)] border border-indigo-600 text-xs text-[var(--foreground)] font-bold disabled:opacity-50"
            >
              {(allTemplates || [{ id: pr.template_id, name: pr.template.name, journal: pr.template.journal, description: "" }]).map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.journal}
                </option>
              ))}
            </select>
            <div className="text-[10px] text-[var(--muted-foreground)] mt-1">
              {switchingTemplate ? "Switching template..." : pr.template.description || pr.template.journal}
            </div>
          </div>

          {/* Recommendation — dynamic from template */}
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Recommendation</label>
            <div className="grid grid-cols-2 gap-2">
              {pr.template.recommendations.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRecommendation(opt.value)}
                  className={`px-3 py-2 rounded text-xs font-bold text-white ${REC_COLORS[opt.value] || "bg-gray-700 hover:bg-gray-600"} ${recommendation === opt.value ? "ring-2 ring-white/60" : "opacity-60"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Extras (template-specific: scope fit, best paper, etc.) */}
          {pr.template.extras.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Additional assessment</label>
              <div className="space-y-2">
                {pr.template.extras.map(ex => (
                  <div key={ex.key} className="rounded border border-[var(--border)] bg-[var(--secondary)] p-2">
                    <div className="text-[11px] font-medium text-[var(--foreground)] mb-1">{ex.label}</div>
                    {ex.description && (
                      <div className="text-[9px] text-[var(--muted-foreground)] mb-1 italic">{ex.description}</div>
                    )}
                    {ex.type === "boolean" && (
                      <div className="flex gap-1">
                        {[
                          { v: true, l: "Yes", c: "bg-emerald-600" },
                          { v: false, l: "No", c: "bg-red-700" },
                        ].map(opt => (
                          <button
                            key={String(opt.v)}
                            onClick={() => setExtras(prev => ({ ...prev, [ex.key]: opt.v }))}
                            className={`flex-1 px-2 py-1 rounded text-[10px] font-bold text-white ${opt.c} ${extras[ex.key] === opt.v ? "ring-2 ring-white/60" : "opacity-50"}`}
                          >
                            {opt.l}
                          </button>
                        ))}
                      </div>
                    )}
                    {ex.type === "choice" && (
                      <div className="flex gap-1 flex-wrap">
                        {ex.choices.map(c => (
                          <button
                            key={c.value}
                            onClick={() => setExtras(prev => ({ ...prev, [ex.key]: c.value }))}
                            className={`px-2 py-1 rounded text-[10px] font-bold ${extras[ex.key] === c.value ? "bg-indigo-700 text-white ring-2 ring-white/60" : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)]"}`}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {ex.type === "text" && (
                      <textarea
                        value={extras[ex.key] || ""}
                        onChange={(e) => setExtras(prev => ({ ...prev, [ex.key]: e.target.value }))}
                        rows={4}
                        placeholder="Type your answer here (or N/A)..."
                        className="w-full px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[10px] text-[var(--foreground)] resize-y font-mono"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Rubric — only when the template defines numeric dimensions */}
          {pr.template.dimensions.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
              Evaluation by dimension ({rubric.filter(r => r.score).length}/{rubric.length} scored)
            </label>
            <p className="text-[9px] text-[var(--muted-foreground)] mb-2 italic">
              1=Poor · 2=Fair · 3=Good · 4=Very good · 5=Excellent
            </p>
            <div className="space-y-1.5">
              {rubric.map((item, idx) => {
                const tplDim = pr.template.dimensions.find(d => d.key === item.key);
                return (
                  <div key={item.key || item.dimension} className="rounded border border-[var(--border)] bg-[var(--secondary)] p-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="text-xs font-medium text-[var(--foreground)]">{item.dimension}</div>
                        {tplDim?.description && (
                          <div className="text-[9px] text-[var(--muted-foreground)] italic">{tplDim.description}</div>
                        )}
                      </div>
                      <div className="flex shrink-0">
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
                );
              })}
            </div>
          </div>
          )}

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

      {/* Review Journal — editorial guidance and reviewer feedback */}
      {pr.paper_id && (
        <div className="mt-6">
          <ReviewJournal paperId={pr.paper_id} />
        </div>
      )}
    </div>
  );
}
