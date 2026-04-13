"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import { cn } from "@/lib/utils";

interface Observation {
  text: string;
  section_ref: string | null;
  severity: string; // major | minor | suggestion | praise
  status: string;   // to_address | addressed | rejected_justified | not_applicable
  response: string | null;
}

interface ReviewerEntry {
  id: number;
  paper_id: number;
  reviewer_label: string;
  source_type: string;
  received_at: string | null;
  raw_text: string | null;
  attachment_path: string | null;
  has_attachment: boolean;
  rating: number | null;
  rating_max: number | null;
  rating_label: string | null;
  decision: string | null;
  rubric: { dimension: string; score: number | null; score_max: number }[];
  items: Observation[];
  created_at: string | null;
  updated_at: string | null;
}

interface JournalResponse {
  paper_id: number;
  entries: ReviewerEntry[];
  total_observations: number;
  addressed: number;
  progress_pct: number;
}

const SEVERITY_BADGE: Record<string, string> = {
  major: "bg-red-700 text-white",
  minor: "bg-amber-700 text-white",
  suggestion: "bg-blue-700 text-white",
  praise: "bg-emerald-700 text-white",
};

const STATUS_OPTIONS = [
  { value: "to_address", label: "To address", color: "text-red-400" },
  { value: "addressed", label: "Addressed", color: "text-emerald-400" },
  { value: "rejected_justified", label: "Rejected (justified)", color: "text-amber-400" },
  { value: "not_applicable", label: "N/A", color: "text-[var(--muted-foreground)]" },
];

const DECISION_OPTIONS = [
  { value: "honours", label: "Honours quality" },
  { value: "accepted", label: "Accepted" },
  { value: "minor_revision", label: "Accepted with minor revision" },
  { value: "major_revision", label: "Major revision needed" },
  { value: "rejected", label: "Rejected" },
];

const DECISION_COLORS: Record<string, string> = {
  honours: "bg-emerald-700 text-white",
  accepted: "bg-emerald-600 text-white",
  minor_revision: "bg-amber-600 text-white",
  major_revision: "bg-orange-700 text-white",
  rejected: "bg-red-700 text-white",
};

const DEFAULT_RUBRIC_DIMENSIONS = [
  "Relevance to the proposed topic",
  "Relevance of the scientific contribution",
  "Relevance of managerial/practitioner implications",
  "Appropriateness of research/study method",
  "Relevance and novelty of the results",
  "Structure (format, language, style)",
  "Standard of English",
  "Reference list, adequate and correctly cited",
];

const SOURCE_TYPE_LABELS: Record<string, string> = {
  email: "Email",
  pdf_annotated: "Annotated PDF",
  editorial_letter: "Editorial Letter",
  scholarone: "ScholarOne",
  verbal: "Verbal / Meeting",
  other: "Other",
};

