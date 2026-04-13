"""Review Journal API — CRUD for reviewer entries and observations per paper.

Each paper can have multiple ReviewerEntry records (one per reviewer).
Each entry has a raw_text (free-form) and structured items (observations).
"""

import json
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.review_journal import ReviewerEntry
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Schemas ---

class ObservationItem(BaseModel):
    text: str
    section_ref: str | None = None
    severity: str = "minor"  # major | minor | suggestion | praise
    status: str = "to_address"  # to_address | addressed | rejected_justified | not_applicable
    response: str | None = None


class RubricDimension(BaseModel):
    dimension: str
    score: int | None = None
    score_max: int = 5


class CreateReviewerEntryRequest(BaseModel):
    reviewer_label: str
    source_type: str = "other"
    received_at: str | None = None
    raw_text: str | None = None
    rating: int | None = None
    rating_max: int | None = None
    rating_label: str | None = None
    decision: str | None = None
    rubric: list[RubricDimension] | None = None
    items: list[ObservationItem] = []


class UpdateReviewerEntryRequest(BaseModel):
    reviewer_label: str | None = None
    source_type: str | None = None
    received_at: str | None = None
    raw_text: str | None = None
    rating: int | None = None
    rating_max: int | None = None
    rating_label: str | None = None
    decision: str | None = None
    rubric: list[RubricDimension] | None = None
    items: list[ObservationItem] | None = None


# --- Helpers ---

def _serialize(entry: ReviewerEntry) -> dict:
    return {
        "id": entry.id,
        "paper_id": entry.paper_id,
        "reviewer_label": entry.reviewer_label,
        "source_type": entry.source_type,
        "received_at": entry.received_at,
        "raw_text": entry.raw_text,
        "attachment_path": entry.attachment_path,
        "has_attachment": bool(entry.attachment_path and Path(entry.attachment_path).exists()),
        "rating": entry.rating,
        "rating_max": entry.rating_max,
        "rating_label": entry.rating_label,
        "decision": entry.decision,
        "rubric": entry.rubric,
        "items": entry.items,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
    }


def _storage_dir(paper_id: int) -> Path:
    d = Path(settings.reports_path) / "review-journal" / str(paper_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


# --- Endpoints ---

@router.get("/{paper_id}")
async def list_entries(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all reviewer entries for a paper, with progress stats."""
    result = await db.execute(
        select(ReviewerEntry)
        .where(ReviewerEntry.paper_id == paper_id)
        .order_by(ReviewerEntry.created_at.asc())
    )
    entries = result.scalars().all()

    # Compute aggregate progress across all entries
    total_items = 0
    addressed = 0
    for e in entries:
        for item in e.items:
            total_items += 1
            if item.get("status") in ("addressed", "rejected_justified", "not_applicable"):
                addressed += 1

    return {
        "paper_id": paper_id,
        "entries": [_serialize(e) for e in entries],
        "total_observations": total_items,
        "addressed": addressed,
        "progress_pct": round(addressed / total_items * 100) if total_items > 0 else 0,
    }


@router.post("/{paper_id}")
async def create_entry(
    paper_id: int,
    body: CreateReviewerEntryRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new reviewer entry for a paper."""
    entry = ReviewerEntry(
        paper_id=paper_id,
        reviewer_label=body.reviewer_label,
        source_type=body.source_type,
        received_at=body.received_at,
        raw_text=body.raw_text,
        rating=body.rating,
        rating_max=body.rating_max,
        rating_label=body.rating_label,
        decision=body.decision,
    )
    if body.rubric is not None:
        entry.rubric = [r.model_dump() for r in body.rubric]
    entry.items = [item.model_dump() for item in body.items]
    db.add(entry)
    await db.flush()
    await db.commit()
    await db.refresh(entry)
    logger.info(f"Review journal entry created: paper={paper_id}, reviewer={body.reviewer_label}")
    return _serialize(entry)


@router.put("/entry/{entry_id}")
async def update_entry(
    entry_id: int,
    body: UpdateReviewerEntryRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a reviewer entry (label, raw_text, items, etc.)."""
    entry = await db.get(ReviewerEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    if body.reviewer_label is not None:
        entry.reviewer_label = body.reviewer_label
    if body.source_type is not None:
        entry.source_type = body.source_type
    if body.received_at is not None:
        entry.received_at = body.received_at
    if body.raw_text is not None:
        entry.raw_text = body.raw_text
    if body.rating is not None:
        entry.rating = body.rating
    if body.rating_max is not None:
        entry.rating_max = body.rating_max
    if body.rating_label is not None:
        entry.rating_label = body.rating_label
    if body.decision is not None:
        entry.decision = body.decision
    if body.rubric is not None:
        entry.rubric = [r.model_dump() for r in body.rubric]
    if body.items is not None:
        entry.items = [item.model_dump() for item in body.items]

    await db.flush()
    await db.commit()
    return _serialize(entry)


@router.delete("/entry/{entry_id}")
async def delete_entry(
    entry_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a reviewer entry."""
    entry = await db.get(ReviewerEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    await db.delete(entry)
    await db.commit()
    return {"deleted": entry_id}


@router.post("/entry/{entry_id}/attachment")
async def upload_attachment(
    entry_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload an attachment (e.g. annotated PDF, editorial letter) to a reviewer entry."""
    entry = await db.get(ReviewerEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    storage = _storage_dir(entry.paper_id)
    safe_name = f"reviewer_{entry_id}_{file.filename or 'attachment.pdf'}"
    out_path = storage / safe_name
    content = await file.read()
    out_path.write_bytes(content)
    entry.attachment_path = str(out_path)
    await db.commit()
    return {"path": str(out_path), "size_kb": round(len(content) / 1024)}


@router.get("/entry/{entry_id}/attachment")
async def get_attachment(
    entry_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download the attachment for a reviewer entry."""
    entry = await db.get(ReviewerEntry, entry_id)
    if not entry or not entry.attachment_path:
        raise HTTPException(status_code=404, detail="No attachment found")

    file_path = Path(entry.attachment_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Attachment file not found on disk")

    # Serve PDFs inline (opens in browser), other files as download
    suffix = file_path.suffix.lower()
    media_types = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
                   ".jpeg": "image/jpeg", ".txt": "text/plain", ".md": "text/markdown"}
    media_type = media_types.get(suffix, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type=media_type,
    )
