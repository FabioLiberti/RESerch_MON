"""Paper Quality Review API — versioned scientific quality assessment of published papers.

Endpoints:
    GET    /paper-quality/{paper_id}                       — current version (404 if none)
    GET    /paper-quality/{paper_id}/history               — all versions for a paper
    GET    /paper-quality/{paper_id}/v/{version}           — specific version
    POST   /paper-quality/{paper_id}                       — create v1 (or first version)
    PUT    /paper-quality/{paper_id}                       — update CURRENT version in place
    POST   /paper-quality/{paper_id}/new-version           — fork current → v+1
    DELETE /paper-quality/{paper_id}/v/{version}           — delete a specific version
    GET    /paper-quality/{paper_id}/v/{version}/{format}  — download pdf/tex/md/txt
    POST   /paper-quality/{paper_id}/llm-suggest           — admin only, Opus 4.6 suggestion
"""

import json
import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user, require_admin
from app.config import settings
from app.database import get_db
from app.models.paper import Paper
from app.models.paper_quality_review import PaperQualityReview
from app.models.user import User
from app.services.paper_quality_report import generate_review_artifacts
from app.services.review_templates import empty_rubric_for, get_template

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_GRADES = {"excellent", "good", "adequate", "weak", "unreliable"}


def _serialize(pr: PaperQualityReview) -> dict:
    template = get_template(pr.template_id)
    rubric = json.loads(pr.rubric_json) if pr.rubric_json else empty_rubric_for(pr.template_id)
    return {
        "id": pr.id,
        "paper_id": pr.paper_id,
        "version": pr.version,
        "is_current": pr.is_current,
        "parent_version": pr.parent_version,
        "template_id": pr.template_id or "paper-quality",
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
        "rubric": rubric,
        "overall_grade": pr.overall_grade,
        "overall_score": pr.overall_score,
        "overall_assessment": pr.overall_assessment,
        "private_notes": pr.private_notes,
        "created_by": pr.created_by,
        "created_at": pr.created_at.isoformat() if pr.created_at else None,
        "updated_at": pr.updated_at.isoformat() if pr.updated_at else None,
    }


async def _get_current(db: AsyncSession, paper_id: int) -> PaperQualityReview | None:
    r = await db.execute(
        select(PaperQualityReview)
        .where(
            PaperQualityReview.paper_id == paper_id,
            PaperQualityReview.is_current.is_(True),
        )
        .limit(1)
    )
    return r.scalar_one_or_none()


async def _get_version(db: AsyncSession, paper_id: int, version: int) -> PaperQualityReview | None:
    r = await db.execute(
        select(PaperQualityReview)
        .where(
            PaperQualityReview.paper_id == paper_id,
            PaperQualityReview.version == version,
        )
        .limit(1)
    )
    return r.scalar_one_or_none()


async def _get_paper(db: AsyncSession, paper_id: int) -> Paper:
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


def _refresh_artifacts(pr: PaperQualityReview, paper: Paper) -> None:
    try:
        paths = generate_review_artifacts(pr, paper)
        if paths.get("pdf"): pr.review_pdf_path = str(paths["pdf"])
        if paths.get("tex"): pr.review_tex_path = str(paths["tex"])
        if paths.get("md"):  pr.review_md_path  = str(paths["md"])
        if paths.get("txt"): pr.review_txt_path = str(paths["txt"])
    except Exception as e:
        logger.warning(f"Could not refresh paper-quality artifacts: {e}")


# ---------- LIST ----------

