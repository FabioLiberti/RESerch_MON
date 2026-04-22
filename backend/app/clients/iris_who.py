"""WHO IRIS institutional repository client (OAI-PMH 2.0, xoai metadata prefix).

IRIS is WHO's DSpace-based institutional repository: https://iris.who.int
- Phase 1: GetRecord resolution for handle-paste auto-fill (v2.39.2)
- Phase 2: ListRecords harvest + keyword ranking for Smart Search (v2.40.0)
"""

import logging
import re
import time
from xml.etree import ElementTree as ET

from app.clients.base import BaseAPIClient, RawPaperResult

logger = logging.getLogger(__name__)

OAI_BASE = "https://iris.who.int/server/oai/request"

# xoai namespace (DSpace Lyncode XOAI)
NS = {
    "oai": "http://www.openarchives.org/OAI/2.0/",
    "xoai": "http://www.lyncode.com/xoai",
}

# DSpace dc.type → our paper_type vocabulary
# Best-effort mapping; unknown types default to "report"
DC_TYPE_MAP = {
    "journal articles": "journal_article",
    "journal article": "journal_article",
    "technical documents": "report",
    "technical document": "report",
    "reports": "report",
    "report": "report",
    "publications": "report",
    "publication": "report",
    "guidelines": "guideline",
    "guideline": "guideline",
    "policy briefs": "white_paper",
    "policy brief": "white_paper",
    "white papers": "white_paper",
    "white paper": "white_paper",
    "standards": "standard",
    "standard": "standard",
    "meeting reports": "report",
    "meeting report": "report",
    "proceedings": "conference",
}

HANDLE_RE = re.compile(r"(10665/\d+)")

# Default sets for Smart Search (confirmed by ListSets 2026-04-22):
#   com_10665_8      → Headquarters (global WHO)
#   com_10665_107131 → Regional Office for Europe
DEFAULT_SETS = ["com_10665_8", "com_10665_107131"]
MAX_LIST_PAGES = 20          # hard cap to bound latency (pages × 100 = records)
CACHE_TTL_SECONDS = 60 * 60  # in-memory cache TTL: 1 hour


def extract_handle(url_or_handle: str) -> str | None:
    """Extract the `10665/NNNN` handle from a full IRIS URL or bare handle.

    Accepts:
      - https://iris.who.int/handle/10665/52481
      - iris.who.int/handle/10665/52481
      - 10665/52481
      - oai:iris.who.int:10665/52481
    """
    if not url_or_handle:
        return None
    m = HANDLE_RE.search(url_or_handle)
    return m.group(1) if m else None


