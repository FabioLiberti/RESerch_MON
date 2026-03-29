"use client";

import { formatNumber } from "@/lib/utils";
import type { OverviewStats } from "@/lib/types";

interface StatsCardsProps {
  stats: OverviewStats | undefined;
  isLoading: boolean;
}

const cards = [
  { key: "total_papers", label: "Total Papers", color: "from-indigo-500 to-purple-500" },
  { key: "papers_this_week", label: "This Week", color: "from-emerald-500 to-teal-500" },
  { key: "papers_this_month", label: "This Month", color: "from-amber-500 to-orange-500" },
  { key: "total_with_pdf", label: "With PDF", color: "from-blue-500 to-cyan-500" },
] as const;

export default function StatsCards({ stats, isLoading }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="relative overflow-hidden rounded-xl bg-[var(--card)] border border-[var(--border)] p-6"
        >
          <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${card.color}`} />
          <p className="text-sm text-[var(--muted-foreground)]">{card.label}</p>
          <p className="text-3xl font-bold mt-2">
            {isLoading ? (
              <span className="inline-block w-16 h-8 bg-[var(--muted)] rounded animate-pulse" />
            ) : (
              formatNumber(stats?.[card.key] ?? 0)
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
