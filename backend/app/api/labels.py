"""Labels and Notes API endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.label import Label, PaperLabel, PaperNote
from app.models.user import User
from app.api.auth import get_current_user, require_admin

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Schemas ---

class LabelCreate(BaseModel):
    name: str
    color: str = "#6366f1"


class LabelResponse(BaseModel):
    id: int
    name: str
    color: str

    model_config = {"from_attributes": True}


class NoteRequest(BaseModel):
    text: str


class NoteResponse(BaseModel):
    paper_id: int
    text: str
    updated_at: str | None = None


# --- Label CRUD ---

@router.get("", response_model=list[LabelResponse])
async def list_labels(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Label).order_by(Label.name))
    return list(result.scalars().all())


@router.post("", response_model=LabelResponse, status_code=201)
async def create_label(
    body: LabelCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Label).where(Label.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Label already exists")

    label = Label(name=body.name, color=body.color)
    db.add(label)
    await db.flush()
    return label


@router.put("/{label_id}", response_model=LabelResponse)
async def update_label(
    label_id: int,
    body: LabelCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    label = await db.get(Label, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    label.name = body.name
    label.color = body.color
    await db.flush()
    return label


@router.delete("/{label_id}")
async def delete_label(
    label_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    label = await db.get(Label, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    await db.delete(label)
    return {"status": "deleted"}


# --- Paper Label assignments ---

@router.get("/paper/{paper_id}", response_model=list[LabelResponse])
async def get_paper_labels(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Label)
        .join(PaperLabel)
        .where(PaperLabel.paper_id == paper_id)
    )
    return list(result.scalars().all())


@router.post("/paper/{paper_id}/{label_id}")
async def assign_label(
    paper_id: int,
    label_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check not already assigned
    existing = await db.execute(
        select(PaperLabel).where(
            PaperLabel.paper_id == paper_id,
            PaperLabel.label_id == label_id,
        )
    )
    if existing.scalar_one_or_none():
        return {"status": "already assigned"}

    db.add(PaperLabel(paper_id=paper_id, label_id=label_id))
    await db.flush()
    return {"status": "assigned"}


@router.delete("/paper/{paper_id}/{label_id}")
async def remove_label(
    paper_id: int,
    label_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(PaperLabel).where(
            PaperLabel.paper_id == paper_id,
            PaperLabel.label_id == label_id,
        )
    )
    return {"status": "removed"}


# --- Paper Notes ---

@router.get("/note/{paper_id}", response_model=NoteResponse | None)
async def get_note(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PaperNote).where(PaperNote.paper_id == paper_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        return None
    return NoteResponse(
        paper_id=note.paper_id,
        text=note.text,
        updated_at=note.updated_at.isoformat() if note.updated_at else None,
    )


@router.put("/note/{paper_id}", response_model=NoteResponse)
async def save_note(
    paper_id: int,
    body: NoteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PaperNote).where(PaperNote.paper_id == paper_id)
    )
    note = result.scalar_one_or_none()

    if note:
        note.text = body.text
    else:
        note = PaperNote(paper_id=paper_id, text=body.text)
        db.add(note)

    await db.flush()
    await db.refresh(note)
    return NoteResponse(
        paper_id=note.paper_id,
        text=note.text,
        updated_at=note.updated_at.isoformat() if note.updated_at else None,
    )
