/**
 * "NEW" badge system — tracks which sections and papers the user has seen.
 *
 * Sidebar badges: show dot when section has items newer than last visit.
 * Per-paper badges: show "NEW" on papers not yet opened by this user.
 */

const VISITED_PREFIX = "fl-visited-";
const SEEN_PAPERS_KEY = "fl-seen-papers";

/** Mark a section as visited right now. */
export function markSectionVisited(section: string) {
  localStorage.setItem(`${VISITED_PREFIX}${section}`, new Date().toISOString());
}

/** Get last-visited timestamp for a section. Returns epoch 0 if never visited. */
export function getSectionVisitedAt(section: string): Date {
  const raw = localStorage.getItem(`${VISITED_PREFIX}${section}`);
  return raw ? new Date(raw) : new Date(0);
}

/** Check if a timestamp is newer than the user's last visit to a section. */
export function isNewForSection(section: string, itemDate: string | null): boolean {
  if (!itemDate) return false;
  const visited = getSectionVisitedAt(section);
  return new Date(itemDate) > visited;
}

/** Mark a paper as seen (opened). */
export function markPaperSeen(paperId: number) {
  const seen = getSeenPapers();
  seen.add(paperId);
  localStorage.setItem(SEEN_PAPERS_KEY, JSON.stringify([...seen]));
}

/** Get set of seen paper IDs. */
export function getSeenPapers(): Set<number> {
  try {
    const raw = localStorage.getItem(SEEN_PAPERS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

/** Check if a paper has been opened before. */
export function isPaperNew(paperId: number): boolean {
  return !getSeenPapers().has(paperId);
}
