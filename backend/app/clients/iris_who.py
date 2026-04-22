"""WHO IRIS institutional repository client (OAI-PMH 2.0, xoai metadata prefix).

IRIS is WHO's DSpace-based institutional repository: https://iris.who.int
Phase 1 scope: GetRecord resolution for handle-paste auto-fill.
Phase 2 (future): ListRecords / ListSets for automated harvesting.
"""

import logging
import re
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

        return _parse_xoai_record(response.text, handle)


def _parse_xoai_record(xml_text: str, handle: str) -> RawPaperResult | None:
    """Parse an OAI-PMH GetRecord response with xoai metadata prefix."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.warning(f"[iris_who] XML parse error for {handle}: {e}")
        return None

    # OAI-PMH errors surface as <error code="idDoesNotExist">
    err = root.find("oai:error", NS)
    if err is not None:
        logger.info(f"[iris_who] OAI error for {handle}: {err.attrib.get('code')}")
        return None

    metadata = root.find(".//oai:metadata/xoai:metadata", NS)
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
