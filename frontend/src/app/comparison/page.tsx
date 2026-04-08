"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { authFetcher, api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ComparisonItem {
  paper_id: number;
  title: string;
  doi: string | null;
  publication_date: string | null;
  labels: { name: string; color: string }[];
  problem_addressed: string | null;
  proposed_method: string | null;
  fl_techniques: string[];
  datasets: string[];
  baselines: string[];
  best_metric_name: string | null;
  best_metric_value: number | null;
  best_baseline_name: string | null;
  best_baseline_value: number | null;
  improvement_delta: number | null;
  privacy_mechanism: string | null;
  privacy_formal: boolean | null;
  reproducibility_score: number | null;
  novelty_level: string | null;
  relevance: string | null;
  healthcare_applicable: boolean | null;
  healthcare_evidence: string | null;
  key_findings_summary: string | null;
  limitations_declared: string[];
  limitations_identified: string[];
  extra: Record<string, unknown>;
}

interface GapsData {
  total_papers_analyzed: number;
  fl_techniques: Record<string, number>;
  datasets_used: Record<string, number>;
  privacy_mechanisms: Record<string, number>;
  novelty_distribution: Record<string, number>;
  relevance_distribution: Record<string, number>;
  healthcare_applicable_count: number;
  common_limitations: [string, number][];
}

type ViewTab = "table" | "gaps";

const RELEVANCE_ORDER: Record<string, number> = { "Molto Alta": 4, "Alta": 3, "Media": 2, "Bassa": 1 };
const NOVELTY_COLORS: Record<string, string> = {
  paradigmatic: "bg-purple-700 text-white",
  moderate: "bg-blue-700 text-white",
  incremental: "bg-gray-600 text-white",
};
const RELEVANCE_COLORS: Record<string, string> = {
  "Molto Alta": "bg-emerald-700 text-white",
  "Alta": "bg-blue-700 text-white",
  "Media": "bg-amber-600 text-white",
  "Bassa": "bg-gray-600 text-white",
};

