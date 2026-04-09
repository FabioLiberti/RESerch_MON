"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { authFetcher } from "@/lib/api";
import { SOURCE_COLORS, SOURCE_LABELS, cn } from "@/lib/utils";
import NetworkGraph from "@/components/charts/NetworkGraph";

type NetworkTab = "co-keywords" | "co-authors" | "citations";

const TABS: { key: NetworkTab; label: string; description: string }[] = [
  { key: "co-keywords", label: "Co-Keywords", description: "Papers linked by shared keywords" },
  { key: "co-authors", label: "Co-Authors", description: "Papers linked by shared authors" },
  { key: "citations", label: "Citations", description: "Citation links via Semantic Scholar (in DB + external)" },
];

export default function NetworkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<NetworkTab>("co-keywords");
  const [maxPapers, setMaxPapers] = useState(100);
  const [minShared, setMinShared] = useState(2);
  const [filter, setFilter] = useState("");

  // Auto-open from URL params (?tab=citations&paper_id=123)
  useEffect(() => {
    const tab = searchParams.get("tab");
    const pid = searchParams.get("paper_id");
    if (tab === "citations") {
      setActiveTab("citations");
      if (pid) {
        const id = parseInt(pid);
        if (!isNaN(id)) exploreCitationsFromUrl(id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Citations tab state
  const [citationPaperId, setCitationPaperId] = useState<number | null>(null);
  const [citationSearch, setCitationSearch] = useState("");
  const [citationLoading, setCitationLoading] = useState(false);
  const [citationData, setCitationData] = useState<any>(null);
  const [citationView, setCitationView] = useState<"all" | "references" | "cited_by">("all");
  const [minCitations, setMinCitations] = useState(0);

  const params = new URLSearchParams({
    max_papers: String(maxPapers),
    min_shared: String(minShared),
  });

  // SWR for co-keywords / co-authors only
  const { data: coData, isLoading: coLoading } = useSWR(
    activeTab !== "citations" ? `/api/v1/network/${activeTab}?${params}` : null,
    authFetcher
  );

  // Paper search for citations tab (searches title, DOI, author)
  const { data: searchResults } = useSWR(
    activeTab === "citations" && citationSearch.length >= 2
      ? `/api/v1/papers?q=${encodeURIComponent(citationSearch)}&per_page=10&sort_by=citation_count&sort_order=desc`
      : null,
    authFetcher
  );

  const exploreCitationsFromUrl = async (paperId: number) => {
    setCitationPaperId(paperId);
    setCitationLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("fl-token") : null;
      const res = await fetch(`/api/v1/network/citations?paper_id=${paperId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setCitationData(await res.json());
    } catch { setCitationData(null); }
    setCitationLoading(false);
  };

  const exploreCitations = async (paperId: number) => {
    setCitationPaperId(paperId);
    setCitationLoading(true);
    setCitationSearch("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("fl-token") : null;
      const res = await fetch(`/api/v1/network/citations?paper_id=${paperId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const newData = await res.json();

      if (citationData && citationData.nodes?.length > 0) {
        // Merge with existing graph
        const existingNodeIds = new Set(citationData.nodes.map((n: any) => n.id));
        const existingLinkKeys = new Set(citationData.links.map((l: any) => `${l.source}-${l.target}`));

        const mergedNodes = [...citationData.nodes];
        for (const n of (newData.nodes || [])) {
          if (!existingNodeIds.has(n.id)) {
            mergedNodes.push(n);
            existingNodeIds.add(n.id);
          }
        }

        const mergedLinks = [...citationData.links];
        for (const l of (newData.links || [])) {
          const key = `${l.source}-${l.target}`;
          if (!existingLinkKeys.has(key)) {
            mergedLinks.push(l);
            existingLinkKeys.add(key);
          }
        }

        const inDb = mergedNodes.filter((n: any) => n.in_db).length;
        setCitationData({
          nodes: mergedNodes,
          links: mergedLinks,
          stats: {
            total_nodes: mergedNodes.length,
            total_links: mergedLinks.length,
            in_db: inDb,
            external: mergedNodes.length - inDb,
            type: "citations",
          },
        });
      } else {
        setCitationData(newData);
      }
    } catch {
      setCitationData(null);
    }
    setCitationLoading(false);
  };

  // Filter citation data by view + min citations
  const filteredCitationData = (() => {
    if (!citationData?.nodes) return citationData;

    // Step 1: filter by view direction
    let links = citationData.links;
    if (citationView === "references") {
      links = links.filter((l: any) => l.source === `db_${citationPaperId}`);
    } else if (citationView === "cited_by") {
      links = links.filter((l: any) => l.target === `db_${citationPaperId}`);
    }

    // Step 2: filter nodes by min citations
    const centerNid = `db_${citationPaperId}`;
    const keepNodes = new Set<string>();
    keepNodes.add(centerNid);
    const nodeMap = new Map(citationData.nodes.map((n: any) => [n.id, n]));

    links.forEach((l: any) => {
      const s: any = nodeMap.get(l.source);
      const t: any = nodeMap.get(l.target);
      if (s && (s.id === centerNid || (s.citations || 0) >= minCitations)) keepNodes.add(s.id);
      if (t && (t.id === centerNid || (t.citations || 0) >= minCitations)) keepNodes.add(t.id);
    });

    const filteredLinks = links.filter((l: any) => keepNodes.has(l.source) && keepNodes.has(l.target));
    const filteredNodes = citationData.nodes.filter((n: any) => keepNodes.has(n.id));
    const inDb = filteredNodes.filter((n: any) => n.in_db).length;

    return {
      nodes: filteredNodes,
      links: filteredLinks,
      stats: { total_nodes: filteredNodes.length, total_links: filteredLinks.length, in_db: inDb, external: filteredNodes.length - inDb, type: "citations" },
    };
  })();

  const data = activeTab === "citations" ? filteredCitationData : coData;
  const isLoading = activeTab === "citations" ? citationLoading : coLoading;

  const handleNodeClick = (id: number) => {
    if (activeTab === "citations" && id > 0) {
      exploreCitations(id);
    } else if (activeTab !== "citations") {
      router.push(`/papers/${id}`);
    }
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

      {/* Citation search */}
      {activeTab === "citations" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative max-w-lg">
              <input
                type="text"
                value={citationSearch}
                onChange={(e) => setCitationSearch(e.target.value)}
                placeholder="Search by title, DOI, or author..."
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              />
              {searchResults?.items && searchResults.items.length > 0 && citationSearch.length >= 2 && (
                <div className="absolute left-0 top-12 z-50 w-full rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-xl max-h-64 overflow-y-auto">
                  {searchResults.items.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => exploreCitations(p.id)}
                      className="w-full text-left px-4 py-2.5 hover:bg-[var(--secondary)] transition-colors border-b border-[var(--border)] last:border-0"
                    >
                      <div className="text-sm font-medium line-clamp-1">{p.title}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">
                        ID: {p.id} &middot; {p.citation_count} citations &middot; {p.publication_date || "N/A"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {citationPaperId && citationData && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--secondary)]">
                {([
                  { key: "all", label: "All" },
                  { key: "references", label: "Bibliography (references)" },
                  { key: "cited_by", label: "Cited by" },
                ] as const).map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setCitationView(v.key)}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-medium transition-all",
                      citationView === v.key
                        ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--muted-foreground)]">Min citations:</span>
                <select
                  value={minCitations}
                  onChange={(e) => setMinCitations(Number(e.target.value))}
                  className="px-2 py-1 rounded bg-[var(--secondary)] border border-[var(--border)] text-xs"
                >
                  <option value={0}>All</option>
                  <option value={5}>5+</option>
                  <option value={10}>10+</option>
                  <option value={50}>50+</option>
                  <option value={100}>100+</option>
                  <option value={500}>500+</option>
                  <option value={1000}>1000+</option>
                </select>
              </div>
              <span className="text-xs text-[var(--muted-foreground)]">
                {data?.stats?.total_nodes || 0} nodes, {data?.stats?.total_links || 0} links
              </span>
              <button
                onClick={() => { setCitationData(null); setCitationPaperId(null); setCitationView("all"); }}
                className="px-2 py-1 rounded bg-gray-700 text-white text-[10px] hover:bg-gray-600"
              >
                Reset
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filter (co-keywords / co-authors only) */}
      {activeTab !== "citations" && (
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
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        {activeTab === "citations" ? (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-amber-500" />
              <span className="text-xs text-[var(--muted-foreground)]">Center paper</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-emerald-400" />
              <span className="text-xs text-[var(--muted-foreground)]">In database (click to expand)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-gray-500" />
              <span className="text-xs text-[var(--muted-foreground)]">External (hover for info)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 bg-indigo-500" />
              <span className="text-xs text-[var(--muted-foreground)]">References (bibliography)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 bg-emerald-500" />
              <span className="text-xs text-[var(--muted-foreground)]">Cited by</span>
            </div>
          </>
        ) : (
          Object.entries(SOURCE_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: SOURCE_COLORS[key] }}
              />
              <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
            </div>
          ))
        )}
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
              {activeTab === "citations" && !citationPaperId ? (
                <>
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-sm">Search for a paper above to explore its citation network</p>
                </>
              ) : (
                <>
                  <p className="text-sm">No data available</p>
                  <p className="text-xs mt-1">{activeTab === "citations" ? "No citations found for this paper" : "Run a discovery to populate the network"}</p>
                </>
              )}
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
        <div className={cn("grid gap-4", activeTab === "citations" ? "grid-cols-4" : "grid-cols-3")}>
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
            <p className="text-2xl font-bold">{filteredData.stats.total_nodes}</p>
            <p className="text-xs text-[var(--muted-foreground)]">Papers{filter ? " (filtered)" : ""}</p>
          </div>
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
            <p className="text-2xl font-bold">{filteredData.stats.total_links}</p>
            <p className="text-xs text-[var(--muted-foreground)]">Connections</p>
          </div>
          {activeTab === "citations" ? (
            <>
              <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
                <p className="text-2xl font-bold text-emerald-400">{filteredData.stats.in_db || 0}</p>
                <p className="text-xs text-[var(--muted-foreground)]">In database</p>
              </div>
              <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
                <p className="text-2xl font-bold text-gray-400">{filteredData.stats.external || 0}</p>
                <p className="text-xs text-[var(--muted-foreground)]">External</p>
              </div>
            </>
          ) : (
            <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 text-center">
              <p className="text-2xl font-bold">
                {filteredData.links?.length > 0
                  ? (filteredData.links.reduce((s: number, l: any) => s + (l.weight || 1), 0) / filteredData.links.length).toFixed(1)
                  : "0"}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Avg shared {activeTab === "co-keywords" ? "keywords" : "authors"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Citation Nodes Table */}
      {activeTab === "citations" && filteredCitationData?.nodes?.length > 0 && (
        <CitationNodesTable nodes={filteredCitationData.nodes} />
      )}
    </div>
  );
}


// --- Citation Nodes Table ---
function CitationNodesTable({ nodes }: { nodes: any[] }) {
  const [sortBy, setSortBy] = useState<"citations" | "title">("citations");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tableFilter, setTableFilter] = useState("");
  const [importing, setImporting] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<Record<string, string>>({});
  const [selectedDois, setSelectedDois] = useState<Set<string>>(new Set());

  const filtered = nodes
    .filter((n: any) => !n.is_center)
    .filter((n: any) => !tableFilter || n.title.toLowerCase().includes(tableFilter.toLowerCase()))
    .sort((a: any, b: any) => {
      const mul = sortDir === "desc" ? -1 : 1;
      if (sortBy === "citations") return mul * ((a.citations || 0) - (b.citations || 0));
      return mul * (a.title || "").localeCompare(b.title || "");
    });

  const importSingle = async (doi: string) => {
    setImporting(doi);
    try {
      const res = await (await import("@/lib/api")).api.importByDoi(doi);
      setImportMsg((prev) => ({ ...prev, [doi]: res.status === "imported" ? `Imported #${res.paper_id}` : res.status === "exists" ? `Already in DB #${res.paper_id}` : "Not found" }));
    } catch { setImportMsg((prev) => ({ ...prev, [doi]: "Error" })); }
    setImporting(null);
  };

  const importBatch = async () => {
    for (const doi of selectedDois) {
      await importSingle(doi);
    }
    setSelectedDois(new Set());
  };

  const exportCsv = () => {
    const header = "Title,DOI,Citations,In DB,Source\n";
    const rows = filtered.map((n: any) =>
      `"${(n.title || "").replace(/"/g, '""')}","${n.doi || ""}",${n.citations || 0},${n.in_db ? "Yes" : "No"},"${n.source || ""}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "citation_network_nodes.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // Stats
  const inDb = filtered.filter((n: any) => n.in_db).length;
  const ext = filtered.filter((n: any) => !n.in_db).length;
  const topCited = [...filtered].sort((a: any, b: any) => (b.citations || 0) - (a.citations || 0))[0];
  const avgCitations = filtered.length > 0 ? Math.round(filtered.reduce((s: number, n: any) => s + (n.citations || 0), 0) / filtered.length) : 0;

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-medium">Citation Network Papers ({filtered.length})</h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            placeholder="Filter by title..."
            className="px-3 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs focus:outline-none max-w-48"
          />
          {selectedDois.size > 0 && (
            <button onClick={importBatch} className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-600">
              Import selected ({selectedDois.size})
            </button>
          )}
          <button onClick={exportCsv} className="px-3 py-1.5 rounded-lg bg-gray-700 text-white text-xs hover:bg-gray-600">
            Export CSV
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="flex gap-4 text-xs text-[var(--muted-foreground)]">
        <span>{inDb} in DB</span>
        <span>{ext} external</span>
        <span>Avg {avgCitations} citations</span>
        {topCited && <span>Top: {topCited.citations} ({topCited.title?.slice(0, 30)}...)</span>}
      </div>

      {/* Table */}
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--card)]">
            <tr className="border-b border-[var(--border)]">
              <th className="w-8 px-2 py-2"></th>
              <th className="text-left px-2 py-2 cursor-pointer hover:text-[var(--foreground)]" onClick={() => { setSortBy("title"); setSortDir(sortBy === "title" && sortDir === "asc" ? "desc" : "asc"); }}>
                Title {sortBy === "title" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="text-right px-2 py-2 w-20 cursor-pointer hover:text-[var(--foreground)]" onClick={() => { setSortBy("citations"); setSortDir(sortBy === "citations" && sortDir === "desc" ? "asc" : "desc"); }}>
                Citations {sortBy === "citations" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="text-center px-2 py-2 w-16">Status</th>
              <th className="text-center px-2 py-2 w-20">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((n: any) => (
              <tr key={n.id} className="border-b border-[var(--border)]/30 hover:bg-[var(--secondary)]/50">
                <td className="px-2 py-1.5">
                  {!n.in_db && n.doi && (
                    <input
                      type="checkbox"
                      checked={selectedDois.has(n.doi)}
                      onChange={() => {
                        const next = new Set(selectedDois);
                        next.has(n.doi) ? next.delete(n.doi) : next.add(n.doi);
                        setSelectedDois(next);
                      }}
                      className="rounded accent-[var(--primary)]"
                    />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {n.in_db && n.paper_id ? (
                    <a href={`/papers/${n.paper_id}`} className="text-[var(--primary)] hover:underline">{n.title}</a>
                  ) : (
                    <span>{n.title}</span>
                  )}
                  {n.doi && <a href={`https://doi.org/${n.doi}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-[10px] text-indigo-400 hover:underline">{n.doi}</a>}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{n.citations || 0}</td>
                <td className="px-2 py-1.5 text-center">
                  {n.in_db ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-700 text-white">IN DB</span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-600 text-white">EXT</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {!n.in_db && n.doi && (
                    importMsg[n.doi] ? (
                      <span className="text-[9px] text-emerald-400">{importMsg[n.doi]}</span>
                    ) : (
                      <button
                        onClick={() => importSingle(n.doi)}
                        disabled={importing === n.doi}
                        className="text-[9px] px-2 py-0.5 rounded bg-indigo-700 text-white hover:bg-indigo-600 disabled:opacity-50"
                      >
                        {importing === n.doi ? "..." : "Add to DB"}
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
