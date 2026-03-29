"""Semantic Scholar Graph API client."""

import logging

from app.clients.base import BaseAPIClient, RawPaperResult
from app.config import settings

logger = logging.getLogger(__name__)

S2_FIELDS = (
    "paperId,externalIds,title,abstract,year,venue,publicationDate,"
    "authors,citationCount,isOpenAccess,openAccessPdf,fieldsOfStudy,"
    "journal,publicationTypes"
)


class SemanticScholarClient(BaseAPIClient):
    source_name = "semantic_scholar"
    base_url = "https://api.semanticscholar.org/graph/v1"
    requests_per_second = 1.0
    timeout = 45.0

    def _headers(self) -> dict:
        headers = {}
        if settings.semantic_scholar_api_key:
            headers["x-api-key"] = settings.semantic_scholar_api_key
        return headers

    async def search(self, query: str, max_results: int = 50) -> list[RawPaperResult]:
        """Search Semantic Scholar for papers."""
        results = []
        offset = 0
        limit = min(max_results, 100)

        while len(results) < max_results:
            params = {
                "query": query,
                "fields": S2_FIELDS,
                "offset": str(offset),
                "limit": str(limit),
            }

            try:
                response = await self._request(
                    "GET", "/paper/search", params=params, headers=self._headers()
                )
                data = response.json()
            except Exception as e:
                logger.error(f"[semantic_scholar] Search error: {e}")
                break

            papers = data.get("data", [])
            if not papers:
                break

            for paper in papers:
                parsed = self._parse_paper(paper)
                if parsed:
                    results.append(parsed)

            total = data.get("total", 0)
            offset += limit
            if offset >= total or offset >= max_results:
                break

        logger.info(f"[semantic_scholar] Found {len(results)} papers for: {query[:80]}")
        return results[:max_results]

    def _parse_paper(self, data: dict) -> RawPaperResult | None:
        """Parse a Semantic Scholar paper object."""
        title = data.get("title")
        if not title:
            return None

        s2_id = data.get("paperId", "")
        external_ids = data.get("externalIds") or {}

        # Authors
        authors = []
        for author in data.get("authors", []):
            authors.append({
                "name": author.get("name", "Unknown"),
                "s2_author_id": author.get("authorId"),
            })

        # PDF URL
        pdf_url = None
        oa_pdf = data.get("openAccessPdf")
        if oa_pdf and isinstance(oa_pdf, dict):
            pdf_url = oa_pdf.get("url")

        # Publication date
        pub_date = data.get("publicationDate") or ""
        if not pub_date and data.get("year"):
            pub_date = f"{data['year']}-01-01"

        # Journal
        journal = None
        journal_data = data.get("journal")
        if journal_data and isinstance(journal_data, dict):
            journal = journal_data.get("name")
        if not journal:
            journal = data.get("venue")

        # Paper type
        pub_types = data.get("publicationTypes") or []
        paper_type = "journal_article"
        if "Conference" in pub_types:
            paper_type = "conference"
        elif "Review" in pub_types:
            paper_type = "review"

        return RawPaperResult(
            source="semantic_scholar",
            source_id=s2_id,
            title=title,
            abstract=data.get("abstract"),
            authors=authors,
            doi=external_ids.get("DOI"),
            publication_date=pub_date,
            journal=journal,
            paper_type=paper_type,
            open_access=data.get("isOpenAccess", False),
            pdf_url=pdf_url,
            citation_count=data.get("citationCount", 0),
            external_ids={
                "s2_id": s2_id,
                "pmid": external_ids.get("PubMed"),
                "arxiv_id": external_ids.get("ArXiv"),
                "doi": external_ids.get("DOI"),
            },
            raw_data=data,
        )

    async def fetch_metadata(self, paper_id: str) -> RawPaperResult | None:
        """Fetch metadata for a specific paper by S2 ID or DOI."""
        try:
            response = await self._request(
                "GET",
                f"/paper/{paper_id}",
                params={"fields": S2_FIELDS},
                headers=self._headers(),
            )
            data = response.json()
            return self._parse_paper(data)
        except Exception as e:
            logger.warning(f"[semantic_scholar] Fetch error for {paper_id}: {e}")
            return None

    async def validate_exists(self, paper_id: str) -> bool:
        """Check if a paper exists in Semantic Scholar."""
        result = await self.fetch_metadata(paper_id)
        return result is not None
