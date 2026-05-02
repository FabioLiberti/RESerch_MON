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


# Two-tier boundary detection. Strong markers (venue, publisher, page span,
# arXiv) are unambiguous. The year alone is weaker because it sometimes
# appears INSIDE a title (e.g. "The 2024 Ageing Report") — we use it only
# as a fallback when no strong marker is present after the authors.
_VENUE_BOUNDARY_STRONG_RE = re.compile(
    r'('
        r'\bin\s+Proc(?:\.|eedings)?\b'                # "in Proceedings"
        r'|\bin\s+\d{4}\s+IEEE\b'                       # "in 2024 IEEE Conf"
        r'|\b(?:vol|no|pp?)\.\s*[\dA-Za-z]'             # "vol. 6", "no. 11", "pp. 1-31"
        r'|\bart\.\s*[\de]'                              # "art. 119" / "art. e0000033"
        r'|\barXiv\b'                                    # arXiv preprint
        r'|\[Online\]'                                   # online resource marker
        r'|(?:Geneva|Paris|London|Luxembourg|Berlin|Rome|Roma|Brussels|Bruxelles|Washington|Cambridge|Oxford|New\s+York):'  # "Geneva:" publisher city
        r'|IEEE\s+Trans(?:actions)?'                    # "IEEE Transactions on..."
        r'|\bDecree\s+\d'                                # legal decree (with number)
        r'|\bRegulation\s*\(EU\)'                        # EU regulation marker
        r'|\bDirective\s+\d'                             # EU directive
        r'|\bInstitutional\s+Paper\b'                    # EU institutional papers
        r'|\bTechnical\s+Report\b'                       # generic tech report
        r'|\bStatistical\s+Report\b'                     # statistical report
        r'|\bWorking\s+Paper\b'                          # working paper
    r')',
    re.IGNORECASE,
)
_VENUE_BOUNDARY_YEAR_RE = re.compile(r'\b(?:19|20)\d{2}\b')


# ---------- EU institutional document detection ----------
# These regexes catch the canonical citation formats used by EUR-Lex for
# Regulations, Directives and Decisions, in both modern (post-Lisbon) and
# legacy (EC/EEC) styles. The year may appear before or after the number.

# Modern: "Regulation (EU) 2025/327" or "Regulation (EU) 2016/679"
# Legacy: "Regulation (EC) No 765/2008" / "Regulation (EEC) No 1612/68"
_EU_REGULATION_RE = re.compile(
    r'\bRegulation\s*\((?:EU|EC|EEC)\)\s*(?:No\s*)?'
    r'(?:(\d{4})/(\d{1,4})|(\d{1,4})/(\d{2,4}))',
    re.IGNORECASE,
)
# Modern: "Directive (EU) 2016/680"
# Legacy: "Directive 2011/24/EU" / "Directive 95/46/EC" / "Directive 2009/138/EC"
_EU_DIRECTIVE_RE = re.compile(
    r'\bDirective\s*'
    r'(?:\((?:EU|EC|EEC)\)\s*(\d{4})/(\d{1,4})'      # (EU) YYYY/NN
    r'|(\d{2,4})/(\d{1,4})/(?:EU|EC|EEC))',           # YYYY/NN/EU
    re.IGNORECASE,
)
# Modern: "Decision (EU) 2024/2847"
# Legacy: "Decision No 1082/2013/EU"
_EU_DECISION_RE = re.compile(
    r'\bDecision\s*'
    r'(?:\((?:EU|EC|EEC)\)\s*(?:No\s*)?(\d{4})/(\d{1,4})'   # (EU) YYYY/NN
    r'|No\s*(\d{1,4})/(\d{2,4})/(?:EU|EC|EEC))',             # No NNN/YYYY/EU
    re.IGNORECASE,
)

# "of 11 February 2025" — full date inside the title (typical EU citation form).
_EU_DATE_RE = re.compile(
    r'\bof\s+(\d{1,2})\s+'
    r'(January|February|March|April|May|June|July|August|September|October|November|December)'
    r'\s+(\d{4})\b',
    re.IGNORECASE,
)
_MONTH_TO_NUM = {m.lower(): i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June",
     "July", "August", "September", "October", "November", "December"], start=1)}


def _normalize_two_digit_year(y: int) -> int:
    """Convert legacy 2-digit EU years to 4-digit. 95 -> 1995, 04 -> 2004."""
    if y >= 100:
        return y
    return 1900 + y if y >= 50 else 2000 + y


def _build_celex(year: int, sector_letter: str, number: int) -> str:
    """Construct a CELEX identifier for an EU legislative act.

    Format: 3 + YYYY + sector + NNNN
    Examples:
      Regulation (EU) 2025/327  -> 32025R0327
      Directive 2011/24/EU      -> 32011L0024
      Decision (EU) 2024/2847   -> 32024D2847
    """
    return f"3{year:04d}{sector_letter}{number:04d}"


