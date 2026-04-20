"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

interface VenueKeyDate {
  id: number;
  paper_id: number;
  label: string;
  date: string;
  is_done: boolean;
  notes: string | null;
  source_url: string | null;
  order_index: number;
  linked_round_id: number | null;
  linked_journal_entry_id: number | null;
  created_at: string | null;
}

interface ListResponse {
  paper_id: number;
  key_dates: VenueKeyDate[];
  total: number;
}

interface Round {
  id: number;
  round_number: number;
  label: string;
}

interface ReviewerEntry {
  id: number;
  reviewer_label: string;
  received_at: string | null;
}

const LABEL_PRESETS = [
  "Call Opening",
  "Track / Workshop Proposal Deadline",
  "Track / Workshop Proposal Notification",
  "Abstract Submission Deadline",
  "Extended Abstract Deadline",
  "Extended Abstract Notification",
  "Full Paper Submission Deadline",
  "Full Paper Submission — Extended Deadline",
  "Acceptance Notification",
  "Revised Paper Submission",
  "Camera-Ready Deadline",
  "Workshop Paper Submission Deadline",
  "Workshop Paper Notification",
  "Workshop Camera-Ready Deadline",
  "Early-Bird Registration Deadline",
  "Registration Deadline",
  "Conference Program Release",
  "Conference Start",
  "Conference End",
];

type Urgency = "done" | "overdue" | "urgent" | "upcoming" | "neutral";

function urgency(dateStr: string, isDone: boolean): Urgency {
  if (isDone) return "done";
  const today = new Date().toISOString().slice(0, 10);
  const diff = Math.ceil((new Date(dateStr).getTime() - new Date(today).getTime()) / 86400000);
  if (diff < 0) return "overdue";
  if (diff <= 7) return "urgent";
  if (diff <= 30) return "upcoming";
  return "neutral";
}

function urgencyStyle(u: Urgency): { bg: string; label: string } {
  switch (u) {
    case "done":     return { bg: "bg-emerald-700 text-white",  label: "✓ Done" };
    case "overdue":  return { bg: "bg-red-700 text-white",      label: "Overdue" };
    case "urgent":   return { bg: "bg-amber-700 text-white",    label: "Urgent" };
    case "upcoming": return { bg: "bg-blue-700 text-white",     label: "Upcoming" };
    default:         return { bg: "bg-gray-700 text-white",     label: "Scheduled" };
  }
}

