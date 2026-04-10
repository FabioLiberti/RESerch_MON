"use client";

import Link from "next/link";
import useSWR from "swr";
import { authFetcher } from "@/lib/api";

interface ValidationStats {
  total_done: number;
  validated: number;
  rejected: number;
  needs_revision: number;
  pending: number;
  this_week: number;
  avg_score: number | null;
}

export default function ValidationStatsCard() {
  const { data } = useSWR<ValidationStats>("/api/v1/analysis/validation-stats", authFetcher);

  if (!data) return null;

  const reviewed = data.validated + data.rejected + data.needs_revision;
  const reviewedPct = data.total_done > 0 ? Math.round((reviewed / data.total_done) * 100) : 0;

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Validation Progress</h3>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {reviewed}/{data.total_done} analyses reviewed ({reviewedPct}%)
          </p>
        </div>
        <Link
          href="/review"
          className="text-[10px] px-3 py-1.5 rounded bg-yellow-400 text-black font-bold border-2 border-red-600 hover:bg-yellow-300"
        >
          Open Review Queue
        </Link>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-[var(--secondary)] overflow-hidden mb-4">
        <div className="h-full flex">
          {data.validated > 0 && (
            <div
              className="bg-emerald-600"
              style={{ width: `${(data.validated / data.total_done) * 100}%` }}
              title={`${data.validated} validated`}
            />
          )}
          {data.needs_revision > 0 && (
            <div
              className="bg-orange-500"
              style={{ width: `${(data.needs_revision / data.total_done) * 100}%` }}
              title={`${data.needs_revision} needs revision`}
            />
          )}
          {data.rejected > 0 && (
            <div
              className="bg-red-600"
              style={{ width: `${(data.rejected / data.total_done) * 100}%` }}
              title={`${data.rejected} rejected`}
            />
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Validated" value={data.validated} color="text-emerald-400" />
        <Stat label="Revision" value={data.needs_revision} color="text-orange-400" />
        <Stat label="Rejected" value={data.rejected} color="text-red-400" />
        <Stat label="Pending" value={data.pending} color="text-gray-400" />
        <Stat
          label="Avg score"
          value={data.avg_score !== null ? `${data.avg_score.toFixed(1)}/5` : "—"}
          color="text-amber-400"
        />
      </div>

      {data.this_week > 0 && (
        <p className="text-[10px] text-[var(--muted-foreground)] mt-3">
          ⚡ {data.this_week} review{data.this_week === 1 ? "" : "s"} in the last 7 days
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-lg bg-[var(--secondary)] p-2.5 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
