"use client";

import { useState, useRef, useEffect } from "react";
import { SOURCE_LABELS } from "@/lib/utils";

const VIA_LABELS: Record<string, string> = {
  discovery: "Discovery (automated)",
  smart_search_keywords: "Smart Search (keywords)",
  smart_search_title: "Smart Search (title)",
  smart_search_author: "Smart Search (author)",
  smart_search_doi: "Smart Search (DOI)",
  import_doi: "Import by DOI",
  bibliography_import: "Bibliography import",
  my_manuscript: "My Manuscript (manual)",
  peer_review: "Peer Review (auto-created)",
  manual: "Manual",
};

interface PaperInfoBoxProps {
  createdAt: string;
  createdVia: string | null;
  sources: string[];
}

export default function PaperInfoBox({ createdAt, createdVia, sources }: PaperInfoBoxProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dt = new Date(createdAt);
  const formatted = dt.toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const viaLabel = createdVia ? (VIA_LABELS[createdVia] || createdVia) : "Unknown";
  const sourceLabels = sources.map(s => SOURCE_LABELS[s] || s).join(", ");

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--secondary)] hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[10px] font-bold transition-colors"
        title="Paper info"
      >
        i
      </button>
      {open && (
        <>
          {/* Mobile: fixed center overlay */}
          <div className="sm:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
            <div className="w-full max-w-xs rounded-lg bg-[var(--card)] border border-[var(--border)] shadow-xl p-4 space-y-2 text-xs" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Paper Info</span>
                <button onClick={() => setOpen(false)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">✕</button>
              </div>
              <div className="flex gap-2"><span className="text-[var(--muted-foreground)] shrink-0">Added:</span><span className="font-medium">{formatted}</span></div>
              <div className="flex gap-2"><span className="text-[var(--muted-foreground)] shrink-0">Via:</span><span className="font-medium">{viaLabel}</span></div>
              {sources.length > 0 && <div className="flex gap-2"><span className="text-[var(--muted-foreground)] shrink-0">Sources:</span><span className="font-medium break-words">{sourceLabels}</span></div>}
            </div>
          </div>
          {/* Desktop: absolute dropdown */}
          <div className="hidden sm:block absolute z-50 right-0 top-7 w-64 rounded-lg bg-[var(--card)] border border-[var(--border)] shadow-xl p-3 space-y-1.5 text-xs">
            <div className="flex gap-2"><span className="text-[var(--muted-foreground)] shrink-0">Added:</span><span className="font-medium">{formatted}</span></div>
            <div className="flex gap-2"><span className="text-[var(--muted-foreground)] shrink-0">Via:</span><span className="font-medium">{viaLabel}</span></div>
            {sources.length > 0 && <div className="flex gap-2"><span className="text-[var(--muted-foreground)] shrink-0">Sources:</span><span className="font-medium">{sourceLabels}</span></div>}
          </div>
        </>
      )}
    </div>
  );
}
