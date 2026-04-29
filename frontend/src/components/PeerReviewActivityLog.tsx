"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import { useAuth } from "@/lib/auth";

interface LogEntry {
  id: number;
  peer_review_id: number;
  event_type: string;
  description: string | null;
  payload: Record<string, any> | null;
  actor_username: string | null;
  occurred_at: string | null;
  created_at: string | null;
}

interface LogResponse {
  peer_review_id: number;
  logs: LogEntry[];
  total: number;
}

// SYSTEM events (auto-logged by backend) and MANUAL categories (user-pickable
// when adding an entry). The two are unified in the timeline display so the
// reviewer reads a single chronological story; the MANUAL_CATEGORIES list is
// what the dropdown in the entry form exposes (5 grouped options).
const EVENT_LABEL: Record<string, string> = {
  // System
  created: "Created",
  metadata_updated: "Metadata updated",
  pdf_uploaded: "Manuscript PDF uploaded",
  comments_edited: "Comments edited",
  rubric_edited: "Rubric edited",
  recommendation_changed: "Recommendation changed",
  llm_suggestion_applied: "AI suggestion applied",
  attachment_added: "Attachment added",
  attachment_removed: "Attachment removed",
  bundle_snapshot_saved: "Bundle snapshot saved",
  submitted: "Submitted",
  edit_unlocked: "Re-opened for editing",
  archived: "Archived",
  deleted: "Deleted",
  receipt_generated: "Submission receipt generated",
  // Manual (user-pickable)
  manual_received: "📥 Received",
  manual_working: "📝 Working note",
  manual_submitted: "📤 Submitted",
  manual_communication: "💬 Communication",
  manual_note: "📌 Note",
};

const EVENT_COLOR: Record<string, string> = {
  // System
  created: "bg-indigo-700",
  pdf_uploaded: "bg-blue-700",
  llm_suggestion_applied: "bg-purple-700",
  attachment_added: "bg-cyan-700",
  attachment_removed: "bg-orange-700",
  bundle_snapshot_saved: "bg-teal-700",
  submitted: "bg-emerald-700",
  edit_unlocked: "bg-amber-700",
  archived: "bg-gray-700",
  receipt_generated: "bg-emerald-800",
  recommendation_changed: "bg-fuchsia-700",
  // Manual
  manual_received: "bg-sky-700",
  manual_working: "bg-slate-700",
  manual_submitted: "bg-emerald-700",
  manual_communication: "bg-violet-700",
  manual_note: "bg-stone-700",
};

