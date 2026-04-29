"""Extract DOIs and titles from bibliography text in any format."""

import re


# DOI regex: matches 10.XXXX/anything-until-whitespace-or-punctuation-end
DOI_PATTERN = re.compile(
    r'(10\.\d{4,}/[^\s,;}\]>)]+[^\s,;}\]>.)])',
    re.IGNORECASE,
)

# Clean trailing punctuation that may be captured
TRAILING_PUNCT = re.compile(r'[.,;:)\]]+$')

# Title patterns — matches text between quotes near a DOI
TITLE_IN_QUOTES = re.compile(r"['\u2018\u2019\u201C\u201D\"](.*?)['\u2018\u2019\u201C\u201D\"]")


def extract_dois(text: str) -> list[str]:
    """Extract unique DOIs from bibliography text.

    Handles Harvard, APA, Vancouver, BibTeX, and plain URL formats.
    Returns deduplicated list preserving order.
    """
    # Pre-process: join DOIs split across lines
    # Case 1: split at hyphen (e.g. "10.1108/JBS-11-\n2021-0182")
    text = re.sub(r'(10\.\d{4,}/\S+)-\s*\n\s*(\S+)', r'\1-\2', text)
    # Case 2: split after dot or slash (e.g. "https://doi.org/10.\n1007/s00146")
    text = re.sub(r'(10\.)\s*\n\s*(\d{4,}/)', r'\1\2', text)
    # Case 3: split in URL (e.g. "https:\n//doi.org/...")
    text = re.sub(r'https:\s*\n\s*//', 'https://', text)

    raw_matches = DOI_PATTERN.findall(text)

    seen = set()
    dois = []
    for doi in raw_matches:
        # Clean trailing punctuation
        doi = TRAILING_PUNCT.sub('', doi)
        # Remove URL prefix if present
        for prefix in ['https://doi.org/', 'http://doi.org/', 'doi:']:
            if doi.lower().startswith(prefix.lower()):
                doi = doi[len(prefix):]
        # Normalize
        doi_lower = doi.lower()
        if doi_lower not in seen:
            seen.add(doi_lower)
            dois.append(doi)

    return dois


def extract_dois_with_titles(text: str) -> list[dict]:
    """Extract DOIs with associated titles from bibliography text.

    Returns list of {"doi": str, "title": str | None}.
    Tries to find the title in quotes closest to each DOI.
    """
    dois = extract_dois(text)
    results = []

    for doi in dois:
        title = _find_title_for_doi(text, doi)
        results.append({"doi": doi, "title": title})

    return results


# ---------- Reference splitter + per-reference parser ----------
# Used by the manuscript bibliography import flow when the user pastes the
# whole "References" section of a paper. Each reference is then independently
# resolved (by DOI / arXiv / title) against Semantic Scholar and linked to
# the target manuscript via a PaperReference row.

# Bracketed numbering [1], [2], ... at the start of a line/paragraph.
_REF_BRACKET_RE = re.compile(r'(?:^|\n)\s*\[(\d+)\]\s*', re.MULTILINE)
# Plain numbered list "1. ", "2. ", ...
_REF_NUMBERED_RE = re.compile(r'(?:^|\n)\s*(\d{1,3})\.\s+(?=[A-ZĀ-ſ])', re.MULTILINE)
# arXiv ID — supports both new (1234.56789) and legacy (cs.LG/9999999) formats
_ARXIV_RE = re.compile(
    r'arXiv\s*:?\s*([0-9]{4}\.[0-9]{4,5}(?:v\d+)?|[a-z\-]+(?:\.[A-Z]{2})?/\d{7})',
    re.IGNORECASE,
)
# Title in straight or curly quotes
_TITLE_QUOTED_RE = re.compile(r'["“‟]([^"“”‟]+?)["”‟]')
# 4-digit year (1900-2099)
_YEAR_RE = re.compile(r'\b(19|20)\d{2}\b')


