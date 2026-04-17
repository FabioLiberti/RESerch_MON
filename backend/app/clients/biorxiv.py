"""bioRxiv/medRxiv API client."""

import logging
from datetime import datetime, timedelta

from app.clients.base import BaseAPIClient, RawPaperResult

logger = logging.getLogger(__name__)


class BioRxivClient(BaseAPIClient):
    source_name = "biorxiv"
    base_url = "https://api.biorxiv.org"
    requests_per_second = 1.0

    async def search(
        self,
        query: str,
        max_results: int = 50,
        server: str = "biorxiv",
        **kwargs,
        days_back: int = 30,
    ) -> list[RawPaperResult]:
        """Search bioRxiv/medRxiv by fetching recent papers and filtering locally.

        bioRxiv API doesn't support keyword search directly, so we fetch
        recent papers and filter by title/abstract containing query keywords.
        """
        end_date = datetime.utcnow().strftime("%Y-%m-%d")
        start_date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")

        # Extract keywords from query for local filtering
        keywords = self._extract_keywords(query)

        results = []
        cursor = 0
        batch_size = 100

        while len(results) < max_results:
            url = f"/details/{server}/{start_date}/{end_date}/{cursor}"
            try:
                response = await self._request("GET", url)
                data = response.json()
            except Exception as e:
                logger.error(f"[{server}] API error: {e}")
                break

            collection = data.get("collection", [])
            if not collection:
                break

            for item in collection:
                parsed = self._parse_item(item, server)
                if parsed and self._matches_keywords(parsed, keywords):
                    results.append(parsed)

            messages = data.get("messages", [])
            total = int(messages[0].get("total", 0)) if messages else 0
            cursor += batch_size

            if cursor >= total:
                break

        logger.info(f"[{server}] Found {len(results)} matching papers (keywords: {keywords})")
        return results[:max_results]

    def _extract_keywords(self, query: str) -> list[str]:
        """Extract meaningful keywords from a search query."""
        # Remove common query syntax
        query = query.replace('"', "").lower()
        stop_words = {"and", "or", "not", "the", "in", "of", "for", "a", "an", "with"}
        words = [w.strip() for w in query.split() if w.strip() not in stop_words]
        return words

    def _matches_keywords(self, paper: RawPaperResult, keywords: list[str]) -> bool:
        """Check if paper title/abstract contains the search keywords."""
        text = f"{paper.title} {paper.abstract or ''}".lower()
        # Require at least one keyword match
        return any(kw in text for kw in keywords)

    def _parse_item(self, item: dict, server: str) -> RawPaperResult | None:
        """Parse a bioRxiv/medRxiv API item."""
        title = item.get("title", "").strip()
        if not title:
            return None

        doi = item.get("doi", "")
        biorxiv_doi = f"10.1101/{doi}" if doi and not doi.startswith("10.") else doi

        # Authors (semicolon-separated string)
        authors_str = item.get("authors", "")
        authors = []
        if authors_str:
            for name in authors_str.split(";"):
                name = name.strip()
                if name:
                    authors.append({"name": name})

        pub_date = item.get("date", "")

        # Keywords from category field
        keywords = []
        category = item.get("category", "")
        if category:
            keywords.append(category)

        return RawPaperResult(
            source=server,
            source_id=doi,
            title=title,
            abstract=item.get("abstract"),
            authors=authors,
            doi=biorxiv_doi,
            publication_date=pub_date,
            journal=f"{server} (preprint)",
            paper_type="preprint",
            open_access=True,
            keywords=keywords,
            pdf_url=f"https://www.{server}.org/content/{biorxiv_doi}v{item.get('version', '1')}.full.pdf"
            if biorxiv_doi
            else None,
            external_ids={f"{server}_doi": biorxiv_doi},
            raw_data=item,
        )

    async def fetch_metadata(self, doi: str) -> RawPaperResult | None:
        """Fetch metadata for a specific bioRxiv DOI."""
        try:
            response = await self._request("GET", f"/details/biorxiv/{doi}/{doi}")
            data = response.json()
            collection = data.get("collection", [])
            if collection:
                return self._parse_item(collection[0], "biorxiv")
        except Exception as e:
            logger.warning(f"[biorxiv] Fetch error for {doi}: {e}")
        return None

    async def validate_exists(self, doi: str) -> bool:
        result = await self.fetch_metadata(doi)
        return result is not None
