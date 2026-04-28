"""Citations-map context parser.

Reads the free-text citations_map of a PaperReference and extracts the set of
manuscript "contexts" (introduction / related_work / methodology / comparison /
results / discussion) where the cited paper appears.

Format expected: one entry per line, "§<section> P<paragraph> — <theme>".
Detection is keyword-based on the <theme> portion (the part after "—" or "-"),
falling back to the full line. Section numbers are kept only as evidence — they
are too paper-specific to drive the mapping reliably.
"""

import re

CONTEXT_KEYS = ("introduction", "related_work", "methodology", "comparison", "results", "discussion")

# Longer multi-word keywords come first so they win over shorter substrings
# (e.g. "related work" before "related"; "future work" before "future").
KEYWORD_TO_CONTEXT: list[tuple[str, str]] = [
    ("state of the art", "related_work"),
    ("related work", "related_work"),
    ("prior work", "related_work"),
    ("future work", "discussion"),
    ("literature", "related_work"),
    ("background", "related_work"),
    ("review", "related_work"),
    ("related", "related_work"),
    ("sota", "related_work"),

    ("methodology", "methodology"),
    ("framework", "methodology"),
    ("algorithm", "methodology"),
    ("approach", "methodology"),
    ("proposed", "methodology"),
    ("method", "methodology"),
    ("design", "methodology"),
    ("model", "methodology"),

    ("comparison", "comparison"),
    ("benchmark", "comparison"),
    ("baseline", "comparison"),
    ("compared", "comparison"),
    ("versus", "comparison"),
    ("vs", "comparison"),

    ("evaluation", "results"),
    ("experiment", "results"),
    ("performance", "results"),
    ("results", "results"),
    ("finding", "results"),

    ("introduction", "introduction"),
    ("motivation", "introduction"),
    ("intro", "introduction"),

    ("discussion", "discussion"),
    ("limitation", "discussion"),
    ("implication", "discussion"),
    ("conclusion", "discussion"),
]

_SECTION_RE = re.compile(r"§\s*[\d.]+\s*(?:P\s*\d+)?", re.IGNORECASE)


def _split_theme(line: str) -> str:
    """Return the portion of the line after the '—' / '-' separator.

    Falls back to the whole line if no separator is present.
    """
    for sep in ("—", "–", " - "):
        if sep in line:
            return line.split(sep, 1)[1].strip()
    return line.strip()


def _section_marker(line: str) -> str | None:
    m = _SECTION_RE.search(line)
    return m.group(0).strip() if m else None


def detect_contexts(citations_map: str | None) -> dict:
    """Parse a citations_map and return contexts + per-line evidence.

    Returns:
        {
          "contexts": ["introduction", "methodology"],  # unique, in first-seen order
          "evidence": [
            {"line": "...", "section": "§2.1 P1", "theme": "...", "matched": "intro", "context": "introduction"},
            ...
          ],
        }
    """
    if not citations_map or not citations_map.strip():
        return {"contexts": [], "evidence": []}

    detected: list[str] = []
    evidence: list[dict] = []

    for raw_line in citations_map.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        section = _section_marker(line)
        theme = _split_theme(line)
        haystack = theme.lower() if theme else line.lower()

        matched_keyword: str | None = None
        matched_context: str | None = None
        for kw, ctx in KEYWORD_TO_CONTEXT:
            # Word-boundary match for short keywords; substring for multi-word
            if " " in kw:
                if kw in haystack:
                    matched_keyword, matched_context = kw, ctx
                    break
            else:
                if re.search(rf"\b{re.escape(kw)}\b", haystack):
                    matched_keyword, matched_context = kw, ctx
                    break

        if matched_context:
            if matched_context not in detected:
                detected.append(matched_context)
            evidence.append({
                "line": line,
                "section": section,
                "theme": theme,
                "matched": matched_keyword,
                "context": matched_context,
            })
        else:
            evidence.append({
                "line": line,
                "section": section,
                "theme": theme,
                "matched": None,
                "context": None,
            })

    return {"contexts": detected, "evidence": evidence}
