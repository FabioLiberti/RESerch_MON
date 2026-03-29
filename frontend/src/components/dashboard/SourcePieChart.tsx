"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { SOURCE_COLORS, SOURCE_LABELS } from "@/lib/utils";

interface SourcePieChartProps {
  data: { name: string; count: number }[] | undefined;
}

export default function SourcePieChart({ data }: SourcePieChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-4">Sources</h3>
        <div className="h-64 flex items-center justify-center text-[var(--muted-foreground)]">
          No data yet
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: SOURCE_LABELS[d.name] || d.name,
    value: d.count,
    color: SOURCE_COLORS[d.name] || "#6b7280",
  }));

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-4">
        Papers by Source
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            dataKey="value"
            nameKey="name"
            strokeWidth={0}
          >
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--foreground)",
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", color: "var(--muted-foreground)" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
