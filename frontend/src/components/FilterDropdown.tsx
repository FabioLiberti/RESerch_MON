"use client";

import { useRef, useState } from "react";

// Typeahead multi-select dropdown used across the app (Papers page, Network page, ...).
// Pattern: input acts as a type-ahead search; suggestions shown in a floating panel;
// selected values turn the input border/background into the "active" state and can
// be cleared with the ✕ icon or the "Clear all" button at the top of the suggestions.
export default function FilterDropdown({
  values,
  onChange,
  placeholder,
  tagLabel,
  options,
  className = "",
  panelWidthClassName = "w-80",
}: {
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder: string;
  tagLabel: string;
  options: { value: string; label: string; count?: number }[];
  className?: string;
  panelWidthClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSet = new Set(values);
  const filtered = options.filter(o =>
    !selectedSet.has(o.value) && o.label.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 50);

  const addValue = (v: string) => {
    onChange([...values, v]);
    setSearch("");
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={values.length > 0 ? `+ ${tagLabel}...` : placeholder}
          className={`w-full text-xs rounded-lg border px-2 py-1.5 pr-6 focus:outline-none ${
            values.length > 0
              ? "border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--secondary)] text-[var(--muted-foreground)]"
          }`}
        />
        {values.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange([]); setSearch(""); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-[var(--muted)] text-[10px] text-[var(--muted-foreground)] hover:bg-red-500 hover:text-white transition-colors"
          >&times;</button>
        )}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(""); }} />
          <div className={`absolute left-0 top-full mt-1 z-50 ${panelWidthClassName} max-h-60 overflow-y-auto rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-xl`}>
            {values.length > 0 && (
              <button
                onClick={() => { onChange([]); setSearch(""); setOpen(false); }}
                className="w-full flex items-center px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors border-b border-[var(--border)]"
              >
                Clear all ({values.length})
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--muted-foreground)]">{search ? "No matches" : "All selected"}</div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  onClick={() => addValue(o.value)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-left hover:bg-[var(--secondary)] transition-colors"
                >
                  <span className="truncate flex-1 mr-2">{o.label}</span>
                  {o.count != null && o.count > 0 && (
                    <span className="text-[9px] text-[var(--muted-foreground)] shrink-0">{o.count}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Render chips of the currently-selected values with a remove button on each.
// Typical usage below a FilterDropdown or between the toolbar and the main view.
export function FilterDropdownTags({
  values,
  onRemove,
  colorClass = "bg-[var(--primary)]/10 text-[var(--primary)]",
}: {
  values: string[];
  onRemove: (v: string) => void;
  colorClass?: string;
}) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {values.map(v => (
        <span key={v} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${colorClass}`}>
          {v}
          <button
            onClick={() => onRemove(v)}
            className="hover:text-red-500 transition-colors"
            aria-label={`remove ${v}`}
          >&times;</button>
        </span>
      ))}
    </div>
  );
}
