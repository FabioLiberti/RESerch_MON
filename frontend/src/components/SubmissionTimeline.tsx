"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import { cn } from "@/lib/utils";

interface Round {
  id: number;
  paper_id: number;
  round_number: number;
  label: string;
  document_type: string;
  document_path: string | null;
  has_document: boolean;
  submitted_at: string | null;
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

export default function SubmissionTimeline({ paperId }: { paperId: number }) {
  const apiUrl = `/api/v1/submission-rounds/${paperId}`;
  const { data, isLoading } = useSWR<TimelineResponse>(apiUrl, authFetcher);

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [docType, setDocType] = useState("full_paper");
  const [submittedAt, setSubmittedAt] = useState("");
  const [decision, setDecision] = useState("");
  const [decisionAt, setDecisionAt] = useState("");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
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
          decision: decision || null,
          decision_at: decisionAt || null,
          decision_notes: decisionNotes || null,
        }),
      });
      setLabel(""); setDocType("full_paper"); setSubmittedAt(""); setDecision(""); setDecisionAt(""); setDecisionNotes("");
      setShowForm(false);
      mutate(apiUrl);
    } finally {
      setCreating(false);
    }
  };

  const updateDecision = async (roundId: number) => {
    await fetch(`/api/v1/submission-rounds/round/${roundId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
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
        <button
          onClick={() => { setShowForm(!showForm); setLabel(`Round ${nextRoundNumber}`); }}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-bold hover:bg-blue-600 transition-colors"
        >
          + Add Round
        </button>
      </div>

      {/* Add Round Form */}
      {showForm && (
        <div className="p-4 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Label (e.g. EA Submission)"
              className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
            />
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          No submission rounds recorded. Click &quot;+ Add Round&quot; to track your submission history.
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
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {round.has_document && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-800 text-white">PDF</span>
                      )}
                      <label className="text-[10px] px-2 py-1 rounded bg-[var(--muted)] hover:bg-[var(--border)] cursor-pointer transition-colors">
                        {round.has_document ? "Replace" : "Upload"} PDF
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) uploadDoc(round.id, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <button
                        onClick={() => deleteRound(round.id)}
                        className="text-[10px] px-2 py-1 rounded text-red-400 hover:bg-red-500/10"
                      >
                        Del
                      </button>
                    </div>
                  </div>

                  {/* Decision */}
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={editDecision}
                        onChange={e => setEditDecision(e.target.value)}
                        className="text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none"
                      >
                        <option value="">No decision</option>
                        {Object.entries(DECISION_BADGE).map(([val, { label: lbl }]) => (
                          <option key={val} value={val}>{lbl}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={editDecisionAt}
                        onChange={e => setEditDecisionAt(e.target.value)}
                        className="text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none"
                      />
                      <input
                        value={editDecisionNotes}
                        onChange={e => setEditDecisionNotes(e.target.value)}
                        placeholder="Notes..."
                        className="text-xs px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none flex-1 min-w-32"
                      />
                      <button onClick={() => updateDecision(round.id)} className="text-[10px] px-2 py-1 rounded bg-emerald-700 text-white font-bold">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-[10px] px-2 py-1 rounded hover:bg-[var(--muted)]">Cancel</button>
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
                      <button
                        onClick={() => {
                          setEditingId(round.id);
                          setEditDecision(round.decision || "");
                          setEditDecisionAt(round.decision_at || "");
                          setEditDecisionNotes(round.decision_notes || "");
                        }}
                        className="text-[10px] text-[var(--primary)] hover:underline ml-auto"
                      >
                        {decBadge ? "Edit decision" : "Set decision"}
                      </button>
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