def detect_eu_document(title: str) -> dict:
    """Detect EU legislative document type, CELEX id and publication date.

    Inspects the title for canonical EUR-Lex citation patterns and, if
    matched, returns a dict with:
      ``paper_type``  — one of ``regulation`` / ``directive`` / ``decision``
      ``celex``       — CELEX identifier (e.g. "32025R0327"), or None
      ``publication_date`` — ISO date "YYYY-MM-DD" extracted from "of D Month YYYY", or None

    Returns ``{}`` when the title doesn't look like an EU legislative act.
    Detection is conservative: only acts with a year + number are matched.
    """
    if not title:
        return {}

    out: dict = {}

    def _pick_year_number(m: re.Match, sector_letter: str) -> tuple[int, int] | None:
        """Pick (year, number) from a regex with two alternative capture pairs."""
        groups = m.groups()
        # First pair: (year, number) modern style; second pair: (number, year) or (year, number) legacy
        # We try both interpretations and pick the one with a plausible year (1950-2099).
        candidates = []
        for i in range(0, len(groups), 2):
            a, b = groups[i], groups[i + 1] if i + 1 < len(groups) else None
            if a and b:
                ai, bi = int(a), int(b)
                # Heuristic: which is the year?
                # Modern format always has year first (4 digits, >=2000 typically).
                # Legacy may have number first then 2- or 4-digit year.
                if 1950 <= ai <= 2099 and bi <= 9999:
                    candidates.append((ai, bi))
                elif 1950 <= bi <= 2099 and ai <= 9999:
                    candidates.append((bi, ai))
                elif ai <= 99:  # 2-digit legacy year for "NN/YY" e.g. "1612/68"
                    candidates.append((_normalize_two_digit_year(bi), ai))
                elif bi <= 99:
                    candidates.append((_normalize_two_digit_year(ai), bi))
        return candidates[0] if candidates else None

    m = _EU_REGULATION_RE.search(title)
    if m:
        yn = _pick_year_number(m, "R")
        if yn:
            year, number = yn
            out["paper_type"] = "regulation"
            out["celex"] = _build_celex(year, "R", number)
    elif _EU_DIRECTIVE_RE.search(title):
        m2 = _EU_DIRECTIVE_RE.search(title)
        yn = _pick_year_number(m2, "L")
        if yn:
            year, number = yn
            out["paper_type"] = "directive"
            out["celex"] = _build_celex(year, "L", number)
    elif _EU_DECISION_RE.search(title):
        m3 = _EU_DECISION_RE.search(title)
        yn = _pick_year_number(m3, "D")
        if yn:
            year, number = yn
            out["paper_type"] = "decision"
            out["celex"] = _build_celex(year, "D", number)

    # Full publication date — independent of the document type detection
    dm = _EU_DATE_RE.search(title)
    if dm:
        try:
            day = int(dm.group(1))
            month = _MONTH_TO_NUM.get(dm.group(2).lower())
            year = int(dm.group(3))
            if month and 1 <= day <= 31 and 1950 <= year <= 2099:
                out["publication_date"] = f"{year:04d}-{month:02d}-{day:02d}"
        except (ValueError, AttributeError):
            pass

    return out


def _extract_unquoted_title(text: str) -> str | None:
    """Heuristic extractor for titles that aren't enclosed in quotation marks.

    Strips a leading "[N]" marker if present, skips the authors segment
    (everything up to the first comma after a typical author token), then
    returns the substring up to the first venue/year/publisher boundary.

    Returns None if no plausible title is recovered.
    """
    # Strip optional leading "[N] " (split_references usually drops it but be safe)
    work = re.sub(r'^\s*\[\d+\]\s*', '', text)

    # Find author-list end. Heuristic priority:
    #   1. "et al.," — definitive author-list terminator in IEEE/APA style
    #   2. First comma in the work — gov / single-author / institutional refs
    #      where the prefix is "ORG, Title..." or "First Last, Title..."
    # The "first comma" works because for academic multi-author papers the
    # quoted-title path catches it earlier and we never enter this fallback.
    author_end = None
    m_etal = re.search(r'\bet\s+al\.?,', work)
    if m_etal:
        author_end = m_etal.end()
    else:
        first_comma = work.find(',')
        if first_comma != -1:
            author_end = first_comma + 1

    if author_end is None:
        return None

    after_authors = work[author_end:].strip()
    if not after_authors:
        return None

    # Two-tier boundary search: strong marker first (venue/publisher/etc.),
    # year only as last-ditch fallback to avoid cutting titles like
    # "The 2024 Ageing Report" where the year is part of the title itself.
    bm_strong = _VENUE_BOUNDARY_STRONG_RE.search(after_authors)
    if bm_strong:
        candidate = after_authors[:bm_strong.start()].strip()
    else:
        bm_year = _VENUE_BOUNDARY_YEAR_RE.search(after_authors)
        if bm_year:
            candidate = after_authors[:bm_year.start()].strip()
        else:
            # No boundary — take up to first "period + space" (sentence end)
            period_match = re.search(r'\.\s+', after_authors)
            candidate = after_authors[:period_match.start()].strip() if period_match else after_authors.strip()

    # Cleanup: strip trailing punctuation, collapse whitespace
    candidate = re.sub(r'[\s.,;:]+$', '', candidate).strip()

    # Sanity bounds: a real title is typically 10-220 chars and contains letters
    if not (10 <= len(candidate) <= 220):
        return None
    if not any(c.isalpha() for c in candidate):
        return None
    return candidate


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

    # Fallback: title without quotes (common for books, gov reports, EU docs).
    # Heuristic: skip the leading authors/affiliation segment, then take text
    # up to the first venue / year / publisher / page-number marker.
    # Example that this recovers:
    #   "WHO and UN-Habitat, Health at the Heart of Urban and Territorial
    #    Planning. Geneva: WHO, 2021."
    # → title = "Health at the Heart of Urban and Territorial Planning"
    if not title:
        title = _extract_unquoted_title(text)

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

    # EU institutional document detection (regulation/directive/decision + CELEX + full date)
    eu = detect_eu_document(title) if title else {}

    return {
        "raw": raw,
        "title": title,
        "doi": doi,
        "arxiv": arxiv,
        "year": year,
        "first_author": first_author,
        "paper_type": eu.get("paper_type"),
        "celex": eu.get("celex"),
        "publication_date": eu.get("publication_date"),
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
