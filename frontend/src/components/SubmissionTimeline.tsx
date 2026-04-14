"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

interface Round {
  id: number;
  paper_id: number;
  round_number: number;
  label: string;
  document_type: string;
  document_path: string | null;
  has_document: boolean;
  submitted_at: string | null;
  deadline: string | null;
  decision: string | null;
  decision_at: string | null;
  decision_notes: string | null;
  created_at: string | null;
}

interface TimelineResponse {
  paper_id: number;
  rounds: Round[];
  total_rounds: number;
}

const DECISION_BADGE: Record<string, { bg: string; label: string }> = {
  pending: { bg: "bg-gray-600 text-white", label: "Pending" },
  accepted: { bg: "bg-emerald-700 text-white", label: "Accepted" },
  accepted_with_revisions: { bg: "bg-amber-600 text-white", label: "Accepted w/ revisions" },
  minor_revisions: { bg: "bg-amber-700 text-white", label: "Minor revisions" },
  major_revisions: { bg: "bg-orange-700 text-white", label: "Major revisions" },
  rejected: { bg: "bg-red-700 text-white", label: "Rejected" },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  abstract: "Abstract",
  extended_abstract: "Extended Abstract",
  full_paper: "Full Paper",
  camera_ready: "Camera Ready",
  other: "Other",
};

// Standard round labels in logical progression order.
// The user selects from these but can also type a custom label.
const ROUND_LABEL_PRESETS = [
  "Abstract Submission",
  "Extended Abstract Submission",
  "Full Paper Submission",
  "Revised Paper (Round 1)",
  "Revised Paper (Round 2)",
  "Revised Paper (Round 3)",
  "Minor Revision",
  "Major Revision",
  "Camera Ready",
  "Final Submission",
  "Poster / Presentation",
];

