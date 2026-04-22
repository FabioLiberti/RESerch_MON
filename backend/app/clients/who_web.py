"""WHO public website metadata scraper (www.who.int).

Not all WHO publications are in IRIS (the institutional repository).
Many live on the public WHO website at URLs like:
    https://www.who.int/europe/publications/i/item/WHO-EURO-2026-12707-52481-81471

These pages include Google Scholar citation meta tags (citation_title,
citation_author, citation_publication_date, citation_pdf_url) and Open Graph
tags (og:title, og:description). We extract these to auto-fill the
"Add External Document" form.
"""

import json
import logging
import re
from html.parser import HTMLParser

from app.clients.base import BaseAPIClient, RawPaperResult

logger = logging.getLogger(__name__)

WHO_HOST_RE = re.compile(r"^https?://(www\.)?who\.int/", re.IGNORECASE)

# Which regional office is referenced in the URL path
REGION_FROM_URL = {
    "/europe/": "WHO Regional Office for Europe",
    "/americas/": "WHO Regional Office for the Americas",
    "/africa/": "WHO Regional Office for Africa",
    "/southeastasia/": "WHO Regional Office for South-East Asia",
    "/westernpacific/": "WHO Regional Office for the Western Pacific",
    "/emro/": "WHO Regional Office for the Eastern Mediterranean",
}


class _MetaTagParser(HTMLParser):
    """Collect <meta name=... content=...>, <meta property=... content=...> pairs
    and JSON-LD <script type=application/ld+json>...</script> blocks.
    """

    def __init__(self):
        super().__init__()
        self.meta: dict[str, list[str]] = {}
        self.jsonld: list[dict] = []
        self._in_title = False
        self._in_jsonld = False
        self._jsonld_buf: list[str] = []
        self.title_text: str = ""

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._in_title = True
            return
        if tag == "script":
            d = dict(attrs)
            if (d.get("type") or "").lower() == "application/ld+json":
                self._in_jsonld = True
                self._jsonld_buf = []
            return
        if tag != "meta":
            return
        d = dict(attrs)
        key = (d.get("name") or d.get("property") or "").lower()
        content = d.get("content")
        if not key or content is None:
            return
        self.meta.setdefault(key, []).append(content)

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_jsonld:
            raw = "".join(self._jsonld_buf).strip()
            self._in_jsonld = False
            self._jsonld_buf = []
            if raw:
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        self.jsonld.extend(p for p in parsed if isinstance(p, dict))
                    elif isinstance(parsed, dict):
                        self.jsonld.append(parsed)
                except json.JSONDecodeError:
                    pass

    def handle_data(self, data):
        if self._in_title:
            self.title_text += data
        elif self._in_jsonld:
            self._jsonld_buf.append(data)


class WhoWebClient(BaseAPIClient):
    source_name = "who_web"
    base_url = "https://www.who.int"
    requests_per_second = 1.5

    async def resolve(self, url: str) -> RawPaperResult | None:
        """Fetch a WHO publication page and extract metadata from meta tags."""
        if not WHO_HOST_RE.search(url):
            return None

        try:
            # Bypass base_url since we pass a full absolute URL (could be any who.int path)
            client = await self._get_client()
            await self._rate_limiter.acquire()
            response = await client.get(
                url,
                follow_redirects=True,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; FL-Research-Monitor/0.1.0)",
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
            response.raise_for_status()
        except Exception as e:
            logger.warning(f"[who_web] Fetch failed for {url}: {e}")
            return None

        parser = _MetaTagParser()
        try:
            parser.feed(response.text)
        except Exception as e:
            logger.warning(f"[who_web] HTML parse error for {url}: {e}")
            return None

        return _build_result(parser, url)


