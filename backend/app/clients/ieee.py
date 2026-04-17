"""IEEE Xplore client — official API with web fallback when no API key."""

import asyncio
import logging
import re

import httpx

from app.clients.base import BaseAPIClient, RawPaperResult
from app.config import settings

logger = logging.getLogger(__name__)

# Web endpoint (same as browser uses) — no API key needed
IEEE_WEB_SEARCH_URL = "https://ieeexplore.ieee.org/rest/search"
IEEE_WEB_HEADERS = {
    "Content-Type": "application/json",
    "Referer": "https://ieeexplore.ieee.org/search/searchresult.jsp",
    "Origin": "https://ieeexplore.ieee.org",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}
# Conservative rate limit for web endpoint: 1 request per 30 seconds
WEB_RATE_LIMIT_SECONDS = 30


class IEEEXploreClient(BaseAPIClient):
    source_name = "ieee"
    base_url = "https://ieeexploreapi.ieee.org/api/v1"
    requests_per_second = 0.5  # ~200 req/day limit (official API)
    timeout = 45.0

    def __init__(self):
        super().__init__()
        self._web_last_request = 0.0

    async def search(self, query: str, max_results: int = 50, **kwargs) -> list[RawPaperResult]:
        """Search IEEE Xplore. Uses official API if key configured, else web fallback."""
        if settings.ieee_api_key:
            return await self._search_official(query, max_results, **kwargs)
        else:
            return await self._search_web(query, max_results, **kwargs)

    async def _search_official(self, query: str, max_results: int, **kwargs) -> list[RawPaperResult]:
        """Search via official IEEE Xplore API (requires API key)."""
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
            logger.error(f"[ieee] Official API error: {e}")
            # Fallback to web endpoint on API failure
            logger.info("[ieee] Falling back to web endpoint")
            return await self._search_web(query, max_results)

        articles = data.get("articles", [])
        results = []
        for article in articles:
            parsed = self._parse_official(article)
            if parsed:
                results.append(parsed)

        logger.info(f"[ieee] Official API: {len(results)} papers for: {query[:80]}")
        return results

    async def _search_web(self, query: str, max_results: int, **kwargs) -> list[RawPaperResult]:
        """Search via IEEE web endpoint with pagination, sorted by date (newest first)."""
        import time

        page_size = min(max_results, 100)  # IEEE max per page = 100
        total_pages = (max_results + page_size - 1) // page_size
        all_results: list[RawPaperResult] = []

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            for page_num in range(1, total_pages + 1):
                # Rate limit between pages
                now = time.monotonic()
                elapsed = now - self._web_last_request
                if elapsed < WEB_RATE_LIMIT_SECONDS:
                    wait = WEB_RATE_LIMIT_SECONDS - elapsed
                    logger.info(f"[ieee-web] Rate limiting: waiting {wait:.0f}s")
                    await asyncio.sleep(wait)

                body: dict = {
                    "queryText": query,
                    "returnType": "SEARCH",
                    "matchPubs": True,
                    "rowsPerPage": page_size,
                    "pageNumber": page_num,
                    "sortType": "newest",  # Sort by publication date, newest first
                }
                # Year range filter
                if kwargs.get("year_from") or kwargs.get("year_to"):
                    yf = kwargs.get("year_from", 1990)
                    yt = kwargs.get("year_to", 2030)
                    body["ranges"] = [f"{yf}_{yt}"]

                try:
                    resp = await client.post(IEEE_WEB_SEARCH_URL, json=body, headers=IEEE_WEB_HEADERS)
                    self._web_last_request = time.monotonic()

                    if resp.status_code == 429:
                        logger.warning(f"[ieee-web] Rate limited (429) on page {page_num}, waiting 60s")
                        await asyncio.sleep(60)
                        resp = await client.post(IEEE_WEB_SEARCH_URL, json=body, headers=IEEE_WEB_HEADERS)
                        self._web_last_request = time.monotonic()

                    if resp.status_code != 200:
                        logger.error(f"[ieee-web] HTTP {resp.status_code} on page {page_num}")
                        break

                    data = resp.json()

                except Exception as e:
                    logger.error(f"[ieee-web] Search error on page {page_num}: {e}")
                    break

                records = data.get("records", [])
                total_available = data.get("totalRecords", 0)

                for record in records:
                    parsed = self._parse_web(record)
                    if parsed:
                        all_results.append(parsed)

                logger.info(f"[ieee-web] Page {page_num}: {len(records)} papers (total available: {total_available}, collected: {len(all_results)}/{max_results})")

                # Stop if we have enough or no more pages
                if len(all_results) >= max_results or len(records) < page_size:
                    break

        logger.info(f"[ieee-web] Found {len(all_results)} papers for: {query[:80]}")
        return all_results[:max_results]

    # --- Parsers ---

    def _parse_official(self, article: dict) -> RawPaperResult | None:
        """Parse a result from the official API."""
        title = article.get("title", "").strip()
        if not title:
            return None

        authors = []
        for author in article.get("authors", {}).get("authors", []):
            authors.append({
                "name": author.get("full_name", "Unknown"),
                "affiliation": author.get("affiliation", None),
            })

        doi = article.get("doi", None)
        pub_date = article.get("publication_date", "")
        if pub_date and len(pub_date) >= 4:
            pub_date = f"{pub_date[:4]}-01-01"

        content_type = article.get("content_type", "")
        paper_type = "conference" if "conference" in content_type.lower() else "journal_article"

        article_number = article.get("article_number", "")
        pdf_url = f"https://ieeexplore.ieee.org/stamp/stamp.jsp?arnumber={article_number}" if article_number else None

        keywords, keyword_categories = self._extract_keywords_official(article)

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
            keywords=keywords,
            keyword_categories=keyword_categories,
            external_ids={"ieee_id": article_number, "doi": doi},
            raw_data=article,
        )

    def _parse_web(self, record: dict) -> RawPaperResult | None:
        """Parse a result from the web endpoint."""
        title = record.get("articleTitle", "").strip()
        if not title:
            return None
        # Remove HTML highlight tags
        title = re.sub(r"</?highlight>", "", title)

        authors = []
        for author in record.get("authors", []):
            authors.append({
                "name": author.get("preferredName", author.get("normalizedName", "Unknown")),
                "affiliation": None,
            })

        doi = record.get("doi", None)

        # Parse publication date
        pub_date_raw = record.get("publicationDate", "")
        pub_year = record.get("publicationYear", "")
        if pub_year:
            pub_date = f"{pub_year}-01-01"
        elif pub_date_raw and len(pub_date_raw) >= 4:
            pub_date = f"{pub_date_raw[:4]}-01-01"
        else:
            pub_date = None

        # Paper type
        content_type = record.get("contentType", record.get("displayContentType", ""))
        paper_type = "conference" if "conference" in content_type.lower() else "journal_article"
        if "standard" in content_type.lower():
            paper_type = "journal_article"

        article_number = record.get("articleNumber", "")
        pdf_url = f"https://ieeexplore.ieee.org/stamp/stamp.jsp?arnumber={article_number}" if article_number else None

        # Abstract — remove HTML
        abstract = record.get("abstract", None)
        if abstract:
            abstract = re.sub(r"<[^>]+>", "", abstract).strip()

        citation_count = record.get("citationCount", 0) or 0

        return RawPaperResult(
            source="ieee",
            source_id=article_number,
            title=title,
            abstract=abstract,
            authors=authors,
            doi=doi,
            publication_date=pub_date,
            journal=record.get("publicationTitle"),
            volume=None,
            pages=f"{record.get('startPage', '')}-{record.get('endPage', '')}".strip("-"),
            paper_type=paper_type,
            open_access="open" in record.get("accessType", {}).get("type", "").lower(),
            pdf_url=pdf_url,
            citation_count=citation_count,
            keywords=[],  # Web endpoint doesn't return keywords in search results
            keyword_categories={},
            external_ids={"ieee_id": article_number, "doi": doi},
            raw_data=record,
        )

    def _extract_keywords_official(self, article: dict) -> tuple[list[str], dict]:
        """Extract keywords from official API response."""
        keywords = []
        index_terms = article.get("index_terms", {})
        author_terms = index_terms.get("author_terms", {}).get("terms", [])
        ieee_terms = index_terms.get("ieee_terms", {}).get("terms", [])
        inspec_terms = index_terms.get("controlled_terms", {}).get("terms", [])
        inspec_nc = index_terms.get("non_controlled_terms", {}).get("terms", [])
        keywords.extend(author_terms)
        keywords.extend(ieee_terms)
        keywords.extend(inspec_terms)
        keywords.extend(inspec_nc)

        seen = set()
        unique = []
        for kw in keywords:
            kw_lower = kw.lower()
            if kw_lower not in seen:
                seen.add(kw_lower)
                unique.append(kw)

        categories = {k: v for k, v in {
            "Author Keywords": author_terms,
            "IEEE Terms": ieee_terms,
            "INSPEC Terms": inspec_terms + inspec_nc,
        }.items() if v}

        return unique, categories

    # --- Single article fetch ---

    async def fetch_metadata(self, article_number: str) -> RawPaperResult | None:
        """Fetch metadata for a specific IEEE article."""
        if settings.ieee_api_key:
            params = {
                "apikey": settings.ieee_api_key,
                "article_number": article_number,
            }
            try:
                response = await self._request("GET", "/search/articles", params=params)
                data = response.json()
                articles = data.get("articles", [])
                if articles:
                    return self._parse_official(articles[0])
            except Exception as e:
                logger.warning(f"[ieee] Fetch error for {article_number}: {e}")
        return None

    async def validate_exists(self, article_number: str) -> bool:
        result = await self.fetch_metadata(article_number)
        return result is not None
