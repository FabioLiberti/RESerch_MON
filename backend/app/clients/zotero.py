"""Zotero Web API v3 client for syncing papers to collections."""

import logging

from app.clients.base import BaseAPIClient
from app.config import settings

logger = logging.getLogger(__name__)

COLLECTION_NAME = "FL-Research-Monitor"


class ZoteroClient(BaseAPIClient):
    source_name = "zotero"
    base_url = "https://api.zotero.org"
    requests_per_second = 5.0

    def _headers(self) -> dict:
        return {
            "Zotero-API-Version": "3",
            "Authorization": f"Bearer {settings.zotero_api_key}",
            "Content-Type": "application/json",
        }

    @property
    def user_prefix(self) -> str:
        return f"/users/{settings.zotero_user_id}"

    def is_configured(self) -> bool:
        return bool(settings.zotero_api_key and settings.zotero_user_id)

    async def get_or_create_collection(self) -> str | None:
        """Get or create the FL-Research-Monitor collection. Returns collection key."""
        if not self.is_configured():
            logger.warning("[zotero] Not configured (missing API key or user ID)")
            return None

        try:
            # List collections
            response = await self._request(
                "GET",
                f"{self.user_prefix}/collections",
                headers=self._headers(),
            )
            collections = response.json()

            for col in collections:
                if col.get("data", {}).get("name") == COLLECTION_NAME:
                    return col["key"]

            # Create collection
            response = await self._request(
                "POST",
                f"{self.user_prefix}/collections",
                headers=self._headers(),
                json=[{"name": COLLECTION_NAME}],
            )
            result = response.json()
            if result.get("successful", {}).get("0"):
                key = result["successful"]["0"]["key"]
                logger.info(f"[zotero] Created collection '{COLLECTION_NAME}': {key}")
                return key

        except Exception as e:
            logger.error(f"[zotero] Error getting/creating collection: {e}")

        return None

    async def add_paper(
        self,
        collection_key: str,
        title: str,
        authors: list[dict],
        doi: str | None = None,
        abstract: str | None = None,
        journal: str | None = None,
        date: str | None = None,
        url: str | None = None,
        paper_type: str = "journalArticle",
    ) -> str | None:
        """Add a paper to the Zotero collection. Returns item key or None."""
        if not self.is_configured():
            return None

        # Map paper_type
        zotero_type = {
            "journal_article": "journalArticle",
            "preprint": "preprint",
            "conference": "conferencePaper",
            "review": "journalArticle",
        }.get(paper_type, "journalArticle")

        # Build creators
        creators = []
        for author in authors[:20]:  # Zotero limit
            name = author.get("name", "")
            parts = name.rsplit(" ", 1)
            creators.append({
                "creatorType": "author",
                "firstName": parts[0] if len(parts) > 1 else "",
                "lastName": parts[-1],
            })

        item_data = {
            "itemType": zotero_type,
            "title": title,
            "creators": creators,
            "abstractNote": abstract or "",
            "publicationTitle": journal or "",
            "date": date or "",
            "DOI": doi or "",
            "url": url or (f"https://doi.org/{doi}" if doi else ""),
            "collections": [collection_key],
        }

        try:
            response = await self._request(
                "POST",
                f"{self.user_prefix}/items",
                headers=self._headers(),
                json=[item_data],
            )
            result = response.json()
            if result.get("successful", {}).get("0"):
                key = result["successful"]["0"]["key"]
                logger.info(f"[zotero] Added paper: {title[:50]}... ({key})")
                return key
            else:
                failed = result.get("failed", {})
                if failed:
                    logger.warning(f"[zotero] Failed to add paper: {failed}")

        except Exception as e:
            logger.error(f"[zotero] Error adding paper: {e}")

        return None
