"""Peer Review API — isolated module for reviewing unpublished papers.

NO Zotero sync. NO LLM. NO topic indexing. NO paper-list pollution.
Storage under data/peer-review/{id}/.
"""

import json
import logging
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.peer_review import PeerReview
from app.models.user import User
from app.services.peer_review_report import (
    RECOMMENDATION_LABELS,
    RUBRIC_DIMENSIONS,
    empty_rubric,
    generate_review_artifacts,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _storage_dir(peer_review_id: int) -> Path:
    base = Path(settings.base_dir if hasattr(settings, "base_dir") else ".")
    d = Path("data/peer-review") / str(peer_review_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _serialize(pr: PeerReview) -> dict:
    return {
        "id": pr.id,
        "title": pr.title,
        "authors": pr.authors,
        "target_journal": pr.target_journal,
        "manuscript_id": pr.manuscript_id,
        "deadline": pr.deadline,
        "reviewer_role": pr.reviewer_role,
        "pdf_path": pr.pdf_path,
        "has_pdf": bool(pr.pdf_path and Path(pr.pdf_path).exists()),
        "rubric": json.loads(pr.rubric_json) if pr.rubric_json else {"items": empty_rubric()},
        "comments_to_authors": pr.comments_to_authors,
        "confidential_comments": pr.confidential_comments,
        "recommendation": pr.recommendation,
        "status": pr.status,
        "created_at": pr.created_at.isoformat() if pr.created_at else None,
        "updated_at": pr.updated_at.isoformat() if pr.updated_at else None,
        "submitted_at": pr.submitted_at.isoformat() if pr.submitted_at else None,
    }


@router.get("/rubric-template")
async def rubric_template(user: User = Depends(get_current_user)):
    """Return the standard peer-review rubric template (empty)."""
    return {
        "dimensions": RUBRIC_DIMENSIONS,
        "items": empty_rubric(),
        "recommendations": RECOMMENDATION_LABELS,
    }


@router.get("")
async def list_peer_reviews(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all peer reviews (most recent first)."""
    r = await db.execute(select(PeerReview).order_by(desc(PeerReview.updated_at)))
    return [_serialize(pr) for pr in r.scalars().all()]


@router.post("")
async def create_peer_review(
    title: str = Form(...),
    authors: str | None = Form(None),
    target_journal: str | None = Form(None),
    manuscript_id: str | None = Form(None),
    deadline: str | None = Form(None),
    reviewer_role: str | None = Form(None),
    pdf: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new peer-review entry. Optionally upload the manuscript PDF."""
    pr = PeerReview(
        title=title,
        authors=authors,
        target_journal=target_journal,
        manuscript_id=manuscript_id,
        deadline=deadline,
        reviewer_role=reviewer_role,
        status="draft",
        created_by=user.username,
        rubric_json=json.dumps({"items": empty_rubric()}),
    )
    db.add(pr)
    await db.flush()   # obtain id

    if pdf is not None:
        storage = _storage_dir(pr.id)
        safe_name = "paper.pdf"
        out_path = storage / safe_name
        content = await pdf.read()
        out_path.write_bytes(content)
        pr.pdf_path = str(out_path)

    await db.commit()
    await db.refresh(pr)
    return _serialize(pr)


@router.get("/{peer_review_id}")
async def get_peer_review(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    return _serialize(pr)


class PeerReviewUpdate(BaseModel):
    title: str | None = None
    authors: str | None = None
    target_journal: str | None = None
    manuscript_id: str | None = None
    deadline: str | None = None
    reviewer_role: str | None = None
    rubric: dict | None = None   # {items: [...], ...}
    comments_to_authors: str | None = None
    confidential_comments: str | None = None
    recommendation: str | None = None
    status: str | None = None


@router.put("/{peer_review_id}")
async def update_peer_review(
    peer_review_id: int,
    body: PeerReviewUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")

    if body.title is not None: pr.title = body.title
    if body.authors is not None: pr.authors = body.authors
    if body.target_journal is not None: pr.target_journal = body.target_journal
    if body.manuscript_id is not None: pr.manuscript_id = body.manuscript_id
    if body.deadline is not None: pr.deadline = body.deadline
    if body.reviewer_role is not None: pr.reviewer_role = body.reviewer_role
    if body.comments_to_authors is not None: pr.comments_to_authors = body.comments_to_authors
    if body.confidential_comments is not None: pr.confidential_comments = body.confidential_comments
    if body.recommendation is not None:
        if body.recommendation not in RECOMMENDATION_LABELS and body.recommendation != "":
            raise HTTPException(status_code=400, detail=f"Invalid recommendation: {body.recommendation}")
        pr.recommendation = body.recommendation or None
    if body.rubric is not None:
        pr.rubric_json = json.dumps(body.rubric, ensure_ascii=False)
    if body.status is not None:
        if body.status not in ("draft", "in_progress", "submitted", "archived"):
            raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
        pr.status = body.status
        if body.status == "submitted" and not pr.submitted_at:
            pr.submitted_at = datetime.utcnow()

    await db.commit()
    await db.refresh(pr)
    return _serialize(pr)


@router.post("/{peer_review_id}/upload-pdf")
async def upload_pdf(
    peer_review_id: int,
    pdf: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")

    storage = _storage_dir(pr.id)
    out_path = storage / "paper.pdf"
    content = await pdf.read()
    out_path.write_bytes(content)
    pr.pdf_path = str(out_path)
    await db.commit()
    return {"pdf_path": pr.pdf_path, "size": len(content)}


@router.get("/{peer_review_id}/pdf")
async def get_pdf(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(PeerReview, peer_review_id)
    if not pr or not pr.pdf_path:
        raise HTTPException(status_code=404, detail="PDF not found")
    path = Path(pr.pdf_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="PDF file missing on disk")
    return FileResponse(
        path=str(path),
        media_type="application/pdf",
        filename=f"peer_review_{peer_review_id}_paper.pdf",
    )


@router.post("/{peer_review_id}/generate")
async def generate_review_document(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate (or refresh) the peer-review PDF + TXT files."""
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    pdf_path, txt_path = generate_review_artifacts(pr)
    if pdf_path:
        pr.review_pdf_path = str(pdf_path)
    if txt_path:
        pr.review_txt_path = str(txt_path)
    await db.commit()
    return {
        "pdf_path": str(pdf_path) if pdf_path else None,
        "txt_path": str(txt_path) if txt_path else None,
        "pdf_available": bool(pdf_path),
    }


@router.get("/{peer_review_id}/review-pdf")
async def download_review_pdf(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the generated PDF review document (regenerates if missing)."""
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    pdf_path = Path(pr.review_pdf_path) if pr.review_pdf_path else None
    if not pdf_path or not pdf_path.exists():
        pdf_path, _ = generate_review_artifacts(pr)
        if pdf_path:
            pr.review_pdf_path = str(pdf_path)
            await db.commit()
    if not pdf_path or not pdf_path.exists():
        raise HTTPException(status_code=500, detail="Could not generate peer-review PDF")
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=f"peer_review_{peer_review_id}.pdf",
    )


@router.get("/{peer_review_id}/review-txt")
async def download_review_txt(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the generated plain-text review (always regenerated on demand)."""
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    _, txt_path = generate_review_artifacts(pr)
    if not txt_path or not txt_path.exists():
        raise HTTPException(status_code=500, detail="Could not generate TXT")
    pr.review_txt_path = str(txt_path)
    await db.commit()
    return FileResponse(
        path=str(txt_path),
        media_type="text/plain",
        filename=f"peer_review_{peer_review_id}.txt",
    )


@router.delete("/{peer_review_id}")
async def delete_peer_review(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    # Remove on-disk files
    storage = Path("data/peer-review") / str(pr.id)
    if storage.exists():
        try:
            shutil.rmtree(storage)
        except OSError as e:
            logger.warning(f"Could not remove peer-review storage {storage}: {e}")
    # Remove generated review files
    reports_dir = Path(settings.reports_path) / "peer-review"
    for ext in (".pdf", ".tex", ".txt"):
        f = reports_dir / f"peer_review_{pr.id}{ext}"
        if f.exists():
            try:
                f.unlink()
            except OSError:
                pass
    await db.delete(pr)
    await db.commit()
    return {"deleted": peer_review_id}
