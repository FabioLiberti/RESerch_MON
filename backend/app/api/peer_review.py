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
from app.models.peer_review_log import PeerReviewLog, EVENT_TYPES
from app.models.user import User
from app.services.peer_review_report import generate_review_artifacts
from app.services.peer_review_receipt import compute_review_hash, generate_submission_receipt
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


def _log_event(
    db: AsyncSession,
    peer_review_id: int,
    event_type: str,
    description: str | None = None,
    payload: dict | None = None,
    actor_username: str | None = None,
    occurred_at: datetime | None = None,
) -> PeerReviewLog:
    """Append an event row to the peer-review activity log.

    Caller is responsible for `await db.commit()`.
    `event_type` is informational — unknown values are accepted but warned.
    """
    if event_type not in EVENT_TYPES:
        logger.warning(f"Unknown peer-review event type: {event_type}")
    log = PeerReviewLog(
        peer_review_id=peer_review_id,
        event_type=event_type,
        description=description,
        payload_json=json.dumps(payload, default=str, ensure_ascii=False) if payload else None,
        actor_username=actor_username,
        occurred_at=occurred_at or datetime.utcnow(),
    )
    db.add(log)
    return log


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

    _log_event(
        db, pr.id, "created",
        description=f"Peer review created. Template: {template_id}. Manuscript: {manuscript_id or '(unspecified)'}.",
        payload={"template_id": template_id, "manuscript_id": manuscript_id, "pdf_uploaded": pdf is not None},
        actor_username=user.username,
    )

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

    # Capture pre-state for audit logging of meaningful changes
    prev_status = pr.status
    prev_recommendation = pr.recommendation

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

    # Audit-log only meaningful state transitions (status, recommendation).
    # Plain-text edits to comments/rubric are not logged here to avoid noise;
    # they are reflected in the bundle snapshots / submission receipt anyway.
    if body.status is not None and body.status != prev_status:
        if body.status == "submitted":
            _log_event(
                db, pr.id, "submitted",
                description=f"Status: {prev_status} -> submitted. Recommendation: {pr.recommendation or '(unset)'}.",
                payload={"prev_status": prev_status, "new_status": "submitted", "submitted_at": pr.submitted_at.isoformat() if pr.submitted_at else None},
                actor_username=user.username,
            )
        elif body.status == "archived":
            _log_event(db, pr.id, "archived", description=f"Status: {prev_status} -> archived.", payload={"prev_status": prev_status}, actor_username=user.username)
        elif prev_status == "submitted" and body.status == "in_progress":
            _log_event(db, pr.id, "edit_unlocked", description="Submitted review unlocked for further editing.", payload={"prev_status": prev_status}, actor_username=user.username)
        else:
            _log_event(db, pr.id, "metadata_updated", description=f"Status: {prev_status} -> {body.status}.", payload={"prev_status": prev_status, "new_status": body.status}, actor_username=user.username)
    if body.recommendation is not None and body.recommendation != prev_recommendation:
        _log_event(
            db, pr.id, "recommendation_changed",
            description=f"Recommendation: {prev_recommendation or '(unset)'} -> {pr.recommendation or '(unset)'}.",
            payload={"prev": prev_recommendation, "new": pr.recommendation},
            actor_username=user.username,
        )

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
    _log_event(
        db, pr.id, "pdf_uploaded",
        description=f"Manuscript PDF uploaded ({len(content)} bytes).",
        payload={"size": len(content)},
        actor_username=user.username,
    )
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

    _meta = suggestion.get("_meta", {}) if isinstance(suggestion, dict) else {}
    _log_event(
        db, pr.id, "llm_suggestion_applied",
        description=f"LLM suggestion drafted by {_meta.get('model', 'Claude Opus')} (cost ~${_meta.get('cost_usd', 0):.4f}).",
        payload={"meta": _meta},
        actor_username=admin.username,
    )
    await db.commit()
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
    _log_event(
        db, pr.id, "attachment_added",
        description=f"Attachment uploaded: {safe_name} ({len(content)} bytes).",
        payload={"filename": safe_name, "size": len(content)},
        actor_username=user.username,
    )
    await db.commit()
    logger.info(f"Attachment uploaded: pr_id={peer_review_id} file={safe_name} size={len(content)}")
    return {"filename": safe_name, "size": len(content)}


