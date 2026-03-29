"use client";

import { usePapers } from "@/hooks/usePapers";
import CitationNetwork from "@/components/charts/CitationNetwork";
import { SOURCE_COLORS, SOURCE_LABELS } from "@/lib/utils";

export default function NetworkPage() {
  const { data: papers, isLoading } = usePapers({
    per_page: "100",
    sort_by: "citation_count",
    sort_order: "desc",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Citation Network</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Paper relationships based on shared topics. Node size = citation count. Drag to rearrange.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        {Object.entries(SOURCE_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: SOURCE_COLORS[key] }}
            />
            <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
          </div>
        ))}
      </div>

      {/* Graph */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden" style={{ height: "600px" }}>
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-sm text-[var(--muted-foreground)]">Loading papers...</div>
          </div>
        ) : !papers?.items?.length ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-[var(--muted-foreground)]">
              <p className="text-sm">No papers discovered yet</p>
              <p className="text-xs mt-1">Run a discovery to populate the network</p>
            </div>
          </div>
        ) : (
          <CitationNetwork papers={papers.items} />
        )}
      </div>

      {/* Stats */}
      {papers?.items && papers.items.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
            <p className="text-2xl font-bold">{papers.items.length}</p>
            <p className="text-xs text-[var(--muted-foreground)]">Nodes</p>
          </div>
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
            <p className="text-2xl font-bold">
              {new Set(papers.items.flatMap((p: any) => p.sources)).size}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">Sources</p>
          </div>
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
            <p className="text-2xl font-bold">
              {papers.items.reduce((sum: number, p: any) => sum + p.citation_count, 0)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">Total Citations</p>
          </div>
        </div>
      )}
    </div>
  );
}
