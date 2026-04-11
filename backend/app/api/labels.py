"""Labels and Notes API endpoints."""

import logging
import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.label import Label, PaperLabel, PaperNote
from app.models.user import User
from app.api.auth import get_current_user, require_admin

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Label name normalization ---

def normalize_label_name(raw: str) -> str:
    """Sanitize a label name on input.

    Steps:
      1. Unicode NFKC normalization — reduces compatibility-composed chars
         (e.g. ligatures, full-width variants) to a canonical form.
      2. Replace en-dash / em-dash with ASCII hyphen.
      3. Replace non-breaking / ideographic / em spaces with ASCII space.
      4. Strip leading/trailing whitespace.
      5. Collapse any run of internal whitespace to a single ASCII space.

    The case is NOT touched — policy is "preserve user input + case-insensitive
    dedup on lookup" (option B). So '  Smart  Healthcare ' → 'Smart Healthcare'
    and 'smart  healthcare' → 'smart healthcare'; those two will still be
    treated as the SAME label at lookup time, but the string originally saved
    by the first user keeps its casing.
    """
    if not raw:
        return ""
    s = unicodedata.normalize("NFKC", raw)
    # Replace dashes
    s = s.replace("\u2013", "-").replace("\u2014", "-")
    # Normalise exotic whitespace characters to plain space
    s = re.sub(r"[\u00a0\u2002\u2003\u2007\u2009\u202f\u3000]", " ", s)
    # Strip and collapse
    s = s.strip()
    s = re.sub(r"\s+", " ", s)
    return s


async def find_or_create_label(
    db: AsyncSession,
    raw_name: str,
    color: str = "#6366f1",
) -> Label:
    """Return an existing label matching the normalized name (case-insensitive),
    creating a new one only if none is found. Raises ValueError for empty input.
    """
    name = normalize_label_name(raw_name)
    if not name:
        raise ValueError("Label name cannot be empty")
    # Case-insensitive lookup — LOWER() is ASCII-only but fine for label names
    existing = await db.execute(
        select(Label).where(func.lower(Label.name) == name.lower())
    )
    found = existing.scalar_one_or_none()
    if found:
        return found
    label = Label(name=name, color=color)
    db.add(label)
    await db.flush()
    return label


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

@router.get("")
async def list_labels(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Label, func.count(PaperLabel.id).label("paper_count"))
        .outerjoin(PaperLabel, PaperLabel.label_id == Label.id)
        .group_by(Label.id)
        .order_by(Label.name)
    )
    return [
        {"id": label.id, "name": label.name, "color": label.color, "paper_count": count}
        for label, count in result.all()
    ]


@router.post("", response_model=LabelResponse, status_code=201)
async def create_label(
    body: LabelCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new label, or return the existing one with the same
    normalized case-insensitive name (idempotent)."""
    name = normalize_label_name(body.name)
    if not name:
        raise HTTPException(status_code=400, detail="Label name cannot be empty")
    # Case-insensitive dedup: if a label with the same name already exists,
    # return it instead of creating a duplicate. This is the explicit
    # "preserve input + case-insensitive dedup" policy.
    existing = await db.execute(
        select(Label).where(func.lower(Label.name) == name.lower())
    )
    found = existing.scalar_one_or_none()
    if found:
        return found
    label = Label(name=name, color=body.color)
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
    new_name = normalize_label_name(body.name)
    if not new_name:
        raise HTTPException(status_code=400, detail="Label name cannot be empty")
    # Case-insensitive dedup: don't allow renaming a label onto another
    # existing label (would create a silent collision).
    if new_name.lower() != (label.name or "").lower():
        collision = await db.execute(
            select(Label).where(
                func.lower(Label.name) == new_name.lower(),
                Label.id != label_id,
            )
        )
        if collision.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail=f"Another label already exists with that name: '{new_name}'",
            )
    label.name = new_name
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


class BatchAssignRequest(BaseModel):
    paper_ids: list[int]
    label_id: int


@router.post("/batch-assign")
async def batch_assign_label(
    body: BatchAssignRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Assign a label to multiple papers at once."""
    assigned = 0
    for paper_id in body.paper_ids:
        existing = await db.execute(
            select(PaperLabel).where(
                PaperLabel.paper_id == paper_id,
                PaperLabel.label_id == body.label_id,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(PaperLabel(paper_id=paper_id, label_id=body.label_id))
            assigned += 1
    await db.flush()
    return {"assigned": assigned}


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
