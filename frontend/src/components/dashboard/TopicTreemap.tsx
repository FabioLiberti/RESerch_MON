"use client";

interface TopicTreemapProps {
  data: { name: string; count: number }[] | undefined;
}

const TOPIC_COLORS = [
  "bg-indigo-500/20 border-indigo-500/40 text-indigo-300",
  "bg-emerald-500/20 border-emerald-500/40 text-emerald-300",
  "bg-amber-500/20 border-amber-500/40 text-amber-300",
  "bg-blue-500/20 border-blue-500/40 text-blue-300",
  "bg-purple-500/20 border-purple-500/40 text-purple-300",
];

export default function TopicTreemap({ data }: TopicTreemapProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
        <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-4">Topics</h3>
        <div className="h-40 flex items-center justify-center text-[var(--muted-foreground)]">
          No topics yet
        </div>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
      <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-4">
        Papers by Topic
      </h3>
      <div className="space-y-3">
        {data.map((topic, idx) => {
          const pct = total > 0 ? (topic.count / total) * 100 : 0;
          const colorClass = TOPIC_COLORS[idx % TOPIC_COLORS.length];
          return (
            <div key={topic.name}>
              <div className="flex justify-between text-sm mb-1">
                <span>{topic.name}</span>
                <span className="text-[var(--muted-foreground)]">
                  {topic.count} ({pct.toFixed(0)}%)
                </span>
              </div>
              <div className="w-full h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${colorClass.split(" ")[0].replace("/20", "/60")}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
