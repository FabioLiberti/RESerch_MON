export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

export const SOURCE_COLORS: Record<string, string> = {
  pubmed: "#10b981",
  semantic_scholar: "#6366f1",
  arxiv: "#ef4444",
  biorxiv: "#f59e0b",
  medrxiv: "#f97316",
  ieee: "#3b82f6",
  elsevier: "#ec4899",
  compendium: "#a855f7",
  iris_who: "#0ea5e9",
  who_web: "#0ea5e9",
  external_document: "#64748b",
};

export const SOURCE_LABELS: Record<string, string> = {
  pubmed: "PubMed",
  semantic_scholar: "Semantic Scholar",
  arxiv: "arXiv",
  biorxiv: "bioRxiv",
  medrxiv: "medRxiv",
  ieee: "IEEE Xplore",
  elsevier: "Elsevier (Scopus)",
  compendium: "Compendium",
  iris_who: "WHO IRIS",
  who_web: "WHO",
  external_document: "External",
};