function daysFromNow(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const diff = Math.ceil((new Date(dateStr).getTime() - new Date(today).getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff < 0) return `${-diff}d ago`;
  return `in ${diff}d`;
}

interface Props {
  paperId: number;
  compact?: boolean;
  manageUrl?: string;
  defaultCollapsed?: boolean;
}

export default function VenueKeyDates({ paperId, compact = false, manageUrl, defaultCollapsed = false }: Props) {
  const { isAdmin } = useAuth();
  const apiUrl = `/api/v1/venue-key-dates/${paperId}`;
  const { data, isLoading } = useSWR<ListResponse>(apiUrl, authFetcher);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const { data: roundsData } = useSWR<{ rounds: Round[] }>(
    !compact ? `/api/v1/submission-rounds/${paperId}` : null,
    authFetcher
  );
  const { data: journalData } = useSWR<{ entries: ReviewerEntry[] }>(
    !compact ? `/api/v1/review-journal/${paperId}` : null,
    authFetcher
  );

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // form state
  const [label, setLabel] = useState(LABEL_PRESETS[6]);
  const [customLabel, setCustomLabel] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [linkedRound, setLinkedRound] = useState<string>("");
  const [linkedEntry, setLinkedEntry] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const items = data?.key_dates || [];

  const resetForm = () => {
    setLabel(LABEL_PRESETS[6]);
    setCustomLabel("");
    setDate("");
    setNotes("");
    setSourceUrl("");
    setLinkedRound("");
    setLinkedEntry("");
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (kd: VenueKeyDate) => {
    if (LABEL_PRESETS.includes(kd.label)) {
      setLabel(kd.label);
      setCustomLabel("");
    } else {
      setLabel("__custom__");
      setCustomLabel(kd.label);
    }
    setDate(kd.date);
    setNotes(kd.notes || "");
    setSourceUrl(kd.source_url || "");
    setLinkedRound(kd.linked_round_id ? String(kd.linked_round_id) : "");
    setLinkedEntry(kd.linked_journal_entry_id ? String(kd.linked_journal_entry_id) : "");
    setEditingId(kd.id);
    setShowForm(true);
  };

  const save = async () => {
    const finalLabel = label === "__custom__" ? customLabel.trim() : label;
    if (!finalLabel || !date) return;
    setSaving(true);
    try {
      const body = {
        label: finalLabel,
        date,
        notes: notes.trim() || null,
        source_url: sourceUrl.trim() || null,
        linked_round_id: linkedRound ? Number(linkedRound) : null,
        linked_journal_entry_id: linkedEntry ? Number(linkedEntry) : null,
      };
      if (editingId) {
        await fetch(`/api/v1/venue-key-dates/entry/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(body),
        });
      } else {
        await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(body),
        });
      }
      resetForm();
      mutate(apiUrl);
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (kd: VenueKeyDate) => {
    await fetch(`/api/v1/venue-key-dates/entry/${kd.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ is_done: !kd.is_done }),
    });
    mutate(apiUrl);
  };

  const remove = async (kd: VenueKeyDate) => {
    if (!confirm(`Delete "${kd.label}"?`)) return;
    await fetch(`/api/v1/venue-key-dates/entry/${kd.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    mutate(apiUrl);
  };

  if (isLoading) {
    return <div className="h-16 bg-[var(--muted)] rounded-xl animate-pulse" />;
  }

  // --- COMPACT MODE (for paper detail page) ---
  if (compact) {
    // Show at most 4 most-relevant: overdue > urgent > upcoming > done
    const prio: Record<Urgency, number> = { overdue: 0, urgent: 1, upcoming: 2, neutral: 3, done: 4 };
    const sorted = [...items].sort((a, b) => {
      const ua = urgency(a.date, a.is_done);
      const ub = urgency(b.date, b.is_done);
      if (prio[ua] !== prio[ub]) return prio[ua] - prio[ub];
      return a.date.localeCompare(b.date);
    });
    const shown = sorted.slice(0, 4);

    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold flex items-center gap-1.5">
            <span className="text-amber-400">📅</span> Venue Key Dates
            {items.length > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] font-normal">
                {items.length}
              </span>
            )}
          </h3>
          {manageUrl && (
            <Link href={manageUrl} className="text-[10px] text-[var(--primary)] hover:underline font-bold">
              {items.length === 0 ? "+ Add key dates →" : "Manage →"}
            </Link>
          )}
        </div>
        {items.length === 0 ? (
          <p className="text-[10px] text-[var(--muted-foreground)] text-center py-2">
            No key dates yet. Track venue deadlines, notifications, and conference dates from the manuscript page.
          </p>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {shown.map(kd => {
            const u = urgency(kd.date, kd.is_done);
            const style = urgencyStyle(u);
            return (
              <div key={kd.id} className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--secondary)]/50 border",
                u === "overdue" ? "border-red-700/50" :
                u === "urgent" ? "border-amber-700/50" :
                u === "done" ? "border-emerald-700/50 opacity-60" :
                "border-[var(--border)]"
              )}>
                <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0", style.bg)}>
                  {style.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-[11px] font-medium truncate", kd.is_done && "line-through")}>
                    {kd.label}
                  </div>
                  <div className="text-[9px] text-[var(--muted-foreground)]">
                    {kd.date} · {daysFromNow(kd.date)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
        {items.length > shown.length && (
          <div className="text-[10px] text-[var(--muted-foreground)] mt-1.5 text-center">
            +{items.length - shown.length} more
          </div>
        )}
      </div>
    );
  }

  // --- FULL MODE (for my-manuscripts detail page) ---
  const rounds = roundsData?.rounds || [];
  const entries = journalData?.entries || [];

  // Summary for collapsed header
  const counts = items.reduce(
    (acc, kd) => {
      const u = urgency(kd.date, kd.is_done);
      acc[u] = (acc[u] || 0) + 1;
      return acc;
    },
    {} as Record<Urgency, number>
  );

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-1.5 text-left hover:opacity-80 transition-opacity"
          aria-expanded={!collapsed}
        >
          <span className="text-[10px] text-[var(--muted-foreground)] w-3">{collapsed ? "▶" : "▼"}</span>
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <span className="text-amber-400">📅</span> Venue Key Dates
            {items.length > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] font-normal">
                {items.length}
              </span>
            )}
          </h3>
          {collapsed && items.length > 0 && (
            <span className="flex items-center gap-1 ml-2">
              {counts.overdue > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-700 text-white font-bold">{counts.overdue} overdue</span>}
              {counts.urgent > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-700 text-white font-bold">{counts.urgent} urgent</span>}
              {counts.upcoming > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-700 text-white font-bold">{counts.upcoming} upcoming</span>}
              {counts.done > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-700 text-white font-bold">{counts.done} done</span>}
            </span>
          )}
        </button>
        {isAdmin && !showForm && !collapsed && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-bold hover:bg-blue-600 transition-colors"
          >
            + Add Date
          </button>
        )}
      </div>

      {!collapsed && isAdmin && showForm && (
        <div className="p-3 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Key date</label>
              <select
                value={label}
                onChange={e => setLabel(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
              >
                {LABEL_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                <option value="__custom__">Custom...</option>
              </select>
              {label === "__custom__" && (
                <input
                  value={customLabel}
                  onChange={e => setCustomLabel(e.target.value)}
                  placeholder="Custom label"
                  className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
                />
              )}
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Source URL (optional)</label>
            <input
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
              placeholder="https://www.ifkad.org/key-dates/"
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Notes (optional)</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. extended deadline, special note..."
              className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
            />
          </div>
          {(rounds.length > 0 || entries.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {rounds.length > 0 && (
                <div>
                  <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Link to Submission Round (optional)</label>
                  <select
                    value={linkedRound}
                    onChange={e => setLinkedRound(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
                  >
                    <option value="">— none —</option>
                    {rounds.map(r => (
                      <option key={r.id} value={r.id}>Round {r.round_number}: {r.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {entries.length > 0 && (
                <div>
                  <label className="text-[10px] text-[var(--muted-foreground)] block mb-1">Link to Review Journal entry (optional)</label>
                  <select
                    value={linkedEntry}
                    onChange={e => setLinkedEntry(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
                  >
                    <option value="">— none —</option>
                    {entries.map(ent => (
                      <option key={ent.id} value={ent.id}>
                        {ent.reviewer_label}{ent.received_at ? ` · ${ent.received_at}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving || (label === "__custom__" && !customLabel.trim()) || !date}
              className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-bold hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {saving ? "..." : editingId ? "Update" : "Create"}
            </button>
            <button onClick={resetForm} className="px-3 py-1.5 rounded-lg bg-[var(--card)] text-xs hover:bg-[var(--muted)] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {!collapsed && items.length === 0 && !showForm && (
        <p className="text-xs text-[var(--muted-foreground)] text-center py-4">
          {isAdmin
            ? 'No key dates yet. Click "+ Add Date" to track venue deadlines, notifications, and conference dates.'
            : "No key dates recorded yet."}
        </p>
      )}

      {!collapsed && items.length > 0 && (() => {
        // --- Horizontal timeline visualization ---
        const todayStr = new Date().toISOString().slice(0, 10);
        const allDates = [...items.map(i => i.date), todayStr].map(d => new Date(d).getTime());
        const minT = Math.min(...allDates);
        const maxT = Math.max(...allDates);
        const paddingMs = Math.max((maxT - minT) * 0.08, 7 * 86400000); // 8% or min 7 days
        const rangeMin = minT - paddingMs;
        const rangeMax = maxT + paddingMs;
        const span = rangeMax - rangeMin || 1;
        const pos = (dateStr: string) => ((new Date(dateStr).getTime() - rangeMin) / span) * 100;
        const todayPos = pos(todayStr);
        const sortedItems = [...items].sort((a, b) => a.date.localeCompare(b.date));

        return (
          <div className="rounded-lg bg-[var(--secondary)]/30 border border-[var(--border)] px-4 pt-10 pb-14 overflow-x-auto">
            <div className="relative min-w-[600px]" style={{ height: "90px" }}>
              {/* Axis line */}
              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-[var(--border)]" />

              {/* Month tick marks (start/end) */}
              <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 text-[9px] text-[var(--muted-foreground)] font-mono">
                <div className="absolute left-1/2 -translate-x-1/2 -top-5">{new Date(rangeMin).toISOString().slice(0, 7)}</div>
                <div className="w-0.5 h-3 bg-[var(--border)]" />
              </div>
              <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 text-[9px] text-[var(--muted-foreground)] font-mono">
                <div className="absolute left-1/2 -translate-x-1/2 -top-5">{new Date(rangeMax).toISOString().slice(0, 7)}</div>
                <div className="w-0.5 h-3 bg-[var(--border)]" />
              </div>

              {/* TODAY marker */}
              {todayPos >= 0 && todayPos <= 100 && (
                <div
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{ left: `${todayPos}%` }}
                >
                  <div className="absolute left-0 top-0 bottom-0 border-l-2 border-dashed border-red-500/70" />
                  <div className="absolute -left-6 -top-8 text-[9px] font-bold text-red-400 whitespace-nowrap bg-[var(--card)] px-1 rounded">
                    TODAY
                  </div>
                </div>
              )}

              {/* Event markers */}
              {sortedItems.map((kd, idx) => {
                const u = urgency(kd.date, kd.is_done);
                const p = pos(kd.date);
                const above = idx % 2 === 0;
                const dotCls =
                  u === "done" ? "bg-emerald-500 border-emerald-700" :
                  u === "overdue" ? "bg-red-500 border-red-700 animate-pulse" :
                  u === "urgent" ? "bg-amber-500 border-amber-700" :
                  u === "upcoming" ? "bg-blue-500 border-blue-700" :
                  "bg-gray-400 border-gray-600";
                const labelCls =
                  u === "done" ? "text-emerald-400" :
                  u === "overdue" ? "text-red-400 font-bold" :
                  u === "urgent" ? "text-amber-400 font-bold" :
                  u === "upcoming" ? "text-blue-300" :
                  "text-[var(--muted-foreground)]";
                return (
                  <div
                    key={kd.id}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 group"
                    style={{ left: `${p}%` }}
                  >
                    <button
                      onClick={() => isAdmin && startEdit(kd)}
                      className={cn(
                        "w-4 h-4 rounded-full border-2 shadow-lg hover:scale-125 transition-transform",
                        dotCls,
                        isAdmin ? "cursor-pointer" : "cursor-default"
                      )}
                      title={`${kd.label} — ${kd.date} (${daysFromNow(kd.date)})`}
                    />
                    {/* Label stem */}
                    <div
                      className={cn(
                        "absolute left-1/2 -translate-x-1/2 w-px bg-[var(--border)]",
                        above ? "bottom-full h-4 mb-1" : "top-full h-4 mt-1"
                      )}
                    />
                    {/* Label content */}
                    <div
                      className={cn(
                        "absolute left-1/2 -translate-x-1/2 text-center whitespace-nowrap pointer-events-none",
                        above ? "bottom-full mb-5" : "top-full mt-5"
                      )}
                    >
                      <div className={cn("text-[9px] leading-tight", labelCls, kd.is_done && "line-through")}>
                        {kd.label.length > 28 ? kd.label.slice(0, 26) + "…" : kd.label}
                      </div>
                      <div className="text-[8px] text-[var(--muted-foreground)] font-mono mt-0.5">
                        {kd.date}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-3 mt-2 text-[9px] text-[var(--muted-foreground)] flex-wrap">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> done</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> overdue</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> urgent (≤7d)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> upcoming (≤30d)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /> scheduled</span>
            </div>
          </div>
        );
      })()}

      {!collapsed && items.length > 0 && (
        <div className="space-y-1.5">
          {items.map(kd => {
            const u = urgency(kd.date, kd.is_done);
            const style = urgencyStyle(u);
            const linkedR = rounds.find(r => r.id === kd.linked_round_id);
            const linkedE = entries.find(e => e.id === kd.linked_journal_entry_id);
            return (
              <div key={kd.id} className={cn(
                "rounded-lg bg-[var(--secondary)]/50 border p-2.5",
                u === "overdue" ? "border-red-700/50" :
                u === "urgent" ? "border-amber-700/50" :
                u === "done" ? "border-emerald-700/50 opacity-75" :
                "border-[var(--border)]"
              )}>
                <div className="flex items-start gap-2">
                  {isAdmin && (
                    <button
                      onClick={() => toggleDone(kd)}
                      className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                        kd.is_done ? "bg-emerald-700 border-emerald-700 text-white" : "border-[var(--border)] hover:border-[var(--primary)]"
                      )}
                      title={kd.is_done ? "Mark as not done" : "Mark as done"}
                    >
                      {kd.is_done && <span className="text-[10px]">✓</span>}
                    </button>
                  )}
                  {!isAdmin && (
                    <div className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5",
                      kd.is_done ? "bg-emerald-700 border-emerald-700 text-white" : "border-[var(--border)]"
                    )}>
                      {kd.is_done && <span className="text-[10px]">✓</span>}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold", style.bg)}>
                        {style.label}
                      </span>
                      <span className={cn("text-xs font-bold", kd.is_done && "line-through")}>
                        {kd.label}
                      </span>
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {kd.date} · <span className={cn(
                          u === "overdue" ? "text-red-400 font-bold" :
                          u === "urgent" ? "text-amber-400 font-bold" :
                          ""
                        )}>{daysFromNow(kd.date)}</span>
                      </span>
                      {kd.source_url && (
                        <a
                          href={kd.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[var(--primary)] hover:underline"
                        >
                          source ↗
                        </a>
                      )}
                    </div>
                    {kd.notes && (
                      <div className="text-[10px] text-[var(--muted-foreground)] italic mt-0.5">
                        {kd.notes}
                      </div>
                    )}
                    {(linkedR || linkedE) && (
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {linkedR && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300">
                            → Round {linkedR.round_number}: {linkedR.label}
                          </span>
                        )}
                        {linkedE && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-300">
                            → {linkedE.reviewer_label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(kd)}
                        className="text-[10px] px-2 py-1 rounded hover:bg-[var(--muted)] text-[var(--primary)]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(kd)}
                        className="text-[10px] px-2 py-1 rounded text-red-400 hover:bg-red-500/10"
                      >
                        Del
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
