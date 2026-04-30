"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { authHeaders } from "@/lib/authHeaders";

interface RubricItem {
  key?: string;
  dimension: string;
  score: number | null;
  comment: string;
}

interface TemplateDim { key: string; label: string; description: string; type: string }
interface TemplateExtra {
  key: string;
  label: string;
  type: "boolean" | "choice" | "score" | "text";
  description: string;
  choices: { value: string; label: string }[];
}
interface TemplateRec { value: string; label: string }
interface Template {
  id: string; name: string; journal: string; description: string;
  dimensions: TemplateDim[];
  recommendations: TemplateRec[];
  extras: TemplateExtra[];
}

interface PQR {
  id: number;
  paper_id: number;
  version: number;
  is_current: boolean;
  parent_version: number | null;
  template_id: string;
  template: Template;
  rubric: { template_id?: string; items: RubricItem[]; extras?: Record<string, any> };
  overall_grade: string | null;
  overall_score: number | null;
  overall_assessment: string | null;
  private_notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const GRADE_COLORS: Record<string, string> = {
  excellent:  "bg-emerald-700 hover:bg-emerald-600",
  good:       "bg-emerald-600 hover:bg-emerald-500",
  adequate:   "bg-amber-600 hover:bg-amber-500",
  weak:       "bg-orange-600 hover:bg-orange-500",
  unreliable: "bg-red-700 hover:bg-red-600",
};

export default function PaperQualityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const paperId = parseInt(idStr, 10);

  const { isAdmin } = useAuth();

