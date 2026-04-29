"use client";

import { useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { authFetcher, api } from "@/lib/api";

export interface LabelData {
  id: number;
  name: string;
  color: string;
  paper_count?: number;
}

interface LabelPickerProps {
  value: number | null;
  onChange: (labelId: number | null) => void;
  placeholder?: string;
  // Visual cue (used to differentiate e.g. main vs verify pickers)
  accentClass?: string; // tailwind colour class for the pill border (e.g. "border-purple-500/50")
  // When true, the picker is rendered disabled
  disabled?: boolean;
  // Allow clearing the selection
  allowClear?: boolean;
}

const PRESET_COLORS = ["#6366f1", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#3b82f6", "#ec4899", "#14b8a6"];

/**
 * Inline label picker with search + create-on-the-fly. Same UX pattern as the
 * paper detail page (`/papers/[id]`), exposed as a reusable component so it
 * can be used in modal dialogs (e.g. bibliography import).
 *
 * Single-select: pass current `value` and receive updates via `onChange(id|null)`.
 */
export default function LabelPicker({
  value,
  onChange,
  placeholder = "Search or create label…",
  accentClass = "border-[var(--border)]",
  disabled = false,
  allowClear = true,
}: LabelPickerProps) {
  const { data: allLabels } = useSWR<LabelData[]>("/api/v1/labels", authFetcher);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Find the currently selected label (for display)
  const selected = (allLabels || []).find(l => l.id === value) || null;

  // Filtering — same logic as papers/[id] picker
  const qLower = query.trim().toLowerCase();
  const sortedAll = (allLabels || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const filtered = qLower
    ? sortedAll
        .filter(l => l.name.toLowerCase().includes(qLower))
        .sort((a, b) => {
          const aStarts = a.name.toLowerCase().startsWith(qLower);
          const bStarts = b.name.toLowerCase().startsWith(qLower);
          if (aStarts !== bStarts) return aStarts ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
    : sortedAll;
  const hasExactMatch = !!qLower && (allLabels || []).some(l => l.name.toLowerCase() === qLower);
  const canCreate = !!qLower && !hasExactMatch;

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setHighlight(0);
  };

  const pick = (labelId: number) => {
    onChange(labelId);
    close();
  };

  const createAndPick = async () => {
    const name = query.trim();
    if (!name) return;
    try {
      const label = await api.createLabel({ name, color: newColor });
      mutate("/api/v1/labels");
      onChange(label.id);
      close();
    } catch (e) {
      console.error("Create label failed:", e);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${accentClass} bg-[var(--card)] hover:bg-[var(--secondary)] flex items-center gap-1.5 min-w-[8rem]`}
      >
        {selected ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-[var(--muted-foreground)] italic">— no label —</span>
        )}
        <span className="ml-auto text-[var(--muted-foreground)] text-[10px]">{open ? "▴" : "▾"}</span>
      </button>

      {value !== null && allowClear && !disabled && (
        <button
          onClick={(e) => { e.stopPropagation(); onChange(null); }}
          className="ml-1 text-[10px] text-[var(--muted-foreground)] hover:text-red-400"
          title="Clear selection"
        >
          ✕
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute left-0 top-9 z-50 w-72 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-xl overflow-hidden">
            <div className="p-2 border-b border-[var(--border)]">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setHighlight(0); }}
                onKeyDown={e => {
                  const maxIdx = filtered.length - 1 + (canCreate ? 1 : 0);
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlight(i => Math.min(i + 1, Math.max(maxIdx, 0)));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlight(i => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (highlight < filtered.length) {
                      pick(filtered[highlight].id);
                    } else if (canCreate) {
                      void createAndPick();
                    }
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    close();
                  }
                }}
                placeholder={placeholder}
                className="w-full px-2 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs focus:outline-none focus:border-[var(--primary)]"
              />
              {query && (
                <div className="mt-1 text-[9px] text-[var(--muted-foreground)]">
                  {filtered.length} of {sortedAll.length} match
                  {hasExactMatch && <span className="ml-2 text-amber-400">· exact match exists</span>}
                </div>
              )}
            </div>

            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 && !canCreate && (
                <div className="px-3 py-3 text-[11px] text-[var(--muted-foreground)] text-center">
                  No labels{query ? " match" : " yet"}.
                </div>
              )}
              {filtered.map((l, i) => (
                <button
                  key={l.id}
                  onClick={() => pick(l.id)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${highlight === i ? "bg-[var(--secondary)]" : "hover:bg-[var(--secondary)]"} ${l.id === value ? "ring-1 ring-[var(--primary)]/40" : ""}`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                  <span className="text-xs truncate flex-1">{l.name}</span>
                  {l.id === value && <span className="text-[10px] text-[var(--primary)]">✓</span>}
                </button>
              ))}
            </div>

            {canCreate && (
              <div className={`border-t border-[var(--border)] p-2 space-y-2 ${highlight === filtered.length ? "bg-[var(--secondary)]/60" : ""}`}>
                <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-medium">Create new</div>
                <div className="flex gap-1 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className={`w-5 h-5 rounded-full transition-all ${newColor === c ? "ring-2 ring-offset-1 ring-[var(--foreground)]" : ""}`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
                <button
                  onClick={createAndPick}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold hover:opacity-90"
                  onMouseEnter={() => setHighlight(filtered.length)}
                >
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: newColor }} />
                  Create &ldquo;{query.trim()}&rdquo;
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
