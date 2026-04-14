"""Submission Rounds API — CRUD for manuscript submission/revision cycles."""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.submission_round import SubmissionRound
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Schemas ---

class CreateRoundRequest(BaseModel):
    round_number: int = 0
    label: str
    document_type: str = "full_paper"
    submitted_at: str | None = None
    deadline: str | None = None
    decision: str | None = None
    decision_at: str | None = None
    decision_notes: str | None = None


class UpdateRoundRequest(BaseModel):
    label: str | None = None
    document_type: str | None = None
    submitted_at: str | None = None
    deadline: str | None = None
    decision: str | None = None
    decision_at: str | None = None
    decision_notes: str | None = None


# --- Helpers ---

def _serialize(r: SubmissionRound) -> dict:
    return {
        "id": r.id,
        "paper_id": r.paper_id,
        "round_number": r.round_number,
        "label": r.label,
        "document_type": r.document_type,
        "document_path": r.document_path,
        "has_document": bool(r.document_path and Path(r.document_path).exists()),
        "submitted_at": r.submitted_at,
        "deadline": r.deadline,
        "decision": r.decision,
        "decision_at": r.decision_at,
        "decision_notes": r.decision_notes,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _storage_dir(paper_id: int) -> Path:
    d = Path(settings.reports_path) / "submissions" / str(paper_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


# --- Endpoints ---

@router.get("/{paper_id}")
async def list_rounds(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all submission rounds for a paper, ordered by round_number."""
    result = await db.execute(
        select(SubmissionRound)
        .where(SubmissionRound.paper_id == paper_id)
        .order_by(SubmissionRound.round_number.asc())
    )
    rounds = result.scalars().all()
    return {
        "paper_id": paper_id,
        "rounds": [_serialize(r) for r in rounds],
        "total_rounds": len(rounds),
    }


@router.post("/{paper_id}")
async def create_round(
    paper_id: int,
    body: CreateRoundRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new submission round."""
    r = SubmissionRound(
        paper_id=paper_id,
        round_number=body.round_number,
        label=body.label,
        document_type=body.document_type,
        submitted_at=body.submitted_at,
        deadline=body.deadline,
        decision=body.decision,
        decision_at=body.decision_at,
        decision_notes=body.decision_notes,
    )
    db.add(r)
    await db.flush()
    await db.commit()
    await db.refresh(r)
    logger.info(f"Submission round created: paper={paper_id}, round={body.round_number}, label={body.label}")
    return _serialize(r)


@router.put("/round/{round_id}")
async def update_round(
    round_id: int,
    body: UpdateRoundRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a submission round (label, dates, decision, etc.)."""
    r = await db.get(SubmissionRound, round_id)
    if not r:
        raise HTTPException(status_code=404, detail="Round not found")

    if body.label is not None:
        r.label = body.label
    if body.document_type is not None:
        r.document_type = body.document_type
    if body.submitted_at is not None:
        r.submitted_at = body.submitted_at
    if body.deadline is not None:
        r.deadline = body.deadline
    if body.decision is not None:
        r.decision = body.decision
    if body.decision_at is not None:
        r.decision_at = body.decision_at
    if body.decision_notes is not None:
        r.decision_notes = body.decision_notes

    await db.flush()
    await db.commit()
    return _serialize(r)


@router.delete("/round/{round_id}")
async def delete_round(
    round_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a submission round."""
    r = await db.get(SubmissionRound, round_id)
    if not r:
        raise HTTPException(status_code=404, detail="Round not found")
    await db.delete(r)
    await db.commit()
    return {"deleted": round_id}


@router.post("/round/{round_id}/document")
async def upload_document(
    round_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document (PDF, .md, .tex, .txt) for a submission round."""
    r = await db.get(SubmissionRound, round_id)
    if not r:
        raise HTTPException(status_code=404, detail="Round not found")

    allowed_ext = {".pdf", ".md", ".tex", ".txt"}
    from pathlib import PurePosixPath
    fname = file.filename or "document.pdf"
    ext = PurePosixPath(fname).suffix.lower()
    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed. Allowed: {', '.join(sorted(allowed_ext))}")

    storage = _storage_dir(r.paper_id)
    safe_name = f"round_{r.round_number}_{fname}"
    out_path = storage / safe_name
    content = await file.read()
    out_path.write_bytes(content)
    r.document_path = str(out_path)
    await db.commit()
    return {"path": str(out_path), "size_kb": round(len(content) / 1024)}
