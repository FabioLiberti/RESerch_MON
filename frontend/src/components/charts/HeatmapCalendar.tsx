"use client";

import { useMemo } from "react";
import type { HeatmapDay } from "@/lib/types";

interface HeatmapCalendarProps {
  data: HeatmapDay[] | undefined;
  year: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

function getColor(count: number): string {
  if (count === 0) return "var(--muted)";
  if (count <= 2) return "#1e3a5f";
  if (count <= 5) return "#2563eb";
  if (count <= 10) return "#6366f1";
  return "#8b5cf6";
}

export default function HeatmapCalendar({ data, year }: HeatmapCalendarProps) {
  const grid = useMemo(() => {
    const countMap = new Map<string, number>();
    (data || []).forEach((d) => countMap.set(d.date, d.count));

    const startDate = new Date(year, 0, 1);
    const startDay = startDate.getDay();
    const weeks: { date: string; count: number; day: number }[][] = [];
    let currentWeek: { date: string; count: number; day: number }[] = [];

    // Pad first week
    for (let i = 0; i < startDay; i++) {
      currentWeek.push({ date: "", count: -1, day: i });
    }

    const endDate = new Date(year, 11, 31);
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateStr = current.toISOString().slice(0, 10);
      const day = current.getDay();
      currentWeek.push({ date: dateStr, count: countMap.get(dateStr) || 0, day });

      if (day === 6) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      current.setDate(current.getDate() + 1);
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    return weeks;
  }, [data, year]);

  const totalPapers = (data || []).reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)]">
          Activity — {year}
        </h3>
        <span className="text-xs text-[var(--muted-foreground)]">
          {totalPapers} papers discovered
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-[2px] min-w-[700px]">
          {/* Day labels */}
          <div className="flex flex-col gap-[2px] mr-1">
            {DAYS.map((d, i) => (
              <div key={i} className="h-[11px] text-[9px] text-[var(--muted-foreground)] leading-[11px] w-6">
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[2px]">
              {week.map((cell, di) => (
                <div
                  key={di}
                  className="w-[11px] h-[11px] rounded-sm"
                  style={{
                    backgroundColor: cell.count < 0 ? "transparent" : getColor(cell.count),
                  }}
                  title={cell.date ? `${cell.date}: ${cell.count} papers` : ""}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-3 text-[9px] text-[var(--muted-foreground)]">
        <span>Less</span>
        {[0, 2, 5, 10, 15].map((n) => (
          <div
            key={n}
            className="w-[10px] h-[10px] rounded-sm"
            style={{ backgroundColor: getColor(n) }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
