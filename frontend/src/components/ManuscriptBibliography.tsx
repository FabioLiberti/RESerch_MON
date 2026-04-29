"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { authFetcher } from "@/lib/api";
import { authHeaders } from "@/lib/authHeaders";
import { useAuth } from "@/lib/auth";

interface Reference {
  id: number;
  cited_paper_id: number;
  title: string;
  doi: string | null;
  journal: string | null;
  publication_date: string | null;
  disabled: boolean;
  rating: number | null;
  keywords: string[];
  labels: { name: string; color: string }[];
  first_author: string | null;
  author_count: number;
  context: string | null;
  context_label: string | null;
  contexts: string[];
  contexts_labels: string[];
  note: string | null;
  citations_map: string | null;
  citation_count: number;
}

interface AutoDetectItem {
  ref_id: number;
  cited_paper_id: number;
  title: string;
  citations_map: string | null;
  current_contexts: string[];
  suggested_contexts: string[];
  evidence: { line: string; section: string | null; theme: string; matched: string | null; context: string | null }[];
}

interface RefsResponse {
  manuscript_id: number;
  references: Reference[];
  total: number;
}

const CONTEXT_OPTIONS = [
  { value: "", label: "— no context —" },
  { value: "introduction", label: "Introduction" },
  { value: "related_work", label: "Related Work" },
  { value: "methodology", label: "Methodology" },
  { value: "comparison", label: "Comparison / Baseline" },
  { value: "results", label: "Results" },
  { value: "discussion", label: "Discussion" },
  { value: "other", label: "Other" },
];

const CONTEXT_COLORS: Record<string, string> = {
  introduction: "bg-blue-700",
  related_work: "bg-purple-700",
  methodology: "bg-emerald-700",
  comparison: "bg-amber-700",
  results: "bg-cyan-700",
  discussion: "bg-indigo-700",
  other: "bg-gray-600",
};

