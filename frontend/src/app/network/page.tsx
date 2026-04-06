"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { authFetcher } from "@/lib/api";
import { SOURCE_COLORS, SOURCE_LABELS, cn } from "@/lib/utils";
import NetworkGraph from "@/components/charts/NetworkGraph";

type NetworkTab = "co-keywords" | "co-authors" | "citations";

const TABS: { key: NetworkTab; label: string; description: string }[] = [
  { key: "co-keywords", label: "Co-Keywords", description: "Papers linked by shared keywords" },
  { key: "co-authors", label: "Co-Authors", description: "Papers linked by shared authors" },
  { key: "citations", label: "Citations", description: "Real citation links (requires S2 API)" },
];

export default function NetworkPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<NetworkTab>("co-keywords");
  const [maxPapers, setMaxPapers] = useState(100);
  const [minShared, setMinShared] = useState(2);
  const [filter, setFilter] = useState("");

  const params = new URLSearchParams({
    max_papers: String(maxPapers),
    min_shared: String(minShared),
  });

  const { data, isLoading } = useSWR(
    `/api/v1/network/${activeTab}?${params}`,
    authFetcher
  );

  const handleNodeClick = (id: number) => {
    router.push(`/papers/${id}`);
  };

  // Filter nodes and links client-side
  const filteredData = (() => {
    if (!data?.nodes || !filter.trim()) return data;

    const q = filter.toLowerCase();
    const matchingIds = new Set(
      data.nodes
        .filter((n: any) =>
          n.title.toLowerCase().includes(q) ||
          (n.doi && n.doi.toLowerCase().includes(q)) ||
          (n.keywords && n.keywords.some((k: string) => k.toLowerCase().includes(q))) ||
          (n.authors && n.authors.some((a: string) => a.toLowerCase().includes(q)))
        )
        .map((n: any) => n.id)
    );

    if (matchingIds.size === 0) return { ...data, nodes: [], links: [], stats: { ...data.stats, total_nodes: 0, total_links: 0 } };

    const filteredNodes = data.nodes.filter((n: any) => matchingIds.has(n.id));
    const filteredLinks = data.links.filter(
      (l: any) => matchingIds.has(l.source) && matchingIds.has(l.target)
    );

    return {
      ...data,
      nodes: filteredNodes,
      links: filteredLinks,
      stats: { ...data.stats, total_nodes: filteredNodes.length, total_links: filteredLinks.length },
    };
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Network</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Explore paper relationships. Node size = citations. Hover for details. Click to open paper. Scroll to zoom.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--secondary)]">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.key
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Controls */}
        {activeTab !== "citations" && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--muted-foreground)]">Papers:</span>
              <select
                value={maxPapers}
                onChange={(e) => setMaxPapers(Number(e.target.value))}
                className="px-2 py-1 rounded bg-[var(--secondary)] border border-[var(--border)] text-xs"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--muted-foreground)]">
                Min shared {activeTab === "co-keywords" ? "keywords" : "authors"}:
              </span>
              <select
                value={minShared}
                onChange={(e) => setMinShared(Number(e.target.value))}
                className="px-2 py-1 rounded bg-[var(--secondary)] border border-[var(--border)] text-xs"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title, author, keyword, or DOI..."
          className="flex-1 px-4 py-2 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] max-w-md"
        />
        {filter && (
          <button
            onClick={() => setFilter("")}
            className="px-3 py-2 rounded-lg text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]"
          >
            Clear
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        {Object.entries(SOURCE_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: SOURCE_COLORS[key] }}
            />
            <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
          </div>
        ))}
      </div>

      {/* Graph */}
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden" style={{ height: "600px" }}>
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-[var(--muted-foreground)]">Loading network...</p>
            </div>
          </div>
        ) : filteredData?.message ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-[var(--muted-foreground)] max-w-sm">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <p className="text-sm">{filteredData.message}</p>
            </div>
          </div>
        ) : !filteredData?.nodes?.length ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-[var(--muted-foreground)]">
              <p className="text-sm">No data available</p>
              <p className="text-xs mt-1">Run a discovery to populate the network</p>
            </div>
          </div>
        ) : (
          <NetworkGraph
            nodes={filteredData.nodes}
            links={filteredData.links}
            type={activeTab}
            onNodeClick={handleNodeClick}
          />
        )}
      </div>

      {/* Stats */}
      {filteredData?.stats && filteredData.stats.total_nodes > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
            <p className="text-2xl font-bold">{filteredData.stats.total_nodes}</p>
            <p className="text-xs text-[var(--muted-foreground)]">Papers{filter ? " (filtered)" : ""}</p>
          </div>
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
            <p className="text-2xl font-bold">{filteredData.stats.total_links}</p>
            <p className="text-xs text-[var(--muted-foreground)]">Connections</p>
          </div>
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
            <p className="text-2xl font-bold">
              {filteredData.links?.length > 0
                ? (filteredData.links.reduce((s: number, l: any) => s + l.weight, 0) / filteredData.links.length).toFixed(1)
                : "0"}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Avg shared {activeTab === "co-keywords" ? "keywords" : activeTab === "co-authors" ? "authors" : "citations"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
