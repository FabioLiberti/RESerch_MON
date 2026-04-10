"use client";

import Link from "next/link";
import useSWR from "swr";
import { authFetcher } from "@/lib/api";

interface ReviewQueueItem {
  queue_id: number;
  paper_id: number;
  title: string;
  doi: string | null;
  journal: string | null;
  publication_date: string | null;
  rating: number | null;
  mode: string;
  version: number;
  validation_status: string | null;
  completed_at: string | null;
}

const MODE_LABEL: Record<string, string> = {
  extended: "EXT.ABS",
  summary: "SUMMARY",
  quick: "QUICK",
  deep: "DEEP",
};

const MODE_COLOR: Record<string, string> = {
  extended: "bg-red-700 text-white",
  summary: "bg-amber-600 text-white",
  quick: "bg-blue-700 text-white",
  deep: "bg-purple-700 text-white",
};

export default function ReviewPage() {
  const { data, isLoading } = useSWR<ReviewQueueItem[]>(
    "/api/v1/analysis/review-queue",
    authFetcher,
    { refreshInterval: 0 }
  );

  const items = data || [];
  const pendingCount = items.filter(i => !i.validation_status).length;
  const revisionCount = items.filter(i => i.validation_status === "needs_revision").length;

  // Group by paper_id
  const groups = new Map<number, { paper: ReviewQueueItem; modes: ReviewQueueItem[] }>();
  for (const it of items) {
    const g = groups.get(it.paper_id);
    if (g) {
      g.modes.push(it);
    } else {
      groups.set(it.paper_id, { paper: it, modes: [it] });
    }
  }
  // Sort modes within each group: extended → summary → quick → deep
  const MODE_ORDER: Record<string, number> = { extended: 0, summary: 1, quick: 2, deep: 3 };
  for (const g of groups.values()) {
    g.modes.sort((a, b) => (MODE_ORDER[a.mode] ?? 9) - (MODE_ORDER[b.mode] ?? 9));
  }
  const grouped = Array.from(groups.values());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Validation Queue</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          {grouped.length} paper{grouped.length === 1 ? "" : "s"} · {items.length} analyses waiting · {pendingCount} pending · {revisionCount} needs revision
          <span className="ml-2 text-[10px] opacity-60">(sorted by paper rating)</span>
        </p>
      </div>

      {isLoading && (
        <div className="text-sm text-[var(--muted-foreground)]">Loading queue...</div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-8 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <p className="text-sm text-[var(--foreground)] font-medium">All caught up!</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">No analyses are waiting for review.</p>
        </div>
      )}

      {grouped.length > 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--secondary)] border-b border-[var(--border)]">
              <tr className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Rating</th>
                <th className="text-left px-4 py-3 font-medium">Paper</th>
                <th className="text-left px-4 py-3 font-medium">Pending Reviews</th>
                <th className="text-left px-4 py-3 font-medium">Last Generated</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ paper, modes }) => {
                const lastDate = modes
                  .map((m) => m.completed_at)
                  .filter(Boolean)
                  .sort()
                  .reverse()[0];
                return (
                  <tr key={paper.paper_id} className="border-b border-[var(--border)] hover:bg-[var(--secondary)]/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      {paper.rating ? (
                        <span className="text-amber-400 text-xs">
                          {"★".repeat(paper.rating)}{"☆".repeat(5 - paper.rating)}
                        </span>
                      ) : (
                        <span className="text-[var(--muted-foreground)] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/papers/${paper.paper_id}`}
                        className="text-[var(--foreground)] hover:text-[var(--primary)] font-medium line-clamp-2"
                        title={paper.title}
                      >
                        {paper.title}
                      </Link>
                      {paper.journal && (
                        <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5 truncate">
                          {paper.journal} {paper.publication_date ? `· ${paper.publication_date.slice(0, 7)}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {modes.map((m) => {
                          const isRevision = m.validation_status === "needs_revision";
                          return (
                            <Link
                              key={m.queue_id}
                              href={`/papers/${m.paper_id}?review=${m.queue_id}`}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border-2 hover:opacity-90 transition-opacity ${
                                isRevision
                                  ? "bg-orange-600 text-white border-orange-800"
                                  : "bg-yellow-400 text-black border-red-600"
                              }`}
                              title={`${MODE_LABEL[m.mode] || m.mode.toUpperCase()} v${m.version} — ${isRevision ? "Needs revision" : "Pending"}`}
                            >
                              <span className={`px-1 rounded ${MODE_COLOR[m.mode] || "bg-gray-700 text-white"}`}>
                                {MODE_LABEL[m.mode] || m.mode.toUpperCase()}
                              </span>
                              <span>v{m.version}</span>
                              {isRevision && <span>⟳</span>}
                            </Link>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[10px] text-[var(--muted-foreground)] align-top">
                      {lastDate ? new Date(lastDate).toLocaleDateString("it-IT") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
