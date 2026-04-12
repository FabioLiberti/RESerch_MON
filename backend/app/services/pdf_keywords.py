"""Extract keywords/index terms from PDF text."""

import re
import logging

logger = logging.getLogger(__name__)

# Unicode-aware whitespace class (includes \u2002, \u2003, \xa0, etc.)
_S = r'[\s\u2002\u2003\u00a0\x07]'
# Terminators: blank line, section headings, metadata lines
# (Received:/Revised:/Accepted:/DOI:/©/This is an open access ... are common after
# the keyword line in many journal templates — Wiley, Elsevier, etc.)
_TERM = (
    rf'(?:'
    rf'\.\n[A-Z]|'
    rf'\n{_S}*\n|'
    rf'\n{_S}*(?:'
        rf'A\s+B\s+S\s+T\s+R\s+A\s+C\s+T|'
        rf'[IVX]+\.?{_S}+\S|'
        rf'\d+\.?{_S}+\S|'
        rf'INTRODUCTION|ABSTRACT|'
        rf'Background|Methods|Results|Discussion|Conclusion|References|'
        rf'Received{_S}*:|Revised{_S}*:|Accepted{_S}*:|'
        rf'DOI{_S}*:|https?://|www\.|'
        rf'This\s+is\s+an\s+open\s+access|'
        rf'Copyright|©|\u00a9|'
        rf'\*{_S}*\S'
    rf'))'
)

# Pattern families for keyword sections.
#
# We try two strategies in order:
#
#   1. SINGLE-LINE pattern: the header sits on one line and the keywords sit
#      on the SAME line or on ONE following line, stopping at the first real
#      newline. This is the format used by most modern journals (Elsevier,
#      Springer, BMC, PLOS, MDPI):
#          "Keywords: word1, word2, word3\n"
#          "K E Y W O R D S\nword1, word2, word3\n"
#
#   2. BLOCK pattern: the keywords span multiple lines, typically IEEE style
#      where each keyword sits on its own line. We use a semantic terminator
#      (_TERM) to know where the block ends.
#
# The single-line pattern runs FIRST. If it catches something, we don't run the
# block pattern for the same header — this prevents the greedy multi-line regex
# from eating page titles and author lines after the real keyword line.

_HEADER_KEYWORDS = (
    r'(?:K\s*E\s*Y\s*W\s*O\s*R\s*D\s*S'       # spaced-out K E Y W O R D S
    r'|Keywords|Key\s*words|KEY\s*WORDS)'
)
_HEADER_INDEX = (
    r'(?:I\s*N\s*D\s*E\s*X\s+T\s*E\s*R\s*M\s*S'
    r'|Index\s+Terms|INDEX\s+TERMS)'
)
_HEADER_SUBJECT = r'(?:Subject\s+terms)'

# IMPORTANT: the header must start at the beginning of a line, otherwise we
# risk matching any mid-sentence mention of "keywords" (e.g. a figure caption
# saying 'we used the keywords "foo" and "bar" to search PubMed').
# A real Keywords/Index Terms section always starts on its own line.
#
# We use (?:^|\n) as a boundary — Python's re default ^ only matches at the
# very start of the string, but we also accept a preceding newline to match
# the start of any line in the middle of the extracted text.

_LINE_START = r'(?:^|\n)'

# Single-line patterns: capture up to the first \n after the header+separator.
# The separator tolerates :, -, —, or any whitespace (including unicode spaces).
SINGLE_LINE_PATTERNS = [
    ("Author Keywords", re.compile(
        _LINE_START + r'[\s\u2002\u2003\u00a0]*' + _HEADER_KEYWORDS
        + r'[\s\u2002\u2003\u00a0:\-—]+([^\n]+)',
        re.IGNORECASE,
    )),
    ("Index Terms", re.compile(
        _LINE_START + r'[\s\u2002\u2003\u00a0]*' + _HEADER_INDEX
        + r'[\s\u2002\u2003\u00a0:\-—]+([^\n]+)',
        re.IGNORECASE,
    )),
    ("Subject Terms", re.compile(
        _LINE_START + r'[\s\u2002\u2003\u00a0]*' + _HEADER_SUBJECT
        + r'[\s\u2002\u2003\u00a0:\-—]+([^\n]+)',
        re.IGNORECASE,
    )),
]

# Block patterns: greedy DOTALL capture until a semantic terminator.
# Used only as fallback when the single-line pattern did not find enough
# content (e.g. when each keyword sits on its own line).
BLOCK_PATTERNS = [
    ("Author Keywords", re.compile(
        _LINE_START + r'[\s\u2002\u2003\u00a0]*' + _HEADER_KEYWORDS
        + r'\s*[:\-—\s]\s*(.+?)' + _TERM,
        re.DOTALL | re.IGNORECASE,
    )),
    ("Index Terms", re.compile(
        _LINE_START + r'[\s\u2002\u2003\u00a0]*' + _HEADER_INDEX
        + r'\s*[:\-—]\s*(.+?)' + _TERM,
        re.DOTALL | re.IGNORECASE,
    )),
    ("Subject Terms", re.compile(
        _LINE_START + r'[\s\u2002\u2003\u00a0]*' + _HEADER_SUBJECT
        + r'\s*[:\-—]\s*(.+?)' + _TERM,
        re.DOTALL | re.IGNORECASE,
    )),
]