// Comparison table rows definition
const ROWS: { key: string; label: string; render: (item: ComparisonItem, allItems: ComparisonItem[]) => React.ReactNode }[] = [
  {
    key: "problem",
    label: "Problem Addressed",
    render: (item) => <span className="text-xs">{item.problem_addressed || "—"}</span>,
  },
  {
    key: "method",
    label: "Proposed Method",
    render: (item) => <span className="text-xs font-medium">{item.proposed_method || "—"}</span>,
  },
  {
    key: "fl_techniques",
    label: "FL Techniques",
    render: (item) =>
      item.fl_techniques.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {item.fl_techniques.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-700 text-white">{t}</span>
          ))}
        </div>
      ) : <span className="text-xs text-[var(--muted-foreground)]">—</span>,
  },
  {
    key: "datasets",
    label: "Datasets",
    render: (item) =>
      item.datasets.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {item.datasets.map((d) => (
            <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-teal-700 text-white">{d}</span>
          ))}
        </div>
      ) : <span className="text-xs text-[var(--muted-foreground)]">—</span>,
  },
  {
    key: "metric",
    label: "Best Metric",
    render: (item, all) => {
      if (!item.best_metric_name) return <span className="text-xs text-[var(--muted-foreground)]">—</span>;
      // Highlight best value among comparable papers (same metric name)
      const sameMetric = all.filter((a) => a.best_metric_name === item.best_metric_name && a.best_metric_value != null);
      const bestVal = sameMetric.length > 0 ? Math.max(...sameMetric.map((a) => a.best_metric_value!)) : null;
      const isBest = bestVal !== null && item.best_metric_value === bestVal && sameMetric.length > 1;
      return (
        <div>
          <span className="text-[10px] text-[var(--muted-foreground)]">{item.best_metric_name}</span>
          <div className={cn("text-sm font-bold", isBest && "text-emerald-400")}>
            {item.best_metric_value != null ? item.best_metric_value : "—"}
            {item.improvement_delta != null && (
              <span className="text-[10px] text-emerald-400 ml-1">(+{item.improvement_delta})</span>
            )}
          </div>
        </div>
      );
    },
  },
  {
    key: "baseline",
    label: "Best Baseline",
    render: (item) => (
      <div>
        <span className="text-xs">{item.best_baseline_name || "—"}</span>
        {item.best_baseline_value != null && (
          <span className="text-[10px] text-[var(--muted-foreground)] ml-1">({item.best_baseline_value})</span>
        )}
      </div>
    ),
  },
  {
    key: "privacy",
    label: "Privacy",
    render: (item) => (
      <div>
        <span className="text-xs">{item.privacy_mechanism || "none"}</span>
        {item.privacy_formal && (
          <span className="text-[10px] px-1 py-0.5 ml-1 rounded bg-emerald-700 text-white">formal</span>
        )}
      </div>
    ),
  },
  {
    key: "reproducibility",
    label: "Reproducibility",
    render: (item) => {
      if (item.reproducibility_score == null) return <span className="text-xs text-[var(--muted-foreground)]">—</span>;
      const score = item.reproducibility_score;
      const color = score >= 4 ? "text-emerald-400" : score >= 3 ? "text-amber-400" : "text-red-400";
      return (
        <div className="flex items-center gap-1">
          <span className={cn("text-sm font-bold", color)}>{score}</span>
          <span className="text-[10px] text-[var(--muted-foreground)]">/5</span>
        </div>
      );
    },
  },
  {
    key: "novelty",
    label: "Novelty",
    render: (item) =>
      item.novelty_level ? (
        <span className={cn("text-[10px] px-2 py-0.5 rounded font-semibold", NOVELTY_COLORS[item.novelty_level] || "bg-gray-600 text-white")}>
          {item.novelty_level.toUpperCase()}
        </span>
      ) : <span className="text-xs text-[var(--muted-foreground)]">—</span>,
  },
  {
    key: "relevance",
    label: "Relevance",
    render: (item) =>
      item.relevance ? (
        <span className={cn("text-[10px] px-2 py-0.5 rounded font-semibold", RELEVANCE_COLORS[item.relevance] || "bg-gray-600 text-white")}>
          {item.relevance}
        </span>
      ) : <span className="text-xs text-[var(--muted-foreground)]">—</span>,
  },
  {
    key: "healthcare",
    label: "Healthcare",
    render: (item) => (
      <div>
        {item.healthcare_applicable ? (
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-700 text-white font-semibold">YES</span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-600 text-white">NO</span>
        )}
        {item.healthcare_evidence && item.healthcare_evidence !== "none" && (
          <span className="text-[10px] text-[var(--muted-foreground)] ml-1">({item.healthcare_evidence})</span>
        )}
      </div>
    ),
  },
  {
    key: "findings",
    label: "Key Findings",
    render: (item) => <span className="text-xs">{item.key_findings_summary || "—"}</span>,
  },
  {
    key: "limitations",
    label: "Limitations",
    render: (item) => {
      const lims = [...(item.limitations_declared || []), ...(item.limitations_identified || [])];
      if (lims.length === 0) return <span className="text-xs text-[var(--muted-foreground)]">—</span>;
      return (
        <ul className="text-xs space-y-0.5 list-disc list-inside">
          {lims.map((l, i) => <li key={i} className="text-[var(--muted-foreground)]">{l}</li>)}
        </ul>
      );
    },
  },
];

// --- Saved comparisons in localStorage ---
interface SavedComparison {
  id: string;
  name: string;
  paperIds: number[];
  paperTitles: string[];
  labels: { name: string; color: string }[];
  createdAt: string;
}

const STORAGE_KEY = "fl-saved-comparisons";

