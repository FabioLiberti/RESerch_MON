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
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export const SOURCE_COLORS: Record<string, string> = {
  pubmed: "#10b981",
  semantic_scholar: "#6366f1",
  arxiv: "#ef4444",
  biorxiv: "#f59e0b",
  medrxiv: "#f97316",
  ieee: "#3b82f6",
  compendium: "#a855f7",
};

export const SOURCE_LABELS: Record<string, string> = {
  pubmed: "PubMed",
  semantic_scholar: "Semantic Scholar",
  arxiv: "arXiv",
  biorxiv: "bioRxiv",
  medrxiv: "medRxiv",
  ieee: "IEEE Xplore",
  compendium: "Compendium",
};
