"""arXiv API client using Atom feed."""

import logging
import re

import feedparser

from app.clients.base import BaseAPIClient, RawPaperResult

logger = logging.getLogger(__name__)


class ArXivClient(BaseAPIClient):
    source_name = "arxiv"
    base_url = "https://export.arxiv.org/api"
    requests_per_second = 0.2  # 1 request per 5 seconds (arXiv is strict)

    async def search(self, query: str, max_results: int = 50) -> list[RawPaperResult]:
        """Search arXiv for papers."""
        params = {
            "search_query": query,
            "start": "0",
            "max_results": str(max_results),
            "sortBy": "submittedDate",
            "sortOrder": "descending",
        }

        try:
            response = await self._request("GET", "/query", params=params)
            feed = feedparser.parse(response.text)
        except Exception as e:
            logger.error(f"[arxiv] Search error: {e}")
            return []

        results = []
        for entry in feed.entries:
            parsed = self._parse_entry(entry)
            if parsed:
                results.append(parsed)

        logger.info(f"[arxiv] Found {len(results)} papers for: {query[:80]}")
        return results

    def _parse_entry(self, entry: dict) -> RawPaperResult | None:
        """Parse a single arXiv Atom feed entry."""
        title = entry.get("title", "").replace("\n", " ").strip()
        if not title:
            return None

        # Extract arXiv ID from entry id URL
        entry_id = entry.get("id", "")
        arxiv_id = ""
        match = re.search(r"arxiv\.org/abs/(.+?)(?:v\d+)?$", entry_id)
        if match:
            arxiv_id = match.group(1)

        # Authors
        authors = []
        for author in entry.get("authors", []):
            name = author.get("name", "")
            affil = ""
            if "arxiv_affiliation" in author:
                affil = author["arxiv_affiliation"]
            authors.append({"name": name, "affiliation": affil or None})

        # Abstract
        abstract = entry.get("summary", "").replace("\n", " ").strip()

        # Publication date
        published = entry.get("published", "")
        pub_date = published[:10] if len(published) >= 10 else ""

        # DOI
        doi = None
        if "arxiv_doi" in entry:
            doi = entry["arxiv_doi"]

        # PDF URL
        pdf_url = None
        for link in entry.get("links", []):
            if link.get("type") == "application/pdf":
                pdf_url = link.get("href")
                break
        if not pdf_url and arxiv_id:
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

        # Categories
        categories = [tag.get("term", "") for tag in entry.get("tags", [])]

        # Journal ref
        journal = entry.get("arxiv_journal_ref", None)

        return RawPaperResult(
            source="arxiv",
            source_id=arxiv_id,
            title=title,
            abstract=abstract,
            authors=authors,
            doi=doi,
            publication_date=pub_date,
            journal=journal,
            paper_type="preprint",
            open_access=True,
            pdf_url=pdf_url,
            keywords=categories,  # arXiv categories as keywords (e.g., cs.LG, cs.CR)
            external_ids={"arxiv_id": arxiv_id, "categories": categories},
            raw_data={"arxiv_id": arxiv_id, "categories": categories},
        )

    async def fetch_metadata(self, arxiv_id: str) -> RawPaperResult | None:
        """Fetch metadata for a specific arXiv paper."""
        params = {"id_list": arxiv_id, "max_results": "1"}
        try:
            response = await self._request("GET", "/query", params=params)
            feed = feedparser.parse(response.text)
            if feed.entries:
                return self._parse_entry(feed.entries[0])
        except Exception as e:
            logger.warning(f"[arxiv] Fetch error for {arxiv_id}: {e}")
        return None

    async def validate_exists(self, arxiv_id: str) -> bool:
        """Check if an arXiv paper exists."""
        result = await self.fetch_metadata(arxiv_id)
        return result is not None and result.title != "Error"