@router.get("")
async def list_quality_reviews(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all papers that have a CURRENT quality review, newest update first."""
    from app.models.label import Label, PaperLabel

    r = await db.execute(
        select(PaperQualityReview, Paper)
        .join(Paper, Paper.id == PaperQualityReview.paper_id)
        .where(PaperQualityReview.is_current.is_(True))
        .order_by(desc(PaperQualityReview.updated_at))
    )
    rows = r.all()

    # Bulk-load labels for all papers in the result (single query, no N+1)
    paper_ids = list({p.id for _, p in rows})
    labels_by_paper: dict[int, list[dict]] = {pid: [] for pid in paper_ids}
    if paper_ids:
        lbl_res = await db.execute(
            select(PaperLabel.paper_id, Label.name, Label.color)
            .join(Label, Label.id == PaperLabel.label_id)
            .where(PaperLabel.paper_id.in_(paper_ids))
        )
        for pid, name, color in lbl_res.all():
            labels_by_paper.setdefault(pid, []).append({"name": name, "color": color})

    out: list[dict] = []
    for pr, paper in rows:
        out.append({
            "paper_id": paper.id,
            "title": paper.title,
            "doi": paper.doi,
            "journal": paper.journal,
            "publication_date": paper.publication_date,
            "rating": paper.rating,
            "labels": labels_by_paper.get(paper.id, []),
            "version": pr.version,
            "overall_grade": pr.overall_grade,
            "overall_score": pr.overall_score,
            "updated_at": pr.updated_at.isoformat() if pr.updated_at else None,
            "created_by": pr.created_by,
        })
    return out


# ---------- GET ----------

@router.get("/{paper_id}")
async def get_current(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the CURRENT version of the quality review for a paper, or 404."""
    pr = await _get_current(db, paper_id)
    if not pr:
        raise HTTPException(status_code=404, detail="No quality review for this paper")
    return _serialize(pr)


@router.get("/{paper_id}/history")
async def get_history(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all versions for a paper, newest first."""
    r = await db.execute(
        select(PaperQualityReview)
        .where(PaperQualityReview.paper_id == paper_id)
        .order_by(desc(PaperQualityReview.version))
    )
    return [_serialize(pr) for pr in r.scalars().all()]


@router.get("/{paper_id}/v/{version}")
async def get_specific_version(
    paper_id: int,
    version: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pr = await _get_version(db, paper_id, version)
    if not pr:
        raise HTTPException(status_code=404, detail="Version not found")
    return _serialize(pr)


# ---------- CREATE / UPDATE / FORK ----------

class PaperQualityCreate(BaseModel):
    template_id: str = "paper-quality"
    rubric: dict | None = None
    overall_grade: str | None = None
    overall_score: int | None = None
    overall_assessment: str | None = None
    private_notes: str | None = None


@router.post("/{paper_id}")
async def create_first(
    paper_id: int,
    body: PaperQualityCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Idempotent: ensure a quality review exists for this paper.

    If one already exists, returns the current version untouched (no 409).
    Otherwise creates v1 and returns it. This makes the endpoint safe against
    React StrictMode double-effect races and concurrent first-load requests.
    """
    paper = await _get_paper(db, paper_id)
    existing = await _get_current(db, paper_id)
    if existing:
        return _serialize(existing)

    from app.services.review_templates import TEMPLATES
    tpl_id = body.template_id if body.template_id in TEMPLATES else "paper-quality"

    pr = PaperQualityReview(
        paper_id=paper_id,
        version=1,
        is_current=True,
        parent_version=None,
        template_id=tpl_id,
        rubric_json=json.dumps(body.rubric) if body.rubric else json.dumps(empty_rubric_for(tpl_id)),
        overall_grade=body.overall_grade if body.overall_grade in VALID_GRADES else None,
        overall_score=body.overall_score if body.overall_score and 1 <= body.overall_score <= 5 else None,
        overall_assessment=body.overall_assessment,
        private_notes=body.private_notes,
        created_by=user.username,
    )
    db.add(pr)
    await db.flush()
    _refresh_artifacts(pr, paper)
    await db.commit()
    await db.refresh(pr)
    return _serialize(pr)


class PaperQualityUpdate(BaseModel):
    rubric: dict | None = None
    overall_grade: str | None = None
    overall_score: int | None = None
    overall_assessment: str | None = None
    private_notes: str | None = None
    template_id: str | None = None


@router.put("/{paper_id}")
async def update_current(
    paper_id: int,
    body: PaperQualityUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the CURRENT version IN PLACE. To preserve history use POST /new-version first."""
    paper = await _get_paper(db, paper_id)
    pr = await _get_current(db, paper_id)
    if not pr:
        raise HTTPException(status_code=404, detail="No quality review yet — use POST to create one")

    if body.template_id is not None:
        from app.services.review_templates import TEMPLATES
        if body.template_id not in TEMPLATES:
            raise HTTPException(status_code=400, detail=f"Unknown template: {body.template_id}")
        if body.template_id != pr.template_id:
            pr.template_id = body.template_id
            if body.rubric is None:
                pr.rubric_json = json.dumps(empty_rubric_for(body.template_id))

    if body.rubric is not None:
        pr.rubric_json = json.dumps(body.rubric, ensure_ascii=False)
    if body.overall_grade is not None:
        if body.overall_grade and body.overall_grade not in VALID_GRADES:
            raise HTTPException(status_code=400, detail=f"Invalid grade: {body.overall_grade}")
        pr.overall_grade = body.overall_grade or None
    if body.overall_score is not None:
        if body.overall_score and not (1 <= body.overall_score <= 5):
            raise HTTPException(status_code=400, detail="Score must be between 1 and 5")
        pr.overall_score = body.overall_score
    if body.overall_assessment is not None:
        pr.overall_assessment = body.overall_assessment
    if body.private_notes is not None:
        pr.private_notes = body.private_notes

    _refresh_artifacts(pr, paper)
    await db.commit()
    await db.refresh(pr)
    return _serialize(pr)


@router.post("/{paper_id}/new-version")
async def fork_new_version(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Snapshot the current version into v+1 (kept as the new CURRENT), demoting
    the previous one to a history entry. Subsequent edits go to v+1.
    """
    paper = await _get_paper(db, paper_id)
    current = await _get_current(db, paper_id)
    if not current:
        raise HTTPException(status_code=404, detail="No quality review yet")

    # Find max version across all entries to compute the next one
    r = await db.execute(
        select(PaperQualityReview.version)
        .where(PaperQualityReview.paper_id == paper_id)
        .order_by(desc(PaperQualityReview.version))
        .limit(1)
    )
    max_v = r.scalar() or 0
    new_v = max_v + 1

    # Demote current to non-current
    current.is_current = False

    new_pr = PaperQualityReview(
        paper_id=paper_id,
        version=new_v,
        is_current=True,
        parent_version=current.version,
        template_id=current.template_id,
        rubric_json=current.rubric_json,
        overall_grade=current.overall_grade,
        overall_score=current.overall_score,
        overall_assessment=current.overall_assessment,
        private_notes=current.private_notes,
        created_by=user.username,
    )
    db.add(new_pr)
    await db.flush()
    _refresh_artifacts(new_pr, paper)
    await db.commit()
    await db.refresh(new_pr)
    return _serialize(new_pr)


# ---------- DELETE ----------

@router.delete("/{paper_id}/v/{version}")
async def delete_version(
    paper_id: int,
    version: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a specific version. If you delete the current one, the next-most-recent
    version becomes the new current automatically.
    """
    pr = await _get_version(db, paper_id, version)
    if not pr:
        raise HTTPException(status_code=404, detail="Version not found")

    was_current = pr.is_current

    # Remove on-disk artifacts for this version
    reports_dir = Path(settings.reports_path) / "paper-quality"
    for ext in (".pdf", ".tex", ".md", ".txt"):
        f = reports_dir / f"paper_quality_{paper_id}_v{version}{ext}"
        if f.exists():
            try:
                f.unlink()
            except OSError:
                pass

    await db.delete(pr)
    await db.flush()

    if was_current:
        r = await db.execute(
            select(PaperQualityReview)
            .where(PaperQualityReview.paper_id == paper_id)
            .order_by(desc(PaperQualityReview.version))
            .limit(1)
        )
        successor = r.scalar_one_or_none()
        if successor:
            successor.is_current = True

    await db.commit()
    return {"deleted": version, "promoted_to_current": (was_current and successor is not None) if was_current else False}


# ---------- DOWNLOAD ----------

@router.get("/{paper_id}/v/{version}/{fmt}")
async def download_artifact(
    paper_id: int,
    version: int,
    fmt: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if fmt not in ("pdf", "tex", "md", "txt"):
        raise HTTPException(status_code=400, detail="Format must be pdf|tex|md|txt")
    paper = await _get_paper(db, paper_id)
    pr = await _get_version(db, paper_id, version)
    if not pr:
        raise HTTPException(status_code=404, detail="Version not found")

    paths = generate_review_artifacts(pr, paper)
    if paths.get("pdf"): pr.review_pdf_path = str(paths["pdf"])
    if paths.get("tex"): pr.review_tex_path = str(paths["tex"])
    if paths.get("md"):  pr.review_md_path  = str(paths["md"])
    if paths.get("txt"): pr.review_txt_path = str(paths["txt"])
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
        filename=f"paper_quality_{paper_id}_v{version}.{fmt}",
    )


# ---------- LLM ASSIST (admin only) ----------

@router.post("/{paper_id}/llm-suggest")
async def llm_suggest(
    paper_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """ADMIN ONLY: Claude Opus 4.6 with extended reasoning drafts a quality
    assessment based on the paper's local PDF. The result is RETURNED but
    NOT saved — the human reviewer must explicitly save after editing.
    """
    paper = await _get_paper(db, paper_id)
    if not paper.pdf_local_path:
        raise HTTPException(status_code=400, detail="Paper has no local PDF — cannot run LLM assessment")

    from app.services.paper_quality_llm import LlmReviewError, suggest_paper_quality
    try:
        suggestion = await suggest_paper_quality(paper)
    except LlmReviewError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected paper-quality LLM error for paper {paper_id}: {e}")
        raise HTTPException(status_code=500, detail=f"LLM call failed: {e}")
    return suggestion
