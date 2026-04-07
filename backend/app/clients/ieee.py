"""IEEE Xplore API client."""

import logging

from app.clients.base import BaseAPIClient, RawPaperResult
from app.config import settings

logger = logging.getLogger(__name__)


class IEEEXploreClient(BaseAPIClient):
    source_name = "ieee"
    base_url = "https://ieeexploreapi.ieee.org/api/v1"
    requests_per_second = 0.5  # ~200 req/day limit
    timeout = 45.0

    async def search(self, query: str, max_results: int = 50) -> list[RawPaperResult]:
        """Search IEEE Xplore for papers."""
        if not settings.ieee_api_key:
            logger.warning("[ieee] No API key configured, skipping IEEE search")
            return []

        params = {
            "apikey": settings.ieee_api_key,
            "querytext": query,
            "max_records": str(min(max_results, 200)),
            "start_record": "1",
            "sort_field": "publication_date",
            "sort_order": "desc",
        }

        try:
            response = await self._request("GET", "/search/articles", params=params)
            data = response.json()
        except Exception as e:
            logger.error(f"[ieee] Search error: {e}")
            return []

        articles = data.get("articles", [])
        results = []
        for article in articles:
            parsed = self._parse_article(article)
            if parsed:
                results.append(parsed)

        logger.info(f"[ieee] Found {len(results)} papers for: {query[:80]}")
        return results

    def _parse_article(self, article: dict) -> RawPaperResult | None:
        """Parse a single IEEE Xplore article."""
        title = article.get("title", "").strip()
        if not title:
            return None

        # Authors
        authors = []
        for author in article.get("authors", {}).get("authors", []):
            authors.append({
                "name": author.get("full_name", "Unknown"),
                "affiliation": author.get("affiliation", None),
            })

        # DOI
        doi = article.get("doi", None)

        # Publication date
        pub_date = article.get("publication_date", "")
        # IEEE dates can be various formats, normalize to YYYY-MM-DD
        if pub_date and len(pub_date) >= 4:
            year = pub_date[:4]
            pub_date = f"{year}-01-01"

        # Paper type
        content_type = article.get("content_type", "")
        paper_type = "journal_article"
        if "conference" in content_type.lower():
            paper_type = "conference"

        # IEEE article number for link
        article_number = article.get("article_number", "")
        pdf_url = None
        if article_number:
            pdf_url = f"https://ieeexplore.ieee.org/stamp/stamp.jsp?arnumber={article_number}"

        # Keywords from index_terms
        keywords = []
        index_terms = article.get("index_terms", {})
        # IEEE Author Keywords
        author_terms = index_terms.get("author_terms", {}).get("terms", [])
        keywords.extend(author_terms)
        # IEEE Terms (controlled vocabulary)
        ieee_terms = index_terms.get("ieee_terms", {}).get("terms", [])
        keywords.extend(ieee_terms)
        # INSPEC Controlled Terms
        inspec_terms = index_terms.get("controlled_terms", {}).get("terms", [])
        keywords.extend(inspec_terms)
        # INSPEC Non-Controlled Terms
        inspec_nc = index_terms.get("non_controlled_terms", {}).get("terms", [])
        keywords.extend(inspec_nc)
        # Deduplicate preserving order
        seen = set()
        unique_keywords = []
        for kw in keywords:
            kw_lower = kw.lower()
            if kw_lower not in seen:
                seen.add(kw_lower)
                unique_keywords.append(kw)

        return RawPaperResult(
            source="ieee",
            source_id=article_number,
            title=title,
            abstract=article.get("abstract", None),
            authors=authors,
            doi=doi,
            publication_date=pub_date,
            journal=article.get("publication_title"),
            volume=article.get("volume"),
            pages=f"{article.get('start_page', '')}-{article.get('end_page', '')}".strip("-"),
            paper_type=paper_type,
            open_access=article.get("access_type", "") == "OPEN_ACCESS",
            pdf_url=pdf_url,
            citation_count=article.get("citing_paper_count", 0),
            keywords=unique_keywords,
            keyword_categories={
                k: v for k, v in {
                    "Author Keywords": author_terms,
                    "IEEE Terms": ieee_terms,
                    "INSPEC Terms": inspec_terms + inspec_nc,
                }.items() if v
            },
            external_ids={"ieee_id": article_number, "doi": doi},
            raw_data=article,
        )

    async def fetch_metadata(self, article_number: str) -> RawPaperResult | None:
        """Fetch metadata for a specific IEEE article."""
        if not settings.ieee_api_key:
            return None
        params = {
            "apikey": settings.ieee_api_key,
            "article_number": article_number,
        }
        try:
            response = await self._request("GET", "/search/articles", params=params)
            data = response.json()
            articles = data.get("articles", [])
            if articles:
                return self._parse_article(articles[0])
        except Exception as e:
            logger.warning(f"[ieee] Fetch error for {article_number}: {e}")
        return None

    async def validate_exists(self, article_number: str) -> bool:
        result = await self.fetch_metadata(article_number)
        return result is not None