// 5 user-pickable categories — covers the full review process without
// overwhelming the form. Default is "manual_working" (most frequent case).
const MANUAL_CATEGORIES: { value: string; label: string; hint: string }[] = [
  { value: "manual_received",      label: "📥 Received",      hint: "Incoming: assignment, editor msg, decision letter, query" },
  { value: "manual_working",       label: "📝 Working note",  hint: "Internal: reading memo, milestone, reminder" },
  { value: "manual_submitted",     label: "📤 Submitted",     hint: "Outgoing: review sent to journal, response transmitted" },
  { value: "manual_communication", label: "💬 Communication", hint: "Email to/from editor, journal, co-authors" },
  { value: "manual_note",          label: "📌 Other",         hint: "Generic note that doesn't fit elsewhere" },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function PeerReviewActivityLog({ peerReviewId }: { peerReviewId: number }) {
  const { isAdmin } = useAuth();
  const apiUrl = `/api/v1/peer-review/${peerReviewId}/log`;
  const { data, isLoading } = useSWR<LogResponse>(apiUrl, authFetcher);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newOccurredAt, setNewOccurredAt] = useState("");
  // Default category: "Working note" — most frequent case for a reviewer
  const [newEventType, setNewEventType] = useState("manual_working");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editOccurredAt, setEditOccurredAt] = useState("");

  const addEntry = async () => {
    if (!newDescription.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          event_type: newEventType,
          description: newDescription,
          occurred_at: newOccurredAt || undefined,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setNewDescription("");
      setNewOccurredAt("");
      setNewEventType("manual_working");
      setShowAddForm(false);
      mutate(apiUrl);
    } catch (e: any) {
      setError(`Add failed: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (logId: number) => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${apiUrl}/${logId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          description: editDescription,
          occurred_at: editOccurredAt || undefined,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEditingId(null);
      mutate(apiUrl);
    } catch (e: any) {
      setError(`Edit failed: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (logId: number) => {
    if (!confirm("Delete this log entry?")) return;
    try {
      const r = await fetch(`${apiUrl}/${logId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mutate(apiUrl);
    } catch (e: any) {
      setError(`Delete failed: ${e.message || e}`);
    }
  };

  const items = data?.logs || [];

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">Activity Log</h3>
          <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
            Chronological record of every state transition and meaningful action on this peer review.
            Useful as audit trail and for proving timeliness of submission.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(s => !s)}
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-white font-bold hover:bg-slate-600 transition-colors"
        >
          {showAddForm ? "Cancel" : "+ Add manual entry"}
        </button>
      </div>

      {showAddForm && (
        <div className="rounded-lg bg-[var(--secondary)]/40 border border-[var(--border)] p-3 space-y-2">
          <div className="flex gap-2 flex-wrap items-center">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Category</label>
            <select
              value={newEventType}
              onChange={e => setNewEventType(e.target.value)}
              className="text-xs px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)]"
              title={MANUAL_CATEGORIES.find(c => c.value === newEventType)?.hint || ""}
            >
              {MANUAL_CATEGORIES.map(c => (
                <option key={c.value} value={c.value} title={c.hint}>{c.label}</option>
              ))}
            </select>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-2">When</label>
            <input
              type="datetime-local"
              value={newOccurredAt}
              onChange={e => setNewOccurredAt(e.target.value)}
              className="text-xs px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)]"
              title="When this event happened (defaults to now; editable for backdating)"
            />
          </div>
          <p className="text-[9px] text-[var(--muted-foreground)] italic">
            {MANUAL_CATEGORIES.find(c => c.value === newEventType)?.hint}
          </p>
          <textarea
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            rows={2}
            placeholder="Description (e.g. 'Submitted to ScholarOne, manuscript ID returned by IEEE')…"
            className="w-full px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={addEntry}
              disabled={saving || !newDescription.trim()}
              className="text-xs px-3 py-1.5 rounded bg-emerald-700 text-white font-bold hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save entry"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="text-[11px] px-2 py-1.5 rounded bg-red-900/30 border border-red-700/40 text-red-300">
          {error}
        </div>
      )}

      {isLoading && <div className="h-12 bg-[var(--muted)] rounded-lg animate-pulse" />}

      {!isLoading && items.length === 0 && (
        <p className="text-xs text-[var(--muted-foreground)] text-center py-4">No log entries yet.</p>
      )}

      {!isLoading && items.length > 0 && (
        <ol className="relative border-l-2 border-[var(--border)] ml-2 space-y-3">
          {items.map((entry) => {
            const label = EVENT_LABEL[entry.event_type] || entry.event_type;
            const color = EVENT_COLOR[entry.event_type] || "bg-slate-700";
            const isEditing = editingId === entry.id;
            return (
              <li key={entry.id} className="ml-4 relative">
                <span className={`absolute -left-[1.4em] top-1 w-3 h-3 rounded-full ${color} ring-2 ring-[var(--card)]`} />
                {isEditing ? (
                  <div className="rounded-lg bg-[var(--secondary)]/40 border border-amber-500/40 p-3 space-y-2">
                    <input
                      type="datetime-local"
                      value={editOccurredAt}
                      onChange={e => setEditOccurredAt(e.target.value)}
                      className="text-xs px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)]"
                    />
                    <textarea
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      rows={2}
                      className="w-full px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => saveEdit(entry.id)}
                        disabled={saving}
                        className="text-[10px] px-2 py-1 rounded bg-amber-600 text-white font-bold hover:bg-amber-500 disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-[10px] px-2 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded text-white font-bold ${color}`}>
                        {label}
                      </span>
                      <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
                        {formatDateTime(entry.occurred_at)}
                      </span>
                      {entry.actor_username && (
                        <span className="text-[10px] text-[var(--muted-foreground)] italic">
                          by {entry.actor_username}
                        </span>
                      )}
                      <div className="flex-1" />
                      <button
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditDescription(entry.description || "");
                          setEditOccurredAt(entry.occurred_at ? entry.occurred_at.slice(0, 16) : "");
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-500 hover:bg-amber-600/40 transition-colors"
                        title="Edit description / timestamp"
                      >
                        Edit
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => removeEntry(entry.id)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 transition-colors"
                          title="Delete entry (admin only)"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {entry.description && (
                      <p className="text-xs text-[var(--foreground)] whitespace-pre-wrap leading-snug">
                        {entry.description}
                      </p>
                    )}
                    {entry.payload && entry.event_type === "receipt_generated" && entry.payload.hash && (
                      <p className="text-[9px] text-[var(--muted-foreground)] font-mono break-all">
                        SHA-256: {entry.payload.hash}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
