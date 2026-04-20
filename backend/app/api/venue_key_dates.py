"""Venue Key Dates API — CRUD for conference/journal key milestones.

Tracks the official venue calendar (submission deadlines, notifications,
registration cut-offs, conference dates) for a specific manuscript.
Each row can optionally be linked to a SubmissionRound or ReviewerEntry.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.database import get_db
from app.models.venue_key_date import VenueKeyDate
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Schemas ---

class CreateKeyDateRequest(BaseModel):
    label: str
    date: str
    is_done: bool = False
    notes: str | None = None
    source_url: str | None = None
    order_index: int = 0
    linked_round_id: int | None = None
    linked_journal_entry_id: int | None = None


class UpdateKeyDateRequest(BaseModel):
    label: str | None = None
    date: str | None = None
    is_done: bool | None = None
    notes: str | None = None
    source_url: str | None = None
    order_index: int | None = None
    linked_round_id: int | None = None
    linked_journal_entry_id: int | None = None


# --- Helpers ---

def _serialize(r: VenueKeyDate) -> dict:
    return {
        "id": r.id,
        "paper_id": r.paper_id,
        "label": r.label,
        "date": r.date,
        "is_done": bool(r.is_done),
        "notes": r.notes,
        "source_url": r.source_url,
        "order_index": r.order_index or 0,
        "linked_round_id": r.linked_round_id,
        "linked_journal_entry_id": r.linked_journal_entry_id,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


# --- Endpoints ---

@router.get("/{paper_id}")
async def list_key_dates(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all key dates for a paper, ordered by date then order_index."""
    result = await db.execute(
        select(VenueKeyDate)
        .where(VenueKeyDate.paper_id == paper_id)
        .order_by(VenueKeyDate.date.asc(), VenueKeyDate.order_index.asc())
    )
    items = result.scalars().all()
    return {
        "paper_id": paper_id,
        "key_dates": [_serialize(r) for r in items],
        "total": len(items),
    }


@router.post("/{paper_id}")
async def create_key_date(
    paper_id: int,
    body: CreateKeyDateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new venue key date entry."""
    r = VenueKeyDate(
        paper_id=paper_id,
        label=body.label.strip(),
        date=body.date,
        is_done=body.is_done,
        notes=body.notes,
        source_url=body.source_url,
        order_index=body.order_index,
        linked_round_id=body.linked_round_id,
        linked_journal_entry_id=body.linked_journal_entry_id,
    )
    db.add(r)
    await db.flush()
    await db.commit()
    await db.refresh(r)
    logger.info(f"VenueKeyDate created: paper={paper_id}, label={body.label}, date={body.date}")
    return _serialize(r)


@router.put("/entry/{entry_id}")
async def update_key_date(
    entry_id: int,
    body: UpdateKeyDateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a venue key date entry."""
    r = await db.get(VenueKeyDate, entry_id)
    if not r:
        raise HTTPException(status_code=404, detail="Key date not found")

    if body.label is not None:
        r.label = body.label.strip()
    if body.date is not None:
        r.date = body.date
    if body.is_done is not None:
        r.is_done = body.is_done
    if body.notes is not None:
        r.notes = body.notes
    if body.source_url is not None:
        r.source_url = body.source_url
    if body.order_index is not None:
        r.order_index = body.order_index
    if body.linked_round_id is not None:
        r.linked_round_id = body.linked_round_id or None
    if body.linked_journal_entry_id is not None:
        r.linked_journal_entry_id = body.linked_journal_entry_id or None

    await db.flush()
    await db.commit()
    return _serialize(r)


@router.delete("/entry/{entry_id}")
async def delete_key_date(
    entry_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a venue key date entry."""
    r = await db.get(VenueKeyDate, entry_id)
    if not r:
        raise HTTPException(status_code=404, detail="Key date not found")
    await db.delete(r)
    await db.commit()
    return {"deleted": entry_id}
