"use client";

import { useTopics, useOverview } from "@/hooks/useAnalytics";
import type { Topic } from "@/lib/types";

export default function TopicsPage() {
  const { data: topics } = useTopics();
  const { data: overview } = useOverview();

  const topicStats = new Map<string, number>();
  (overview?.topics || []).forEach((t: { name: string; count: number }) => {
    topicStats.set(t.name, t.count);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Topics</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Configured research topics and their coverage
        </p>
      </div>

      <div className="space-y-4">
        {(topics || []).map((topic: Topic) => (
          <div
            key={topic.id}
            className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-medium">{topic.name}</h3>
                {topic.description && (
                  <p className="text-sm text-[var(--muted-foreground)] mt-1">
                    {topic.description}
                  </p>
                )}
              </div>
              <span className="text-2xl font-bold text-[var(--primary)]">
                {topicStats.get(topic.name) ?? 0}
              </span>
            </div>

            {/* Keywords */}
            {topic.keywords.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-[var(--muted-foreground)] mb-2">Keywords</p>
                <div className="flex flex-wrap gap-1.5">
                  {topic.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="text-xs px-2 py-0.5 rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)]"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Source Queries */}
            {Object.keys(topic.source_queries).length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-[var(--muted-foreground)] mb-2">Source Queries</p>
                <div className="space-y-1">
                  {Object.entries(topic.source_queries).map(([source, query]) => (
                    <div key={source} className="flex gap-2 text-xs">
                      <span className="font-medium w-28 shrink-0 text-[var(--muted-foreground)]">
                        {source}:
                      </span>
                      <code className="text-[var(--foreground)] bg-[var(--muted)] px-2 py-0.5 rounded overflow-x-auto">
                        {query}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