class IrisWhoClient(BaseAPIClient):
    source_name = "iris_who"
    base_url = OAI_BASE
    requests_per_second = 2.0

    # Class-level cache, shared across instances:
    # key = (frozenset(sets), from_date) → (fetched_at_epoch, list[RawPaperResult])
    _harvest_cache: dict = {}

    async def get_record(self, handle: str) -> RawPaperResult | None:
        """Fetch a single IRIS record by handle (e.g. `10665/52481`) using xoai prefix."""
        handle = extract_handle(handle) or handle
        if not handle or not handle.startswith("10665/"):
            return None

        identifier = f"oai:iris.who.int:{handle}"
        params = {
            "verb": "GetRecord",
            "identifier": identifier,
            "metadataPrefix": "xoai",
        }
        try:
            response = await self._request("GET", "", params=params)
        except Exception as e:
            logger.warning(f"[iris_who] GetRecord failed for {handle}: {e}")
            return None

        root = _safe_parse(response.text)
        if root is None:
            return None
        record = root.find(".//oai:record", NS)
        if record is None:
            return None
        return _parse_xoai_record_node(record, handle)

    async def list_records(
        self,
        sets: list[str] | None = None,
        from_date: str | None = None,
        max_records: int = 500,
    ) -> list[RawPaperResult]:
        """Harvest records via OAI-PMH ListRecords across the given DSpace sets.

        Results are cached in-memory for CACHE_TTL_SECONDS keyed by (sets, from_date)
        to avoid refetching for each keyword query in the same session.
        """
        sets = sets or DEFAULT_SETS
        cache_key = (frozenset(sets), from_date or "")
        cached = self._harvest_cache.get(cache_key)
        now = time.time()
        if cached and (now - cached[0]) < CACHE_TTL_SECONDS:
            logger.info(f"[iris_who] Cache HIT for {cache_key}: {len(cached[1])} records")
            return cached[1]

        all_records: list[RawPaperResult] = []
        for set_spec in sets:
            records = await self._harvest_set(set_spec, from_date, max_records)
            all_records.extend(records)
            if len(all_records) >= max_records:
                break

        # Dedup by handle (same doc can appear if indexed in multiple sets)
        seen: set[str] = set()
        unique: list[RawPaperResult] = []
        for r in all_records:
            if r.source_id in seen:
                continue
            seen.add(r.source_id)
            unique.append(r)

        self._harvest_cache[cache_key] = (now, unique)
        logger.info(f"[iris_who] Harvested {len(unique)} records for {cache_key}")
        return unique

    async def _harvest_set(
        self, set_spec: str, from_date: str | None, max_records: int
    ) -> list[RawPaperResult]:
        records: list[RawPaperResult] = []
        params: dict = {
            "verb": "ListRecords",
            "metadataPrefix": "xoai",
            "set": set_spec,
        }
        if from_date:
            params["from"] = from_date

        pages = 0
        while True:
            pages += 1
            if pages > MAX_LIST_PAGES:
                logger.warning(f"[iris_who] Hit page cap ({MAX_LIST_PAGES}) on set={set_spec}")
                break
            try:
                response = await self._request("GET", "", params=params)
            except Exception as e:
                logger.warning(f"[iris_who] ListRecords failed on set={set_spec}: {e}")
                break

            root = _safe_parse(response.text)
            if root is None:
                break

            err = root.find(".//oai:error", NS)
            if err is not None:
                code = err.attrib.get("code", "")
                if code == "noRecordsMatch":
                    break
                logger.info(f"[iris_who] OAI error on set={set_spec}: {code}")
                break

            for record_node in root.findall(".//oai:record", NS):
                header = record_node.find("oai:header", NS)
                if header is not None and header.attrib.get("status") == "deleted":
                    continue
                id_el = header.find("oai:identifier", NS) if header is not None else None
                handle = None
                if id_el is not None and id_el.text:
                    handle = id_el.text.replace("oai:iris.who.int:", "").strip()
                if not handle:
                    continue
                parsed = _parse_xoai_record_node(record_node, handle)
                if parsed is not None:
                    records.append(parsed)
                    if len(records) >= max_records:
                        return records

            token_el = root.find(".//oai:resumptionToken", NS)
            if token_el is None or not (token_el.text and token_el.text.strip()):
                break
            params = {"verb": "ListRecords", "resumptionToken": token_el.text.strip()}

        return records

    async def search(
        self,
        query: str,
        max_results: int = 20,
        **kwargs,
    ) -> list[RawPaperResult]:
        """Keyword search over IRIS. OAI-PMH has no full-text search, so this:
          1. Harvests records from DEFAULT_SETS with OAI `from` (IRIS datestamp) = year_from-01-01
          2. Filters by language (default EN)
          3. Post-filters by dc.date.issued >= year_from  — OAI `from` is the IRIS
             record-modification datestamp, not the publication date, so records
             published years ago but recently re-indexed would otherwise slip in
          4. Ranks by token match (title 3x, subjects 2x, abstract 1x)

        kwargs accepted:
            year_from (int): minimum publication year (defaults to current_year - 2)
            sets (list[str]): override DEFAULT_SETS
            language (str): dc.language filter (default "en")
        """
        import datetime as _dt

        sets = kwargs.get("sets") or DEFAULT_SETS
        year_from = kwargs.get("year_from") or (_dt.date.today().year - 2)
        language = (kwargs.get("language") or "en").lower()
        from_date = f"{year_from}-01-01"

        records = await self.list_records(sets=sets, from_date=from_date, max_records=2000)

        if language:
            records = [r for r in records if _record_language_matches(r, language)]

        # Post-filter by actual publication date (dc.date.issued)
        year_from_str = f"{year_from}-01-01"
        records = [
            r for r in records
            if r.publication_date and r.publication_date >= year_from_str
        ]

        tokens = _tokenize(query)
        if not tokens:
            # No keywords: return the most recent ones first
            records.sort(key=lambda r: r.publication_date or "", reverse=True)
            return records[:max_results]

        scored: list[tuple[float, RawPaperResult]] = []
        for r in records:
            score = _score_record(r, tokens)
            if score > 0:
                scored.append((score, r))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [r for _, r in scored[:max_results]]


def _safe_parse(xml_text: str):
    try:
        return ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.warning(f"[iris_who] XML parse error: {e}")
        return None


def _tokenize(query: str) -> list[str]:
    return [t for t in re.split(r"\W+", query.lower()) if len(t) > 2]


def _score_record(r: RawPaperResult, tokens: list[str]) -> float:
    """Match score: title tokens count 3x, subject tokens 2x, abstract 1x."""
    title = (r.title or "").lower()
    abstract = (r.abstract or "").lower()
    subjects = " ".join(r.keywords or []).lower()

    total = 0.0
    for tok in tokens:
        if tok in title:
            total += 3.0
        if tok in subjects:
            total += 2.0
        if tok in abstract:
            total += 1.0
    return total


