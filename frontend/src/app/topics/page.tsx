"use client";

import { useTopics, useOverview } from "@/hooks/useAnalytics";
import { usePapers } from "@/hooks/usePapers";
import { useState } from "react";
import { formatDate, SOURCE_LABELS } from "@/lib/utils";
import type { Topic, Paper } from "@/lib/types";

export default function TopicsPage() {
  const { data: topics } = useTopics();
  const { data: overview } = useOverview();
  const [selectedTopic, setSelectedTopic] = useState<string>("");

  const { data: topicPapers } = usePapers(
    selectedTopic ? { topic: selectedTopic, per_page: "10", sort_by: "publication_date", sort_order: "desc" } : {}
  );

  const topicStats = new Map<string, number>();
  (overview?.topics || []).forEach((t: { name: string; count: number }) => {
    topicStats.set(t.name, t.count);
  });

  const totalPapers = Array.from(topicStats.values()).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Topics</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          {topics?.length || 0} configured topics — {totalPapers} papers classified
        </p>
      </div>

      {/* Topic Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(topics || []).map((topic: Topic, idx: number) => {
          const count = topicStats.get(topic.name) ?? 0;
          const pct = totalPapers > 0 ? ((count / totalPapers) * 100).toFixed(0) : "0";
          const isSelected = selectedTopic === topic.name;
          const colors = [
            "from-indigo-500/20 to-purple-500/20 border-indigo-500/30",
            "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
            "from-amber-500/20 to-orange-500/20 border-amber-500/30",
            "from-blue-500/20 to-cyan-500/20 border-blue-500/30",
            "from-rose-500/20 to-pink-500/20 border-rose-500/30",
          ];
          const color = colors[idx % colors.length];

          return (
            <div
              key={topic.id}
              onClick={() => setSelectedTopic(isSelected ? "" : topic.name)}
              className={`rounded-xl border p-5 cursor-pointer transition-all ${
                isSelected
                  ? `bg-gradient-to-br ${color}`
                  : "bg-[var(--card)] border-[var(--border)] hover:border-[var(--border)]/80"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-medium text-sm">{topic.name}</h3>
                <span className="text-2xl font-bold">{count}</span>
              </div>
              {topic.description && (
                <p className="text-xs text-[var(--muted-foreground)] mb-3 line-clamp-2">
                  {topic.description}
                </p>
              )}
              <div className="w-full h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--primary)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-[var(--muted-foreground)] mt-1 block">{pct}% of total</span>

              {/* Keywords preview */}
              <div className="flex flex-wrap gap-1 mt-3">
                {topic.keywords.slice(0, 4).map((kw) => (
                  <span key={kw} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Topic Papers */}
      {selectedTopic && topicPapers?.items && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
          <h3 className="font-medium mb-4">
            Recent papers in &ldquo;{selectedTopic}&rdquo;
          </h3>
          {topicPapers.items.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No papers in this topic yet</p>
          ) : (
            <div className="space-y-2">
              {topicPapers.items.map((paper: Paper) => (
                <a
                  key={paper.id}
                  href={`/papers/${paper.id}`}
                  className="block p-3 rounded-lg hover:bg-[var(--secondary)] transition-colors"
                >
                  <h4 className="text-sm font-medium line-clamp-1">{paper.title}</h4>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--muted-foreground)]">
                    <span>{formatDate(paper.publication_date)}</span>
                    <span>{paper.journal}</span>
                    <span>Citations: {paper.citation_count}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Source Queries Detail */}
      {selectedTopic && (
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-6">
          <h3 className="font-medium mb-3">Source Queries for &ldquo;{selectedTopic}&rdquo;</h3>
          {(() => {
            const topic = (topics || []).find((t: Topic) => t.name === selectedTopic);
            if (!topic || !topic.source_queries) return null;
            return (
              <div className="space-y-2">
                {Object.entries(topic.source_queries).map(([src, query]) => (
                  <div key={src} className="flex gap-3 text-sm">
                    <span className="w-32 shrink-0 font-medium text-[var(--muted-foreground)]">
                      {SOURCE_LABELS[src] || src}
                    </span>
                    <code className="text-xs bg-[var(--muted)] px-2 py-1 rounded overflow-x-auto flex-1 font-mono">
                      {query as string}
                    </code>
                  </div>
                ))}
              </div>
            );
          })() as React.ReactNode}
        </div>
      )}
    </div>
  );
}
