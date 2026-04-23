"use client";

import Link from "next/link";
import useSWR from "swr";
import { authFetcher } from "@/lib/api";

interface CitedByItem {
  manuscript_id: number;
  manuscript_title: string;
  manuscript_role: string;
  context: string | null;
  note: string | null;
  citations_map: string | null;
}

interface CitedByResponse {
  paper_id: number;
  cited_by: CitedByItem[];
}

const CONTEXT_COLORS: Record<string, string> = {
  introduction: "bg-blue-700",
  related_work: "bg-purple-700",
  methodology: "bg-emerald-700",
  comparison: "bg-amber-700",
  results: "bg-cyan-700",
  discussion: "bg-indigo-700",
  other: "bg-gray-600",
};

export default function CitedByManuscripts({ paperId }: { paperId: number }) {
  const { data } = useSWR<CitedByResponse>(
    `/api/v1/paper-references/${paperId}/reverse`,
    authFetcher
  );

  if (!data || data.cited_by.length === 0) return null;

  return (
    <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/20 p-4 space-y-2">
      <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
        Cited by my manuscripts ({data.cited_by.length})
      </h3>
      <div className="space-y-2">
        {data.cited_by.map(item => (
          <div key={item.manuscript_id} className="space-y-0.5">
            <div className="flex items-start gap-2">
              <Link
                href={`/papers/${item.manuscript_id}`}
                className="text-sm hover:text-[var(--primary)] line-clamp-1 flex-1"
              >
                {item.manuscript_title}
              </Link>
              {item.context && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded text-white font-bold shrink-0 ${CONTEXT_COLORS[item.context] || "bg-gray-600"}`}>
                  {item.context}
                </span>
              )}
            </div>
            {item.citations_map && (
              <p className="text-[11px] whitespace-pre-wrap">
                <span className="font-bold uppercase tracking-wider text-indigo-500 text-[9px] mr-1.5">Cites</span>
                <span className="text-[var(--foreground)]">{item.citations_map}</span>
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
