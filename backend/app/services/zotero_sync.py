"""Zotero synchronization service — syncs papers with label → sub-collection mapping."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.clients.zotero import ZoteroClient
from app.models.paper import Paper, PaperAuthor
from app.models.label import Label, PaperLabel, PaperNote
from app.models.analysis import AnalysisQueue
from app.services.validation_report import get_validation_summary, build_validation_zotero_tags

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

    async def _upload_paper_pdf(self, paper: Paper) -> bool:
        """Upload the paper's local PDF as the main Zotero attachment.

        Idempotent: deletes any previously uploaded "paper_*.pdf" attachment
        before uploading the new one, so running this twice does not leave
        duplicates. The PDF is uploaded with a stable filename derived from
        the paper id.
        """
        from pathlib import Path
        if not paper.zotero_key or not paper.pdf_local_path:
            return False
        pdf_path = Path(paper.pdf_local_path)
        if not pdf_path.exists():
            logger.debug(f"Paper {paper.id}: pdf_local_path set but file missing on disk")
            return False
        try:
            # Remove any previously uploaded paper PDF (idempotency)
            await self.client.delete_child_attachments(paper.zotero_key, f"paper_{paper.id}")
            # Upload with a stable, deterministic filename
            filename = f"paper_{paper.id}.pdf"
            key = await self.client.upload_attachment(
                parent_item_key=paper.zotero_key,
                file_path=str(pdf_path),
                filename=filename,
                content_type="application/pdf",
            )
            if key:
                logger.info(f"Paper {paper.id}: uploaded original PDF as {filename}")
                return True
        except Exception as e:
            logger.warning(f"Paper {paper.id}: failed to upload original PDF to Zotero: {e}")
        return False

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

        # Disabled papers must NOT be on Zotero. If they were, remove them; if
        # they were never there, do nothing.
        if paper.disabled:
            if paper.zotero_key:
                try:
                    deleted = await self.client.delete_item(paper.zotero_key)
                    if deleted:
                        logger.info(f"Removed disabled paper {paper_id} from Zotero")
                        paper.zotero_key = None
                        await db.flush()
                except Exception as e:
                    logger.warning(f"Could not remove disabled paper {paper_id} from Zotero: {e}")
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

        # Build extra field with rating + validation summary.
        # Rating is ALWAYS rendered (even when not yet set) so it stays visible
        # in Zotero as a reminder to grade the paper. When a rating is set we
        # also emit a "Star Rating: N" line which Zotero picks up as native
        # star rating (visible in the sortable Rating column without opening
        # the item).
        extra_lines = []
        if paper.rating:
            stars = "★" * paper.rating + "☆" * (5 - paper.rating)
            extra_lines.append(f"Rating: {stars} ({paper.rating}/5)")
            extra_lines.append(f"Star Rating: {paper.rating}")
        else:
            extra_lines.append("Rating: ☆☆☆☆☆ (not yet rated)")

        # Validation summary (latest analysis per mode)
        analysis_result = await db.execute(
            select(AnalysisQueue)
            .where(AnalysisQueue.paper_id == paper_id, AnalysisQueue.status == "done")
            .order_by(AnalysisQueue.completed_at.desc())
        )
        all_analyses = list(analysis_result.scalars().all())
        seen_m: set[str] = set()
        latest: list[AnalysisQueue] = []
        for a in all_analyses:
            m = a.analysis_mode or "quick"
            if m not in seen_m:
                seen_m.add(m)
                latest.append(a)
        if latest:
            vsum = get_validation_summary(latest)
            extra_lines.append(f"Validation: {vsum['overall']}")
            if vsum["validated_modes"]:
                extra_lines.append(f"Validated: {', '.join(vsum['validated_modes'])}")
            if vsum["rejected_modes"]:
                extra_lines.append(f"Rejected: {', '.join(vsum['rejected_modes'])}")
            if vsum["needs_revision_modes"]:
                extra_lines.append(f"Needs revision: {', '.join(vsum['needs_revision_modes'])}")
            # Add validation tags (emoji visible + short for colored tags)
            for vt in build_validation_zotero_tags(vsum):
                if vt not in tags:
                    tags.append(vt)

        # Tutor check tags — independent from validation. The user assigns a
        # colored tag (once) to each short form so the corresponding coloured
        # square shows next to the paper title in Zotero.
        TUTOR_CHECK_TAGS: dict[str, tuple[str, str]] = {
            "ok":     ("\u2705 Check OK",     "check-ok"),        # ✅
            "review": ("\u26a0\ufe0f Check Review", "check-review"),  # ⚠️
            "no":     ("\u274c Check NO",     "check-no"),        # ❌
        }
        if paper.tutor_check in TUTOR_CHECK_TAGS:
            for vt in TUTOR_CHECK_TAGS[paper.tutor_check]:
                if vt not in tags:
                    tags.append(vt)

        extra_field = "\n".join(extra_lines) if extra_lines else ""

        # Get note
        note_result = await db.execute(
            select(PaperNote).where(PaperNote.paper_id == paper_id)
        )
        note = note_result.scalar_one_or_none()

        if paper.zotero_key:
            # Paper already in Zotero — update collections, tags, extra, and notes
            for key in collection_keys:
                await self.client.add_paper_to_collection(paper.zotero_key, key)
            await self.client.update_tags(paper.zotero_key, tags)
            await self.client.update_extra(paper.zotero_key, extra_field)
            if note and note.text and note.text.strip():
                await self.client.delete_child_notes(paper.zotero_key)
                await self.client.add_note(paper.zotero_key, f"<p>{note.text}</p>")
            # Upload the original paper PDF as attachment (idempotent: replaces any existing one)
            await self._upload_paper_pdf(paper)
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
            extra=extra_field,
        )

        if zotero_key:
            paper.zotero_key = zotero_key
            await db.flush()
            if note and note.text and note.text.strip():
                await self.client.add_note(zotero_key, f"<p>{note.text}</p>")
            # Upload the original paper PDF as the first (main) attachment
            await self._upload_paper_pdf(paper)
            logger.info(f"Paper {paper_id} synced to Zotero ({zotero_key}) in {len(collection_keys)} collections, {len(tags)} tags")
            return True

        return False

    async def sync_papers(self, db: AsyncSession, paper_ids: list[int]) -> dict:
        """Sync specific papers to Zotero."""
        if not self.client.is_configured():
            return {"synced": 0, "failed": 0, "message": "Zotero not configured"}

        total = len(paper_ids)
        logger.info(f"Bulk Zotero sync started: {total} papers — may take a while (metadata + PDF upload each)")
        synced = 0
        failed = 0
        for idx, pid in enumerate(paper_ids, start=1):
            logger.info(f"Zotero sync [{idx}/{total}] paper_id={pid} ...")
            if await self.sync_paper(db, pid):
                synced += 1
            else:
                failed += 1

        logger.info(f"Bulk Zotero sync COMPLETE: {synced}/{total} synced, {failed} failed")
        return {"synced": synced, "failed": failed, "total": total}

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