def extract_keywords_from_pdf(pdf_path: str) -> dict[str, list[str]]:
    """Extract keywords from a PDF file.

    Returns dict like {"Author Keywords": [...], "Index Terms": [...]}.
    Empty dict if no keywords found.
    """
    try:
        import fitz
        doc = fitz.open(pdf_path)

        # First pass: scan the first 5 pages (keywords are usually near the
        # abstract in the opening pages). If nothing matches we'll fall back
        # to scanning the whole document.
        text_early = ""
        text_all = ""
        for i, page in enumerate(doc):
            t = page.get_text() + "\n"
            text_all += t
            if i < 5:
                text_early += t
        doc.close()

    except Exception as e:
        logger.warning(f"PDF extraction failed for keyword search: {e}")
        return {}

    if not text_early and not text_all:
        return {}

    # Dehyphenate line-wraps: "feder-\nated learning" → "federated learning".
    # This is the standard PDF-to-text artifact when a word is broken across
    # two lines. Only join when the letter before '-' is lowercase (to avoid
    # collapsing intentional hyphens like "Cross-\nValidation" becoming
    # "CrossValidation"). We keep the "-" when the next char is uppercase.
    def _dehyphenate(txt: str) -> str:
        return re.sub(r'([a-z])-\n([a-z])', r'\1\2', txt)

    text_early = _dehyphenate(text_early)
    text_all = _dehyphenate(text_all)

    def _clean_and_split(raw: str, force_single_line: bool) -> list[str]:
        """Parse a raw captured block into a clean list of keywords."""
        raw = raw.strip().rstrip('.')
        if force_single_line:
            # Single-line capture: everything is on one line, separator is inline
            clean = re.sub(r'\s+', ' ', raw)
            keywords = re.split(r'[,;·\u00b7\u2022]', clean)
        else:
            # Block capture: could be one-per-line or inline
            lines = [l.strip() for l in raw.split('\n') if l.strip()]
            has_inline_sep = any(re.search(r'[,;·\u00b7\u2022]', line) for line in lines[:3])
            if not has_inline_sep and len(lines) > 1:
                keywords = lines
            else:
                clean = re.sub(r'\s+', ' ', raw)
                keywords = re.split(r'[,;·\u00b7\u2022]', clean)
        # Normalise each keyword
        keywords = [kw.strip().strip('·•–—.,;:') for kw in keywords if kw.strip()]

        def _is_valid_kw(kw: str) -> bool:
            if not (2 < len(kw) < 120):
                return False
            if kw.count(' ') > 10:
                return False
            # Exclude spaced-out section headers like "A B S T R A C T"
            if re.match(r'^([A-Z]\s){3,}', kw):
                return False
            # Heuristic: looks like an author name — contains a digit (affiliation
            # marker like "Name1" or "Name2"), or starts with "and " (e.g.
            # "Corry Ketelaars1 and Ian Leistikow1"). Author keywords never
            # look like that.
            if re.search(r'\d', kw):
                return False
            if kw.lower().startswith("and "):
                return False
            return True
        keywords = [kw for kw in keywords if _is_valid_kw(kw)]
        # Stop at first item that looks like a section-break heading
        for i, kw in enumerate(keywords):
            if re.search(r'A\s+B\s+S\s+T\s+R\s+A\s+C\s+T', kw):
                keywords = keywords[:i]
                break
        return keywords

    result: dict[str, list[str]] = {}

    # Try the early-pages text first; fall back to the whole document if no
    # pattern matches there (useful for papers where the keyword section lives
    # past page 5, or where the text extraction order is unusual).
    text = text_early
    any_match_early = any(p.search(text_early) for _, p in SINGLE_LINE_PATTERNS) or \
                      any(p.search(text_early) for _, p in BLOCK_PATTERNS)
    if not any_match_early:
        text = text_all

    # STRATEGY 1 — single-line capture (stops at the first \n).
    # This matches the vast majority of modern journals where the keyword
    # section is a one-liner: "Keywords: kw1, kw2, kw3\n".
    seen_categories: set[str] = set()
    for cat_name, pattern in SINGLE_LINE_PATTERNS:
        if cat_name in seen_categories:
            continue
        match = pattern.search(text)
        if match:
            keywords = _clean_and_split(match.group(1), force_single_line=True)
            if keywords:
                result[cat_name] = keywords
                seen_categories.add(cat_name)
                logger.info(f"Extracted {len(keywords)} {cat_name} from PDF (single-line)")

    # STRATEGY 2 — block capture (multi-line with semantic terminator).
    # Run for ALL categories: if the block pattern finds MORE keywords than the
    # single-line pattern did, the block result wins. This handles journals where
    # keywords wrap across multiple lines (e.g. Frontiers, some Elsevier) — the
    # single-line capture stops at the first newline and truncates the list, while
    # the block capture correctly reads until the next section heading.
    for cat_name, pattern in BLOCK_PATTERNS:
        match = pattern.search(text)
        if match:
            keywords = _clean_and_split(match.group(1), force_single_line=False)
            if keywords:
                existing = result.get(cat_name, [])
                if len(keywords) > len(existing):
                    if existing:
                        logger.info(
                            f"Block pattern found {len(keywords)} {cat_name} "
                            f"(upgrading from {len(existing)} single-line)"
                        )
                    else:
                        logger.info(f"Extracted {len(keywords)} {cat_name} from PDF (block)")
                    result[cat_name] = keywords
                    seen_categories.add(cat_name)

    return result