export default function ReviewJournal({ paperId }: { paperId: number }) {
  const { data, isLoading } = useSWR<JournalResponse>(
    `/api/v1/review-journal/${paperId}`,
    authFetcher
  );

  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newSourceType, setNewSourceType] = useState("other");
  const [newDate, setNewDate] = useState("");
  const [newRawText, setNewRawText] = useState("");
  const [creating, setCreating] = useState(false);

  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const [addingObsTo, setAddingObsTo] = useState<number | null>(null);
  const [newObsText, setNewObsText] = useState("");
  const [newObsSeverity, setNewObsSeverity] = useState("minor");
  const [newObsSection, setNewObsSection] = useState("");
  const [editingRawText, setEditingRawText] = useState<number | null>(null);
  const [editRawTextValue, setEditRawTextValue] = useState("");
  const [editingRatingLabel, setEditingRatingLabel] = useState<Record<number, string>>({});

  const toggleExpanded = (id: number) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const createEntry = async () => {
    if (!newLabel.trim()) return;
    setCreating(true);
    try {
      await fetch(`/api/v1/review-journal/${paperId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          reviewer_label: newLabel.trim(),
          source_type: newSourceType,
          received_at: newDate || null,
          raw_text: newRawText || null,
          items: [],
        }),
      });
      setNewLabel(""); setNewSourceType("other"); setNewDate(""); setNewRawText("");
      setShowAddForm(false);
      mutate(`/api/v1/review-journal/${paperId}`);
    } finally {
      setCreating(false);
    }
  };

  const addObservation = async (entryId: number) => {
    if (!newObsText.trim()) return;
    const entry = data?.entries.find(e => e.id === entryId);
    if (!entry) return;

    const updatedItems = [...entry.items, {
      text: newObsText.trim(),
      section_ref: newObsSection || null,
      severity: newObsSeverity,
      status: "to_address",
      response: null,
    }];

    await fetch(`/api/v1/review-journal/entry/${entryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ items: updatedItems }),
    });
    setNewObsText(""); setNewObsSeverity("minor"); setNewObsSection("");
    setAddingObsTo(null);
    mutate(`/api/v1/review-journal/${paperId}`);
  };

  const updateObservation = async (entryId: number, obsIndex: number, patch: Partial<Observation>) => {
    const entry = data?.entries.find(e => e.id === entryId);
    if (!entry) return;

    const updatedItems = entry.items.map((item, i) =>
      i === obsIndex ? { ...item, ...patch } : item
    );

    await fetch(`/api/v1/review-journal/entry/${entryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ items: updatedItems }),
    });
    mutate(`/api/v1/review-journal/${paperId}`);
  };

  const deleteEntry = async (entryId: number) => {
    if (!confirm("Delete this reviewer entry and all its observations?")) return;
    await fetch(`/api/v1/review-journal/entry/${entryId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    mutate(`/api/v1/review-journal/${paperId}`);
  };

  if (isLoading) {
    return <div className="h-20 bg-[var(--muted)] rounded-xl animate-pulse" />;
  }

  const entries = data?.entries || [];

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-4">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          Review Journal
          {data && data.total_observations > 0 && (
            <span className="text-xs font-normal text-[var(--muted-foreground)]">
              {data.addressed}/{data.total_observations} addressed ({data.progress_pct}%)
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-bold hover:bg-emerald-600 transition-colors"
        >
          + Add Reviewer
        </button>
      </div>

      {/* Progress bar */}
      {data && data.total_observations > 0 && (
        <div className="h-2 bg-[var(--secondary)] rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${data.progress_pct}%` }}
          />
        </div>
      )}

      {/* Add Reviewer Form */}
      {showAddForm && (
        <div className="p-4 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="Reviewer label (e.g. Reviewer 1)"
              className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
            />
            <select
              value={newSourceType}
              onChange={e => setNewSourceType(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
            >
              {Object.entries(SOURCE_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
            />
          </div>
          <textarea
            value={newRawText}
            onChange={e => setNewRawText(e.target.value)}
            placeholder="Paste the full review text here (optional — you can add structured observations separately)"
            rows={4}
            className="w-full px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none resize-y"
          />
          <div className="flex gap-2">
            <button
              onClick={createEntry}
              disabled={!newLabel.trim() || creating}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {creating ? "..." : "Create"}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-lg bg-[var(--card)] text-sm hover:bg-[var(--muted)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && !showAddForm && (
        <p className="text-sm text-[var(--muted-foreground)] text-center py-6">
          No reviewer feedback recorded yet. Click &quot;+ Add Reviewer&quot; to start tracking observations.
        </p>
      )}

      {/* Reviewer Entries */}
      {entries.map(entry => {
        const isExpanded = expandedEntries.has(entry.id);
        const entryAddressed = entry.items.filter(i => ["addressed", "rejected_justified", "not_applicable"].includes(i.status)).length;
        const entryTotal = entry.items.length;

        return (
          <div key={entry.id} className="rounded-lg border border-[var(--border)] overflow-hidden">
            {/* Entry header — click to expand/collapse */}
            <button
              onClick={() => toggleExpanded(entry.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--secondary)] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <svg className={cn("w-4 h-4 text-[var(--muted-foreground)] transition-transform shrink-0", isExpanded && "rotate-90")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <div className="min-w-0">
                  <span className="text-sm font-bold">{entry.reviewer_label}</span>
                  <span className="text-[10px] text-[var(--muted-foreground)] ml-2">
                    {SOURCE_TYPE_LABELS[entry.source_type] || entry.source_type}
                    {entry.received_at && ` · ${entry.received_at}`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {entry.decision && (
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold", DECISION_COLORS[entry.decision] || "bg-gray-600 text-white")}>
                    {DECISION_OPTIONS.find(o => o.value === entry.decision)?.label || entry.decision}
                  </span>
                )}
                {entry.rating != null && entry.rating_max != null && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold">
                    {entry.rating}/{entry.rating_max}
                  </span>
                )}
                {entryTotal > 0 && (
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold",
                    entryAddressed === entryTotal ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                  )}>
                    {entryAddressed}/{entryTotal}
                  </span>
                )}
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
                {/* Raw text — always editable */}
                {editingRawText === entry.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editRawTextValue}
                      onChange={e => setEditRawTextValue(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none resize-y"
                      placeholder="Reviewer notes, feedback, comments..."
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await fetch(`/api/v1/review-journal/entry/${entry.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json", ...authHeaders() },
                            body: JSON.stringify({ raw_text: editRawTextValue }),
                          });
                          setEditingRawText(null);
                          mutate(`/api/v1/review-journal/${paperId}`);
                        }}
                        className="text-[10px] px-3 py-1.5 rounded bg-emerald-700 text-white font-bold"
                      >Save</button>
                      <button onClick={() => setEditingRawText(null)} className="text-[10px] px-3 py-1.5 rounded hover:bg-[var(--muted)]">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="relative group">
                    {entry.raw_text ? (
                      <div className="text-xs text-[var(--muted-foreground)] bg-[var(--secondary)] rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {entry.raw_text}
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--muted-foreground)] italic bg-[var(--secondary)] rounded-lg p-3">
                        No notes yet — click Edit to add reviewer feedback text.
                      </div>
                    )}
                    <button
                      onClick={() => { setEditingRawText(entry.id); setEditRawTextValue(entry.raw_text || ""); }}
                      className="text-[10px] text-[var(--primary)] hover:underline mt-1"
                    >
                      Edit notes
                    </button>
                  </div>
                )}

                {/* Rating — collapsible, shown only if has data or user expands */}
                {(entry.rating != null || entry.rating_max != null || entry.rating_label) ? (
                <div className="p-2 rounded-lg bg-indigo-500/5 border border-indigo-500/20 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">Rating:</span>
                    <input
                      type="number"
                      min={1}
                      max={entry.rating_max || 10}
                      value={entry.rating ?? ""}
                      onChange={async (e) => {
                        const val = e.target.value ? parseInt(e.target.value) : null;
                        await fetch(`/api/v1/review-journal/entry/${entry.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json", ...authHeaders() },
                          body: JSON.stringify({ rating: val }),
                        });
                        mutate(`/api/v1/review-journal/${paperId}`);
                      }}
                      className="w-14 px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-xs text-center focus:outline-none"
                      placeholder="—"
                    />
                    <span className="text-[10px] text-[var(--muted-foreground)]">out of</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={entry.rating_max ?? ""}
                      onChange={async (e) => {
                        const val = e.target.value ? parseInt(e.target.value) : null;
                        await fetch(`/api/v1/review-journal/entry/${entry.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json", ...authHeaders() },
                          body: JSON.stringify({ rating_max: val }),
                        });
                        mutate(`/api/v1/review-journal/${paperId}`);
                      }}
                      className="w-14 px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-xs text-center focus:outline-none"
                      placeholder="5"
                    />
                  </div>
                  <input
                    type="text"
                    value={editingRatingLabel[entry.id] ?? entry.rating_label ?? ""}
                    onChange={(e) => setEditingRatingLabel(prev => ({ ...prev, [entry.id]: e.target.value }))}
                    onBlur={async (e) => {
                      await fetch(`/api/v1/review-journal/entry/${entry.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json", ...authHeaders() },
                        body: JSON.stringify({ rating_label: e.target.value || null }),
                      });
                      mutate(`/api/v1/review-journal/${paperId}`);
                    }}
                    className="w-full px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-[10px] focus:outline-none"
                    placeholder="Rating label (e.g. Overall contribution to IFKAD)"
                  />
                </div>
                ) : (
                <button
                  onClick={async () => {
                    await fetch(`/api/v1/review-journal/entry/${entry.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json", ...authHeaders() },
                      body: JSON.stringify({ rating_max: 5 }),
                    });
                    mutate(`/api/v1/review-journal/${paperId}`);
                  }}
                  className="text-[10px] text-[var(--primary)] hover:underline"
                >
                  + Add rating
                </button>
                )}

                {/* Decision */}
                <div className="flex items-center gap-3 p-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
                  <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">Decision:</span>
                  <select
                    value={entry.decision || ""}
                    onChange={async (e) => {
                      await fetch(`/api/v1/review-journal/entry/${entry.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json", ...authHeaders() },
                        body: JSON.stringify({ decision: e.target.value || null }),
                      });
                      mutate(`/api/v1/review-journal/${paperId}`);
                    }}
                    className="flex-1 px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
                  >
                    <option value="">— not set —</option>
                    {DECISION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {entry.decision && (
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold", DECISION_COLORS[entry.decision] || "bg-gray-600 text-white")}>
                      {DECISION_OPTIONS.find(o => o.value === entry.decision)?.label || entry.decision}
                    </span>
                  )}
                </div>

                {/* Rubric grid — only shown if has data */}
                {entry.rubric.length > 0 ? (
                <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-[var(--secondary)] border-b border-[var(--border)]">
                    <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase">Evaluation Rubric</span>
                  </div>
                    <div className="divide-y divide-[var(--border)]">
                      {entry.rubric.map((dim, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-2">
                          <span className="text-[10px] flex-1 min-w-0">{dim.dimension}</span>
                          <div className="flex gap-1 shrink-0">
                            {Array.from({ length: dim.score_max }, (_, i) => i + 1).map(val => (
                              <button
                                key={val}
                                onClick={async () => {
                                  const updated = [...entry.rubric];
                                  updated[idx] = { ...updated[idx], score: val };
                                  await fetch(`/api/v1/review-journal/entry/${entry.id}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json", ...authHeaders() },
                                    body: JSON.stringify({ rubric: updated }),
                                  });
                                  mutate(`/api/v1/review-journal/${paperId}`);
                                }}
                                className={cn(
                                  "w-6 h-6 rounded text-[10px] font-bold transition-colors",
                                  dim.score === val
                                    ? "bg-indigo-600 text-white"
                                    : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                                )}
                              >
                                {val}
                              </button>
                            ))}
                            <button
                              onClick={async () => {
                                const updated = [...entry.rubric];
                                updated[idx] = { ...updated[idx], score: null };
                                await fetch(`/api/v1/review-journal/entry/${entry.id}`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json", ...authHeaders() },
                                  body: JSON.stringify({ rubric: updated }),
                                });
                                mutate(`/api/v1/review-journal/${paperId}`);
                              }}
                              className={cn(
                                "w-8 h-6 rounded text-[9px] font-bold transition-colors",
                                dim.score === null
                                  ? "bg-gray-600 text-white"
                                  : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                              )}
                            >
                              N/A
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                </div>
                ) : (
                <button
                  onClick={async () => {
                    const defaultRubric = DEFAULT_RUBRIC_DIMENSIONS.map(d => ({ dimension: d, score: null, score_max: 5 }));
                    await fetch(`/api/v1/review-journal/entry/${entry.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json", ...authHeaders() },
                      body: JSON.stringify({ rubric: defaultRubric }),
                    });
                    mutate(`/api/v1/review-journal/${paperId}`);
                  }}
                  className="text-[10px] text-[var(--primary)] hover:underline"
                >
                  + Add evaluation rubric
                </button>
                )}

                {/* Observations list */}
                {entry.items.length > 0 && (
                  <div className="space-y-2">
                    {entry.items.map((obs, idx) => (
                      <div key={idx} className="flex gap-3 p-3 rounded-lg bg-[var(--secondary)]/50 border border-[var(--border)]">
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold uppercase", SEVERITY_BADGE[obs.severity] || "bg-gray-600 text-white")}>
                            {obs.severity}
                          </span>
                          {obs.section_ref && (
                            <span className="text-[9px] text-[var(--muted-foreground)]">§ {obs.section_ref}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="text-sm">{obs.text}</p>
                          {obs.response && (
                            <div className="text-xs text-emerald-400 bg-emerald-500/10 rounded px-2 py-1">
                              ↳ {obs.response}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <select
                              value={obs.status}
                              onChange={e => updateObservation(entry.id, idx, { status: e.target.value })}
                              className="text-[10px] px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none"
                            >
                              {STATUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            {obs.status !== "to_address" && !obs.response && (
                              <button
                                onClick={() => {
                                  const resp = prompt("Your response/action for this observation:");
                                  if (resp !== null) updateObservation(entry.id, idx, { response: resp });
                                }}
                                className="text-[10px] text-[var(--primary)] hover:underline"
                              >
                                + response
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add observation form */}
                {addingObsTo === entry.id ? (
                  <div className="p-3 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-2">
                    <textarea
                      value={newObsText}
                      onChange={e => setNewObsText(e.target.value)}
                      placeholder="Observation text..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none resize-y"
                    />
                    <div className="flex gap-2 items-center">
                      <select
                        value={newObsSeverity}
                        onChange={e => setNewObsSeverity(e.target.value)}
                        className="text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none"
                      >
                        <option value="major">Major</option>
                        <option value="minor">Minor</option>
                        <option value="suggestion">Suggestion</option>
                        <option value="praise">Praise</option>
                      </select>
                      <input
                        value={newObsSection}
                        onChange={e => setNewObsSection(e.target.value)}
                        placeholder="Section (optional)"
                        className="text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none w-32"
                      />
                      <button
                        onClick={() => addObservation(entry.id)}
                        disabled={!newObsText.trim()}
                        className="text-xs px-3 py-1.5 rounded bg-emerald-700 text-white font-bold hover:bg-emerald-600 disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setAddingObsTo(null)}
                        className="text-xs px-3 py-1.5 rounded hover:bg-[var(--muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setAddingObsTo(entry.id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[var(--secondary)] hover:bg-[var(--muted)] transition-colors"
                    >
                      + Add Observation
                    </button>
                    <label className="text-xs px-3 py-1.5 rounded-lg bg-amber-700 text-white hover:bg-amber-600 cursor-pointer transition-colors">
                      {entry.has_attachment ? "Replace attachment" : "Attach file"}
                      <input
                        type="file"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const fd = new FormData();
                          fd.append("file", f);
                          await fetch(`/api/v1/review-journal/entry/${entry.id}/attachment`, {
                            method: "POST",
                            headers: authHeaders(),
                            body: fd,
                          });
                          mutate(`/api/v1/review-journal/${paperId}`);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {entry.has_attachment && entry.attachment_path && (
                      <button
                        onClick={async () => {
                          const r = await fetch(`/api/v1/review-journal/entry/${entry.id}/attachment`, {
                            headers: authHeaders(),
                          });
                          if (r.ok) {
                            const blob = await r.blob();
                            const url = URL.createObjectURL(blob);
                            window.open(url, "_blank");
                          }
                        }}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-amber-800 text-white hover:bg-amber-700 flex items-center gap-1"
                        title="Open attachment"
                      >
                        📎 {entry.attachment_path.split("/").pop()}
                      </button>
                    )}
                    <button
                      onClick={() => deleteEntry(entry.id)}
                      className="text-xs px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors ml-auto"
                    >
                      Delete Reviewer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
