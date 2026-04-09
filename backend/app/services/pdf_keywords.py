"""Extract keywords/index terms from PDF text."""

import re
import logging

logger = logging.getLogger(__name__)

# Unicode-aware whitespace class (includes \u2002, \u2003, \xa0, etc.)
_S = r'[\s\u2002\u2003\u00a0\x07]'
# Terminators: blank line, section headings (I., II., 1, 1., 2, INTRODUCTION, Abstract, etc.)
_TERM = rf'(?:\.\n[A-Z]|\n{_S}*\n|\n{_S}*(?:[IVX]+\.?{_S}+\S|\d+\.?{_S}+\S|INTRODUCTION|ABSTRACT|Copyright|©|\u00a9|\*{_S}*\S))'

# Patterns for keyword sections in papers
KEYWORD_PATTERNS = [
    # "Keywords: word1, word2, word3" or "Keywords  word1 · word2 · word3"
    re.compile(r'(?:Keywords|Key\s*words|KEYWORDS|KEY\s*WORDS)\s*[:\-—\s]\s*(.+?)' + _TERM, re.DOTALL | re.IGNORECASE),
    # "Index Terms—word1, word2, word3"
    re.compile(r'(?:Index\s+Terms|INDEX\s+TERMS)\s*[:\-—]\s*(.+?)' + _TERM, re.DOTALL | re.IGNORECASE),
    # "Subject terms: word1; word2; word3"
    re.compile(r'(?:Subject\s+terms)\s*[:\-—]\s*(.+?)' + _TERM, re.DOTALL | re.IGNORECASE),
]


def extract_keywords_from_pdf(pdf_path: str) -> dict[str, list[str]]:
    """Extract keywords from a PDF file.

    Returns dict like {"Author Keywords": [...], "Index Terms": [...]}.
    Empty dict if no keywords found.
    """
    try:
        import fitz
        doc = fitz.open(pdf_path)

        # Extract text from first 3 pages (keywords are usually in first 1-2 pages)
        text = ""
        for i, page in enumerate(doc):
            if i >= 3:
                break
            text += page.get_text() + "\n"
        doc.close()

    except Exception as e:
        logger.warning(f"PDF extraction failed for keyword search: {e}")
        return {}

    if not text:
        return {}

    result: dict[str, list[str]] = {}

    for pattern in KEYWORD_PATTERNS:
        match = pattern.search(text)
        if match:
            raw = match.group(1).strip()
            # Clean up: remove newlines, extra spaces
            raw = re.sub(r'\s+', ' ', raw)
            # Remove trailing period
            raw = raw.rstrip('.')

            # Split by comma, semicolon, middle dot, or em-dash
            keywords = re.split(r'[,;·\u00b7\u2022]', raw)
            keywords = [kw.strip().strip('·•–—') for kw in keywords if kw.strip()]

            # Filter out very short or very long items (likely parsing errors)
            keywords = [kw for kw in keywords if 2 < len(kw) < 80]

            if keywords:
                # Determine category name based on which pattern matched
                pattern_str = pattern.pattern.lower()
                if 'index' in pattern_str:
                    cat_name = "Index Terms"
                elif 'subject' in pattern_str:
                    cat_name = "Subject Terms"
                else:
                    cat_name = "Author Keywords"

                result[cat_name] = keywords
                logger.info(f"Extracted {len(keywords)} {cat_name} from PDF")
                break  # Use first match

    return result