@router.get("/{peer_review_id}/attachments/{filename}")
async def download_attachment(
    peer_review_id: int,
    filename: str,
    inline: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download a specific attachment.

    Pass ``?inline=1`` to receive ``Content-Disposition: inline``, which lets
    the browser render PDFs / images / text directly in a new tab. Default
    behaviour is ``attachment`` (forces save-as).
    """
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    safe_name = _safe_attachment_name(filename)
    folder = _attachments_dir(peer_review_id)
    file_path = folder / safe_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Attachment not found")
    media_type = ATTACHMENT_MEDIA_TYPES.get(file_path.suffix.lower(), "application/octet-stream")
    if inline:
        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
        )
    return FileResponse(path=str(file_path), media_type=media_type, filename=safe_name)


@router.post("/{peer_review_id}/save-bundle-to-attachments")
async def save_bundle_to_attachments(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate the resmon-bundled review (PDF/TEX/MD/TXT) and copy each
    artifact into this peer review's Attachments folder as a snapshot.

    Snapshot files are timestamped so subsequent calls do not overwrite the
    earlier snapshots — the user explicitly chooses when to take a snapshot
    (manual button) and history is preserved.
    """
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    paths = generate_review_artifacts(pr)
    _persist_artifacts(pr, paths)
    folder = _attachments_dir(peer_review_id)
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    saved: list[str] = []
    for fmt in ("pdf", "tex", "md", "txt"):
        src = paths.get(fmt)
        if src and Path(src).exists():
            dst_name = f"BundledReview_{peer_review_id}_{timestamp}.{fmt}"
            dst = folder / dst_name
            dst.write_bytes(Path(src).read_bytes())
            saved.append(dst_name)
    _log_event(
        db, pr.id, "bundle_snapshot_saved",
        description=f"Manual bundle snapshot saved ({len(saved)} files, ts={timestamp}).",
        payload={"saved": saved, "timestamp": timestamp},
        actor_username=user.username,
    )
    await db.commit()
    logger.info(f"Bundle snapshot saved to attachments: pr_id={peer_review_id} files={len(saved)}")
    return {"saved": saved, "count": len(saved), "timestamp": timestamp}


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
    _log_event(
        db, pr.id, "attachment_removed",
        description=f"Attachment removed: {safe_name}.",
        payload={"filename": safe_name},
        actor_username=user.username,
    )
    await db.commit()
    logger.info(f"Attachment deleted: pr_id={peer_review_id} file={safe_name}")
    return {"deleted": safe_name}


# ---------- Lifecycle transitions: submit / unlock / archive ----------

class MarkSubmittedRequest(BaseModel):
    submitted_at: str | None = None  # ISO datetime; defaults to "now". Editable to allow backdating.
    note: str | None = None           # Optional reviewer note appended to the log entry.


@router.post("/{peer_review_id}/mark-submitted")
async def mark_submitted(
    peer_review_id: int,
    body: MarkSubmittedRequest = MarkSubmittedRequest(),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Transition the peer review to status='submitted', set the submission
    timestamp (editable, defaults to now), generate the integrity Submission
    Receipt PDF/TXT into the Attachments folder, and append the corresponding
    log entries.
    """
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")

    submitted_at: datetime
    if body.submitted_at:
        try:
            submitted_at = datetime.fromisoformat(body.submitted_at.replace("Z", "+00:00"))
            if submitted_at.tzinfo is not None:
                submitted_at = submitted_at.astimezone(tz=None).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(status_code=400, detail="submitted_at must be ISO 8601 (e.g. 2026-04-29T18:00:00)")
    else:
        submitted_at = datetime.utcnow()

    prev_status = pr.status
    pr.status = "submitted"
    pr.submitted_at = submitted_at

    # Generate the Submission Receipt and store it directly in attachments/
    receipt_info: dict | None = None
    try:
        attach_folder = _attachments_dir(pr.id)
        receipt_info = generate_submission_receipt(
            pr, submitted_at=submitted_at, output_dir=attach_folder,
        )
    except Exception as e:
        logger.warning(f"Could not generate submission receipt for pr {pr.id}: {e}")

    # Log the submission event + receipt event
    _log_event(
        db, pr.id, "submitted",
        description=f"Status: {prev_status} -> submitted on {submitted_at.strftime('%Y-%m-%d %H:%M:%S UTC')}. "
                    f"Recommendation: {pr.recommendation or '(unset)'}." +
                    (f" Note: {body.note}" if body.note else ""),
        payload={
            "prev_status": prev_status,
            "submitted_at": submitted_at.isoformat(),
            "recommendation": pr.recommendation,
            "note": body.note,
        },
        actor_username=user.username,
        occurred_at=submitted_at,
    )
    if receipt_info:
        _log_event(
            db, pr.id, "receipt_generated",
            description=f"Submission Receipt generated. Hash: {receipt_info['hash']}.",
            payload={
                "hash": receipt_info["hash"],
                "basename": receipt_info["basename"],
                "files": [str(p.name) for p in (receipt_info["pdf"], receipt_info["tex"], receipt_info["txt"]) if p],
            },
            actor_username=user.username,
            occurred_at=submitted_at,
        )

    await db.commit()
    await db.refresh(pr)
    return {
        "status": pr.status,
        "submitted_at": pr.submitted_at.isoformat() if pr.submitted_at else None,
        "receipt": {
            "hash": receipt_info["hash"] if receipt_info else None,
            "files": [str(p.name) for p in (receipt_info["pdf"], receipt_info["tex"], receipt_info["txt"]) if p] if receipt_info else [],
        } if receipt_info else None,
    }


@router.post("/{peer_review_id}/edit-unlock")
async def edit_unlock(
    peer_review_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: re-open a submitted peer review for editing. Status reverts
    to 'in_progress'. Subsequent edits are tracked in the log; the original
    Submission Receipt remains as historical evidence of the prior state.
    """
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    if pr.status != "submitted":
        raise HTTPException(status_code=400, detail=f"Cannot unlock: current status is '{pr.status}'.")

    prev_status = pr.status
    pr.status = "in_progress"
    _log_event(
        db, pr.id, "edit_unlocked",
        description=f"Submitted review unlocked for editing by {admin.username}. "
                    f"Original Submission Receipt retained for audit.",
        payload={"prev_status": prev_status},
        actor_username=admin.username,
    )
    await db.commit()
    await db.refresh(pr)
    return {"status": pr.status}


@router.post("/{peer_review_id}/archive")
async def archive_peer_review(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-archive: status -> 'archived'. Data and attachments are preserved."""
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")

    prev_status = pr.status
    pr.status = "archived"
    _log_event(
        db, pr.id, "archived",
        description=f"Status: {prev_status} -> archived.",
        payload={"prev_status": prev_status},
        actor_username=user.username,
    )
    await db.commit()
    await db.refresh(pr)
    return {"status": pr.status}


# ---------- Activity log CRUD ----------

class LogEntryCreate(BaseModel):
    event_type: str = "manual_note"
    description: str
    occurred_at: str | None = None  # ISO datetime; defaults to now. Editable for backdating.


class LogEntryUpdate(BaseModel):
    description: str | None = None
    occurred_at: str | None = None


def _serialize_log(row: PeerReviewLog) -> dict:
    return {
        "id": row.id,
        "peer_review_id": row.peer_review_id,
        "event_type": row.event_type,
        "description": row.description,
        "payload": json.loads(row.payload_json) if row.payload_json else None,
        "actor_username": row.actor_username,
        "occurred_at": row.occurred_at.isoformat() if row.occurred_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/{peer_review_id}/log")
async def list_logs(
    peer_review_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the activity log of this peer review, ordered chronologically."""
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")
    rows = (await db.execute(
        select(PeerReviewLog)
        .where(PeerReviewLog.peer_review_id == peer_review_id)
        .order_by(PeerReviewLog.occurred_at.asc(), PeerReviewLog.id.asc())
    )).scalars().all()
    return {
        "peer_review_id": peer_review_id,
        "logs": [_serialize_log(r) for r in rows],
        "total": len(rows),
    }


@router.post("/{peer_review_id}/log")
async def create_log(
    peer_review_id: int,
    body: LogEntryCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually append a log entry — useful for recording an event that the
    system did not auto-capture (e.g. ScholarOne submission timestamp once the
    user has actually clicked Submit on the journal portal)."""
    pr = await db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Peer review not found")

    occurred_at: datetime
    if body.occurred_at:
        try:
            occurred_at = datetime.fromisoformat(body.occurred_at.replace("Z", "+00:00"))
            if occurred_at.tzinfo is not None:
                occurred_at = occurred_at.astimezone(tz=None).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(status_code=400, detail="occurred_at must be ISO 8601")
    else:
        occurred_at = datetime.utcnow()

    log = _log_event(
        db, peer_review_id,
        event_type=body.event_type,
        description=body.description,
        actor_username=user.username,
        occurred_at=occurred_at,
    )
    await db.commit()
    await db.refresh(log)
    return _serialize_log(log)


@router.put("/{peer_review_id}/log/{log_id}")
async def update_log(
    peer_review_id: int,
    log_id: int,
    body: LogEntryUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit description and/or `occurred_at` of a log entry — useful when the
    user backdates a submission previously logged with the wrong timestamp."""
    log = await db.get(PeerReviewLog, log_id)
    if not log or log.peer_review_id != peer_review_id:
        raise HTTPException(status_code=404, detail="Log entry not found")

    if body.description is not None:
        log.description = body.description
    if body.occurred_at is not None:
        try:
            ts = datetime.fromisoformat(body.occurred_at.replace("Z", "+00:00"))
            if ts.tzinfo is not None:
                ts = ts.astimezone(tz=None).replace(tzinfo=None)
            log.occurred_at = ts
        except ValueError:
            raise HTTPException(status_code=400, detail="occurred_at must be ISO 8601")

    await db.commit()
    await db.refresh(log)
    return _serialize_log(log)


@router.delete("/{peer_review_id}/log/{log_id}")
async def delete_log(
    peer_review_id: int,
    log_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: remove an erroneous log entry. Used sparingly."""
    log = await db.get(PeerReviewLog, log_id)
    if not log or log.peer_review_id != peer_review_id:
        raise HTTPException(status_code=404, detail="Log entry not found")
    await db.delete(log)
    await db.commit()
    return {"deleted": log_id}


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
