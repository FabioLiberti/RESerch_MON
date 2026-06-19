/** Document type labels and badge styles for papers/manuscripts. */

export const PAPER_TYPE_OPTIONS = [
  { value: "extended_abstract", label: "Extended Abstract", badge: "EXT. ABSTRACT", color: "bg-red-600" },
  { value: "full_paper", label: "Full Paper", badge: "FULL PAPER", color: "bg-purple-700" },
  { value: "conference", label: "Conference Paper", badge: "CONFERENCE", color: "bg-indigo-700" },
  { value: "journal_article", label: "Journal Article", badge: "JOURNAL", color: "bg-emerald-700" },
  { value: "review", label: "Review Article", badge: "REVIEW", color: "bg-yellow-700" },
  { value: "case_report", label: "Case Report", badge: "CASE REPORT", color: "bg-pink-700" },
  { value: "clinical_trial", label: "Clinical Trial", badge: "CLINICAL TRIAL", color: "bg-rose-700" },
  { value: "meta_analysis", label: "Meta-Analysis", badge: "META-ANALYSIS", color: "bg-fuchsia-700" },
  { value: "editorial", label: "Editorial", badge: "EDITORIAL", color: "bg-violet-700" },
  { value: "letter", label: "Letter / Comment", badge: "LETTER", color: "bg-lime-700" },
  { value: "camera_ready", label: "Camera Ready", badge: "CAMERA READY", color: "bg-teal-700" },
  { value: "poster", label: "Poster", badge: "POSTER", color: "bg-amber-700" },
  { value: "preprint", label: "Preprint", badge: "PREPRINT", color: "bg-gray-600" },
  { value: "dataset", label: "Dataset", badge: "DATASET", color: "bg-emerald-900" },
  { value: "dissertation", label: "Dissertation / Thesis", badge: "DISSERTATION", color: "bg-purple-900" },
  { value: "report", label: "Report", badge: "REPORT", color: "bg-slate-700" },
  { value: "guideline", label: "Guideline", badge: "GUIDELINE", color: "bg-cyan-700" },
  { value: "white_paper", label: "White Paper", badge: "WHITE PAPER", color: "bg-stone-700" },
  { value: "standard", label: "Standard", badge: "STANDARD", color: "bg-zinc-700" },
  { value: "regulation", label: "Regulation (EU/EC)", badge: "REGULATION", color: "bg-blue-800" },
  { value: "directive", label: "Directive (EU)", badge: "DIRECTIVE", color: "bg-sky-800" },
  { value: "decision", label: "Decision (EU)", badge: "DECISION", color: "bg-indigo-800" },
  { value: "book", label: "Book", badge: "BOOK", color: "bg-orange-700" },
  { value: "book_chapter", label: "Book Chapter", badge: "BOOK CHAPTER", color: "bg-orange-800" },
  { value: "other", label: "Other / Unclassified", badge: "OTHER", color: "bg-neutral-600" },
] as const;

/** Subset shown in the "Add External Document" form (grey literature). */
export const EXTERNAL_DOCUMENT_TYPES = [
  { value: "report", label: "Report (WHO, OECD, EU Commission, ...)" },
  { value: "guideline", label: "Guideline (clinical guideline, EMA, FDA, ...)" },
  { value: "white_paper", label: "White Paper (institutional, industry)" },
  { value: "standard", label: "Standard (ISO, IEEE, NIST)" },
  { value: "book", label: "Book (academic, monograph)" },
  { value: "book_chapter", label: "Book Chapter (edited volume)" },
] as const;

export function getPaperTypeBadge(paperType: string) {
  return PAPER_TYPE_OPTIONS.find(o => o.value === paperType) || {
    value: paperType, label: paperType, badge: paperType.toUpperCase().replace(/_/g, " "), color: "bg-gray-600",
  };
}