  const [pqr, setPqr] = useState<PQR | null>(null);
  const [history, setHistory] = useState<PQR[]>([]);
  const [paperTitle, setPaperTitle] = useState<string>("");
  const [paperHasPdf, setPaperHasPdf] = useState<boolean>(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState("");
  const [llmSuggesting, setLlmSuggesting] = useState(false);
  const [llmCost, setLlmCost] = useState<number | null>(null);

  // Form state
  const [rubric, setRubric] = useState<RubricItem[]>([]);
  const [extras, setExtras] = useState<Record<string, any>>({});
  const [overallGrade, setOverallGrade] = useState<string>("");
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [overallAssessment, setOverallAssessment] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      // 1. Fetch paper minimal info
      const pr = await fetch(`/api/v1/papers/${paperId}`, { headers: authHeaders() });
      if (!pr.ok) throw new Error("Paper not found");
      const paperData = await pr.json();
      setPaperTitle(paperData.title);
      setPaperHasPdf(!!paperData.has_pdf);

      // 2. Try to fetch the current quality review (404 ⇒ no review yet)
      const current = await fetch(`/api/v1/paper-quality/${paperId}`, { headers: authHeaders() });
      if (current.status === 404) {
        // No review yet — create empty v1
        const tplRes = await fetch("/api/v1/peer-review/templates", { headers: authHeaders() });
        const templates = await tplRes.json();
        const tpl = templates.find((t: any) => t.id === "paper-quality");
        // Create v1 with empty rubric server-side
        const create = await fetch(`/api/v1/paper-quality/${paperId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ template_id: "paper-quality" }),
        });
        if (!create.ok) {
          const err = await create.json().catch(() => ({}));
          throw new Error(err.detail || "Could not create quality review");
        }
        const created = await create.json();
        applyState(created);
      } else if (current.ok) {
        const data = await current.json();
        applyState(data);
      } else {
        const err = await current.json().catch(() => ({}));
        throw new Error(err.detail || "Load failed");
      }

      // 3. Fetch history
      const h = await fetch(`/api/v1/paper-quality/${paperId}/history`, { headers: authHeaders() });
      if (h.ok) setHistory(await h.json());
    } catch (e: any) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  };

  const applyState = (data: PQR) => {
    setPqr(data);
    const tpl = data.template;
    const stored = data.rubric?.items || [];
    const byKey: Record<string, RubricItem> = {};
    for (const it of stored) {
      const k = (it.key || it.dimension || "").toLowerCase();
      if (k) byKey[k] = it;
    }
    const reconciled: RubricItem[] = tpl.dimensions.map(d => {
      const ex = byKey[d.key.toLowerCase()] || byKey[d.label.toLowerCase()];
      return {
        key: d.key,
        dimension: d.label,
        score: ex?.score ?? null,
        comment: ex?.comment ?? "",
      };
    });
    setRubric(reconciled);
    setExtras(data.rubric?.extras || {});
    setOverallGrade(data.overall_grade || "");
    setOverallScore(data.overall_score || null);
    setOverallAssessment(data.overall_assessment || "");
    setPrivateNotes(data.private_notes || "");
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  // Lazy load paper PDF as blob
  useEffect(() => {
    if (!paperHasPdf || pdfBlobUrl || pdfLoading) return;
    setPdfLoading(true);
    fetch(`/api/v1/papers/${paperId}/pdf-file`, { headers: authHeaders() })
      .then(r => r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(blob => setPdfBlobUrl(URL.createObjectURL(blob)))
      .catch(() => setPaperHasPdf(false))
      .finally(() => setPdfLoading(false));
  }, [paperHasPdf, pdfBlobUrl, pdfLoading, paperId]);

  useEffect(() => () => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
  }, [pdfBlobUrl]);

  const updateItem = (idx: number, patch: Partial<RubricItem>) => {
    setRubric(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const save = async () => {
    setSaving(true);
    setSavePhase("Saving...");
    setError(null);
    try {
      const r = await fetch(`/api/v1/paper-quality/${paperId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          rubric: { template_id: pqr?.template_id, items: rubric, extras },
          overall_grade: overallGrade || null,
          overall_score: overallScore,
          overall_assessment: overallAssessment || null,
          private_notes: privateNotes || null,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "Save failed");
      }
      const data = await r.json();
      applyState(data);
      setSavePhase("Saved");
      setTimeout(() => setSavePhase(""), 1500);
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const newVersion = async () => {
    if (!confirm(
      "Create a new version (v+1) by snapshotting the current one?\n\n" +
      "The current version becomes part of history. Future edits go to the new version. " +
      "Use this when you have substantively reconsidered the assessment and want to preserve the previous judgement."
    )) return;
    setSaving(true);
    setSavePhase("Creating new version...");
    try {
      // Save current edits first (so the snapshot is fresh)
      await save();
      const r = await fetch(`/api/v1/paper-quality/${paperId}/new-version`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "Fork failed");
      }
      await reload();
      setSavePhase("");
    } catch (e: any) {
      setError(e.message || "Fork failed");
      setSaving(false);
      setSavePhase("");
    } finally {
      setSaving(false);
    }
  };

  const switchVersion = async (version: number) => {
    if (!pqr || version === pqr.version) return;
    try {
      const r = await fetch(`/api/v1/paper-quality/${paperId}/v/${version}`, { headers: authHeaders() });
      if (!r.ok) throw new Error("Version not found");
      const data = await r.json();
      applyState(data);
    } catch (e: any) {
      alert(`Could not load version ${version}: ${e.message}`);
    }
  };

  const downloadFmt = async (fmt: "pdf" | "tex" | "md" | "txt") => {
    if (!pqr) return;
    await save();
    const r = await fetch(`/api/v1/paper-quality/${paperId}/v/${pqr.version}/${fmt}`, { headers: authHeaders() });
    if (!r.ok) {
      alert(`Could not generate ${fmt.toUpperCase()}`);
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paper_quality_${paperId}_v${pqr.version}.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const llmSuggest = async () => {
    if (!paperHasPdf) {
      alert("Paper must have a local PDF to use the LLM assistant.");
      return;
    }
    if (!confirm(
      "AI-assisted Paper Quality Assessment (Claude Opus 4.7, extended reasoning)\n\n" +
      "This will read the entire paper PDF and produce a complete suggested quality assessment " +
      "(per-dimension scores, structured extras, overall grade, overall assessment).\n\n" +
      "The suggestion is a STARTING POINT — you must read it carefully and edit any field before saving.\n\n" +
      "Estimated cost: ~$0.40-1.00 per call.\n" +
      "Estimated time: 30-90 seconds.\n\n" +
      "Continue?"
    )) return;

    setLlmSuggesting(true);
    setLlmCost(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/paper-quality/${paperId}/llm-suggest`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "LLM call failed");
      }
      const sug = await r.json();
      // Apply suggestion to local state (does NOT save automatically)
      const tpl = pqr?.template;
      if (tpl) {
        const sugByKey: Record<string, any> = {};
        for (const it of (sug.rubric?.items || [])) if (it.key) sugByKey[it.key] = it;
        const newR: RubricItem[] = tpl.dimensions.map(d => {
          const src = sugByKey[d.key] || {};
          return { key: d.key, dimension: d.label, score: src.score ?? null, comment: src.comment ?? "" };
        });
        setRubric(newR);
        setExtras({ ...(extras || {}), ...(sug.rubric?.extras || {}) });
      }
      if (sug.overall_grade) setOverallGrade(sug.overall_grade);
      if (sug.overall_score) setOverallScore(sug.overall_score);
      if (sug.overall_assessment) setOverallAssessment(sug.overall_assessment);
      setLlmCost(sug._meta?.cost_usd || 0);
    } catch (e: any) {
      setError(e.message || "LLM suggestion failed");
    } finally {
      setLlmSuggesting(false);
    }
  };

  if (loading) return <div className="text-sm text-[var(--muted-foreground)]">Loading paper quality assessment...</div>;
  if (error || !pqr) return <div className="text-sm text-red-400">{error || "Not found"}</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-3">
        <div>
          <Link href={`/papers/${paperId}`} className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            ← Back to paper
          </Link>
          <h1 className="text-xl font-bold mt-1 line-clamp-2">{paperTitle}</h1>
          <p className="text-xs text-[var(--muted-foreground)]">
            Paper Quality Assessment · paper #{paperId} · v{pqr.version} {pqr.is_current ? "(current)" : "(historical)"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <button
              onClick={llmSuggest}
              disabled={llmSuggesting || !paperHasPdf}
              className="px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-700 to-purple-700 text-white text-xs font-bold border border-indigo-400 hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50"
              title="Admin only — Claude Opus 4.7 extended reasoning. ~$0.40-1.00."
            >
              {llmSuggesting ? "Drafting (extended reasoning)…" : "AI Suggest (Opus)"}
            </button>
          )}
          <button onClick={() => downloadFmt("txt")} className="px-3 py-2 rounded-lg bg-gray-700 text-white text-xs font-medium hover:bg-gray-600">TXT</button>
          <button onClick={() => downloadFmt("md")} className="px-3 py-2 rounded-lg bg-gray-700 text-white text-xs font-medium hover:bg-gray-600">MD</button>
          <button onClick={() => downloadFmt("tex")} className="px-3 py-2 rounded-lg bg-teal-700 text-white text-xs font-medium hover:bg-teal-600">TEX</button>
          <button onClick={() => downloadFmt("pdf")} className="px-3 py-2 rounded-lg bg-red-700 text-white text-xs font-medium hover:bg-red-600">PDF</button>
          {isAdmin && (
            <>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 min-w-[110px]"
              >
                {saving ? (savePhase || "Saving...") : (savePhase || "Save")}
              </button>
              <button
                onClick={newVersion}
                disabled={saving}
                className="px-3 py-2 rounded-lg bg-fuchsia-700 text-white text-xs font-bold hover:bg-fuchsia-600 disabled:opacity-50"
                title="Snapshot current version into v+1, preserving the previous one in history"
              >
                New version
              </button>
            </>
          )}
        </div>
      </div>

      {/* Side-by-side layout */}
      <div className="flex flex-col lg:flex-row gap-4 h-auto lg:h-[calc(100vh-200px)]">
        {/* LEFT: Paper PDF */}
        <div className="lg:flex-1 rounded-xl border border-[var(--border)] overflow-hidden bg-white flex flex-col min-h-[300px] lg:min-h-0">
          <div className="p-2 border-b border-gray-300 bg-gray-100">
            <span className="text-xs font-bold text-gray-800">Paper PDF</span>
          </div>
          <div className="flex-1 overflow-hidden">
            {!paperHasPdf ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">No local PDF available for this paper</div>
            ) : pdfLoading || !pdfBlobUrl ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">Loading PDF...</div>
            ) : (
              <>
                <iframe title="Paper PDF" src={`${pdfBlobUrl}#view=FitH`} className="w-full h-full border-0 hidden sm:block" />
                <div className="sm:hidden h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
                  <p className="text-sm text-gray-600">PDF preview not available on mobile.</p>
                  <a href={pdfBlobUrl} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm font-bold hover:bg-indigo-600">
                    Open PDF
                  </a>
                </div>
              </>
            )}
          </div>
        </div>

        {/* RIGHT: Form */}
        <fieldset disabled={!isAdmin} className="contents">
        <div className="lg:w-[44%] rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-y-auto p-4 space-y-4">
          {/* Version selector */}
          {history.length > 1 && (
            <div className="rounded border border-fuchsia-700/50 bg-fuchsia-900/10 p-2">
              <div className="text-[10px] text-fuchsia-300 uppercase tracking-wider mb-1">Version history</div>
              <select
                value={pqr.version}
                onChange={(e) => switchVersion(parseInt(e.target.value, 10))}
                className="w-full px-2 py-1 rounded bg-[var(--card)] border border-fuchsia-600 text-xs text-[var(--foreground)]"
              >
                {history.map(h => (
                  <option key={h.version} value={h.version}>
                    v{h.version}{h.is_current ? " (current)" : ""}{h.parent_version ? ` — forked from v${h.parent_version}` : ""} — {h.updated_at?.slice(0, 10)}
                  </option>
                ))}
              </select>
              {!pqr.is_current && (
                <p className="text-[9px] text-amber-300 mt-1 italic">
                  Viewing a historical version (read-only). Switch to current to edit, or open and click New version.
                </p>
              )}
            </div>
          )}

          {/* LLM banner */}
          {llmCost !== null && (
            <div className="rounded border-2 border-indigo-500 bg-indigo-900/20 p-2 text-[10px]">
              <div className="font-bold text-indigo-300 uppercase tracking-wider mb-1">AI suggestion applied</div>
              <div className="text-[var(--foreground)]">
                Pre-populated by Claude Opus 4.7 with extended reasoning.
                <strong className="text-amber-300"> Read carefully and edit before saving.</strong>
              </div>
              <div className="text-[var(--muted-foreground)] mt-1">cost ~${llmCost.toFixed(4)}</div>
              <button onClick={() => setLlmCost(null)} className="mt-1 text-[9px] text-indigo-400 hover:text-indigo-200 underline">dismiss</button>
            </div>
          )}

          {/* Private notes */}
          <details className="rounded border-2 border-amber-700/50 bg-amber-900/10 p-2" open={!!privateNotes}>
            <summary className="text-xs font-bold cursor-pointer text-amber-400 flex items-center gap-2">
              Private notes
              <span className="text-[9px] font-normal text-[var(--muted-foreground)] italic">(only for you · never in exports)</span>
              {privateNotes && <span className="text-[9px] px-1 rounded bg-amber-600 text-white">●</span>}
            </summary>
            <textarea
              value={privateNotes}
              onChange={e => setPrivateNotes(e.target.value)}
              rows={3}
              placeholder="Quick notes for yourself..."
              className="mt-2 w-full px-2 py-1 rounded bg-[var(--card)] border border-amber-700/50 text-xs resize-y"
            />
          </details>

          {/* Overall grade */}
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Overall grade</label>
            <div className="grid grid-cols-1 gap-1.5">
              {pqr.template.recommendations.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setOverallGrade(opt.value)}
                  className={`px-3 py-2 rounded text-xs font-bold text-white text-left ${GRADE_COLORS[opt.value] || "bg-gray-700"} ${overallGrade === opt.value ? "ring-2 ring-white/60" : "opacity-60"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Overall numeric score */}
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Overall score</label>
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setOverallScore(n)}
                    className={`text-xl leading-none px-0.5 ${overallScore !== null && n <= overallScore ? "text-amber-400" : "text-gray-700"} hover:scale-110 transition-transform`}
                  >★</button>
                ))}
              </div>
              <span className="text-sm font-bold text-amber-400">{overallScore || "—"}/5</span>
            </div>
          </div>

          {/* Overall assessment text */}
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Overall assessment</label>
            <textarea
              value={overallAssessment}
              onChange={e => setOverallAssessment(e.target.value)}
              rows={5}
              placeholder="A structured paragraph: contribution summary, strengths, weaknesses, recommendation on how to use this paper..."
              className="w-full px-3 py-2 rounded bg-[var(--secondary)] border border-[var(--border)] text-xs text-[var(--foreground)] resize-y"
            />
          </div>

          {/* Rubric */}
          {pqr.template.dimensions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                Evaluation by dimension ({rubric.filter(r => r.score).length}/{rubric.length} scored)
              </label>
              <p className="text-[9px] text-[var(--muted-foreground)] italic mb-2">
                1=Poor · 2=Fair · 3=Good · 4=Very good · 5=Excellent
              </p>
              <div className="space-y-1.5">
                {rubric.map((item, idx) => {
                  const tplDim = pqr.template.dimensions.find(d => d.key === item.key);
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
                              onClick={() => updateItem(idx, { score: n })}
                              className={`text-base leading-none px-0.5 ${item.score !== null && n <= item.score ? "text-amber-400" : "text-gray-700"} hover:scale-110 transition-transform`}
                            >★</button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        value={item.comment}
                        onChange={e => updateItem(idx, { comment: e.target.value })}
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

          {/* Extras */}
          {pqr.template.extras.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Additional assessment</label>
              <div className="space-y-2">
                {pqr.template.extras.map(ex => (
                  <div key={ex.key} className="rounded border border-[var(--border)] bg-[var(--secondary)] p-2">
                    <div className="text-[11px] font-medium text-[var(--foreground)] mb-1">{ex.label}</div>
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
                          >{opt.l}</button>
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
                          >{c.label}</button>
                        ))}
                      </div>
                    )}
                    {ex.type === "text" && (
                      <textarea
                        value={extras[ex.key] || ""}
                        onChange={e => setExtras(prev => ({ ...prev, [ex.key]: e.target.value }))}
                        rows={3}
                        className="w-full px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[10px] text-[var(--foreground)] resize-y font-mono"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="text-xs text-red-400">{error}</div>}
        </div>
        </fieldset>
      </div>
    </div>
  );
}
