"""Paper References API — manage bibliography links between manuscripts and cited papers."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.database import get_db
from app.models.paper import Paper
from app.models.paper_reference import PaperReference
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()


class AddReferenceRequest(BaseModel):
    cited_paper_id: int
    context: str | None = None
    note: str | None = None


class UpdateReferenceRequest(BaseModel):
    context: str | None = None
    note: str | None = None


CONTEXT_LABELS = {
    "introduction": "Introduction",
    "related_work": "Related Work",
    "methodology": "Methodology",
    "comparison": "Comparison / Baseline",
    "results": "Results",
    "discussion": "Discussion",
    "other": "Other",
}


@router.get("/{manuscript_id}")
async def list_references(
    manuscript_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all papers cited by a manuscript, with their metadata."""
    result = await db.execute(
        select(PaperReference, Paper.title, Paper.doi, Paper.journal, Paper.publication_date, Paper.disabled, Paper.rating)
        .join(Paper, PaperReference.cited_paper_id == Paper.id)
        .where(PaperReference.manuscript_id == manuscript_id)
        .order_by(PaperReference.created_at.asc())
    )
    refs = result.all()

    return {
        "manuscript_id": manuscript_id,
        "references": [
            {
                "id": ref.PaperReference.id,
                "cited_paper_id": ref.PaperReference.cited_paper_id,
                "title": ref.title,
                "doi": ref.doi,
                "journal": ref.journal,
                "publication_date": ref.publication_date,
                "disabled": bool(ref.disabled),
                "rating": ref.rating,
                "context": ref.PaperReference.context,
                "context_label": CONTEXT_LABELS.get(ref.PaperReference.context, ref.PaperReference.context),
                "note": ref.PaperReference.note,
            }
            for ref in refs
        ],
        "total": len(refs),
    }


@router.get("/{manuscript_id}/reverse")
async def list_cited_by(
    manuscript_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all manuscripts that cite this paper (reverse lookup)."""
    result = await db.execute(
        select(PaperReference, Paper.title, Paper.paper_role)
        .join(Paper, PaperReference.manuscript_id == Paper.id)
        .where(PaperReference.cited_paper_id == manuscript_id)
        .order_by(PaperReference.created_at.asc())
    )
    refs = result.all()

    return {
        "paper_id": manuscript_id,
        "cited_by": [
            {
                "manuscript_id": ref.PaperReference.manuscript_id,
                "manuscript_title": ref.title,
                "manuscript_role": ref.paper_role,
                "context": ref.PaperReference.context,
                "note": ref.PaperReference.note,
            }
            for ref in refs
        ],
    }


@router.get("/{manuscript_id}/keywords")
async def bibliography_keywords(
    manuscript_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate keywords from all papers cited by this manuscript, with counts."""
    result = await db.execute(
        select(Paper.keywords_json)
        .join(PaperReference, PaperReference.cited_paper_id == Paper.id)
        .where(PaperReference.manuscript_id == manuscript_id)
    )
    rows = result.all()

    import json as _json
    counts: dict[str, int] = {}
    for (kw_json,) in rows:
        if not kw_json:
            continue
        for kw in _json.loads(kw_json):
            kw_clean = kw.strip()
            if kw_clean:
                counts[kw_clean.lower()] = counts.get(kw_clean.lower(), 0) + 1

    # Sort by count descending, then alphabetically
    sorted_kws = sorted(counts.items(), key=lambda x: (-x[1], x[0]))

    return {
        "manuscript_id": manuscript_id,
        "total_papers": len(rows),
        "keywords": [{"keyword": kw, "count": c} for kw, c in sorted_kws],
    }


@router.post("/{manuscript_id}")
async def add_reference(
    manuscript_id: int,
    body: AddReferenceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a paper to the manuscript's bibliography."""
    # Verify both papers exist
    manuscript = await db.get(Paper, manuscript_id)
    if not manuscript:
        raise HTTPException(status_code=404, detail="Manuscript not found")
    cited = await db.get(Paper, body.cited_paper_id)
    if not cited:
        raise HTTPException(status_code=404, detail="Cited paper not found in database")
    if manuscript_id == body.cited_paper_id:
        raise HTTPException(status_code=400, detail="A paper cannot cite itself")

    # Check for duplicates
    existing = await db.execute(
        select(PaperReference).where(
            PaperReference.manuscript_id == manuscript_id,
            PaperReference.cited_paper_id == body.cited_paper_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="This paper is already in the bibliography")

    ref = PaperReference(
        manuscript_id=manuscript_id,
        cited_paper_id=body.cited_paper_id,
        context=body.context,
        note=body.note,
    )
    db.add(ref)
    await db.flush()
    await db.commit()
    logger.info(f"Reference added: manuscript={manuscript_id} cites paper={body.cited_paper_id}")
    return {"id": ref.id, "manuscript_id": manuscript_id, "cited_paper_id": body.cited_paper_id}


@router.put("/ref/{ref_id}")
async def update_reference(
    ref_id: int,
    body: UpdateReferenceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update context or note of a reference."""
    ref = await db.get(PaperReference, ref_id)
    if not ref:
        raise HTTPException(status_code=404, detail="Reference not found")
    if body.context is not None:
        ref.context = body.context
    if body.note is not None:
        ref.note = body.note
    await db.commit()
    return {"id": ref.id, "context": ref.context, "note": ref.note}


@router.delete("/ref/{ref_id}")
async def delete_reference(
    ref_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a paper from the manuscript's bibliography."""
    ref = await db.get(PaperReference, ref_id)
    if not ref:
        raise HTTPException(status_code=404, detail="Reference not found")
    await db.delete(ref)
    await db.commit()
    return {"deleted": ref_id}
