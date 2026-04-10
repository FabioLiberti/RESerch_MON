"""Extract keywords/index terms from PDF text."""

import re
import logging

logger = logging.getLogger(__name__)

# Unicode-aware whitespace class (includes \u2002, \u2003, \xa0, etc.)
_S = r'[\s\u2002\u2003\u00a0\x07]'
# Terminators: blank line, section headings (I., II., 1, 1., 2, INTRODUCTION, Abstract, etc.)
_TERM = rf'(?:\.\n[A-Z]|\n{_S}*\n|\n{_S}*(?:A\s+B\s+S\s+T\s+R\s+A\s+C\s+T|[IVX]+\.?{_S}+\S|\d+\.?{_S}+\S|INTRODUCTION|ABSTRACT|Background|Methods|Results|Discussion|Conclusion|References|Copyright|©|\u00a9|\*{_S}*\S))'

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
            # Remove trailing period
            raw = raw.rstrip('.')

            # Detect if keywords are one-per-line (no inline separator on first non-empty line)
            lines = [l.strip() for l in raw.split('\n') if l.strip()]
            has_inline_sep = any(re.search(r'[,;·\u00b7\u2022]', line) for line in lines[:3])

            if not has_inline_sep and len(lines) > 1:
                # One keyword per line
                keywords = lines
            else:
                # Inline separators: collapse newlines, split by , ; · etc.
                clean = re.sub(r'\s+', ' ', raw)
                keywords = re.split(r'[,;·\u00b7\u2022]', clean)
                keywords = [kw.strip() for kw in keywords if kw.strip()]

            # Clean each keyword
            keywords = [kw.strip().strip('·•–—.,;:') for kw in keywords if kw.strip()]
            # Filter: reasonable length (allow long technical terms with parentheses/acronyms)
            def _is_valid_kw(kw: str) -> bool:
                if not (2 < len(kw) < 120):
                    return False
                if kw.count(' ') > 10:
                    return False
                # Exclude spaced-out section headers like "A B S T R A C T"
                if re.match(r'^([A-Z]\s){3,}', kw):
                    return False
                return True
            keywords = [kw for kw in keywords if _is_valid_kw(kw)]
            # Stop at first item that contains "A B S T R A C T" (section break)
            for i, kw in enumerate(keywords):
                if re.search(r'A\s+B\s+S\s+T\s+R\s+A\s+C\s+T', kw):
                    keywords = keywords[:i]
                    break

            if keywords:
                pattern_str = pattern.pattern.lower()
                if 'index' in pattern_str:
                    cat_name = "Index Terms"
                elif 'subject' in pattern_str:
                    cat_name = "Subject Terms"
                else:
                    cat_name = "Author Keywords"

                result[cat_name] = keywords
                logger.info(f"Extracted {len(keywords)} {cat_name} from PDF")
                break

    return result
