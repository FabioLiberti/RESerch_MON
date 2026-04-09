"""Zotero synchronization service — syncs papers with label → sub-collection mapping."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.clients.zotero import ZoteroClient
from app.models.paper import Paper, PaperAuthor
from app.models.label import Label, PaperLabel, PaperNote

logger = logging.getLogger(__name__)


class ZoteroSyncService:
    """Syncs papers to Zotero with label-based sub-collections."""

    def __init__(self):
        self.client = ZoteroClient()
        self._main_collection_key: str | None = None
        self._label_collection_keys: dict[str, str] = {}  # label_name → collection_key

    async def close(self):
        await self.client.close()

    async def _get_main_collection(self) -> str | None:
        if not self._main_collection_key:
            self._main_collection_key = await self.client.get_or_create_collection()
        return self._main_collection_key

    async def _get_label_collection(self, label_name: str) -> str | None:
        """Get or create a sub-collection for a label under the main collection."""
        if label_name in self._label_collection_keys:
            return self._label_collection_keys[label_name]

        main_key = await self._get_main_collection()
        if not main_key:
            return None

        key = await self.client.get_or_create_collection(name=label_name, parent_key=main_key)
        if key:
            self._label_collection_keys[label_name] = key
        return key

    async def sync_paper(self, db: AsyncSession, paper_id: int) -> bool:
        """Sync a single paper to Zotero. Places in main collection + label sub-collections."""
        if not self.client.is_configured():
            logger.warning("Zotero not configured")
            return False

        main_key = await self._get_main_collection()
        if not main_key:
            return False

        # Get paper with authors
        result = await db.execute(
            select(Paper)
            .where(Paper.id == paper_id)
            .options(selectinload(Paper.authors).selectinload(PaperAuthor.author))
        )
        paper = result.unique().scalar_one_or_none()
        if not paper:
            return False

        # Get paper labels
        label_result = await db.execute(
            select(Label)
            .join(PaperLabel)
            .where(PaperLabel.paper_id == paper_id)
        )
        labels = list(label_result.scalars().all())

        # Build collection list: main + label sub-collections
        collection_keys = [main_key]
        for label in labels:
            label_key = await self._get_label_collection(label.name)
            if label_key:
                collection_keys.append(label_key)

        authors = [
            {"name": pa.author.name}
            for pa in sorted(paper.authors, key=lambda x: x.position)
            if pa.author
        ]

        # Build tags from keywords + labels
        tags = list(paper.keywords or [])
        for label in labels:
            if label.name not in tags:
                tags.append(label.name)

        # Get note
        note_result = await db.execute(
            select(PaperNote).where(PaperNote.paper_id == paper_id)
        )
        note = note_result.scalar_one_or_none()

        if paper.zotero_key:
            # Paper already in Zotero — update collections, tags, and notes
            for key in collection_keys:
                await self.client.add_paper_to_collection(paper.zotero_key, key)
            # Update tags
            await self.client.update_tags(paper.zotero_key, tags)
            # Sync note (delete old notes, add new if exists)
            if note and note.text and note.text.strip():
                await self.client.delete_child_notes(paper.zotero_key)
                await self.client.add_note(paper.zotero_key, f"<p>{note.text}</p>")
            logger.debug(f"Paper {paper_id} updated in Zotero: {paper.zotero_key}")
            return True

        # New paper — add to Zotero
        zotero_key = await self.client.add_paper(
            collection_keys=collection_keys,
            title=paper.title,
            authors=authors,
            doi=paper.doi,
            abstract=paper.abstract,
            journal=paper.journal,
            date=paper.publication_date,
            url=paper.pdf_url,
            paper_type=paper.paper_type,
            tags=tags,
        )

        if zotero_key:
            paper.zotero_key = zotero_key
            await db.flush()
            # Add note if exists
            if note and note.text and note.text.strip():
                await self.client.add_note(zotero_key, f"<p>{note.text}</p>")
            logger.info(f"Paper {paper_id} synced to Zotero ({zotero_key}) in {len(collection_keys)} collections, {len(tags)} tags")
            return True

        return False

    async def sync_papers(self, db: AsyncSession, paper_ids: list[int]) -> dict:
        """Sync specific papers to Zotero."""
        if not self.client.is_configured():
            return {"synced": 0, "failed": 0, "message": "Zotero not configured"}

        synced = 0
        failed = 0
        for pid in paper_ids:
            if await self.sync_paper(db, pid):
                synced += 1
            else:
                failed += 1

        logger.info(f"Zotero sync: {synced} synced, {failed} failed")
        return {"synced": synced, "failed": failed}

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

        res = await self.sync_papers(db, paper_ids)
        return res["synced"]
