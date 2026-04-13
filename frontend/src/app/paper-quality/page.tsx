"use client";

import Link from "next/link";
import useSWR from "swr";
import { authFetcher } from "@/lib/api";

interface QualityListItem {
  paper_id: number;
  title: string;
  doi: string | null;
  journal: string | null;
  publication_date: string | null;
  rating: number | null;
  labels: { name: string; color: string }[];
  version: number;
  overall_grade: string | null;
  overall_score: number | null;
  updated_at: string | null;
  created_by: string | null;
}

const GRADE_LABEL: Record<string, string> = {
  excellent:  "Excellent",
  good:       "Good",
  adequate:   "Adequate",
  weak:       "Weak",
  unreliable: "Unreliable",
};

const GRADE_COLOR: Record<string, string> = {
  excellent:  "bg-emerald-700 text-white",
  good:       "bg-emerald-600 text-white",
  adequate:   "bg-amber-600 text-white",
  weak:       "bg-orange-600 text-white",
  unreliable: "bg-red-700 text-white",
};

export default function PaperQualityListPage() {
  const { data, isLoading } = useSWR<QualityListItem[]>(
    "/api/v1/paper-quality",
    authFetcher
  );

  const items = data || [];

  // Counters by grade
  const counts = items.reduce<Record<string, number>>((acc, it) => {
    const g = it.overall_grade || "unrated";
    acc[g] = (acc[g] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paper Quality Reviews</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          {items.length} paper{items.length === 1 ? "" : "s"} with a quality assessment
          {Object.keys(counts).length > 0 && (
            <>
              {" — "}
              {(["excellent", "good", "adequate", "weak", "unreliable", "unrated"] as const).map((g) => counts[g] ? (
                <span key={g} className="ml-2 text-[10px] uppercase tracking-wider">
                  {g === "unrated" ? "Not graded" : GRADE_LABEL[g]}: <strong>{counts[g]}</strong>
                </span>
              ) : null)}
            </>
          )}
        </p>
      </div>

      {isLoading && <div className="text-sm text-[var(--muted-foreground)]">Loading...</div>}

      {!isLoading && items.length === 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-8 text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-[var(--muted-foreground)]">No quality reviews yet</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Open any paper from the Papers page and click <strong>Quality Review</strong> to start one.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--secondary)] border-b border-[var(--border)]">
              <tr className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Grade</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Score</th>
                <th className="text-left px-4 py-3 font-medium">Paper</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Version</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Updated</th>
                <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.paper_id} className="border-b border-[var(--border)] hover:bg-[var(--secondary)]/50">
                  <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                    {it.overall_grade ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${GRADE_COLOR[it.overall_grade]}`}>
                        {GRADE_LABEL[it.overall_grade]}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--muted-foreground)]">— not graded —</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap hidden md:table-cell">
                    {it.overall_score ? (
                      <span className="text-amber-400 text-xs">
                        {"★".repeat(it.overall_score)}{"☆".repeat(5 - it.overall_score)}
                      </span>
                    ) : (
                      <span className="text-[var(--muted-foreground)] text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/paper-quality/${it.paper_id}`}
                      className="font-medium text-[var(--foreground)] hover:text-[var(--primary)] line-clamp-2 break-words"
                    >
                      {it.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {/* Show grade inline on mobile (hidden on sm+ where it has its own column) */}
                      {it.overall_grade && (
                        <span className={`sm:hidden text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${GRADE_COLOR[it.overall_grade]}`}>
                          {GRADE_LABEL[it.overall_grade]}
                        </span>
                      )}
                      {it.journal && (
                        <span className="text-[10px] text-[var(--muted-foreground)]">
                          {it.journal} {it.publication_date ? `· ${it.publication_date.slice(0, 7)}` : ""}
                        </span>
                      )}
                    </div>
                    {it.labels && it.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {it.labels.map((lbl) => (
                          <span
                            key={lbl.name}
                            className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                              backgroundColor: `${lbl.color}25`,
                              color: lbl.color,
                              border: `1px solid ${lbl.color}55`,
                            }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lbl.color }} />
                            {lbl.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[10px] hidden md:table-cell">
                    <span className="px-1.5 py-0.5 rounded bg-fuchsia-700 text-white font-bold">v{it.version}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[10px] text-[var(--muted-foreground)] hidden lg:table-cell">
                    {it.updated_at ? new Date(it.updated_at).toLocaleDateString("it-IT") : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right hidden sm:table-cell">
                    <Link
                      href={`/paper-quality/${it.paper_id}`}
                      className="inline-block text-[10px] px-3 py-1.5 rounded font-bold border-2"
                      style={{
                        backgroundColor: "#fde047",
                        color: "#1e1b4b",
                        borderColor: "#7c3aed",
                      }}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
