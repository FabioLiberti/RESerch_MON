"""Zotero sync API endpoints."""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.analysis import AnalysisQueue
from app.models.paper import Paper
from app.models.user import User
from app.api.auth import get_current_user, require_admin
from app.clients.zotero import ZoteroClient
from app.services.zotero_sync import ZoteroSyncService

logger = logging.getLogger(__name__)

router = APIRouter()


class SyncRequest(BaseModel):
    paper_ids: list[int]


@router.post("/sync")
async def sync_papers(
    body: SyncRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Sync selected papers to Zotero (with label → sub-collection mapping)."""
    if not body.paper_ids:
        raise HTTPException(status_code=400, detail="No paper IDs provided")

    service = ZoteroSyncService()
    if not service.client.is_configured():
        raise HTTPException(status_code=503, detail="Zotero not configured. Set ZOTERO_API_KEY and ZOTERO_USER_ID in .env")

    try:
        result = await service.sync_papers(db, body.paper_ids)
        return result
    finally:
        await service.close()


@router.post("/sync-all")
async def sync_all(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Sync all unsynced papers to Zotero."""
    service = ZoteroSyncService()
    if not service.client.is_configured():
        raise HTTPException(status_code=503, detail="Zotero not configured")

    try:
        count = await service.sync_all_unsynced(db)
        return {"synced": count}
    finally:
        await service.close()


@router.post("/sync-analysis/{paper_id}")
async def sync_analysis(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload analysis report PDF as attachment to the paper's Zotero item."""
    # Check paper exists and has zotero_key
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if not paper.zotero_key:
        raise HTTPException(status_code=400, detail="Paper not synced to Zotero yet. Sync the paper first.")

    # Get most recent analysis per mode (quick + deep)
    result = await db.execute(
        select(AnalysisQueue).where(
            AnalysisQueue.paper_id == paper_id,
            AnalysisQueue.status == "done",
        ).order_by(AnalysisQueue.completed_at.desc())
    )
    all_analyses = result.scalars().all()

    # Keep only latest per mode
    seen_modes: set[str] = set()
    analyses_to_sync: list = []
    for a in all_analyses:
        mode = a.analysis_mode or "quick"
        if mode not in seen_modes:
            seen_modes.add(mode)
            analyses_to_sync.append(a)

    if not analyses_to_sync:
        raise HTTPException(status_code=404, detail="No analysis report found for this paper")

    # Order: extended first (becomes Zotero's main "PDF" attachment), then summary, quick, deep
    mode_order = {"extended": 0, "summary": 1, "quick": 2, "deep": 3}
    analyses_to_sync.sort(key=lambda a: mode_order.get(a.analysis_mode or "quick", 9))

    client = ZoteroClient()
    if not client.is_configured():
        raise HTTPException(status_code=503, detail="Zotero not configured")

    try:
        # Delete old analysis attachments before uploading new ones
        await client.delete_child_attachments(paper.zotero_key, f"analysis_")

        uploaded = []
        for analysis in analyses_to_sync:
            mode = analysis.analysis_mode or "quick"

            # Prefer PDF, fallback to HTML (lowercase filenames)
            if analysis.pdf_path and Path(analysis.pdf_path).exists():
                file_path = analysis.pdf_path
                filename = f"analysis_{mode}_{paper_id}.pdf"
                content_type = "application/pdf"
            elif analysis.html_path and Path(analysis.html_path).exists():
                file_path = analysis.html_path
                filename = f"analysis_{mode}_{paper_id}.html"
                content_type = "text/html"
            else:
                continue

            attachment_key = await client.upload_attachment(
                parent_item_key=paper.zotero_key,
                file_path=file_path,
                filename=filename,
                content_type=content_type,
            )
            if attachment_key:
                uploaded.append(filename)
                analysis.zotero_synced = True

        await db.flush()
        await db.commit()

        if not uploaded:
            return {"status": "already_synced", "filenames": [], "count": 0, "message": "Analysis reports already present in Zotero"}

        return {"status": "uploaded", "filenames": uploaded, "count": len(uploaded)}

    finally:
        await client.close()


@router.delete("/remove/{paper_id}")
async def remove_from_zotero(
    paper_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Remove a paper and its attachments from Zotero, clear zotero_key in DB."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if not paper.zotero_key:
        raise HTTPException(status_code=400, detail="Paper is not on Zotero")

    client = ZoteroClient()
    if not client.is_configured():
        raise HTTPException(status_code=503, detail="Zotero not configured")

    try:
        deleted = await client.delete_item(paper.zotero_key)
        if deleted:
            paper.zotero_key = None
            await db.flush()
            await db.commit()
            return {"status": "removed", "paper_id": paper_id}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete from Zotero")
    finally:
        await client.close()