def split_references(text: str) -> list[str]:
    """Split a bibliography blob into individual reference entries.

    Recognises three layouts:
    1. IEEE-style "[1] ... [2] ... [3] ..."
    2. Numbered list "1. ... 2. ..." (must start with capital letter to avoid
       false splits on "vol. 36, no. 11" etc.)
    3. Blank-line separated paragraphs (fallback)

    Returns the raw text of each entry (whitespace-collapsed, no leading number).
    """
    text = (text or "").strip()
    if not text:
        return []

    # 1. Bracketed [N]
    parts = _REF_BRACKET_RE.split(text)
    if len(parts) >= 3:  # at least one [N] match
        refs: list[str] = []
        # parts: [preamble, "1", ref1, "2", ref2, ...]
        for i in range(2, len(parts), 2):
            ref = re.sub(r'\s+', ' ', parts[i]).strip()
            if ref:
                refs.append(ref)
        if refs:
            return refs

    # 2. Numbered list "1. "
    parts = _REF_NUMBERED_RE.split(text)
    if len(parts) >= 3:
        refs = []
        for i in range(2, len(parts), 2):
            ref = re.sub(r'\s+', ' ', parts[i]).strip()
            if ref:
                refs.append(ref)
        if refs:
            return refs

    # 3. Blank-line separated
    refs = [re.sub(r'\s+', ' ', p).strip() for p in re.split(r'\n\s*\n', text)]
    return [r for r in refs if r]


def parse_reference(text: str) -> dict:
    """Extract structured fields from a single reference entry.

    Returns a dict with: ``raw``, ``title``, ``doi``, ``arxiv``, ``year``,
    ``first_author``. All fields except ``raw`` may be None.
    """
    raw = text
    text = re.sub(r'\s+', ' ', text).strip()

    # Title — first occurrence between matching quotation marks
    title: str | None = None
    m = _TITLE_QUOTED_RE.search(text)
    if m:
        title = m.group(1).strip().rstrip(',').rstrip('.').strip()
        # Reject obvious noise (e.g. one-word "quoted" venue names)
        if len(title) < 6:
            title = None

    # DOI (reuse existing extractor)
    doi_list = extract_dois(text)
    doi = doi_list[0] if doi_list else None

    # arXiv
    arxiv: str | None = None
    am = _ARXIV_RE.search(text)
    if am:
        arxiv = am.group(1)

    # Year — pick the LAST 4-digit year in the text (publication year is
    # typically near the end of the reference string; the first one might be
    # part of an arXiv id like 2010.01264, an issue number, or a page span).
    year: int | None = None
    # Strip arXiv id portion before scanning so its leading 4 digits don't
    # masquerade as a publication year.
    text_no_arxiv = _ARXIV_RE.sub("", text) if arxiv else text
    year_matches = _YEAR_RE.findall(text_no_arxiv)
    if year_matches:
        try:
            # findall returns the captured group 1 (the prefix), reconstruct full year by re-finding
            full_years = [int(m.group(0)) for m in _YEAR_RE.finditer(text_no_arxiv)]
            if full_years:
                year = full_years[-1]
        except ValueError:
            year = None

    # First author — naive: take text up to the first comma; strip leading
    # initials/dots and trailing "and" tokens.
    first_author: str | None = None
    head = text.split(',')[0].strip() if text else ""
    if 1 < len(head) < 80:
        first_author = head

    return {
        "raw": raw,
        "title": title,
        "doi": doi,
        "arxiv": arxiv,
        "year": year,
        "first_author": first_author,
    }


def _find_title_for_doi(text: str, doi: str) -> str | None:
    """Find the title associated with a DOI in the bibliography text."""
    # Find the DOI position in text
    doi_pos = text.find(doi)
    if doi_pos == -1:
        # Try with URL prefix
        for prefix in ['https://doi.org/', 'http://doi.org/']:
            pos = text.find(prefix + doi)
            if pos != -1:
                doi_pos = pos
                break

    if doi_pos == -1:
        return None

    # Take up to 600 chars before the DOI
    start = max(0, doi_pos - 600)
    context = text[start:doi_pos]

    # Try to isolate the current entry by finding the last double-newline or
    # the last line starting with an author surname pattern (e.g. "\nSmith, J.")
    # Use a relaxed split — last paragraph break
    para_breaks = [m.start() for m in re.finditer(r'\n\s*\n', context)]
    if para_breaks:
        context = context[para_breaks[-1]:]

    # Try to find title in quotes (Harvard/APA style): 'Title Here' or "Title Here"
    quotes = TITLE_IN_QUOTES.findall(context)
    if quotes:
        # Take the first substantial match
        for q in quotes:
            title = q.strip()
            if len(title) > 10:
                return title

    # Fallback: look for text after year pattern like (2024) Title..., or (2024) 'Title...'
    year_match = re.search(
        r'\(\d{4}[a-z]?\)\s*[\'"]?(.+?)[\'"]?\s*(?:,\s*[A-Z]|\.\s+Available|\.\s*$|,\s+in\s+)',
        context,
        re.DOTALL,
    )
    if year_match:
        title = year_match.group(1).strip().strip("'\"").replace('\n', ' ')
        # Clean multi-line titles
        title = re.sub(r'\s+', ' ', title)
        if len(title) > 10:
            return title

    return None
