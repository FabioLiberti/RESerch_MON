/** Document type labels and badge styles for papers/manuscripts. */

export const PAPER_TYPE_OPTIONS = [
  { value: "extended_abstract", label: "Extended Abstract", badge: "EXT. ABSTRACT", color: "bg-red-600" },
  { value: "full_paper", label: "Full Paper", badge: "FULL PAPER", color: "bg-purple-700" },
  { value: "conference", label: "Conference Paper", badge: "CONFERENCE", color: "bg-indigo-700" },
  { value: "journal_article", label: "Journal Article", badge: "JOURNAL", color: "bg-emerald-700" },
  { value: "camera_ready", label: "Camera Ready", badge: "CAMERA READY", color: "bg-teal-700" },
  { value: "poster", label: "Poster", badge: "POSTER", color: "bg-amber-700" },
  { value: "preprint", label: "Preprint", badge: "PREPRINT", color: "bg-gray-600" },
  { value: "report", label: "Report", badge: "REPORT", color: "bg-slate-700" },
  { value: "guideline", label: "Guideline", badge: "GUIDELINE", color: "bg-cyan-700" },
  { value: "white_paper", label: "White Paper", badge: "WHITE PAPER", color: "bg-stone-700" },
  { value: "standard", label: "Standard", badge: "STANDARD", color: "bg-zinc-700" },
] as const;

/** Subset shown in the "Add External Document" form (grey literature). */
export const EXTERNAL_DOCUMENT_TYPES = [
  { value: "report", label: "Report (WHO, OECD, EU Commission, ...)" },
  { value: "guideline", label: "Guideline (clinical guideline, EMA, FDA, ...)" },
  { value: "white_paper", label: "White Paper (institutional, industry)" },
  { value: "standard", label: "Standard (ISO, IEEE, NIST)" },
] as const;

export function getPaperTypeBadge(paperType: string) {
  return PAPER_TYPE_OPTIONS.find(o => o.value === paperType) || {
    value: paperType, label: paperType, badge: paperType.toUpperCase().replace(/_/g, " "), color: "bg-gray-600",
  };
}
