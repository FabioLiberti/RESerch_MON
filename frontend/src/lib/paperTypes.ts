/** Document type labels and badge styles for papers/manuscripts. */

export const PAPER_TYPE_OPTIONS = [
  { value: "extended_abstract", label: "Extended Abstract", badge: "EXT. ABSTRACT", color: "bg-red-600" },
  { value: "full_paper", label: "Full Paper", badge: "FULL PAPER", color: "bg-purple-700" },
  { value: "conference", label: "Conference Paper", badge: "CONFERENCE", color: "bg-indigo-700" },
  { value: "journal_article", label: "Journal Article", badge: "JOURNAL", color: "bg-emerald-700" },
  { value: "camera_ready", label: "Camera Ready", badge: "CAMERA READY", color: "bg-teal-700" },
  { value: "poster", label: "Poster", badge: "POSTER", color: "bg-amber-700" },
  { value: "preprint", label: "Preprint", badge: "PREPRINT", color: "bg-gray-600" },
] as const;

export function getPaperTypeBadge(paperType: string) {
  return PAPER_TYPE_OPTIONS.find(o => o.value === paperType) || {
    value: paperType, label: paperType, badge: paperType.toUpperCase().replace(/_/g, " "), color: "bg-gray-600",
  };
}
