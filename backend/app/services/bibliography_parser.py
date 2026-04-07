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
