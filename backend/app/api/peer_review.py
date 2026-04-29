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

from app.api.auth import get_current_user, require_admin
from app.config import settings
from app.database import get_db
from app.models.paper import Paper
from app.models.peer_review import PeerReview
from app.models.user import User
from app.services.peer_review_report import generate_review_artifacts
from app.services.review_templates import (
    empty_rubric_for,
    get_template,
    list_templates,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _storage_dir(peer_review_id: int) -> Path:
    base = Path(settings.base_dir if hasattr(settings, "base_dir") else ".")
    d = Path("data/peer-review") / str(peer_review_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _serialize(pr: PeerReview) -> dict:
    template = get_template(pr.template_id)
    rubric = json.loads(pr.rubric_json) if pr.rubric_json else empty_rubric_for(pr.template_id)
    return {
        "id": pr.id,
        "template_id": pr.template_id or "generic",
        "template": {
            "id": template.id,
            "name": template.name,
            "journal": template.journal,
            "description": template.description,
            "dimensions": [
                {"key": d.key, "label": d.label, "description": d.description, "type": d.type}
                for d in template.dimensions
            ],
            "recommendations": [{"value": v, "label": l} for v, l in template.recommendations],
            "extras": [
                {
                    "key": e.key,
                    "label": e.label,
                    "type": e.type,
                    "description": e.description,
                    "choices": [{"value": v, "label": l} for v, l in (e.choices or [])],
                }
                for e in template.extras
            ],
        },
        "title": pr.title,
        "authors": pr.authors,
        "target_journal": pr.target_journal,
        "manuscript_id": pr.manuscript_id,
        "deadline": pr.deadline,
        "reviewer_role": pr.reviewer_role,
        "pdf_path": pr.pdf_path,
        "has_pdf": bool(pr.pdf_path and Path(pr.pdf_path).exists()),
        "rubric": rubric,
        "comments_to_authors": pr.comments_to_authors,
        "confidential_comments": pr.confidential_comments,
        "private_notes": pr.private_notes,
        "recommendation": pr.recommendation,
        "status": pr.status,
        "paper_id": pr.paper_id,
        "created_at": pr.created_at.isoformat() if pr.created_at else None,
        "updated_at": pr.updated_at.isoformat() if pr.updated_at else None,
        "submitted_at": pr.submitted_at.isoformat() if pr.submitted_at else None,
    }


@router.get("/templates")
async def templates(user: User = Depends(get_current_user)):
    """Return the full list of registered peer-review templates."""
    return list_templates()


@router.get("/rubric-template")
async def rubric_template(
    template_id: str | None = None,
    user: User = Depends(get_current_user),
):
    """Return the blank rubric for a given template (default: generic)."""
    return empty_rubric_for(template_id)


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
    private_notes: str | None = Form(None),
    template_id: str = Form("generic"),
    pdf: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new peer-review entry. Optionally upload the manuscript PDF."""
    # Validate template id (fall back to generic rather than fail the create)
    from app.services.review_templates import TEMPLATES
    if template_id not in TEMPLATES:
        template_id = "generic"

    # Auto-create a Paper record with role='reviewing' so the peer review
    # appears in the papers list and has a standard detail page.
    paper = Paper(
        title=title,
        abstract=None,
        journal=target_journal,
        paper_type="manuscript",
        paper_role="reviewing",
        created_via="peer_review",
    )
    db.add(paper)
    await db.flush()  # obtain paper.id

    pr = PeerReview(
        title=title,
        authors=authors,
        target_journal=target_journal,
        manuscript_id=manuscript_id,
        deadline=deadline,
        reviewer_role=reviewer_role,
        private_notes=private_notes,
        template_id=template_id,
        status="draft",
        created_by=user.username,
        rubric_json=json.dumps(empty_rubric_for(template_id)),
        paper_id=paper.id,
    )
    db.add(pr)
    await db.flush()   # obtain pr.id

    if pdf is not None:
        storage = _storage_dir(pr.id)
        safe_name = "paper.pdf"
        out_path = storage / safe_name
        content = await pdf.read()
        out_path.write_bytes(content)
        pr.pdf_path = str(out_path)
        # Also link the PDF to the auto-created Paper record so it appears
        # in the paper detail page with the "View PDF" button.
        paper.pdf_local_path = str(out_path)

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
    template_id: str | None = None
    rubric: dict | None = None   # {template_id, items, extras}
    comments_to_authors: str | None = None
    confidential_comments: str | None = None
    private_notes: str | None = None
    recommendation: str | None = None
    status: str | None = None


@router.put("/{peer_review_id}")
async def update_peer_review(
    peer_review_id: int,
    body: PeerReviewUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.review_templates import TEMPLATES

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
    if body.private_notes is not None: pr.private_notes = body.private_notes
    if body.template_id is not None:
        if body.template_id not in TEMPLATES:
            raise HTTPException(status_code=400, detail=f"Unknown template: {body.template_id}")
        if body.template_id != pr.template_id:
            pr.template_id = body.template_id
            # Reset rubric to blank for the new template unless the caller
            # also passed an explicit rubric payload.
            if body.rubric is None:
                pr.rubric_json = json.dumps(empty_rubric_for(body.template_id))
    if body.recommendation is not None:
        template = get_template(pr.template_id)
        valid = {v for v, _ in template.recommendations}
        if body.recommendation and body.recommendation not in valid:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid recommendation for template {pr.template_id}: {body.recommendation}",
            )
        pr.recommendation = body.recommendation or None
    if body.rubric is not None:
        pr.rubric_json = json.dumps(body.rubric, ensure_ascii=False)
    if body.status is not None:
        if body.status not in ("draft", "in_progress", "submitted", "archived"):
            raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
        pr.status = body.status
        if body.status == "submitted" and not pr.submitted_at:
            pr.submitted_at = datetime.utcnow()

    # Keep on-disk artifacts (.pdf .tex .md .txt) always in sync with DB state.
    # Failures here are non-fatal: the review is saved regardless.
    try:
        paths = generate_review_artifacts(pr)
        _persist_artifacts(pr, paths)
    except Exception as e:
        logger.warning(f"Could not refresh peer review artifacts on save: {e}")

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
    # Keep the linked Paper record in sync
    if pr.paper_id:
        linked_paper = await db.get(Paper, pr.paper_id)
        if linked_paper:
            linked_paper.pdf_local_path = str(out_path)
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


def _persist_artifacts(pr: PeerReview, paths: dict) -> dict:
    """Persist generated paths on the PeerReview row. Mutates pr in-place."""
    if paths.get("pdf"): pr.review_pdf_path = str(paths["pdf"])
    if paths.get("tex"): pr.review_tex_path = str(paths["tex"])
    if paths.get("md"):  pr.review_md_path  = str(paths["md"])
    if paths.get("txt"): pr.review_txt_path = str(paths["txt"])
    return {
        "pdf_path": str(paths["pdf"]) if paths.get("pdf") else None,
        "tex_path": str(paths["tex"]) if paths.get("tex") else None,
        "md_path":  str(paths["md"])  if paths.get("md")  else None,
        "txt_path": str(paths["txt"]) if paths.get("txt") else None,
        "pdf_available": bool(paths.get("pdf")),
    }


@router.post("/{peer_review_id}/generate")
async def generate_review_document(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate (or refresh) all four review artifacts: PDF, TEX, MD, TXT."""
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    paths = generate_review_artifacts(pr)
    response = _persist_artifacts(pr, paths)
    await db.commit()
    return response


async def _serve_artifact(
    pr: PeerReview,
    db: AsyncSession,
    fmt: str,
) -> FileResponse:
    """Generate (or refresh) all artifacts and serve the requested format."""
    paths = generate_review_artifacts(pr)
    _persist_artifacts(pr, paths)
    await db.commit()
    target = paths.get(fmt)
    if not target or not target.exists():
        raise HTTPException(status_code=500, detail=f"Could not generate {fmt.upper()}")
    media = {
        "pdf": "application/pdf",
        "tex": "application/x-tex",
        "md":  "text/markdown",
        "txt": "text/plain",
    }[fmt]
    return FileResponse(
        path=str(target),
        media_type=media,
        filename=f"peer_review_{pr.id}.{fmt}",
    )


@router.get("/{peer_review_id}/review-pdf")
async def download_review_pdf(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(PeerReview, peer_review_id)
    if not pr: raise HTTPException(status_code=404, detail="Peer review not found")
    return await _serve_artifact(pr, db, "pdf")


@router.get("/{peer_review_id}/review-txt")
async def download_review_txt(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(PeerReview, peer_review_id)
    if not pr: raise HTTPException(status_code=404, detail="Peer review not found")
    return await _serve_artifact(pr, db, "txt")


@router.get("/{peer_review_id}/review-md")
async def download_review_md(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(PeerReview, peer_review_id)
    if not pr: raise HTTPException(status_code=404, detail="Peer review not found")
    return await _serve_artifact(pr, db, "md")


@router.get("/{peer_review_id}/review-tex")
async def download_review_tex(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pr = await db.get(PeerReview, peer_review_id)
    if not pr: raise HTTPException(status_code=404, detail="Peer review not found")
    return await _serve_artifact(pr, db, "tex")


@router.post("/{peer_review_id}/llm-suggest")
async def llm_suggest_review(
    peer_review_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """ADMIN ONLY: ask Claude Opus 4.6 (extended thinking) to draft a complete
    peer review for the manuscript. The result is RETURNED but NOT saved — the
    human reviewer must explicitly save after editing.
    """
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    if not pr.pdf_path:
        raise HTTPException(status_code=400, detail="Upload the manuscript PDF first")

    from app.services.peer_review_llm import LlmReviewError, suggest_peer_review
    try:
        suggestion = await suggest_peer_review(pr)
    except LlmReviewError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected LLM peer review error for pr {peer_review_id}: {e}")
        raise HTTPException(status_code=500, detail=f"LLM call failed: {e}")
    return suggestion


# ---------- Attachments (review-related documents) ----------
# A peer review may accumulate several deliverables: the full review report,
# the letter to authors, the letter to editor, screenshots of the submission
# in the journal system, supplementary notes. These are kept as files in
# data/peer-review/{id}/attachments/ so the manuscript PDF (paper.pdf) stays
# semantically separate.

ATTACHMENT_MEDIA_TYPES = {
    ".pdf":  "application/pdf",
    ".md":   "text/markdown; charset=utf-8",
    ".tex":  "application/x-tex",
    ".txt":  "text/plain; charset=utf-8",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".webp": "image/webp",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".rtf":  "application/rtf",
    ".bib":  "application/x-bibtex",
}


def _attachments_dir(peer_review_id: int) -> Path:
    d = _storage_dir(peer_review_id) / "attachments"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe_attachment_name(name: str) -> str:
    base = Path(name).name  # strip any path components
    if not base or base.startswith(".") or base in ("..", "/"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    return base


@router.get("/{peer_review_id}/attachments")
async def list_attachments(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List review attachments for this peer review."""
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    folder = _attachments_dir(peer_review_id)
    items = []
    for p in sorted(folder.iterdir()):
        if p.is_file():
            stat = p.stat()
            items.append({
                "filename": p.name,
                "size": stat.st_size,
                "modified_at": datetime.utcfromtimestamp(stat.st_mtime).isoformat(),
                "extension": p.suffix.lower().lstrip("."),
            })
    return {"peer_review_id": peer_review_id, "attachments": items, "total": len(items)}


@router.post("/{peer_review_id}/attachments")
async def upload_attachment(
    peer_review_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a new review attachment (overwrites if same filename exists)."""
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    safe_name = _safe_attachment_name(file.filename or "")
    folder = _attachments_dir(peer_review_id)
    out_path = folder / safe_name
    content = await file.read()
    out_path.write_bytes(content)
    logger.info(f"Attachment uploaded: pr_id={peer_review_id} file={safe_name} size={len(content)}")
    return {"filename": safe_name, "size": len(content)}


@router.get("/{peer_review_id}/attachments/{filename}")
async def download_attachment(
    peer_review_id: int,
    filename: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download a specific attachment."""
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    safe_name = _safe_attachment_name(filename)
    folder = _attachments_dir(peer_review_id)
    file_path = folder / safe_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Attachment not found")
    media_type = ATTACHMENT_MEDIA_TYPES.get(file_path.suffix.lower(), "application/octet-stream")
    return FileResponse(path=str(file_path), media_type=media_type, filename=safe_name)


@router.delete("/{peer_review_id}/attachments/{filename}")
async def delete_attachment(
    peer_review_id: int,
    filename: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete an attachment (admin only)."""
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    safe_name = _safe_attachment_name(filename)
    folder = _attachments_dir(peer_review_id)
    file_path = folder / safe_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Attachment not found")
    file_path.unlink()
    logger.info(f"Attachment deleted: pr_id={peer_review_id} file={safe_name}")
    return {"deleted": safe_name}


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
    # Remove generated review files (all four formats)
    reports_dir = Path(settings.reports_path) / "peer-review"
    for ext in (".pdf", ".tex", ".md", ".txt"):
        f = reports_dir / f"peer_review_{pr.id}{ext}"
        if f.exists():
            try:
                f.unlink()
            except OSError:
                pass
    await db.delete(pr)
    await db.commit()
    return {"deleted": peer_review_id}
