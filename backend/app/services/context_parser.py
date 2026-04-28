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
# Both English (matches Claude-authored section labels like "§3.1 Related Work")
# and Italian (matches free-text Italian descriptions in additional lines).
KEYWORD_TO_CONTEXT: list[tuple[str, str]] = [
    # related_work
    ("state of the art", "related_work"),
    ("stato dell'arte", "related_work"),
    ("lavori correlati", "related_work"),
    ("lavori precedenti", "related_work"),
    ("related work", "related_work"),
    ("prior work", "related_work"),
    ("rassegna sistematica", "related_work"),
    ("revisione sistematica", "related_work"),
    ("scoping review", "related_work"),
    ("literature", "related_work"),
    ("letteratura", "related_work"),
    ("background", "related_work"),
    ("rassegna", "related_work"),
    ("revisione", "related_work"),
    ("review", "related_work"),
    ("related", "related_work"),
    ("sota", "related_work"),

    # methodology
    ("methodology", "methodology"),
    ("metodologia", "methodology"),
    ("framework", "methodology"),
    ("algoritmo", "methodology"),
    ("algorithm", "methodology"),
    ("approccio", "methodology"),
    ("approach", "methodology"),
    ("proposed", "methodology"),
    ("proposto", "methodology"),
    ("metodo", "methodology"),
    ("method", "methodology"),
    ("design", "methodology"),
    ("modello", "methodology"),
    ("model", "methodology"),

    # comparison — note: "vs"/"versus" intentionally excluded.
    # In Italian "vs" is a generic separator and produces false positives.
    ("comparison", "comparison"),
    ("confronto", "comparison"),
    ("comparazione", "comparison"),
    ("paragone", "comparison"),
    ("benchmark", "comparison"),
    ("baseline", "comparison"),
    ("compared", "comparison"),
    ("a confronto", "comparison"),

    # results
    ("evaluation", "results"),
    ("valutazione", "results"),
    ("experiment", "results"),
    ("esperimento", "results"),
    ("esperimenti", "results"),
    ("performance", "results"),
    ("prestazioni", "results"),
    ("risultati", "results"),
    ("results", "results"),
    ("evidenze", "results"),
    ("finding", "results"),

    # introduction
    ("introduction", "introduction"),
    ("introduzione", "introduction"),
    ("motivation", "introduction"),
    ("motivazione", "introduction"),
    ("premessa", "introduction"),
    ("intro", "introduction"),

    # discussion
    ("future work", "discussion"),
    ("lavoro futuro", "discussion"),
    ("limitations", "discussion"),
    ("limitazioni", "discussion"),
    ("conclusioni", "discussion"),
    ("implicazioni", "discussion"),
    ("discussion", "discussion"),
    ("discussione", "discussion"),
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
        # Scan the full line so we don't miss section labels that appear
        # before the optional "—" separator (e.g. "§3.1 Related Work come …").
        haystack = line.lower()

        # Collect ALL contexts present on this line — a single line can mention
        # multiple sections (e.g. "§2.1 Background e §4.1 Framework"), and a
        # keyword from one context shouldn't suppress another.
        line_contexts: list[str] = []
        first_kw_for_ctx: dict[str, str] = {}
        for kw, ctx in KEYWORD_TO_CONTEXT:
            if ctx in line_contexts:
                continue  # already attributed for this line
            if " " in kw:
                if kw in haystack:
                    line_contexts.append(ctx)
                    first_kw_for_ctx[ctx] = kw
            else:
                if re.search(rf"\b{re.escape(kw)}\b", haystack):
                    line_contexts.append(ctx)
                    first_kw_for_ctx[ctx] = kw

        if line_contexts:
            for ctx in line_contexts:
                if ctx not in detected:
                    detected.append(ctx)
                evidence.append({
                    "line": line,
                    "section": section,
                    "theme": theme,
                    "matched": first_kw_for_ctx[ctx],
                    "context": ctx,
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
