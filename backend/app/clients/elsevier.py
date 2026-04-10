"""Elsevier Scopus Search API client.

Scopus Search API: https://dev.elsevier.com/documentation/ScopusSearchAPI.wadl
Get API key: https://dev.elsevier.com/apikey/manage
"""

import logging

from app.clients.base import BaseAPIClient, RawPaperResult
from app.config import settings

logger = logging.getLogger(__name__)


class ElsevierClient(BaseAPIClient):
    source_name = "elsevier"
    base_url = "https://api.elsevier.com/content"
    requests_per_second = 2.0
    timeout = 30.0

    def _headers(self) -> dict:
        return {
            "X-ELS-APIKey": settings.elsevier_api_key,
            "Accept": "application/json",
        }

    def is_configured(self) -> bool:
        return bool(settings.elsevier_api_key)

    async def search(self, query: str, max_results: int = 50) -> list[RawPaperResult]:
        """Search Scopus for papers matching query."""
        if not self.is_configured():
            logger.warning("[elsevier] API key not configured")
            return []

        results: list[RawPaperResult] = []
        start = 0
        page_size = min(25, max_results)  # Scopus default is 25

        while len(results) < max_results:
            params = {
                "query": query,
                "start": str(start),
                "count": str(page_size),
                "view": "STANDARD",
            }
            try:
                response = await self._request(
                    "GET", "/search/scopus", params=params, headers=self._headers()
                )
                data = response.json()
            except Exception as e:
                logger.error(f"[elsevier] Search error: {e}")
                break

            entries = data.get("search-results", {}).get("entry", [])
            if not entries or (len(entries) == 1 and "error" in entries[0]):
                break

            for entry in entries:
                if "error" in entry:
                    continue
                paper = self._parse_entry(entry)
                if paper:
                    results.append(paper)
                if len(results) >= max_results:
                    break

            total_results = int(data.get("search-results", {}).get("opensearch:totalResults", 0))
            if start + page_size >= total_results:
                break
            start += page_size

        logger.info(f"[elsevier] Found {len(results)} papers for query: {query[:50]}")
        return results

    def _parse_entry(self, entry: dict) -> RawPaperResult | None:
        """Convert a Scopus entry into a RawPaperResult."""
        try:
            scopus_id = entry.get("dc:identifier", "").replace("SCOPUS_ID:", "")
            title = entry.get("dc:title", "")
            if not title:
                return None

            doi = entry.get("prism:doi")
            journal = entry.get("prism:publicationName")
            pub_date = entry.get("prism:coverDate")  # YYYY-MM-DD format
            volume = entry.get("prism:volume")
            pages = entry.get("prism:pageRange")

            # Authors (Scopus STANDARD view returns first author only as dc:creator)
            authors = []
            creator = entry.get("dc:creator")
            if creator:
                authors.append({"name": creator})
            # If author list is provided
            for a in (entry.get("author") or []):
                name = a.get("authname") or a.get("ce:given-name", "") + " " + a.get("ce:surname", "")
                if name.strip():
                    authors.append({"name": name.strip()})

            citations = int(entry.get("citedby-count", 0))

            # Open access
            openaccess = entry.get("openaccess", "0") == "1"

            # PDF URL — Scopus doesn't provide direct PDF, only links
            pdf_url = None
            for link in (entry.get("link") or []):
                if link.get("@ref") == "scopus" and link.get("@href"):
                    pdf_url = link["@href"]
                    break

            paper_type = "journal_article"
            sub_type = entry.get("subtypeDescription", "").lower()
            if "conference" in sub_type:
                paper_type = "conference"
            elif "review" in sub_type:
                paper_type = "review"

            return RawPaperResult(
                source="elsevier",
                source_id=scopus_id,
                title=title,
                doi=doi,
                publication_date=pub_date,
                journal=journal,
                volume=volume,
                pages=pages,
                paper_type=paper_type,
                open_access=openaccess,
                pdf_url=pdf_url,
                citation_count=citations,
                authors=authors,
                external_ids={"scopus_id": scopus_id, "doi": doi},
                raw_data=entry,
            )
        except Exception as e:
            logger.warning(f"[elsevier] Parse error: {e}")
            return None

    async def fetch_metadata(self, paper_id: str) -> RawPaperResult | None:
        """Fetch full metadata for a paper by Scopus ID or DOI."""
        if not self.is_configured():
            return None
        try:
            # Try by DOI first
            if paper_id.lower().startswith("doi:") or "/" in paper_id:
                doi = paper_id.replace("DOI:", "").replace("doi:", "")
                response = await self._request(
                    "GET", f"/abstract/doi/{doi}",
                    headers=self._headers(), params={"view": "META"},
                )
            else:
                # By Scopus ID
                response = await self._request(
                    "GET", f"/abstract/scopus_id/{paper_id}",
                    headers=self._headers(), params={"view": "META"},
                )
            data = response.json()
            # Parse abstract retrieval response
            core = data.get("abstracts-retrieval-response", {}).get("coredata", {})
            if not core:
                return None

            return RawPaperResult(
                source="elsevier",
                source_id=core.get("dc:identifier", "").replace("SCOPUS_ID:", ""),
                title=core.get("dc:title", ""),
                abstract=core.get("dc:description"),
                doi=core.get("prism:doi"),
                publication_date=core.get("prism:coverDate"),
                journal=core.get("prism:publicationName"),
                citation_count=int(core.get("citedby-count", 0)),
                external_ids={"doi": core.get("prism:doi")},
            )
        except Exception as e:
            logger.warning(f"[elsevier] Fetch metadata error: {e}")
            return None