def _record_language_matches(r: RawPaperResult, language_code: str) -> bool:
    """Check dc.language.iso (from raw_data) or fall back to title heuristics."""
    lang = (r.raw_data or {}).get("language")
    if not lang:
        return True  # records without language info pass through
    lang = lang.lower()
    # Accept both ISO codes (en, fr) and full names (English, Français)
    if language_code == "en":
        return lang in ("en", "eng", "english")
    return lang.startswith(language_code)


def _parse_xoai_record_node(record_node, handle: str) -> RawPaperResult | None:
    """Parse a <record> element with xoai metadata into a RawPaperResult."""
    metadata = record_node.find(".//oai:metadata/xoai:metadata", NS)
    if metadata is None:
        return None

    def xoai_values(schema: str, element: str, qualifier: str | None = None) -> list[str]:
        """Extract text values from the xoai structure:
        <element name="dc">
          <element name="title">
            <element name="none">
              <field name="value">...</field>
            </element>
          </element>
        </element>
        """
        xpath = f"xoai:element[@name='{schema}']/xoai:element[@name='{element}']"
        if qualifier:
            xpath += f"/xoai:element[@name='{qualifier}']"
        nodes = metadata.findall(xpath, NS)
        seen: set[str] = set()
        values: list[str] = []
        for node in nodes:
            for f in node.iter("{http://www.lyncode.com/xoai}field"):
                if f.attrib.get("name") == "value" and f.text:
                    v = f.text.strip()
                    if v and v not in seen:
                        seen.add(v)
                        values.append(v)
        return values

    def first(values: list[str]) -> str | None:
        return values[0] if values else None

    title = first(xoai_values("dc", "title"))
    if not title:
        return None

    # Prefer description.abstract (explicit). Fallback to plain dc.description but
    # exclude page counts ("v, 17 p.", "292", "1 p.") and very short blurbs.
    abstract_list = xoai_values("dc", "description", "abstract")
    if not abstract_list:
        pagelike = re.compile(r"^(\s*(?:[ivxlcdm]+|\d+)\s*[,.]?\s*)+(p\.?|c\.?|s\.?)?\s*$", re.IGNORECASE)
        abstract_list = [
            d for d in xoai_values("dc", "description")
            if len(d) > 80 and not pagelike.match(d)
        ]
    abstract = "\n\n".join(abstract_list) if abstract_list else None

    # Prefer dc.date.issued (actual publication), fallback to dc.date
    date_issued = first(xoai_values("dc", "date", "issued"))
    if not date_issued:
        dates = xoai_values("dc", "date")
        # Prefer a YYYY-MM-DD-looking string
        date_issued = next((d for d in dates if re.match(r"^\d{4}", d)), None)
    publication_date = _normalize_date(date_issued)

    authors_raw = xoai_values("dc", "contributor", "author") or xoai_values("dc", "creator")
    authors = [{"name": a, "affiliation": None, "orcid": None} for a in authors_raw]

    dc_type_raw = first(xoai_values("dc", "type")) or ""
    paper_type = DC_TYPE_MAP.get(dc_type_raw.strip().lower(), "report")

    publisher = first(xoai_values("dc", "publisher")) or "World Health Organization"

    language = first(xoai_values("dc", "language", "iso")) or first(xoai_values("dc", "language"))

    subjects = xoai_values("dc", "subject", "mesh") + xoai_values("dc", "subject")
    subjects = list(dict.fromkeys(s for s in subjects if s))  # dedup, preserve order

    landing_url = f"https://iris.who.int/handle/{handle}"

    return RawPaperResult(
        source="iris_who",
        source_id=handle,
        title=title,
        abstract=abstract,
        authors=authors,
        doi=None,
        publication_date=publication_date,
        journal=publisher,
        paper_type=paper_type,
        open_access=True,
        pdf_url=landing_url,
        keywords=subjects[:20],
        external_ids={"who_handle": handle, "iris_url": landing_url},
        raw_data={"dc_type": dc_type_raw, "language": language},
    )


def _normalize_date(raw: str | None) -> str | None:
    """Normalize to YYYY-MM-DD; accept YYYY / YYYY-MM / YYYY-MM-DDThh:mm:ssZ."""
    if not raw:
        return None
    m = re.match(r"^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?", raw)
    if not m:
        return None
    y, mo, d = m.group(1), m.group(2) or "01", m.group(3) or "01"
    return f"{y}-{mo}-{d}"
