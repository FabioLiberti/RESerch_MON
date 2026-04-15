"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import { useAuth } from "@/lib/auth";

interface NoteEntry {
  id: number;
  user_id: number;
  username: string;
  content: string;
  updated_at: string | null;
  is_mine: boolean;
}

interface Props {
  paperId: number;
  noteType: "dev_notes" | "bib_notes";
  title: string;
  icon: React.ReactNode;
  placeholder?: string;
}

export default function UserNotes({ paperId, noteType, title, icon, placeholder }: Props) {
  const { user } = useAuth();
  const apiUrl = `/api/v1/user-notes/${paperId}/${noteType}`;
  const { data: notes } = useSWR<NoteEntry[]>(apiUrl, authFetcher);

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const myNote = notes?.find(n => n.is_mine);
  const otherNotes = notes?.filter(n => !n.is_mine) || [];
  const hasContent = notes && notes.some(n => n.content);

  const startEdit = () => {
    setText(myNote?.content || "");
    setEditing(true);
    setCollapsed(false);
  };

  const save = async () => {
    setSaving(true);
    await fetch(apiUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content: text }),
    });
    setSaving(false);
    setEditing(false);
    mutate(apiUrl);
    mutate(`/api/v1/user-notes/has-notes/${paperId}`);
  };

  const fmtTime = (ts: string | null) =>
    ts ? new Date(ts).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }) : "";

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="text-sm font-bold flex items-center gap-2">
          {icon}
          {title}
          {hasContent && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
              {notes?.length || 0}
            </span>
          )}
        </h3>
        <svg className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform ${collapsed ? "" : "rotate-180"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-3">
          {/* My note — editable */}
          {editing ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
                <span className="font-bold">{user?.username}</span> — editing
              </div>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none resize-y"
                placeholder={placeholder || "Write your notes here..."}
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={save} disabled={saving}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-600 disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={() => setEditing(false)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--secondary)] text-xs hover:bg-[var(--muted)]">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              {myNote?.content ? (
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-amber-400">{user?.username}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-[var(--muted-foreground)]">{fmtTime(myNote.updated_at)}</span>
                      <button onClick={startEdit}
                        className="text-[9px] px-2 py-0.5 rounded bg-[var(--secondary)] hover:bg-[var(--muted)]">
                        Edit
                      </button>
                    </div>
                  </div>
                  <p className="text-xs whitespace-pre-wrap">{myNote.content}</p>
                </div>
              ) : (
                <button onClick={startEdit}
                  className="text-xs text-[var(--primary)] hover:underline">
                  + Add your notes
                </button>
              )}
            </div>
          )}

          {/* Other users' notes — read-only */}
          {otherNotes.filter(n => n.content).map(n => (
            <div key={n.id} className="rounded-lg bg-[var(--secondary)]/50 border border-[var(--border)] p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-[var(--muted-foreground)]">{n.username}</span>
                <span className="text-[9px] text-[var(--muted-foreground)]">{fmtTime(n.updated_at)}</span>
              </div>
              <p className="text-xs text-[var(--foreground)] whitespace-pre-wrap">{n.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
