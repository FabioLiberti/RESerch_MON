"""Zotero synchronization service."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.clients.zotero import ZoteroClient
from app.models.paper import Paper, PaperAuthor

logger = logging.getLogger(__name__)


class ZoteroSyncService:
    """Syncs papers to a Zotero collection."""

    def __init__(self):
        self.client = ZoteroClient()

    async def close(self):
        await self.client.close()

    async def sync_paper(self, db: AsyncSession, paper_id: int) -> bool:
        """Sync a single paper to Zotero. Returns True if successful."""
        if not self.client.is_configured():
            logger.warning("Zotero not configured")
            return False

        collection_key = await self.client.get_or_create_collection()
        if not collection_key:
            return False

        result = await db.execute(
            select(Paper)
            .where(Paper.id == paper_id)
            .options(selectinload(Paper.authors).selectinload(PaperAuthor.author))
        )
        paper = result.unique().scalar_one_or_none()
        if not paper:
            return False

        if paper.zotero_key:
            logger.debug(f"Paper {paper_id} already in Zotero: {paper.zotero_key}")
            return True

        authors = [
            {"name": pa.author.name}
            for pa in sorted(paper.authors, key=lambda x: x.position)
            if pa.author
        ]

        key = await self.client.add_paper(
            collection_key=collection_key,
            title=paper.title,
            authors=authors,
            doi=paper.doi,
            abstract=paper.abstract,
            journal=paper.journal,
            date=paper.publication_date,
            url=paper.pdf_url,
            paper_type=paper.paper_type,
        )

        if key:
            paper.zotero_key = key
            await db.flush()
            return True

        return False

    async def sync_all_unsynced(self, db: AsyncSession) -> int:
        """Sync all papers not yet in Zotero."""
        if not self.client.is_configured():
            logger.warning("Zotero not configured, skipping sync")
            return 0

        result = await db.execute(
            select(Paper.id).where(Paper.zotero_key.is_(None))
        )
        paper_ids = [row[0] for row in result.all()]

        if not paper_ids:
            logger.info("All papers already synced to Zotero")
            return 0

        count = 0
        for pid in paper_ids:
            if await self.sync_paper(db, pid):
                count += 1

        logger.info(f"Synced {count}/{len(paper_ids)} papers to Zotero")
        return count