export default function SubmissionTimeline({ paperId }: { paperId: number }) {
  const { isAdmin } = useAuth();
  const apiUrl = `/api/v1/submission-rounds/${paperId}`;
  const { data, isLoading } = useSWR<TimelineResponse>(apiUrl, authFetcher);

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [docType, setDocType] = useState("full_paper");
  const [submittedAt, setSubmittedAt] = useState("");
  const [deadlineVal, setDeadlineVal] = useState("");
  const [decision, setDecision] = useState("");
  const [decisionAt, setDecisionAt] = useState("");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDocType, setEditDocType] = useState("");
  const [editSubmittedAt, setEditSubmittedAt] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editDecision, setEditDecision] = useState("");
  const [editDecisionAt, setEditDecisionAt] = useState("");
  const [editDecisionNotes, setEditDecisionNotes] = useState("");

  const nextRoundNumber = (data?.rounds.length ?? 0);

  const createRound = async () => {
    if (!label.trim()) return;
    setCreating(true);
    try {
      await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          round_number: nextRoundNumber,
          label: label.trim(),
          document_type: docType,
          submitted_at: submittedAt || null,
          deadline: deadlineVal || null,
          decision: decision || null,
          decision_at: decisionAt || null,
          decision_notes: decisionNotes || null,
        }),
      });
      setLabel(""); setDocType("full_paper"); setSubmittedAt(""); setDeadlineVal(""); setDecision(""); setDecisionAt(""); setDecisionNotes("");
      setShowForm(false);
      mutate(apiUrl);
    } finally {
      setCreating(false);
    }
  };

  const updateRound = async (roundId: number) => {
    await fetch(`/api/v1/submission-rounds/round/${roundId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        label: editLabel || null,
        document_type: editDocType || null,
        submitted_at: editSubmittedAt || null,
        deadline: editDeadline || null,
        decision: editDecision || null,
        decision_at: editDecisionAt || null,
        decision_notes: editDecisionNotes || null,
      }),
    });
    setEditingId(null);
    mutate(apiUrl);
  };

  const uploadDoc = async (roundId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    await fetch(`/api/v1/submission-rounds/round/${roundId}/document`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    });
    mutate(apiUrl);
  };

  const deleteRound = async (roundId: number) => {
    if (!confirm("Delete this submission round?")) return;
    await fetch(`/api/v1/submission-rounds/round/${roundId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    mutate(apiUrl);
  };

  if (isLoading) {
    return <div className="h-20 bg-[var(--muted)] rounded-xl animate-pulse" />;
  }

  const rounds = data?.rounds || [];

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Submission Timeline</h3>
        {isAdmin && (
          <button
            onClick={() => { setShowForm(!showForm); setLabel(`Round ${nextRoundNumber}`); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-bold hover:bg-blue-600 transition-colors"
          >
            + Add Round
          </button>
        )}
      </div>

      {/* Add Round Form */}
      {isAdmin && showForm && (
        <div className="p-4 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <select
                value={ROUND_LABEL_PRESETS.includes(label) ? label : "__custom__"}
                onChange={e => {
                  if (e.target.value === "__custom__") setLabel("");
                  else setLabel(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
              >
                {ROUND_LABEL_PRESETS.map(preset => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
                <option value="__custom__">Custom label...</option>
              </select>
              {!ROUND_LABEL_PRESETS.includes(label) && (
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="Custom label"
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
                />
              )}
            </div>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
            >
              {Object.entries(DOC_TYPE_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
            <input
              type="date"
              value={submittedAt}
              onChange={e => setSubmittedAt(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
              placeholder="Submitted date"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Deadline</label>
              <input
                type="date"
                value={deadlineVal}
                onChange={e => setDeadlineVal(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
              />
            </div>
            <select
              value={decision}
              onChange={e => setDecision(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
            >
              <option value="">Decision (optional)</option>
              {Object.entries(DECISION_BADGE).map(([val, { label: lbl }]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
            <input
              type="date"
              value={decisionAt}
              onChange={e => setDecisionAt(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
              placeholder="Decision date"
            />
            <input
              value={decisionNotes}
              onChange={e => setDecisionNotes(e.target.value)}
              placeholder="Decision notes (optional)"
              className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={createRound}
              disabled={!label.trim() || creating}
              className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-bold hover:bg-blue-600 disabled:opacity-50"
            >
              {creating ? "..." : "Create"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-[var(--card)] text-sm hover:bg-[var(--muted)]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {rounds.length === 0 && !showForm && (
        <p className="text-sm text-[var(--muted-foreground)] text-center py-6">
          {isAdmin
            ? 'No submission rounds recorded. Click "+ Add Round" to track your submission history.'
            : "No submission rounds recorded yet."}
        </p>
      )}

      {/* Timeline */}
      {rounds.length > 0 && (
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-[var(--border)]" />

          {rounds.map((round, idx) => {
            const decBadge = round.decision ? DECISION_BADGE[round.decision] : null;
            const isLast = idx === rounds.length - 1;
            const isEditing = editingId === round.id;

            return (
              <div key={round.id} className={cn("relative pb-6", isLast && "pb-0")}>
                {/* Dot on timeline */}
                <div className={cn(
                  "absolute -left-3.5 top-1 w-3 h-3 rounded-full border-2",
                  round.decision === "accepted" ? "bg-emerald-500 border-emerald-700" :
                  round.decision === "rejected" ? "bg-red-500 border-red-700" :
                  round.decision ? "bg-amber-500 border-amber-700" :
                  "bg-[var(--muted-foreground)] border-[var(--border)]"
                )} />

                <div className="rounded-lg bg-[var(--secondary)]/50 border border-[var(--border)] p-3 space-y-2">
                  {/* Round header */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold">{round.label}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] font-bold">
                        {DOC_TYPE_LABELS[round.document_type] || round.document_type}
                      </span>
                      {round.submitted_at && (
                        <span className="text-[10px] text-[var(--muted-foreground)]">Submitted: {round.submitted_at}</span>
                      )}
                      {round.deadline && (() => {
                        const today = new Date().toISOString().slice(0, 10);
                        const daysLeft = Math.ceil((new Date(round.deadline).getTime() - new Date(today).getTime()) / 86400000);
                        const isOverdue = daysLeft < 0 && !round.submitted_at;
                        const isUrgent = daysLeft >= 0 && daysLeft <= 7 && !round.submitted_at;
                        return (
                          <span className={`text-[10px] font-bold ${isOverdue ? "text-red-400" : isUrgent ? "text-amber-400" : "text-[var(--muted-foreground)]"}`}>
                            ⏰ Deadline: {round.deadline}
                            {isOverdue && " (overdue!)"}
                            {isUrgent && ` (${daysLeft}d left)`}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {round.has_document && round.document_path && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-800 text-white">
                          {round.document_path.split(".").pop()?.toUpperCase() || "DOC"}
                        </span>
                      )}
                      {isAdmin && (
                        <label className="text-[10px] px-2 py-1 rounded bg-[var(--muted)] hover:bg-[var(--border)] cursor-pointer transition-colors">
                          {round.has_document ? "Replace" : "Upload"}
                          <input
                            type="file"
                            accept=".pdf,.md,.tex,.txt"
                            className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) uploadDoc(round.id, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => deleteRound(round.id)}
                          className="text-[10px] px-2 py-1 rounded text-red-400 hover:bg-red-500/10"
                        >
                          Del
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Decision + Edit all fields */}
                  {isEditing ? (
                    <div className="space-y-2 p-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)]">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[9px] text-[var(--muted-foreground)]">Label</label>
                          <select value={ROUND_LABEL_PRESETS.includes(editLabel) ? editLabel : "__custom__"} onChange={e => { if (e.target.value !== "__custom__") setEditLabel(e.target.value); else setEditLabel(""); }} className="w-full text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none">
                            {ROUND_LABEL_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                            <option value="__custom__">Custom...</option>
                          </select>
                          {!ROUND_LABEL_PRESETS.includes(editLabel) && <input value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Custom label" className="w-full mt-1 text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none" />}
                        </div>
                        <div>
                          <label className="text-[9px] text-[var(--muted-foreground)]">Doc type</label>
                          <select value={editDocType} onChange={e => setEditDocType(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none">
                            {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] text-[var(--muted-foreground)]">Submitted</label>
                          <input type="date" value={editSubmittedAt} onChange={e => setEditSubmittedAt(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[9px] text-[var(--muted-foreground)]">Deadline</label>
                          <input type="date" value={editDeadline} onChange={e => setEditDeadline(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[9px] text-[var(--muted-foreground)]">Decision</label>
                          <select value={editDecision} onChange={e => setEditDecision(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none">
                            <option value="">No decision</option>
                            {Object.entries(DECISION_BADGE).map(([v, { label: l }]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] text-[var(--muted-foreground)]">Decision date</label>
                          <input type="date" value={editDecisionAt} onChange={e => setEditDecisionAt(e.target.value)} className="w-full text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[9px] text-[var(--muted-foreground)]">Notes</label>
                          <input value={editDecisionNotes} onChange={e => setEditDecisionNotes(e.target.value)} placeholder="Decision notes..." className="w-full text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => updateRound(round.id)} className="text-[10px] px-3 py-1.5 rounded bg-emerald-700 text-white font-bold">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-[10px] px-3 py-1.5 rounded hover:bg-[var(--muted)]">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {decBadge ? (
                        <>
                          <span className={cn("text-[10px] px-2 py-0.5 rounded font-bold", decBadge.bg)}>
                            {decBadge.label}
                          </span>
                          {round.decision_at && (
                            <span className="text-[10px] text-[var(--muted-foreground)]">{round.decision_at}</span>
                          )}
                          {round.decision_notes && (
                            <span className="text-[10px] text-[var(--muted-foreground)] italic">— {round.decision_notes}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-[var(--muted-foreground)]">No decision yet</span>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setEditingId(round.id);
                            setEditLabel(round.label);
                            setEditDocType(round.document_type);
                            setEditSubmittedAt(round.submitted_at || "");
                            setEditDeadline(round.deadline || "");
                            setEditDecision(round.decision || "");
                            setEditDecisionAt(round.decision_at || "");
                            setEditDecisionNotes(round.decision_notes || "");
                          }}
                          className="text-[10px] text-[var(--primary)] hover:underline ml-auto"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