def _build_result(parser: _MetaTagParser, source_url: str) -> RawPaperResult | None:
    meta = parser.meta

    def first(key: str) -> str | None:
        v = meta.get(key.lower())
        return v[0].strip() if v and v[0] else None

    def all_of(key: str) -> list[str]:
        return [v.strip() for v in meta.get(key.lower(), []) if v and v.strip()]

    # Title: prefer citation_title (Google Scholar standard), fallback to og:title or <title>
    title = first("citation_title") or first("og:title") or parser.title_text.strip() or None
    if not title:
        return None
    title = re.sub(r"\s+", " ", title).strip()

    # Authors: citation_author can appear multiple times
    authors_raw = all_of("citation_author") or all_of("dc.creator") or all_of("author")
    authors = [{"name": a, "affiliation": None, "orcid": None} for a in authors_raw]

    # Date — try an extensive list of meta tags used by WHO / DSpace / CMS systems,
    # then fall back to JSON-LD structured data (schema.org datePublished).
    publication_date = _normalize_date(
        first("citation_publication_date")
        or first("citation_date")
        or first("citation_online_date")
        or first("publication_date")
        or first("article:published_time")
        or first("og:article:published_time")
        or first("dc.date")
        or first("dc.date.issued")
        or first("dcterms.issued")
        or first("dcterms.created")
        or first("dc.date.created")
        or first("date")
        or _jsonld_date(parser.jsonld)
    )

    # Abstract / description
    abstract = (
        first("citation_abstract")
        or first("dc.description")
        or first("og:description")
        or first("description")
    )
    if abstract:
        abstract = re.sub(r"\s+", " ", abstract).strip()

    # PDF: prefer citation_pdf_url, else sameAs from JSON-LD (WHO uses it to link
    # to the IRIS bitstream — the actual PDF), else fall back to the page URL.
    pdf_url = first("citation_pdf_url") or first("og:pdf") or _jsonld_pdf(parser.jsonld) or source_url

    # Issuing organization: prefer publisher meta, else detect region from URL
    publisher = first("citation_publisher") or first("dc.publisher")
    if not publisher:
        for frag, name in REGION_FROM_URL.items():
            if frag in source_url.lower():
                publisher = name
                break
    if not publisher:
        publisher = "World Health Organization"

    # Keywords
    keywords_raw = first("citation_keywords") or first("keywords") or ""
    keywords = [k.strip() for k in re.split(r"[;,]", keywords_raw) if k.strip()][:20]

    # Heuristic paper_type: most WHO publications of this kind are reports; guidelines
    # usually have "guideline" in the title.
    paper_type = "guideline" if re.search(r"\bguidelin", title, re.IGNORECASE) else "report"

    return RawPaperResult(
        source="who_web",
        source_id=source_url,
        title=title,
        abstract=abstract,
        authors=authors,
        doi=None,
        publication_date=publication_date,
        journal=publisher,
        paper_type=paper_type,
        open_access=True,
        pdf_url=pdf_url,
        keywords=keywords,
        external_ids={"who_url": source_url},
        raw_data={},
    )


_MONTHS = {
    "jan": "01", "january": "01",
    "feb": "02", "february": "02",
    "mar": "03", "march": "03",
    "apr": "04", "april": "04",
    "may": "05",
    "jun": "06", "june": "06",
    "jul": "07", "july": "07",
    "aug": "08", "august": "08",
    "sep": "09", "sept": "09", "september": "09",
    "oct": "10", "october": "10",
    "nov": "11", "november": "11",
    "dec": "12", "december": "12",
}


def _normalize_date(raw: str | None) -> str | None:
    """Normalize multiple date formats to YYYY-MM-DD.

    Handles:
      - YYYY, YYYY-MM, YYYY-MM-DD, YYYY/MM/DD
      - ISO 8601 with time ("2024-08-02T08:00:00Z")
      - "DD Month YYYY"  (e.g. "20 April 2026")
      - "Month YYYY"     (e.g. "April 2026")
      - "Month DD, YYYY" (e.g. "April 20, 2026")
    """
    if not raw:
        return None
    raw = raw.strip()

    # ISO / numeric
    m = re.match(r"^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?", raw)
    if m:
        y, mo, d = m.group(1), (m.group(2) or "01").zfill(2), (m.group(3) or "01").zfill(2)
        return f"{y}-{mo}-{d}"

    # "DD Month YYYY"
    m = re.match(r"^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", raw)
    if m:
        d, mon, y = m.group(1).zfill(2), _MONTHS.get(m.group(2).lower()), m.group(3)
        if mon:
            return f"{y}-{mon}-{d}"

    # "Month DD, YYYY"
    m = re.match(r"^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})", raw)
    if m:
        mon, d, y = _MONTHS.get(m.group(1).lower()), m.group(2).zfill(2), m.group(3)
        if mon:
            return f"{y}-{mon}-{d}"

    # "Month YYYY"
    m = re.match(r"^([A-Za-z]+)\s+(\d{4})", raw)
    if m:
        mon, y = _MONTHS.get(m.group(1).lower()), m.group(2)
        if mon:
            return f"{y}-{mon}-01"

    return None


def _jsonld_date(blocks: list[dict]) -> str | None:
    """Traverse JSON-LD objects for a schema.org datePublished / dateCreated."""
    for block in blocks:
        for key in ("datePublished", "dateCreated", "uploadDate"):
            v = block.get(key)
            if isinstance(v, str) and v:
                return v
        # Nested @graph (WHO sometimes wraps metadata in @graph arrays)
        graph = block.get("@graph")
        if isinstance(graph, list):
            nested = _jsonld_date(graph)
            if nested:
                return nested
    return None


def _jsonld_pdf(blocks: list[dict]) -> str | None:
    """WHO's schema.org blocks expose the actual PDF via `sameAs` pointing to the
    IRIS bitstream (e.g. https://iris.who.int/server/api/core/bitstreams/<uuid>/content).
    """
    for block in blocks:
        v = block.get("sameAs")
        if isinstance(v, str) and v.startswith("https://iris.who.int/"):
            return v
        graph = block.get("@graph")
        if isinstance(graph, list):
            nested = _jsonld_pdf(graph)
            if nested:
                return nested
    return None