export default function ManuscriptBibliography({ paperId, defaultCollapsed = false }: { paperId: number; defaultCollapsed?: boolean }) {
  const { isAdmin } = useAuth();
  const apiUrl = `/api/v1/paper-references/${paperId}`;
  const { data, isLoading } = useSWR<RefsResponse>(apiUrl, authFetcher);

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [citesMapModal, setCitesMapModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [addContext, setAddContext] = useState("");
  const [addNote, setAddNote] = useState("");

  const [editingNote, setEditingNote] = useState<Record<number, string>>({});
  const [noteEditMode, setNoteEditMode] = useState<Record<number, boolean>>({});
  const [editingCitationsMap, setEditingCitationsMap] = useState<Record<number, string>>({});
  const [citesEditMode, setCitesEditMode] = useState<Record<number, boolean>>({});
  const [citesPopup, setCitesPopup] = useState<number | null>(null);

  // Import from label
  const [showLabelImport, setShowLabelImport] = useState(false);
  // Import bibliography from pasted text — two-phase: preview, then apply
  const [showBibImport, setShowBibImport] = useState(false);
  const [bibImportText, setBibImportText] = useState("");
  const [bibImportLoading, setBibImportLoading] = useState(false);
  const [bibImportPreview, setBibImportPreview] = useState<any | null>(null);
  const [bibImportSelections, setBibImportSelections] = useState<Set<number>>(new Set());
  const [bibImportApplying, setBibImportApplying] = useState(false);
  const [bibImportError, setBibImportError] = useState<string | null>(null);
  const [bibImportResult, setBibImportResult] = useState<{ created: number; linked: number; skipped: number } | null>(null);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [labelPapers, setLabelPapers] = useState<any[] | null>(null);
  const [labelLoading, setLabelLoading] = useState(false);
  const [selectedForImport, setSelectedForImport] = useState<Set<number>>(new Set());
  const [importingLabel, setImportingLabel] = useState(false);

  const { data: labels } = useSWR<{ id: number; name: string; color: string }[]>(
    showLabelImport ? "/api/v1/labels" : null,
    authFetcher
  );

  const loadLabelPapers = async (labelName: string) => {
    setLabelLoading(true);
    setSelectedForImport(new Set());
    try {
      const r = await fetch(`/api/v1/papers?label=${encodeURIComponent(labelName)}&per_page=100&sort_by=title&sort_order=asc`, {
        headers: authHeaders(),
      });
      if (r.ok) {
        const d = await r.json();
        const existingIds = new Set((data?.references || []).map(ref => ref.cited_paper_id));
        existingIds.add(paperId);
        setLabelPapers((d.items || []).filter((p: any) => !existingIds.has(p.id)));
      }
    } finally {
      setLabelLoading(false);
    }
  };

  const runBibImportPreview = async () => {
    if (!bibImportText.trim()) return;
    setBibImportLoading(true);
    setBibImportError(null);
    setBibImportPreview(null);
    setBibImportResult(null);
    try {
      const r = await fetch(`/api/v1/paper-references/${paperId}/import-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ text: bibImportText }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      const d = await r.json();
      setBibImportPreview(d);
      // Default selection: everything that is "in_db" (not yet linked) or "found_s2".
      // Ambiguous and not_found stay un-ticked — user must opt in.
      const initial = new Set<number>();
      (d.items || []).forEach((it: any, idx: number) => {
        if (it.already_linked) return;
        if (it.status === "in_db" || it.status === "found_s2") initial.add(idx);
      });
      setBibImportSelections(initial);
    } catch (e: any) {
      setBibImportError(`Preview failed: ${e.message || e}`);
    } finally {
      setBibImportLoading(false);
    }
  };

  const applyBibImport = async () => {
    if (!bibImportPreview) return;
    setBibImportApplying(true);
    setBibImportError(null);
    try {
      const items = (bibImportPreview.items || [])
        .map((it: any, idx: number) => ({ idx, it }))
        .filter((x: any) => bibImportSelections.has(x.idx))
        .map((x: any) => ({
          title: x.it.title || x.it.parsed_title,
          doi: x.it.doi || x.it.parsed_doi || null,
          arxiv: x.it.arxiv || null,
          abstract: x.it.abstract,
          journal: x.it.journal,
          publication_date: x.it.publication_date,
          authors: x.it.authors || [],
          keywords: x.it.keywords || [],
          s2_id: x.it.s2_id,
          paper_type: x.it.paper_type,
          citation_count: x.it.citation_count || 0,
          matched_paper_id: x.it.matched_paper_id,
        }));
      const r = await fetch(`/api/v1/paper-references/${paperId}/import-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      const d = await r.json();
      setBibImportResult({ created: d.created || 0, linked: d.linked || 0, skipped: d.skipped || 0 });
      // Refresh the bibliography list on the page
      mutate(apiUrl);
    } catch (e: any) {
      setBibImportError(`Import failed: ${e.message || e}`);
    } finally {
      setBibImportApplying(false);
    }
  };

  const closeBibImport = () => {
    setShowBibImport(false);
    setBibImportText("");
    setBibImportPreview(null);
    setBibImportSelections(new Set());
    setBibImportError(null);
    setBibImportResult(null);
  };

  const importSelected = async () => {
    if (selectedForImport.size === 0) return;
    setImportingLabel(true);
    for (const pid of selectedForImport) {
      await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ cited_paper_id: pid, context: null, note: null }),
      }).catch(() => {});
    }
    setSelectedForImport(new Set());
    setLabelPapers(null);
    setShowLabelImport(false);
    setImportingLabel(false);
    mutate(apiUrl);
  };

  const searchPapers = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/v1/papers?q=${encodeURIComponent(searchQuery)}&per_page=10&sort_by=title&sort_order=asc`, {
        headers: authHeaders(),
      });
      if (r.ok) {
        const d = await r.json();
        // Exclude papers already in bibliography and the manuscript itself
        const existingIds = new Set((data?.references || []).map(ref => ref.cited_paper_id));
        existingIds.add(paperId);
        setSearchResults((d.items || []).filter((p: any) => !existingIds.has(p.id)));
      }
    } finally {
      setSearching(false);
    }
  };

  const addReference = async (citedPaperId: number) => {
    await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        cited_paper_id: citedPaperId,
        context: addContext || null,
        note: addNote || null,
      }),
    });
    setAddContext("");
    setAddNote("");
    // Remove from search results
    setSearchResults(prev => prev?.filter(p => p.id !== citedPaperId) || null);
    mutate(apiUrl);
  };

  const updateRef = async (refId: number, patch: Record<string, any>) => {
    await fetch(`/api/v1/paper-references/ref/${refId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    });
    mutate(apiUrl);
  };

  const deleteRef = async (refId: number) => {
    if (!confirm("Remove this paper from the bibliography?")) return;
    await fetch(`/api/v1/paper-references/ref/${refId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    mutate(apiUrl);
  };

  // --- Export functions ---
  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportTxt = () => {
    const lines = (data?.references || []).map((ref, i) => {
      let line = `[${i + 1}] ${ref.title}`;
      if (ref.journal) line += `. ${ref.journal}`;
      if (ref.publication_date) line += ` (${ref.publication_date.slice(0, 4)})`;
      if (ref.doi) line += `. DOI: ${ref.doi}`;
      if (ref.context_label) line += `\n    Context: ${ref.context_label}`;
      if (ref.note) line += `\n    Note: ${ref.note}`;
      if (ref.disabled) line += `\n    [DISABLED]`;
      return line;
    });
    downloadFile(lines.join("\n\n"), `bibliography_${paperId}.txt`, "text/plain");
  };

  const exportBibtex = async () => {
    // Server-side generation: proper entry types (@article / @inproceedings /
    // @techreport / @misc), author field, Harvard-style keys (lastnameYEARword),
    // disambiguation, URL/eprint/arXiv handling. Much richer than the previous
    // client-side version.
    try {
      const r = await fetch(`/api/v1/paper-references/${paperId}/bibtex`, {
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const content = await r.text();
      downloadFile(content, `bibliography_${paperId}.bib`, "text/plain");
    } catch (e) {
      console.error("BibTeX export failed:", e);
      alert("BibTeX export failed — check console.");
    }
  };

  const exportHarvard = async () => {
    // Server-side Harvard plain-text: ready to paste into Word/Google Docs
    // templates (IFKAD-compatible). Alphabetically sorted by author surname.
    try {
      const r = await fetch(`/api/v1/paper-references/${paperId}/harvard`, {
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const content = await r.text();
      downloadFile(content, `bibliography_${paperId}_harvard.txt`, "text/plain");
    } catch (e) {
      console.error("Harvard export failed:", e);
      alert("Harvard export failed — check console.");
    }
  };

  const exportCsv = () => {
    const header = "No,Title,Journal,Year,DOI,Context,Note,Disabled,Rating";
    const rows = (data?.references || []).map((ref, i) =>
      [
        i + 1,
        `"${(ref.title || "").replace(/"/g, '""')}"`,
        `"${(ref.journal || "").replace(/"/g, '""')}"`,
        ref.publication_date ? ref.publication_date.slice(0, 4) : "",
        ref.doi || "",
        ref.context_label || "",
        `"${(ref.note || "").replace(/"/g, '""')}"`,
        ref.disabled ? "YES" : "",
        ref.rating || "",
      ].join(",")
    );
    downloadFile([header, ...rows].join("\n"), `bibliography_${paperId}.csv`, "text/csv");
  };

  const exportCitesMap = () => {
    // Structured markdown export of the citations_map for each cited paper.
    // Useful to share with supervisors a compact digest of "where each source
    // is used in the manuscript" without opening the bibliography UI.
    const refs = data?.references || [];
    const today = new Date().toISOString().slice(0, 10);
    const withMap = refs.filter(r => r.citations_map && r.citations_map.trim());
    const withoutMap = refs.filter(r => !r.citations_map || !r.citations_map.trim());

    const lines: string[] = [];
    lines.push(`# Citations map — Manuscript #${paperId}`);
    lines.push(`Generated: ${today}`);
    lines.push(``);
    lines.push(`Total cited papers: ${refs.length}`);
    lines.push(`With citations map: ${withMap.length}`);
    lines.push(`Without citations map: ${withoutMap.length}`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);

    withMap.forEach((ref, i) => {
      const year = ref.publication_date ? ref.publication_date.slice(0, 4) : "n.d.";
      lines.push(`## ${i + 1}. ${ref.title || "(no title)"}`);
      const meta: string[] = [];
      if (ref.journal) meta.push(`*${ref.journal}*`);
      meta.push(`**${year}**`);
      if (ref.doi) meta.push(`DOI: ${ref.doi}`);
      lines.push(meta.join(" · "));
      const tags: string[] = [];
      if (ref.context_label) tags.push(`Context: ${ref.context_label}`);
      tags.push(`Citations: ${ref.citation_count ?? 0}`);
      if (ref.rating) tags.push(`My rating: ${ref.rating}/5`);
      if (tags.length > 0) lines.push(tags.join(" · "));
      lines.push(``);
      lines.push(`**Citations map:**`);
      lines.push(``);
      (ref.citations_map || "").split("\n").forEach(l => lines.push(`> ${l}`));
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    });

    if (withoutMap.length > 0) {
      lines.push(`## Papers without a citations map (${withoutMap.length})`);
      lines.push(``);
      withoutMap.forEach((ref) => {
        const year = ref.publication_date ? ref.publication_date.slice(0, 4) : "n.d.";
        lines.push(`- ${ref.title || "(no title)"} (${year})`);
      });
      lines.push(``);
    }

    downloadFile(lines.join("\n"), `citations_map_${paperId}.md`, "text/markdown");
  };

  const exportCitesMapCsv = () => {
    const refs = data?.references || [];
    const header = "No,Title,Year,Journal,DOI,Context,Citations,MyRating,CitationsMap";
    const rows = refs
      .filter(r => r.citations_map && r.citations_map.trim())
      .map((ref, i) => [
        i + 1,
        `"${(ref.title || "").replace(/"/g, '""')}"`,
        ref.publication_date ? ref.publication_date.slice(0, 4) : "",
        `"${(ref.journal || "").replace(/"/g, '""')}"`,
        ref.doi || "",
        ref.context_label || "",
        ref.citation_count ?? 0,
        ref.rating || "",
        `"${(ref.citations_map || "").replace(/"/g, '""').replace(/\n/g, " | ")}"`,
      ].join(","));
    downloadFile([header, ...rows].join("\n"), `citations_map_${paperId}.csv`, "text/csv");
  };

  const exportCitesMapTxt = () => {
    const refs = data?.references || [];
    const withMap = refs.filter(r => r.citations_map && r.citations_map.trim());
    const withoutMap = refs.filter(r => !r.citations_map || !r.citations_map.trim());
    const today = new Date().toISOString().slice(0, 10);

    const lines: string[] = [];
    lines.push(`Citations map — Manuscript #${paperId}`);
    lines.push(`Generated: ${today}`);
    lines.push(``);
    lines.push(`Total cited papers: ${refs.length}`);
    lines.push(`With citations map: ${withMap.length}`);
    lines.push(`Without citations map: ${withoutMap.length}`);
    lines.push(``);
    lines.push("=".repeat(72));
    lines.push(``);

    withMap.forEach((ref, i) => {
      const year = ref.publication_date ? ref.publication_date.slice(0, 4) : "n.d.";
      lines.push(`[${i + 1}] ${ref.title || "(no title)"}`);
      const meta: string[] = [];
      if (ref.journal) meta.push(ref.journal);
      meta.push(year);
      if (ref.doi) meta.push(`DOI: ${ref.doi}`);
      lines.push(`    ${meta.join(" · ")}`);
      const tags: string[] = [];
      if (ref.context_label) tags.push(`Context: ${ref.context_label}`);
      tags.push(`Citations: ${ref.citation_count ?? 0}`);
      if (ref.rating) tags.push(`My rating: ${ref.rating}/5`);
      if (tags.length > 0) lines.push(`    ${tags.join(" · ")}`);
      lines.push(``);
      (ref.citations_map || "").split("\n").forEach(l => lines.push(`    ${l}`));
      lines.push(``);
      lines.push("-".repeat(72));
      lines.push(``);
    });

    if (withoutMap.length > 0) {
      lines.push(`Papers without a citations map (${withoutMap.length}):`);
      withoutMap.forEach(ref => {
        const year = ref.publication_date ? ref.publication_date.slice(0, 4) : "n.d.";
        lines.push(`- ${ref.title || "(no title)"} (${year})`);
      });
    }

    downloadFile(lines.join("\n"), `citations_map_${paperId}.txt`, "text/plain");
  };

  // Keywords aggregation — use data?.references directly (refs not yet defined here)
  const { data: kwData } = useSWR<{ total_papers: number; keywords: { keyword: string; count: number }[] }>(
    (data?.references?.length ?? 0) > 0 ? `/api/v1/paper-references/${paperId}/keywords` : null,
    authFetcher
  );
  const [showKeywords, setShowKeywords] = useState(false);
  const [filterKeywords, setFilterKeywords] = useState<Set<string>>(new Set());
  const [filterLabels, setFilterLabels] = useState<Set<string>>(new Set());
  const [showLabelsFilter, setShowLabelsFilter] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<string>("insertion");
  const [editingContexts, setEditingContexts] = useState<Record<number, string[]>>({});

  // Auto-detect contexts modal
  const [autoDetectOpen, setAutoDetectOpen] = useState(false);
  const [autoDetectLoading, setAutoDetectLoading] = useState(false);
  const [autoDetectItems, setAutoDetectItems] = useState<AutoDetectItem[] | null>(null);
  const [autoDetectSelections, setAutoDetectSelections] = useState<Record<number, Set<string>>>({});
  const [autoDetectApplying, setAutoDetectApplying] = useState(false);
  const [autoDetectExpanded, setAutoDetectExpanded] = useState<Set<number>>(new Set());

  const updateContexts = async (refId: number, contexts: string[]) => {
    await fetch(`/api/v1/paper-references/ref/${refId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ contexts }),
    });
    mutate(apiUrl);
  };

  const openAutoDetect = async () => {
    setAutoDetectOpen(true);
    setAutoDetectLoading(true);
    setAutoDetectItems(null);
    try {
      const r = await fetch(`/api/v1/paper-references/${paperId}/auto-detect-contexts`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const items: AutoDetectItem[] = d.items || [];
      setAutoDetectItems(items);
      // Pre-select rows where the suggestion adds new contexts vs current
      const initial: Record<number, Set<string>> = {};
      items.forEach(it => {
        const merged = new Set<string>([...(it.current_contexts || []), ...(it.suggested_contexts || [])]);
        initial[it.ref_id] = merged;
      });
      setAutoDetectSelections(initial);
    } catch (e) {
      console.error("Auto-detect failed:", e);
      alert("Auto-detect failed — check console.");
    } finally {
      setAutoDetectLoading(false);
    }
  };

  const applyAutoDetect = async () => {
    if (!autoDetectItems) return;
    setAutoDetectApplying(true);
    const selections: Record<number, string[]> = {};
    Object.entries(autoDetectSelections).forEach(([refId, set]) => {
      selections[Number(refId)] = Array.from(set);
    });
    try {
      const r = await fetch(`/api/v1/paper-references/${paperId}/apply-detected-contexts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ selections }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mutate(apiUrl);
      setAutoDetectOpen(false);
      setAutoDetectItems(null);
      setAutoDetectSelections({});
    } catch (e) {
      console.error("Apply failed:", e);
      alert("Apply failed — check console.");
    } finally {
      setAutoDetectApplying(false);
    }
  };

  if (isLoading) return <div className="h-16 bg-[var(--muted)] rounded-xl animate-pulse" />;

  const refs = data?.references || [];

  const getYear = (r: Reference) => (r.publication_date ? parseInt(r.publication_date.slice(0, 4), 10) || 0 : 0);
  const getSurname = (r: Reference) => (r.first_author ? (r.first_author.split(/[ ,]+/).pop() || "").toLowerCase() : "");
  const nullLast = (av: any, bv: any) => {
    const aE = av === null || av === undefined || av === "" || av === 0;
    const bE = bv === null || bv === undefined || bv === "" || bv === 0;
    if (aE && bE) return 0;
    if (aE) return 1;
    if (bE) return -1;
    return null;
  };
  const sortedRefs = sortBy === "insertion" ? refs : [...refs].sort((a, b) => {
    switch (sortBy) {
      case "author_asc": {
        const sa = getSurname(a), sb = getSurname(b);
        const n = nullLast(sa, sb); if (n !== null) return n;
        return sa.localeCompare(sb);
      }
      case "year_desc": {
        const ya = getYear(a), yb = getYear(b);
        const n = nullLast(ya, yb); if (n !== null) return n;
        return yb - ya;
      }
      case "year_asc": {
        const ya = getYear(a), yb = getYear(b);
        const n = nullLast(ya, yb); if (n !== null) return n;
        return ya - yb;
      }
      case "title_asc":
        return (a.title || "").localeCompare(b.title || "");
      case "rating_desc":
        return (b.rating || 0) - (a.rating || 0);
      case "journal_asc": {
        const ja = a.journal || "", jb = b.journal || "";
        const n = nullLast(ja, jb); if (n !== null) return n;
        return ja.localeCompare(jb);
      }
      case "context": {
        const ca = (a.contexts && a.contexts[0]) || a.context || "";
        const cb = (b.contexts && b.contexts[0]) || b.context || "";
        const n = nullLast(ca, cb); if (n !== null) return n;
        return ca.localeCompare(cb);
      }
      default:
        return 0;
    }
  });

  // Compute filtered refs based on active filters (for dynamic counts)
  const refsFilteredByLabels = filterLabels.size > 0
    ? refs.filter(r => r.labels.some(l => filterLabels.has(l.name)))
    : refs;
  const refsFilteredByKeywords = filterKeywords.size > 0
    ? refs.filter(r => r.keywords.some(k => filterKeywords.has(k)))
    : refs;

  // Dynamic keyword counts: when labels are selected, count only within label-filtered papers
  const dynamicKeywordCounts: Record<string, number> = {};
  refsFilteredByLabels.forEach(r => r.keywords.forEach(k => {
    dynamicKeywordCounts[k] = (dynamicKeywordCounts[k] || 0) + 1;
  }));

  // Dynamic label counts: when keywords are selected, count only within keyword-filtered papers
  const dynamicLabelCounts: Record<string, number> = {};
  refsFilteredByKeywords.forEach(r => r.labels.forEach(l => {
    dynamicLabelCounts[l.name] = (dynamicLabelCounts[l.name] || 0) + 1;
  }));

  return (
    <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-start gap-1.5 text-left hover:opacity-80 transition-opacity cursor-pointer min-w-0"
          aria-expanded={!collapsed}
        >
          <span className="text-[10px] text-[var(--muted-foreground)] w-3 shrink-0 pt-0.5">{collapsed ? "▶" : "▼"}</span>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-bold">Bibliography</h3>
            {refs.length > 0 && (
              <span className="text-[10px] font-normal text-[var(--muted-foreground)]">
                {(filterKeywords.size > 0 || filterLabels.size > 0)
                  ? (() => {
                      const matched = refs.filter(r =>
                        (filterKeywords.size === 0 || r.keywords.some(k => filterKeywords.has(k))) &&
                        (filterLabels.size === 0 || r.labels.some(l => filterLabels.has(l.name)))
                      ).length;
                      const parts: string[] = [];
                      if (filterKeywords.size > 0) parts.push(`${filterKeywords.size} keyword${filterKeywords.size > 1 ? "s" : ""}`);
                      if (filterLabels.size > 0) parts.push(`${filterLabels.size} label${filterLabels.size > 1 ? "s" : ""}`);
                      return `${matched}/${refs.length} papers matching ${parts.join(" + ")}`;
                    })()
                  : `${refs.length} paper${refs.length !== 1 ? "s" : ""} cited`
                }
              </span>
            )}
          </div>
        </button>
        {!collapsed && (
        <div className="flex flex-col items-end gap-1.5">
          {/* Row 1: view / analyze / export */}
          <div className="flex gap-2 flex-wrap justify-end">
            {refs.length > 0 && (
              <>
                <ExportMenu
                  onExportBibtex={exportBibtex}
                  onExportHarvard={exportHarvard}
                  onExportTxt={exportTxt}
                  onExportCsv={exportCsv}
                  onExportCitesMap={exportCitesMap}
                  onExportCitesMapCsv={exportCitesMapCsv}
                  onExportCitesMapTxt={exportCitesMapTxt}
                />
                <a href={`/bibliography-analysis/${paperId}`} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 inline-flex items-center gap-1" title="Analyze bibliography">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  Analyze
                </a>
                <a href={`/network?tab=citations&paper_id=${paperId}`} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] px-2 py-1 rounded bg-cyan-600 text-white hover:bg-cyan-500 inline-flex items-center gap-1" title="Open citations network — this manuscript at the centre with its bibliography around it">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M7 7l10 4M7 17l10-4"/></svg>
                  Citations network
                </a>
                <button
                  onClick={() => setCitesMapModal(true)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 hover:text-indigo-300 font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                  title="View all citations maps"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                  Citations map
                </button>
              </>
            )}
          </div>
          {/* Row 2: admin actions */}
          {isAdmin && (
            <div className="flex gap-2 flex-wrap justify-end">
              {refs.length > 0 && (
                <button
                  onClick={openAutoDetect}
                  className="text-xs px-3 py-1.5 rounded-lg bg-amber-700 text-white font-bold hover:bg-amber-600 transition-colors"
                  title="Scan each reference's citations map and propose contexts"
                >
                  Auto-detect contexts
                </button>
              )}
              <button
                onClick={() => { setShowBibImport(true); setShowLabelImport(false); setShowSearch(false); }}
                className="text-xs px-3 py-1.5 rounded-lg bg-cyan-700 text-white font-bold hover:bg-cyan-600 transition-colors"
                title="Paste a bibliography text (e.g. References section of a PDF). The system parses each entry, looks it up via Semantic Scholar (DOI / arXiv / title), and links it to this manuscript."
              >
                Import bibliography
              </button>
              <button
                onClick={() => { setShowLabelImport(!showLabelImport); setShowSearch(false); }}
                className="text-xs px-3 py-1.5 rounded-lg bg-purple-700 text-white font-bold hover:bg-purple-600 transition-colors"
              >
                Import from Label
              </button>
              <button
                onClick={() => { setShowSearch(!showSearch); setShowLabelImport(false); }}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-700 text-white font-bold hover:bg-indigo-600 transition-colors"
              >
                + Add Reference
              </button>
            </div>
          )}
        </div>
        )}
      </div>
      {!collapsed && (
      <>

      {/* Keywords aggregation — at the top, collapsed by default */}
      {kwData && kwData.keywords.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => setShowKeywords(!showKeywords)}
            className="w-full flex items-center justify-between px-3 py-2 bg-[var(--secondary)] hover:bg-[var(--muted)] transition-colors"
          >
            <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
              Keywords ({kwData.keywords.length} unique from {kwData.total_papers} papers)
            </span>
            <svg className={`w-3.5 h-3.5 text-[var(--muted-foreground)] transition-transform ${showKeywords ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showKeywords && (
            <div className="p-3 flex flex-wrap gap-1.5">
              {filterKeywords.size > 0 && (
                <button
                  onClick={() => setFilterKeywords(new Set())}
                  className="text-[10px] px-2 py-1 rounded-full bg-red-700 text-white font-bold hover:bg-red-600"
                >
                  Clear filter ({filterKeywords.size}) &times;
                </button>
              )}
              {kwData.keywords.map(({ keyword }) => {
                const dynCount = dynamicKeywordCounts[keyword] || 0;
                return (
                  <button
                    key={keyword}
                    onClick={() => setFilterKeywords(prev => {
                      const next = new Set(prev);
                      if (next.has(keyword)) next.delete(keyword); else next.add(keyword);
                      return next;
                    })}
                    className={`text-[10px] px-2 py-1 rounded-full border transition-colors cursor-pointer ${
                      filterKeywords.has(keyword)
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : dynCount === 0
                        ? "bg-[var(--secondary)] border-[var(--border)] text-[var(--muted-foreground)] opacity-40"
                        : "bg-[var(--secondary)] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                    }`}
                    title={`${dynCount} paper${dynCount !== 1 ? "s" : ""} — click to filter`}
                  >
                    {keyword} <span className={filterKeywords.has(keyword) ? "text-indigo-200" : "text-[var(--muted-foreground)]"}>({dynCount})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Labels aggregation — collapsed, multi-select filter */}
      {refs.length > 0 && (() => {
        // Static counts for all labels (for the list)
        const allLabelColors: Record<string, string> = {};
        refs.forEach(r => r.labels.forEach(l => { allLabelColors[l.name] = l.color; }));
        const sortedLabels = Object.entries(allLabelColors).sort((a, b) => a[0].localeCompare(b[0]));
        if (sortedLabels.length === 0) return null;
        return (
          <div className="rounded-lg border border-[var(--border)] overflow-hidden">
            <button
              onClick={() => setShowLabelsFilter(!showLabelsFilter)}
              className="w-full flex items-center justify-between px-3 py-2 bg-[var(--secondary)] hover:bg-[var(--muted)] transition-colors"
            >
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
                Labels ({sortedLabels.length} unique)
              </span>
              <svg className={`w-3.5 h-3.5 text-[var(--muted-foreground)] transition-transform ${showLabelsFilter ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showLabelsFilter && (
              <div className="p-3 flex flex-wrap gap-1.5">
                {filterLabels.size > 0 && (
                  <button onClick={() => setFilterLabels(new Set())} className="text-[10px] px-2 py-1 rounded-full bg-red-700 text-white font-bold hover:bg-red-600">
                    Clear ({filterLabels.size}) &times;
                  </button>
                )}
                {sortedLabels.map(([name, color]) => {
                  const dynCount = dynamicLabelCounts[name] || 0;
                  return (
                    <button
                      key={name}
                      onClick={() => setFilterLabels(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; })}
                      className={`text-[10px] px-2 py-1 rounded-full border transition-colors cursor-pointer flex items-center gap-1 ${
                        filterLabels.has(name) ? "border-white/50 ring-1 ring-white/30" : "border-transparent"
                      } ${dynCount === 0 && !filterLabels.has(name) ? "opacity-40" : ""}`}
                      style={{ backgroundColor: filterLabels.has(name) ? color : `${color}25`, color: filterLabels.has(name) ? "#fff" : color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: filterLabels.has(name) ? "#fff" : color }} />
                      {name} ({dynCount})
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Import from Label */}
      {showLabelImport && (
        <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted-foreground)]">Label:</span>
            <select
              value={selectedLabel}
              onChange={e => { setSelectedLabel(e.target.value); if (e.target.value) loadLabelPapers(e.target.value); else setLabelPapers(null); }}
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
            >
              <option value="">Select a label...</option>
              {(labels || []).map(l => (
                <option key={l.id} value={l.name}>{l.name}</option>
              ))}
            </select>
          </div>

          {labelLoading && <p className="text-xs text-[var(--muted-foreground)]">Loading papers...</p>}

          {labelPapers && !labelLoading && (
            <>
              {labelPapers.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)] text-center py-2">No new papers found in this label (all already in bibliography).</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--muted-foreground)]">{labelPapers.length} papers available</span>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setSelectedForImport(new Set(labelPapers.map((p: any) => p.id)))}
                        className="text-[10px] px-2 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--muted)]"
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => setSelectedForImport(new Set(labelPapers.filter((p: any) => !p.disabled).map((p: any) => p.id)))}
                        className="text-[10px] px-2 py-1 rounded bg-emerald-700 text-white hover:bg-emerald-600"
                      >
                        Select enabled only
                      </button>
                      <button
                        onClick={() => setSelectedForImport(new Set())}
                        className="text-[10px] px-2 py-1 rounded bg-[var(--secondary)] hover:bg-[var(--muted)]"
                      >
                        Deselect
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {labelPapers.map((paper: any) => (
                      <label key={paper.id} className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${selectedForImport.has(paper.id) ? "bg-purple-500/10" : "hover:bg-[var(--secondary)]"} ${paper.disabled ? "opacity-40" : ""}`}>
                        <input
                          type="checkbox"
                          checked={selectedForImport.has(paper.id)}
                          onChange={() => setSelectedForImport(prev => {
                            const next = new Set(prev);
                            if (next.has(paper.id)) next.delete(paper.id); else next.add(paper.id);
                            return next;
                          })}
                          className="mt-0.5 rounded accent-[var(--primary)]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium line-clamp-1">{paper.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {paper.rating > 0 && (
                              <span className="text-[10px] text-amber-400">{"★".repeat(paper.rating)}{"☆".repeat(5 - paper.rating)}</span>
                            )}
                            {paper.disabled && <span className="text-[9px] px-1 py-0.5 rounded bg-red-800 text-white">DISABLED</span>}
                            {paper.journal && <span className="text-[10px] text-[var(--muted-foreground)]">{paper.journal}</span>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={importSelected}
                    disabled={selectedForImport.size === 0 || importingLabel}
                    className="px-4 py-2 rounded-lg bg-purple-700 text-white text-sm font-bold hover:bg-purple-600 disabled:opacity-50 transition-colors"
                  >
                    {importingLabel ? "Importing..." : `Import ${selectedForImport.size} selected`}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Search to add */}
      {showSearch && (
        <div className="p-4 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-3">
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && searchPapers()}
              placeholder="Search papers in DB by title, DOI, or author..."
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm focus:outline-none"
            />
            <button
              onClick={searchPapers}
              disabled={searching || !searchQuery.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm font-bold hover:bg-indigo-600 disabled:opacity-50"
            >
              {searching ? "..." : "Search"}
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={addContext}
              onChange={e => setAddContext(e.target.value)}
              className="px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
            >
              {CONTEXT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              value={addNote}
              onChange={e => setAddNote(e.target.value)}
              placeholder="Note (optional, e.g. 'Baseline in Table 3')"
              className="flex-1 px-2 py-1.5 rounded bg-[var(--card)] border border-[var(--border)] text-xs focus:outline-none"
            />
          </div>

          {/* Search results */}
          {searchResults && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)] text-center py-2">No papers found (or all already in bibliography).</p>
              ) : (
                searchResults.map(paper => (
                  <div key={paper.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-[var(--muted)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium line-clamp-1">{paper.title}</p>
                      {paper.journal && <p className="text-[10px] text-[var(--muted-foreground)]">{paper.journal}</p>}
                    </div>
                    <button
                      onClick={() => addReference(paper.id)}
                      className="text-[10px] px-2 py-1 rounded bg-emerald-700 text-white font-bold hover:bg-emerald-600 shrink-0"
                    >
                      Add
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {refs.length === 0 && !showSearch && (
        <p className="text-sm text-[var(--muted-foreground)] text-center py-4">
          No bibliography references linked yet. Click &quot;+ Add Reference&quot; to link papers from your database.
        </p>
      )}

      {/* References list */}
      {refs.length > 0 && (
        <div className="space-y-2">
          {refs.length > 1 && (
            <div className="flex items-center justify-end gap-2 pb-2 border-b border-[var(--border)]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Sort</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="text-[10px] px-2 py-1 rounded bg-[var(--card)] border border-[var(--border)] focus:outline-none cursor-pointer"
                title="Sort the bibliography (display only — does not change saved order)"
              >
                <option value="insertion">Insertion order</option>
                <option value="author_asc">Author (A→Z)</option>
                <option value="year_desc">Year (newest first)</option>
                <option value="year_asc">Year (oldest first)</option>
                <option value="title_asc">Title (A→Z)</option>
                <option value="rating_desc">Rating (★ high first)</option>
                <option value="journal_asc">Journal (A→Z)</option>
                <option value="context">Context (grouped)</option>
              </select>
            </div>
          )}
          {sortedRefs.map(ref => (
            <div key={ref.id} className={`flex items-start gap-3 p-3 rounded-lg bg-[var(--secondary)]/30 border transition-opacity ${ref.disabled ? "opacity-75 border-red-800/40" : "border-[var(--border)]"} ${(filterKeywords.size > 0 && !ref.keywords.some(k => filterKeywords.has(k))) || (filterLabels.size > 0 && !ref.labels.some(l => filterLabels.has(l.name))) ? "opacity-30" : ""}`}>
              <div className="flex-1 min-w-0 space-y-1">
                <Link
                  href={`/papers/${ref.cited_paper_id}`}
                  target="_blank"
                  className="text-sm font-medium hover:text-[var(--primary)] line-clamp-2"
                >
                  {ref.title}
                </Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ref.disabled && <span className="text-[9px] px-1 py-0.5 rounded bg-red-800 text-white font-bold">DISABLED</span>}
                  {ref.rating != null && ref.rating > 0 && (
                    <span className="text-[10px] text-amber-400">{"★".repeat(ref.rating)}{"☆".repeat(5 - ref.rating)}</span>
                  )}
                  {(ref.contexts && ref.contexts.length > 0
                    ? ref.contexts
                    : (ref.context ? [ref.context] : [])
                  ).map((ctxKey, idx) => (
                    <span
                      key={`${ctxKey}-${idx}`}
                      className={`text-[9px] px-1.5 py-0.5 rounded text-white font-bold ${CONTEXT_COLORS[ctxKey] || "bg-gray-600"}`}
                    >
                      {CONTEXT_OPTIONS.find(o => o.value === ctxKey)?.label || ctxKey}
                    </span>
                  ))}
                  {ref.doi && <span className="text-[10px] text-[var(--muted-foreground)]">DOI: {ref.doi}</span>}
                  {ref.journal && <span className="text-[10px] text-[var(--muted-foreground)] italic">{ref.journal}</span>}
                </div>
                {/* Private note — view / edit / delete (admin only) */}
                {noteEditMode[ref.id] ? (
                  <div className="flex items-start gap-1.5 mt-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500 shrink-0 pt-1">Note</span>
                    <div className="flex-1 flex flex-col gap-1">
                      <textarea
                        value={editingNote[ref.id] ?? ref.note ?? ""}
                        onChange={e => setEditingNote(prev => ({ ...prev, [ref.id]: e.target.value }))}
                        placeholder="Private note (visible only to admin)…"
                        rows={2}
                        autoFocus
                        className="w-full px-2 py-1 rounded bg-[var(--card)] border border-amber-500/40 text-[10px] text-[var(--foreground)] focus:outline-none focus:border-amber-500 resize-y"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            const v = editingNote[ref.id] ?? ref.note ?? "";
                            updateRef(ref.id, { note: v || null });
                            setNoteEditMode(prev => ({ ...prev, [ref.id]: false }));
                          }}
                          className="text-[9px] px-2 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-500 transition-colors"
                        >Save</button>
                        <button
                          onClick={() => {
                            setEditingNote(prev => { const n = { ...prev }; delete n[ref.id]; return n; });
                            setNoteEditMode(prev => ({ ...prev, [ref.id]: false }));
                          }}
                          className="text-[9px] px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--border)] transition-colors"
                        >Cancel</button>
                      </div>
                    </div>
                  </div>
                ) : ref.note ? (
                  <div className="flex items-start gap-1.5 mt-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500 shrink-0 pt-0.5">Note</span>
                    <p className="text-[10px] text-[var(--muted-foreground)] italic flex-1">{ref.note}</p>
                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => setNoteEditMode(prev => ({ ...prev, [ref.id]: true }))}
                          title="Edit note"
                          className="text-[9px] px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-500 hover:bg-amber-600/40 transition-colors"
                        >Edit</button>
                        <button
                          onClick={() => { if (confirm("Delete note?")) updateRef(ref.id, { note: null }); }}
                          title="Delete note"
                          className="text-[9px] px-1.5 py-0.5 rounded bg-red-600/20 text-red-500 hover:bg-red-600/40 transition-colors"
                        >Del</button>
                      </div>
                    )}
                  </div>
                ) : isAdmin ? (
                  <button
                    onClick={() => setNoteEditMode(prev => ({ ...prev, [ref.id]: true }))}
                    className="text-[9px] text-amber-500 hover:text-amber-400 mt-1 self-start"
                  >+ Add private note</button>
                ) : null}

                {/* Citations map — view / edit / delete. Click CITES to open popup. */}
                {citesEditMode[ref.id] ? (
                  <div className="flex items-start gap-1.5 mt-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-500 shrink-0 pt-1">Cites</span>
                    <div className="flex-1 flex flex-col gap-1">
                      <textarea
                        value={editingCitationsMap[ref.id] ?? ref.citations_map ?? ""}
                        onChange={e => setEditingCitationsMap(prev => ({ ...prev, [ref.id]: e.target.value }))}
                        placeholder="e.g. §2.1 P1 — theme (multi-line allowed)…"
                        rows={4}
                        autoFocus
                        className="w-full px-2 py-1 rounded bg-[var(--card)] border border-indigo-500/40 text-[10px] text-[var(--foreground)] focus:outline-none focus:border-indigo-500 resize-y"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            const v = editingCitationsMap[ref.id] ?? ref.citations_map ?? "";
                            updateRef(ref.id, { citations_map: v || null });
                            setCitesEditMode(prev => ({ ...prev, [ref.id]: false }));
                          }}
                          className="text-[9px] px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
                        >Save</button>
                        <button
                          onClick={() => {
                            setEditingCitationsMap(prev => { const n = { ...prev }; delete n[ref.id]; return n; });
                            setCitesEditMode(prev => ({ ...prev, [ref.id]: false }));
                          }}
                          className="text-[9px] px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--border)] transition-colors"
                        >Cancel</button>
                      </div>
                    </div>
                  </div>
                ) : ref.citations_map ? (
                  <div className="flex items-start gap-1.5 mt-1">
                    <button
                      onClick={() => setCitesPopup(citesPopup === ref.id ? null : ref.id)}
                      className="text-[9px] font-bold uppercase tracking-wider text-indigo-500 shrink-0 pt-0.5 hover:text-indigo-400 transition-colors cursor-pointer"
                      title="Click to view full citations map"
                    >Cites ▸</button>
                    <p className="text-[10px] text-[var(--foreground)] flex-1 line-clamp-1">{ref.citations_map.split("\n")[0]}</p>
                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => setCitesEditMode(prev => ({ ...prev, [ref.id]: true }))}
                          title="Edit citations map"
                          className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-500 hover:bg-indigo-600/40 transition-colors"
                        >Edit</button>
                        <button
                          onClick={() => { if (confirm("Delete citations map?")) updateRef(ref.id, { citations_map: null }); }}
                          title="Delete citations map"
                          className="text-[9px] px-1.5 py-0.5 rounded bg-red-600/20 text-red-500 hover:bg-red-600/40 transition-colors"
                        >Del</button>
                      </div>
                    )}
                  </div>
                ) : isAdmin ? (
                  <button
                    onClick={() => setCitesEditMode(prev => ({ ...prev, [ref.id]: true }))}
                    className="text-[9px] text-indigo-500 hover:text-indigo-400 mt-1 self-start"
                  >+ Add citations map</button>
                ) : null}

                {/* Popup for full citations_map view */}
                {citesPopup === ref.id && ref.citations_map && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                    onClick={() => setCitesPopup(null)}
                  >
                    <div
                      className="bg-[var(--background)] border border-indigo-500/40 rounded-lg p-4 max-w-2xl max-h-[80vh] overflow-y-auto"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-500">Citations map</span>
                        <button
                          onClick={() => setCitesPopup(null)}
                          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >✕</button>
                      </div>
                      <p className="text-sm font-medium mb-2 text-[var(--foreground)]">{ref.title}</p>
                      <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">{ref.citations_map}</p>
                    </div>
                  </div>
                )}
                {/* Collapsible keywords + labels */}
                {(ref.keywords.length > 0 || ref.labels.length > 0) && (
                  <>
                    <button
                      onClick={() => setExpandedDetails(prev => { const next = new Set(prev); if (next.has(ref.id)) next.delete(ref.id); else next.add(ref.id); return next; })}
                      className="text-[9px] text-[var(--primary)] hover:underline mt-1 self-start"
                    >
                      {expandedDetails.has(ref.id) ? "Hide details ▴" : `Details ▾ (${ref.keywords.length} kw, ${ref.labels.length} labels)`}
                    </button>
                    {expandedDetails.has(ref.id) && (
                      <div className="mt-1 space-y-1">
                        {ref.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {ref.labels.map(l => (
                              <span key={l.name} className="text-[8px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${l.color}25`, color: l.color }}>
                                {l.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {ref.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {ref.keywords.slice(0, 15).map(kw => (
                              <span key={kw} className="text-[8px] px-1.5 py-0.5 rounded-full bg-[var(--secondary)] border border-[var(--border)]">{kw}</span>
                            ))}
                            {ref.keywords.length > 15 && <span className="text-[8px] text-[var(--muted-foreground)]">+{ref.keywords.length - 15} more</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              {isAdmin ? (
                <div className="flex flex-col gap-1 shrink-0 w-44">
                  {(() => {
                    const draft = editingContexts[ref.id];
                    const current = draft ?? (ref.contexts && ref.contexts.length > 0 ? ref.contexts : (ref.context ? [ref.context] : []));
                    const isDirty = !!draft && (draft.length !== (ref.contexts?.length ?? (ref.context ? 1 : 0)) || draft.some((c, i) => c !== (ref.contexts?.[i] ?? ref.context)));
                    return (
                      <div className="flex flex-col gap-1 rounded bg-[var(--card)] border border-[var(--border)] p-1">
                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Contexts</span>
                        <div className="flex flex-wrap gap-0.5">
                          {CONTEXT_OPTIONS.filter(o => o.value).map(opt => {
                            const active = current.includes(opt.value);
                            return (
                              <button
                                key={opt.value}
                                title={opt.label}
                                onClick={() => {
                                  const next = active ? current.filter(c => c !== opt.value) : [...current, opt.value];
                                  setEditingContexts(prev => ({ ...prev, [ref.id]: next }));
                                }}
                                className={`text-[8px] px-1 py-0.5 rounded transition-colors cursor-pointer ${
                                  active ? `${CONTEXT_COLORS[opt.value] || "bg-gray-600"} text-white font-bold` : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                                }`}
                              >
                                {opt.label.split(" ")[0]}
                              </button>
                            );
                          })}
                        </div>
                        {isDirty && (
                          <div className="flex gap-1 mt-0.5">
                            <button
                              onClick={async () => {
                                await updateContexts(ref.id, current);
                                setEditingContexts(prev => { const n = { ...prev }; delete n[ref.id]; return n; });
                              }}
                              className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-700 text-white font-bold hover:bg-emerald-600"
                            >Save</button>
                            <button
                              onClick={() => setEditingContexts(prev => { const n = { ...prev }; delete n[ref.id]; return n; })}
                              className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--secondary)] hover:bg-[var(--muted)]"
                            >Cancel</button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <button
                    onClick={async () => {
                      await fetch(`/api/v1/papers/${ref.cited_paper_id}/toggle-disabled`, {
                        method: "POST",
                        headers: authHeaders(),
                      });
                      mutate(apiUrl);
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                      ref.disabled
                        ? "bg-green-700/90 text-white hover:bg-green-600"
                        : "bg-yellow-700/90 text-white hover:bg-yellow-600"
                    }`}
                    title={ref.disabled ? "Re-enable this paper (removes the disabled flag)" : "Mark this paper as disabled"}
                  >
                    {ref.disabled ? "Enable" : "Disable"}
                  </button>
                  <button
                    onClick={() => deleteRef(ref.id)}
                    className="text-[10px] px-2 py-0.5 rounded bg-red-900/80 text-red-100 hover:bg-red-800 font-semibold cursor-pointer transition-colors"
                    title="Remove this reference from the manuscript (paper itself stays in DB)"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      </>
      )}

      {/* Import bibliography modal — paste-text → S2 lookup → linked references */}
      {showBibImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !bibImportLoading && !bibImportApplying && closeBibImport()}
        >
          <div
            className="bg-[var(--background)] border border-cyan-500/40 rounded-lg w-full max-w-4xl max-h-[88vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)] shrink-0">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">Import bibliography from text</h3>
                <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
                  Paste the References section of a paper. Each entry is resolved via Semantic Scholar (DOI / arXiv / title)
                  and linked to this manuscript. Existing papers in your DB are reused.
                </p>
              </div>
              <button
                onClick={closeBibImport}
                disabled={bibImportLoading || bibImportApplying}
                className="text-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer leading-none disabled:opacity-50"
                aria-label="Close"
              >✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!bibImportPreview && !bibImportResult && (
                <>
                  <textarea
                    value={bibImportText}
                    onChange={e => setBibImportText(e.target.value)}
                    rows={14}
                    placeholder={"Paste References section here, e.g.\n\n[1] Y. He et al., \"Class-wise adaptive…\" in AAAI 2022, pp. 12967-12968.\n[2] E. Diao, J. Ding, V. Tarokh, \"Heterofl…\" arXiv:2010.01264, 2020.\n[3] …"}
                    disabled={bibImportLoading}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs font-mono focus:outline-none focus:border-cyan-500/50 resize-y"
                  />
                  <p className="text-[10px] text-[var(--muted-foreground)]">
                    Recognises IEEE-style <code>[N]</code>, numbered lists, and blank-line separated entries. Lookup uses DOI &gt; arXiv &gt; title (rate-limited via Semantic Scholar — expect ~1 s per reference).
                  </p>
                </>
              )}

              {bibImportPreview && !bibImportResult && (
                <>
                  <div className="grid grid-cols-5 gap-2 text-[10px]">
                    <div className="rounded bg-emerald-900/30 border border-emerald-700/40 p-2 text-center">
                      <div className="text-emerald-400 font-bold text-base">{bibImportPreview.summary.in_db}</div>
                      <div className="text-[var(--muted-foreground)]">in DB</div>
                    </div>
                    <div className="rounded bg-cyan-900/30 border border-cyan-700/40 p-2 text-center">
                      <div className="text-cyan-400 font-bold text-base">{bibImportPreview.summary.found}</div>
                      <div className="text-[var(--muted-foreground)]">found via S2</div>
                    </div>
                    <div className="rounded bg-amber-900/30 border border-amber-700/40 p-2 text-center">
                      <div className="text-amber-400 font-bold text-base">{bibImportPreview.summary.ambiguous}</div>
                      <div className="text-[var(--muted-foreground)]">ambiguous</div>
                    </div>
                    <div className="rounded bg-red-900/30 border border-red-700/40 p-2 text-center">
                      <div className="text-red-400 font-bold text-base">{bibImportPreview.summary.not_found}</div>
                      <div className="text-[var(--muted-foreground)]">not found</div>
                    </div>
                    <div className="rounded bg-slate-800 border border-slate-600/40 p-2 text-center">
                      <div className="font-bold text-base">{bibImportPreview.summary.already_linked}</div>
                      <div className="text-[var(--muted-foreground)]">already linked</div>
                    </div>
                  </div>

                  <div className="text-[10px] text-[var(--muted-foreground)]">
                    {bibImportSelections.size} of {bibImportPreview.items.length} selected. Click to toggle. Defaults: matched in DB + found via S2 (you can include ambiguous if you trust the match).
                  </div>

                  <div className="space-y-1.5">
                    {bibImportPreview.items.map((it: any, idx: number) => {
                      const status = it.status as string;
                      const isSelected = bibImportSelections.has(idx);
                      const statusColor = status === "in_db"
                        ? "bg-emerald-700"
                        : status === "found_s2"
                        ? "bg-cyan-700"
                        : status === "ambiguous"
                        ? "bg-amber-700"
                        : "bg-red-800";
                      const statusLabel = status === "in_db"
                        ? "in DB"
                        : status === "found_s2"
                        ? "S2"
                        : status === "ambiguous"
                        ? "ambiguous"
                        : "not found";
                      const isDisabled = status === "not_found" || it.already_linked;
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            if (isDisabled) return;
                            setBibImportSelections(prev => {
                              const next = new Set(prev);
                              if (next.has(idx)) next.delete(idx); else next.add(idx);
                              return next;
                            });
                          }}
                          className={`flex items-start gap-2 p-2 rounded border transition-colors ${
                            isDisabled
                              ? "border-[var(--border)] bg-[var(--secondary)]/20 opacity-50 cursor-not-allowed"
                              : isSelected
                              ? "border-cyan-500/60 bg-cyan-900/20 cursor-pointer"
                              : "border-[var(--border)] bg-[var(--secondary)]/30 cursor-pointer hover:bg-[var(--muted)]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isDisabled}
                            onChange={() => {}}
                            className="mt-0.5 shrink-0 accent-[var(--primary)]"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                              <span className={`text-[8px] px-1 py-0.5 rounded text-white font-bold ${statusColor}`}>{statusLabel}</span>
                              {it.already_linked && <span className="text-[8px] px-1 py-0.5 rounded text-white font-bold bg-slate-600">already linked</span>}
                              {typeof it.similarity === "number" && it.similarity > 0 && it.similarity < 1 && (
                                <span className="text-[9px] text-[var(--muted-foreground)]">sim {Math.round(it.similarity * 100)}%</span>
                              )}
                              {(it.doi || it.parsed_doi) && <span className="text-[9px] text-[var(--muted-foreground)] font-mono">{it.doi || it.parsed_doi}</span>}
                              {it.arxiv && <span className="text-[9px] text-[var(--muted-foreground)] font-mono">arXiv:{it.arxiv}</span>}
                            </div>
                            <p className="text-xs font-medium line-clamp-2">{it.title || it.parsed_title || <em className="text-[var(--muted-foreground)]">(no title parsed)</em>}</p>
                            {it.parsed_first_author && (
                              <p className="text-[10px] text-[var(--muted-foreground)] line-clamp-1">
                                {it.parsed_first_author}{it.parsed_year ? ` · ${it.parsed_year}` : ""}{it.journal ? ` · ${it.journal}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {bibImportResult && (
                <div className="space-y-3 py-4">
                  <div className="text-emerald-400 font-bold text-center text-lg">✓ Import complete</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded bg-emerald-900/30 border border-emerald-700/40 p-3 text-center">
                      <div className="text-emerald-400 font-bold text-2xl">{bibImportResult.created}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">papers created</div>
                    </div>
                    <div className="rounded bg-cyan-900/30 border border-cyan-700/40 p-3 text-center">
                      <div className="text-cyan-400 font-bold text-2xl">{bibImportResult.linked}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">references linked</div>
                    </div>
                    <div className="rounded bg-slate-800 border border-slate-600/40 p-3 text-center">
                      <div className="font-bold text-2xl">{bibImportResult.skipped}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">skipped (duplicates)</div>
                    </div>
                  </div>
                </div>
              )}

              {bibImportError && (
                <div className="text-[11px] px-2 py-1.5 rounded bg-red-900/30 border border-red-700/40 text-red-300">
                  {bibImportError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-4 border-t border-[var(--border)] shrink-0">
              <span className="text-[10px] text-[var(--muted-foreground)] italic">
                {bibImportLoading ? "Resolving references via Semantic Scholar — this can take ~1 s per entry…" : ""}
              </span>
              <div className="flex gap-2">
                {!bibImportPreview && !bibImportResult && (
                  <>
                    <button onClick={closeBibImport} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--secondary)] hover:bg-[var(--muted)]">Cancel</button>
                    <button
                      onClick={runBibImportPreview}
                      disabled={bibImportLoading || !bibImportText.trim()}
                      className="text-xs px-3 py-1.5 rounded-lg bg-cyan-700 text-white font-bold hover:bg-cyan-600 disabled:opacity-50"
                    >
                      {bibImportLoading ? "Resolving…" : "Preview"}
                    </button>
                  </>
                )}
                {bibImportPreview && !bibImportResult && (
                  <>
                    <button onClick={() => { setBibImportPreview(null); setBibImportSelections(new Set()); }} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--secondary)] hover:bg-[var(--muted)]">Back</button>
                    <button
                      onClick={applyBibImport}
                      disabled={bibImportApplying || bibImportSelections.size === 0}
                      className="text-xs px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-bold hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {bibImportApplying ? "Importing…" : `Import ${bibImportSelections.size} selected`}
                    </button>
                  </>
                )}
                {bibImportResult && (
                  <button
                    onClick={closeBibImport}
                    className="text-xs px-3 py-1.5 rounded-lg bg-cyan-700 text-white font-bold hover:bg-cyan-600"
                  >Close</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global "Citations map" modal — lists all refs with citations_map */}
      {citesMapModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setCitesMapModal(false)}
        >
          <div
            className="bg-[var(--background)] border border-indigo-500/40 rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)] shrink-0">
              <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-500">
                Citations map — all references ({refs.filter(r => r.citations_map && r.citations_map.trim()).length}/{refs.length})
              </h3>
              <button
                onClick={() => setCitesMapModal(false)}
                className="text-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer leading-none"
                aria-label="Close"
              >✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {refs.filter(r => r.citations_map && r.citations_map.trim()).map((ref, i) => {
                const year = ref.publication_date ? ref.publication_date.slice(0, 4) : "n.d.";
                const authorTag = ref.first_author
                  ? (ref.author_count > 1 ? `${ref.first_author.split(/[ ,]+/).pop()} et al. (${year})` : `${ref.first_author.split(/[ ,]+/).pop()} (${year})`)
                  : null;
                return (
                  <div key={ref.id} className="border-b border-[var(--border)] pb-3 last:border-b-0">
                    <Link
                      href={`/papers/${ref.cited_paper_id}`}
                      target="_blank"
                      className="text-sm font-semibold hover:text-indigo-400 transition-colors"
                    >
                      [{i + 1}] {authorTag && <span className="text-indigo-400">{authorTag} · </span>}{ref.title}
                    </Link>
                    <p className="text-xs text-[var(--foreground)] mb-2 mt-1">
                      {ref.journal && <span>{ref.journal} · </span>}
                      <span className="font-medium">{year}</span>
                      {ref.doi && <span> · DOI: {ref.doi}</span>}
                      {ref.context_label && <> · <span className="text-indigo-400 font-semibold">{ref.context_label}</span></>}
                      {ref.rating ? <span> · Rating {ref.rating}/5</span> : null}
                    </p>
                    <p className="text-sm whitespace-pre-wrap text-[var(--foreground)]">{ref.citations_map}</p>
                  </div>
                );
              })}
              {refs.filter(r => !r.citations_map || !r.citations_map.trim()).length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
                    Without citations map ({refs.filter(r => !r.citations_map || !r.citations_map.trim()).length})
                  </h4>
                  <ul className="text-xs space-y-0.5">
                    {refs.filter(r => !r.citations_map || !r.citations_map.trim()).map(ref => (
                      <li key={ref.id} className="text-[var(--muted-foreground)]">— {ref.title}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto-detect contexts modal */}
      {autoDetectOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !autoDetectApplying && setAutoDetectOpen(false)}
        >
          <div
            className="bg-[var(--background)] border border-amber-500/40 rounded-lg w-full max-w-5xl max-h-[88vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)] shrink-0">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-amber-500">Auto-detect contexts from citations map</h3>
                <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
                  Each line of the citations_map is scanned for keywords (e.g. <em>method</em>, <em>related work</em>, <em>baseline</em>)
                  and proposed as a context. Tick the contexts you want to keep, then Apply.
                </p>
              </div>
              <button
                onClick={() => !autoDetectApplying && setAutoDetectOpen(false)}
                disabled={autoDetectApplying}
                className="text-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer leading-none disabled:opacity-50"
                aria-label="Close"
              >✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {autoDetectLoading && <p className="text-sm text-[var(--muted-foreground)] text-center py-6">Scanning citations maps…</p>}

              {!autoDetectLoading && autoDetectItems && autoDetectItems.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)] text-center py-6">No references in this manuscript.</p>
              )}

              {!autoDetectLoading && autoDetectItems && autoDetectItems.map(item => {
                const selected = autoDetectSelections[item.ref_id] || new Set<string>();
                const hasMap = item.citations_map && item.citations_map.trim();
                const expanded = autoDetectExpanded.has(item.ref_id);
                const allSuggested = new Set([...(item.current_contexts || []), ...(item.suggested_contexts || [])]);
                return (
                  <div key={item.ref_id} className={`rounded-lg border p-3 ${hasMap ? "border-[var(--border)] bg-[var(--secondary)]/20" : "border-[var(--border)] bg-[var(--secondary)]/5 opacity-70"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <Link href={`/papers/${item.cited_paper_id}`} target="_blank" className="text-xs font-semibold hover:text-amber-400 line-clamp-1">
                          {item.title}
                        </Link>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          <span className="text-[9px] text-[var(--muted-foreground)] uppercase tracking-wider">Current:</span>
                          {item.current_contexts.length === 0 && <span className="text-[9px] text-[var(--muted-foreground)] italic">(none)</span>}
                          {item.current_contexts.map(c => (
                            <span key={c} className={`text-[9px] px-1.5 py-0.5 rounded text-white font-bold ${CONTEXT_COLORS[c] || "bg-gray-600"}`}>
                              {CONTEXT_OPTIONS.find(o => o.value === c)?.label || c}
                            </span>
                          ))}
                        </div>
                      </div>
                      {!hasMap && <span className="text-[9px] text-[var(--muted-foreground)] italic shrink-0">no citations map</span>}
                    </div>

                    {/* Selectable chips — union of current + suggested */}
                    {allSuggested.size > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] text-[var(--muted-foreground)] uppercase tracking-wider">Apply:</span>
                        {CONTEXT_OPTIONS.filter(o => o.value && allSuggested.has(o.value)).map(opt => {
                          const isSelected = selected.has(opt.value);
                          const isNew = !item.current_contexts.includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              onClick={() => {
                                setAutoDetectSelections(prev => {
                                  const next = { ...prev };
                                  const set = new Set(next[item.ref_id] || []);
                                  if (set.has(opt.value)) set.delete(opt.value); else set.add(opt.value);
                                  next[item.ref_id] = set;
                                  return next;
                                });
                              }}
                              className={`text-[10px] px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                                isSelected
                                  ? `${CONTEXT_COLORS[opt.value] || "bg-gray-600"} text-white`
                                  : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                              } ${isNew ? "ring-1 ring-amber-500/60" : ""}`}
                              title={isNew ? `Suggested (new): ${opt.label}` : `Currently set: ${opt.label}`}
                            >
                              {isSelected ? "✓ " : ""}{opt.label}{isNew ? " ★" : ""}
                            </button>
                          );
                        })}
                        {hasMap && item.evidence.length > 0 && (
                          <button
                            onClick={() => {
                              setAutoDetectExpanded(prev => {
                                const next = new Set(prev);
                                if (next.has(item.ref_id)) next.delete(item.ref_id); else next.add(item.ref_id);
                                return next;
                              });
                            }}
                            className="text-[9px] text-amber-500 hover:text-amber-400 ml-auto"
                          >
                            {expanded ? "Hide evidence ▴" : "Show evidence ▾"}
                          </button>
                        )}
                      </div>
                    )}

                    {expanded && hasMap && (
                      <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-1">
                        {item.evidence.map((ev, i) => (
                          <div key={i} className="text-[10px] flex items-start gap-2">
                            <span className="text-[var(--muted-foreground)] shrink-0 w-20 truncate" title={ev.section || ""}>
                              {ev.section || "—"}
                            </span>
                            <span className="flex-1 text-[var(--foreground)]">{ev.theme || ev.line}</span>
                            {ev.context ? (
                              <span className={`text-[9px] px-1 py-0.5 rounded text-white font-bold shrink-0 ${CONTEXT_COLORS[ev.context] || "bg-gray-600"}`}>
                                {CONTEXT_OPTIONS.find(o => o.value === ev.context)?.label || ev.context}
                              </span>
                            ) : (
                              <span className="text-[9px] text-[var(--muted-foreground)] italic shrink-0">no match</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between p-4 border-t border-[var(--border)] shrink-0 gap-2">
              <span className="text-[10px] text-[var(--muted-foreground)]">
                ★ = newly suggested · existing contexts pre-ticked · click chips to toggle
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => !autoDetectApplying && setAutoDetectOpen(false)}
                  disabled={autoDetectApplying}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[var(--secondary)] hover:bg-[var(--muted)] disabled:opacity-50"
                >Cancel</button>
                <button
                  onClick={applyAutoDetect}
                  disabled={autoDetectApplying || !autoDetectItems}
                  className="text-xs px-3 py-1.5 rounded-lg bg-amber-700 text-white font-bold hover:bg-amber-600 disabled:opacity-50"
                >
                  {autoDetectApplying ? "Applying…" : "Apply"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ------------------------------------------------------------------
// Export menu — dropdown with BibTeX / TXT / CSV options. Structured so
// adding new formats (e.g. Harvard plain-text in v2.40.23) is a single
// entry addition.
// ------------------------------------------------------------------
function ExportMenu({
  onExportBibtex,
  onExportHarvard,
  onExportTxt,
  onExportCsv,
  onExportCitesMap,
  onExportCitesMapCsv,
  onExportCitesMapTxt,
}: {
  onExportBibtex: () => void | Promise<void>;
  onExportHarvard: () => void | Promise<void>;
  onExportTxt: () => void;
  onExportCsv: () => void;
  onExportCitesMap: () => void;
  onExportCitesMapCsv: () => void;
  onExportCitesMapTxt: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pick = (fn: () => void | Promise<void>) => {
    setOpen(false);
    Promise.resolve(fn()).catch(() => {});
  };

  const options: { key: string; label: string; desc: string; onClick: () => void | Promise<void> }[] = [
    { key: "bib", label: "BibTeX (.bib)", desc: "LaTeX / Overleaf — Harvard-ready", onClick: onExportBibtex },
    { key: "harvard", label: "Harvard (.txt)", desc: "Ready to paste in Word — IFKAD style", onClick: onExportHarvard },
    { key: "txt", label: "Plain text (.txt)", desc: "Numbered list", onClick: onExportTxt },
    { key: "csv", label: "Spreadsheet (.csv)", desc: "Tabular view", onClick: onExportCsv },
    { key: "cites-md", label: "Citations map (.md)", desc: "Markdown digest of citations map", onClick: onExportCitesMap },
    { key: "cites-csv", label: "Citations map (.csv)", desc: "Spreadsheet with citations map column", onClick: onExportCitesMapCsv },
    { key: "cites-txt", label: "Citations map (.txt)", desc: "Plain-text digest of citations map", onClick: onExportCitesMapTxt },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] px-2.5 py-1 rounded bg-teal-700 text-white hover:bg-teal-600 font-semibold inline-flex items-center gap-1 cursor-pointer"
        title="Export bibliography"
      >
        Export
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-xl overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.key}
              onClick={() => pick(opt.onClick)}
              className="w-full flex flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer border-b border-[var(--border)] last:border-b-0"
            >
              <span className="text-xs font-semibold">{opt.label}</span>
              <span className="text-[10px] text-[var(--muted-foreground)]">{opt.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
