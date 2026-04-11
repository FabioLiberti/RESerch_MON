#!/usr/bin/env python3
"""Cleanup quick/deep/summary analysis PDFs from Zotero for all synced papers.

Only the Extended Abstract is shareable with academic tutors. Quick, Deep and
Summary are local working notes that should never appear on Zotero. The
recurring sync already filters them out, but old uploads stay until the paper
is touched again. This script removes them in one shot.

Usage:
    python scripts/cleanup_zotero_quick_deep.py            # dry-run
    python scripts/cleanup_zotero_quick_deep.py --apply    # actually delete
"""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, update

from app.clients.zotero import ZoteroClient
from app.database import async_session
from app.models.analysis import AnalysisQueue
from app.models.paper import Paper

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cleanup_zotero_quick_deep")

PREFIXES_TO_REMOVE = (
    "analysis_quick_",
    "analysis_deep_",
    "analysis_summary_",
    "validation_",   # validation report stays local from now on
)


async def main(apply: bool) -> None:
    logger.info(f"Mode: {'APPLY' if apply else 'DRY-RUN'}")

    async with async_session() as db:
        r = await db.execute(
            select(Paper).where(Paper.zotero_key.isnot(None))
        )
        papers = list(r.scalars().all())

    logger.info(f"Scanning {len(papers)} papers on Zotero...")

    client = ZoteroClient()
    if not client.is_configured():
        logger.error("Zotero not configured in .env")
        return

    total_scanned = 0
    total_to_delete = 0
    total_deleted = 0
    papers_touched = 0

    try:
        for p in papers:
            total_scanned += 1
            try:
                resp = await client._request(
                    "GET",
                    f"{client.user_prefix}/items/{p.zotero_key}/children",
                    headers=client._headers(),
                )
                children = resp.json()
            except Exception as e:
                logger.warning(f"  paper {p.id} ({p.zotero_key}): failed to list children — {e}")
                continue

            targets = []
            for ch in children:
                data = ch.get("data", {})
                if data.get("itemType") != "attachment":
                    continue
                fname = (data.get("filename") or "").lower()
                if any(fname.startswith(pref) for pref in PREFIXES_TO_REMOVE):
                    targets.append((data.get("key") or ch.get("key"), data.get("filename"), ch.get("version", 0)))

            if not targets:
                continue

            papers_touched += 1
            logger.info(f"Paper {p.id} ({p.zotero_key}): {[t[1] for t in targets]}")
            for item_key, filename, version in targets:
                total_to_delete += 1
                if not apply:
                    logger.info(f"  [DRY] would DELETE {filename} ({item_key})")
                    continue
                try:
                    await client._request(
                        "DELETE",
                        f"{client.user_prefix}/items/{item_key}",
                        headers={**client._headers(), "If-Unmodified-Since-Version": str(version)},
                    )
                    logger.info(f"  DELETED {filename} ({item_key})")
                    total_deleted += 1
                except Exception as e:
                    logger.error(f"  FAILED to delete {filename} ({item_key}): {e}")
    finally:
        await client.close()

    logger.info("")
    logger.info(f"Scanned {total_scanned} papers")
    logger.info(f"Papers with quick/deep attachments: {papers_touched}")
    logger.info(f"Attachments to delete: {total_to_delete}")
    if apply:
        logger.info(f"Attachments actually deleted: {total_deleted}")

    # Reset DB flag: any AnalysisQueue row of mode quick/deep/summary marked
    # zotero_synced=True is stale data — the corresponding file no longer
    # exists on Zotero (only Extended Abstract is shareable now).
    async with async_session() as db:
        r = await db.execute(
            select(AnalysisQueue.id).where(
                AnalysisQueue.analysis_mode.in_(["quick", "deep", "summary"]),
                AnalysisQueue.zotero_synced.is_(True),
            )
        )
        stale_ids = [row[0] for row in r.all()]
        logger.info(f"Stale zotero_synced=True flags on quick/deep/summary AnalysisQueue rows: {len(stale_ids)}")
        if apply and stale_ids:
            await db.execute(
                update(AnalysisQueue)
                .where(AnalysisQueue.id.in_(stale_ids))
                .values(zotero_synced=False)
            )
            await db.commit()
            logger.info(f"Reset zotero_synced=False on {len(stale_ids)} rows.")
        elif stale_ids:
            logger.info(f"[DRY] would reset zotero_synced=False on {len(stale_ids)} rows.")

    if not apply:
        logger.info("DRY-RUN complete. Re-run with --apply to actually delete.")


if __name__ == "__main__":
    apply = "--apply" in sys.argv
    asyncio.run(main(apply))