function loadSavedComparisons(): SavedComparison[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

function persistComparisons(items: SavedComparison[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function ComparisonPage() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get("ids");
  const [activeTab, setActiveTab] = useState<ViewTab>("table");
  const [saved, setSaved] = useState<SavedComparison[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Load saved comparisons on mount
  useEffect(() => {
    setSaved(loadSavedComparisons());
  }, []);

  // Parse paper IDs from URL
  const paperIds = useMemo(() => {
    if (!idsParam) return [];
    return idsParam.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
  }, [idsParam]);

  // Fetch comparison data
  const { data: comparisonData, isLoading } = useSWR<ComparisonItem[]>(
    paperIds.length > 0 ? `/api/v1/comparison/papers?paper_ids=${paperIds.join(",")}` : null,
    authFetcher
  );

  // Fetch gaps data
  const { data: gapsData } = useSWR<GapsData>(
    activeTab === "gaps" ? "/api/v1/comparison/gaps" : null,
    authFetcher
  );

  // Auto-save comparison when data arrives
  useEffect(() => {
    if (!comparisonData || comparisonData.length === 0 || paperIds.length === 0) return;
    const key = [...paperIds].sort().join(",");
    const existing = loadSavedComparisons();
    // Skip if already saved with same paper set
    if (existing.some((s) => [...s.paperIds].sort().join(",") === key)) return;
    // Collect unique labels across all compared papers
    const labelMap = new Map<string, { name: string; color: string }>();
    comparisonData.forEach((c) => (c.labels || []).forEach((l) => labelMap.set(l.name, l)));
    const entry: SavedComparison = {
      id: crypto.randomUUID(),
      name: `Comparison ${new Date().toLocaleDateString("it-IT")} (${comparisonData.length} papers)`,
      paperIds,
      paperTitles: comparisonData.map((c) => c.title),
      labels: [...labelMap.values()],
      createdAt: new Date().toISOString(),
    };
    const updated = [entry, ...existing];
    persistComparisons(updated);
    setSaved(updated);
  }, [comparisonData, paperIds]);

  // Papers without structured analysis
  const missingPapers = useMemo(() => {
    if (!comparisonData) return paperIds;
    const analyzed = new Set(comparisonData.map((c) => c.paper_id));
    return paperIds.filter((id) => !analyzed.has(id));
  }, [paperIds, comparisonData]);

  const exportToExcel = () => {
    if (!comparisonData || comparisonData.length === 0) return;
    import("xlsx").then((XLSX) => {
      // Build rows: each field as a row, papers as columns
      const fields: { label: string; getValue: (item: ComparisonItem) => string }[] = [
        { label: "Title", getValue: (i) => i.title },
        { label: "DOI", getValue: (i) => i.doi || "" },
        { label: "Publication Date", getValue: (i) => i.publication_date || "" },
        { label: "Labels", getValue: (i) => (i.labels || []).map((l) => l.name).join(", ") },
        { label: "Problem Addressed", getValue: (i) => i.problem_addressed || "" },
        { label: "Proposed Method", getValue: (i) => i.proposed_method || "" },
        { label: "FL Techniques", getValue: (i) => i.fl_techniques.join(", ") },
        { label: "Datasets", getValue: (i) => i.datasets.join(", ") },
        { label: "Baselines", getValue: (i) => i.baselines.join(", ") },
        { label: "Best Metric", getValue: (i) => i.best_metric_name ? `${i.best_metric_name}: ${i.best_metric_value ?? "—"}` : "" },
        { label: "Best Baseline", getValue: (i) => i.best_baseline_name ? `${i.best_baseline_name}: ${i.best_baseline_value ?? "—"}` : "" },
        { label: "Improvement Delta", getValue: (i) => i.improvement_delta != null ? String(i.improvement_delta) : "" },
        { label: "Privacy Mechanism", getValue: (i) => i.privacy_mechanism || "none" },
        { label: "Privacy Formal", getValue: (i) => i.privacy_formal ? "Yes" : "No" },
        { label: "Reproducibility", getValue: (i) => i.reproducibility_score != null ? `${i.reproducibility_score}/5` : "" },
        { label: "Novelty", getValue: (i) => i.novelty_level || "" },
        { label: "Relevance", getValue: (i) => i.relevance || "" },
        { label: "Healthcare Applicable", getValue: (i) => i.healthcare_applicable ? "Yes" : "No" },
        { label: "Healthcare Evidence", getValue: (i) => i.healthcare_evidence || "" },
        { label: "Key Findings", getValue: (i) => i.key_findings_summary || "" },
        { label: "Limitations (declared)", getValue: (i) => (i.limitations_declared || []).join("\n") },
        { label: "Limitations (identified)", getValue: (i) => (i.limitations_identified || []).join("\n") },
      ];

      // Header row: Field + paper titles
      const header = ["Field", ...comparisonData.map((c) => c.title)];
      const rows = fields.map((f) => [f.label, ...comparisonData.map((c) => f.getValue(c))]);

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

      // Auto-width columns
      const colWidths = header.map((_, colIdx) => {
        const maxLen = [header, ...rows].reduce((max, row) => {
          const cellLen = String(row[colIdx] || "").split("\n").reduce((m, line) => Math.max(m, line.length), 0);
          return Math.max(max, cellLen);
        }, 10);
        return { wch: Math.min(maxLen + 2, 60) };
      });
      ws["!cols"] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Comparison");
      XLSX.writeFile(wb, `comparison_${comparisonData.length}_papers_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  const deleteComparison = (id: string) => {
    const updated = saved.filter((s) => s.id !== id);
    persistComparisons(updated);
    setSaved(updated);
  };

  const renameComparison = (id: string) => {
    const updated = saved.map((s) => s.id === id ? { ...s, name: editName.trim() || s.name } : s);
    persistComparisons(updated);
    setSaved(updated);
    setEditingId(null);
  };

  // --- Landing page: show saved comparisons ---
  if (paperIds.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Paper Comparison</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Saved comparisons and structured cross-paper analysis
          </p>
        </div>

        {saved.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-[var(--muted-foreground)]">Saved Comparisons</h3>
            {saved.map((s) => (
              <div key={s.id} className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {editingId === s.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && renameComparison(s.id)}
                          className="flex-1 px-2 py-1 rounded bg-[var(--secondary)] border border-[var(--border)] text-sm"
                          autoFocus
                        />
                        <button onClick={() => renameComparison(s.id)} className="text-xs px-2 py-1 rounded bg-emerald-700 text-white">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 rounded bg-gray-600 text-white">Cancel</button>
                      </div>
                    ) : (
                      <Link
                        href={`/comparison?ids=${s.paperIds.join(",")}`}
                        className="text-sm font-medium text-[var(--primary)] hover:underline"
                      >
                        {s.name}
                      </Link>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {new Date(s.createdAt).toLocaleString("it-IT")} &middot; {s.paperIds.length} papers
                      </span>
                      {(s.labels || []).length > 0 && (
                        <div className="flex gap-1">
                          {s.labels.map((l) => (
                            <span key={l.name} className="text-[9px] px-1.5 py-0.5 rounded font-medium text-white" style={{ backgroundColor: l.color }}>
                              {l.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.paperTitles.map((t, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--muted-foreground)] max-w-[300px] truncate">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => { setEditingId(s.id); setEditName(s.name); }}
                      className="text-[10px] px-2 py-1 rounded bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      title="Rename"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteComparison(s.id)}
                      className="text-[10px] px-2 py-1 rounded bg-red-700/20 text-red-400 hover:bg-red-700/40"
                      title="Delete"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-12 text-center">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-[var(--muted-foreground)] mb-4">No saved comparisons yet. Select papers from the Papers page and click "Confronta".</p>
            <Link href="/papers" className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90">
              Go to Papers
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Paper Comparison</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Comparing {paperIds.length} papers &middot; {comparisonData?.length || 0} with structured analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportToExcel}
            disabled={!comparisonData || comparisonData.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Excel
          </button>
          <Link href="/papers" className="text-sm text-[var(--primary)] hover:underline">
            &larr; Back to Papers
          </Link>
        </div>
      </div>

      {/* Missing analysis warning */}
      {missingPapers.length > 0 && (
        <div className="px-4 py-3 rounded-lg bg-amber-600/10 border border-amber-600/20">
          <p className="text-sm text-amber-400">
            {missingPapers.length} paper{missingPapers.length > 1 ? "s" : ""} missing structured analysis data
            (ID: {missingPapers.join(", ")}). Run an analysis first to include them in the comparison.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--secondary)] max-w-xs">
        <button
          onClick={() => setActiveTab("table")}
          className={cn(
            "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeTab === "table"
              ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          )}
        >
          Comparison
        </button>
        <button
          onClick={() => setActiveTab("gaps")}
          className={cn(
            "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeTab === "gaps"
              ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          )}
        >
          Research Gaps
        </button>
      </div>

      {activeTab === "table" ? (
        /* ====== COMPARISON TABLE ====== */
        isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-[var(--muted)] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !comparisonData || comparisonData.length === 0 ? (
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-12 text-center">
            <p className="text-[var(--muted-foreground)]">No structured analysis data available for the selected papers.</p>
            <p className="text-sm text-[var(--muted-foreground)] mt-2">Run an analysis (Quick or Deep) on these papers first.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                {/* Header: paper titles */}
                <thead>
                  <tr className="bg-[var(--secondary)]">
                    <th className="px-4 py-3 text-xs font-medium text-[var(--muted-foreground)] w-36 sticky left-0 bg-[var(--secondary)] z-10 border-r border-[var(--border)]">
                      Field
                    </th>
                    {comparisonData.map((item) => (
                      <th key={item.paper_id} className="px-4 py-3 min-w-[250px] max-w-[350px]">
                        <Link href={`/papers/${item.paper_id}`} className="text-xs font-medium text-[var(--primary)] hover:underline line-clamp-2">
                          {item.title}
                        </Link>
                        <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
                          {item.publication_date || "—"}
                          {item.doi && <span className="ml-2">DOI: {item.doi}</span>}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, rowIdx) => (
                    <tr key={row.key} className={cn(rowIdx % 2 === 0 ? "bg-[var(--card)]" : "bg-[var(--secondary)]/30")}>
                      <td className="px-4 py-3 text-xs font-medium text-[var(--muted-foreground)] sticky left-0 z-10 border-r border-[var(--border)]" style={{ backgroundColor: rowIdx % 2 === 0 ? "var(--card)" : "var(--secondary)" }}>
                        {row.label}
                      </td>
                      {comparisonData.map((item) => (
                        <td key={item.paper_id} className="px-4 py-3 align-top">
                          {row.render(item, comparisonData)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* ====== RESEARCH GAPS ====== */
        <GapsView data={gapsData} />
      )}
    </div>
  );
}


/* ====== GAPS VIEW COMPONENT ====== */

function GapsView({ data }: { data: GapsData | undefined }) {
  if (!data) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-[var(--muted)] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Papers Analyzed" value={data.total_papers_analyzed} />
        <StatCard label="Healthcare Applicable" value={data.healthcare_applicable_count} accent="emerald" />
        <StatCard label="FL Techniques" value={Object.keys(data.fl_techniques).length} accent="indigo" />
        <StatCard label="Datasets Used" value={Object.keys(data.datasets_used).length} accent="teal" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* FL Techniques */}
        <BarSection title="FL Techniques" data={data.fl_techniques} color="bg-indigo-600" />

        {/* Datasets */}
        <BarSection title="Datasets Used" data={data.datasets_used} color="bg-teal-600" />

        {/* Privacy Mechanisms */}
        <BarSection title="Privacy Mechanisms" data={data.privacy_mechanisms} color="bg-purple-600" />

        {/* Novelty Distribution */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-sm font-medium mb-3">Novelty Distribution</h3>
          <div className="flex gap-3">
            {["paradigmatic", "moderate", "incremental"].map((level) => (
              <div key={level} className="flex-1 text-center">
                <div className="text-2xl font-bold">{data.novelty_distribution[level] || 0}</div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded font-semibold", NOVELTY_COLORS[level])}>
                  {level.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Relevance Distribution */}
        <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
          <h3 className="text-sm font-medium mb-3">Relevance Distribution</h3>
          <div className="flex gap-3">
            {["Molto Alta", "Alta", "Media", "Bassa"].map((level) => (
              <div key={level} className="flex-1 text-center">
                <div className="text-2xl font-bold">{data.relevance_distribution[level] || 0}</div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded font-semibold", RELEVANCE_COLORS[level])}>
                  {level}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Common Limitations */}
        {data.common_limitations.length > 0 && (
          <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 lg:col-span-2">
            <h3 className="text-sm font-medium mb-3">Common Limitations</h3>
            <div className="space-y-2">
              {data.common_limitations.map(([limitation, count]) => (
                <div key={limitation} className="flex items-start gap-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-red-700 text-white font-mono shrink-0">{count}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">{limitation}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const borderColor = accent ? `border-${accent}-700/30` : "border-[var(--border)]";
  return (
    <div className={cn("rounded-xl bg-[var(--card)] border p-4 text-center", borderColor)}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs text-[var(--muted-foreground)] mt-1">{label}</div>
    </div>
  );
}


function BarSection({ title, data, color }: { title: string; data: Record<string, number>; color: string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries.length > 0 ? entries[0][1] : 1;

  if (entries.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
        <h3 className="text-sm font-medium mb-3">{title}</h3>
        <p className="text-xs text-[var(--muted-foreground)]">No data available</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4">
      <h3 className="text-sm font-medium mb-3">{title}</h3>
      <div className="space-y-2">
        {entries.map(([name, count]) => (
          <div key={name} className="flex items-center gap-3">
            <span className="text-xs w-36 truncate shrink-0" title={name}>{name}</span>
            <div className="flex-1 h-5 rounded bg-[var(--secondary)] overflow-hidden">
              <div
                className={cn("h-full rounded", color)}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono w-6 text-right shrink-0">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
