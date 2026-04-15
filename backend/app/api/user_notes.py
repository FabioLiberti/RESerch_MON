"""API endpoints for per-user notes (dev notes, bibliography notes)."""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.user_note import UserNote

logger = logging.getLogger(__name__)
router = APIRouter()


class SaveNoteRequest(BaseModel):
    content: str


@router.get("/{paper_id}/{note_type}")
async def get_notes(
    paper_id: int,
    note_type: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all user notes for a paper+type. Returns list with each user's note."""
    result = await db.execute(
        select(UserNote)
        .where(UserNote.paper_id == paper_id, UserNote.note_type == note_type)
        .order_by(UserNote.updated_at.desc())
    )
    notes = result.scalars().all()
    return [
        {
            "id": n.id,
            "user_id": n.user_id,
            "username": n.username,
            "content": n.content,
            "updated_at": n.updated_at.isoformat() if n.updated_at else None,
            "is_mine": n.user_id == user.id,
        }
        for n in notes
    ]


@router.put("/{paper_id}/{note_type}")
async def save_note(
    paper_id: int,
    note_type: str,
    body: SaveNoteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save (create or update) the current user's note for a paper+type."""
    if note_type not in ("dev_notes", "bib_notes"):
        from fastapi import HTTPException
        raise HTTPException(400, "note_type must be 'dev_notes' or 'bib_notes'")

    result = await db.execute(
        select(UserNote).where(
            UserNote.paper_id == paper_id,
            UserNote.user_id == user.id,
            UserNote.note_type == note_type,
        )
    )
    note = result.scalar_one_or_none()

    if note:
        note.content = body.content
    else:
        note = UserNote(
            paper_id=paper_id,
            user_id=user.id,
            username=user.username,
            note_type=note_type,
            content=body.content,
        )
        db.add(note)

    await db.commit()
    return {"status": "saved", "paper_id": paper_id, "note_type": note_type}


@router.get("/has-notes/{paper_id}")
async def has_notes(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if a paper has any dev_notes or bib_notes (for icon display)."""
    from sqlalchemy import func
    dev = await db.execute(
        select(func.count()).select_from(UserNote).where(
            UserNote.paper_id == paper_id, UserNote.note_type == "dev_notes",
            UserNote.content != "", UserNote.content.isnot(None),
        )
    )
    bib = await db.execute(
        select(func.count()).select_from(UserNote).where(
            UserNote.paper_id == paper_id, UserNote.note_type == "bib_notes",
            UserNote.content != "", UserNote.content.isnot(None),
        )
    )
    return {
        "has_dev_notes": dev.scalar_one() > 0,
        "has_bib_notes": bib.scalar_one() > 0,
    }
