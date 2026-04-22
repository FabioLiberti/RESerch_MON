"""Papers API endpoints."""

import math
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.paper import Paper, PaperAuthor, PaperSource, Author
from app.models.topic import PaperTopic, Topic
from app.models.analysis import SyntheticAnalysis
from app.models.label import Label, PaperLabel
from app.schemas.paper import (
    AnalysisSchema,
    AuthorSchema,
    PaperDetail,
    PaperListResponse,
    PaperSourceSchema,
    PaperSummary,
    TopicAssignment,
)

router = APIRouter()


def _count_pdf_pages(pdf_path: str | None) -> int | None:
    """Count pages in a PDF file. Returns None if no PDF."""
    if not pdf_path:
        return None
    try:
        import fitz
        p = Path(pdf_path)
        if not p.is_absolute() and not p.exists():
            # Try relative to project root
            from app.config import settings
            p = Path(settings.base_dir) / pdf_path if hasattr(settings, 'base_dir') else p
        doc = fitz.open(str(p))
        count = len(doc)
        doc.close()
        return count
    except Exception:
        return None


def _paper_to_summary(paper: Paper, labels: list[dict] | None = None, analyses: list[dict] | None = None, has_note: bool = False, quality_grade: str | None = None) -> PaperSummary:  # noqa: E501
    return PaperSummary(
        id=paper.id,
        doi=paper.doi,
        title=paper.title,
        publication_date=paper.publication_date,
        journal=paper.journal,
        paper_type=paper.paper_type,
        open_access=paper.open_access,
        has_pdf=paper.pdf_local_path is not None,
        citation_count=paper.citation_count,
        sources=[s.source_name for s in paper.sources],
        topics=[pt.topic.name for pt in paper.topics if pt.topic],
        keywords=paper.keywords,
        labels=labels or [],
        analyses=analyses or [],
        has_note=has_note,
        disabled=paper.disabled or False,
        on_zotero=paper.zotero_key is not None,
        zotero_key=paper.zotero_key,
        rating=paper.rating,
        tutor_check=paper.tutor_check,
        quality_grade=quality_grade,
        paper_role=paper.paper_role or "bibliography",
        has_supplementary=paper.supplementary_path is not None,
        created_via=paper.created_via,
        created_at=paper.created_at,
    )


def _paper_to_detail(paper: Paper) -> PaperDetail:
    return PaperDetail(
        id=paper.id,
        doi=paper.doi,
        title=paper.title,
        abstract=paper.abstract,
        publication_date=paper.publication_date,
        journal=paper.journal,
        volume=paper.volume,
        pages=paper.pages,
        paper_type=paper.paper_type,
        open_access=paper.open_access,
        pdf_url=paper.pdf_url,
        has_pdf=paper.pdf_local_path is not None,
        pdf_pages=_count_pdf_pages(paper.pdf_local_path),
        citation_count=paper.citation_count,
        external_ids=paper.external_ids,
        validated=paper.validated,
        zotero_key=paper.zotero_key,
        disabled=paper.disabled or False,
        rating=paper.rating,
        tutor_check=paper.tutor_check,
        paper_role=paper.paper_role or "bibliography",
        created_via=paper.created_via,
        conference_url=paper.conference_url,
        conference_notes=paper.conference_notes,
        github_url=paper.github_url,
        overleaf_url=paper.overleaf_url,
        has_tex=paper.tex_local_path is not None,
        has_md=paper.md_local_path is not None,
        has_supplementary=paper.supplementary_path is not None,
        supplementary_pages=_count_pdf_pages(paper.supplementary_path),
        authors=[
            AuthorSchema(
                id=pa.author.id,
                name=pa.author.name,
                affiliation=pa.author.affiliation,
                orcid=pa.author.orcid,
            )
            for pa in sorted(paper.authors, key=lambda x: x.position)
            if pa.author
        ],
        topics=[
            TopicAssignment(
                topic_id=pt.topic_id,
                topic_name=pt.topic.name if pt.topic else "Unknown",
                confidence=pt.confidence,
            )
            for pt in paper.topics
        ],
        keywords=paper.keywords,
        keyword_categories=paper.keyword_categories,
        source_details=[
            PaperSourceSchema(
                source_name=s.source_name,
                source_id=s.source_id,
                fetched_at=s.fetched_at,
            )
            for s in paper.sources
        ],
        created_at=paper.created_at,
        updated_at=paper.updated_at,
    )


@router.get("", response_model=PaperListResponse)
async def list_papers(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at", pattern="^(created_at|publication_date|citation_count|title|rating)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    topic: str | None = None,
    source: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    has_pdf: bool | None = None,
    on_zotero: bool | None = None,
    disabled: bool | None = None,
    min_rating: int | None = None,
    min_citations: int | None = None,
    q: str | None = None,  # Unified search: title, abstract, DOI, author
    search: str | None = None,
    keyword: str | None = None,
    author: str | None = None,
    doi: str | None = None,
    label: str | None = None,
    fl_technique: str | None = None,
    dataset: str | None = None,
    method_tag: str | None = None,
    validation: str | None = None,  # any, validated, pending, rejected, needs_revision
    quality: str | None = None,  # any, excellent, good, adequate, weak, unreliable, none
    tutor_check: str | None = None,  # ok | review | no | none
    paper_role: str | None = None,  # bibliography | reviewing | my_manuscript
    paper_type: str | None = None,  # journal_article | preprint | conference | extended_abstract | ...
    db: AsyncSession = Depends(get_db),
):
    """List papers with filtering, sorting, and pagination."""
    query = select(Paper).options(
        selectinload(Paper.sources),
        selectinload(Paper.topics).selectinload(PaperTopic.topic),
    )

    # Filters
    if topic:
        query = query.join(Paper.topics).join(PaperTopic.topic).where(Topic.name == topic)
    if source:
        query = query.join(Paper.sources).where(PaperSource.source_name == source)
    if date_from:
        query = query.where(Paper.publication_date >= date_from)
    if date_to:
        query = query.where(Paper.publication_date <= date_to)
    if has_pdf is True:
        query = query.where(Paper.pdf_local_path.isnot(None))
    if on_zotero is True:
        query = query.where(Paper.zotero_key.isnot(None))
    elif on_zotero is False:
        query = query.where(Paper.zotero_key.is_(None))
    if disabled is True:
        query = query.where(Paper.disabled.is_(True))
    elif disabled is False:
        query = query.where((Paper.disabled.is_(False)) | (Paper.disabled.is_(None)))
    if min_rating is not None:
        query = query.where(Paper.rating >= min_rating)
    if min_citations is not None:
        query = query.where(Paper.citation_count >= min_citations)
    if q:
        # Unified search across title, abstract, DOI, and author name
        like_q = f"%{q}%"
        from sqlalchemy import or_
        query = query.outerjoin(PaperAuthor, PaperAuthor.paper_id == Paper.id).outerjoin(
            Author, Author.id == PaperAuthor.author_id
        ).where(or_(
            Paper.title.ilike(like_q),
            Paper.abstract.ilike(like_q),
            Paper.doi.ilike(like_q),
            Author.name.ilike(like_q),
        ))
    if search:
        like_term = f"%{search}%"
        query = query.where(Paper.title.ilike(like_term) | Paper.abstract.ilike(like_term))
    if keyword:
        # Support comma-separated keywords (AND logic)
        for kw in keyword.split(","):
            kw = kw.strip()
            if kw:
                query = query.where(Paper.keywords_json.ilike(f'%"{kw}"%'))
    if author:
        query = query.join(PaperAuthor, PaperAuthor.paper_id == Paper.id).join(
            Author, Author.id == PaperAuthor.author_id
        ).where(Author.name.ilike(f"%{author}%"))
    if doi:
        query = query.where(Paper.doi.ilike(f"%{doi}%"))
    if label:
        # Support comma-separated labels (AND logic)
        for lbl in label.split(","):
            lbl = lbl.strip()
            if lbl:
                sub = select(PaperLabel.paper_id).join(Label, Label.id == PaperLabel.label_id).where(Label.name == lbl)
                query = query.where(Paper.id.in_(sub))
    if fl_technique:
        from app.models.structured_analysis import StructuredAnalysis
        # Case-insensitive partial match to handle variations
        query = query.where(Paper.id.in_(
            select(StructuredAnalysis.paper_id).where(
                StructuredAnalysis.fl_techniques_json.ilike(f'%{fl_technique}%')
            )
        ))
    if dataset:
        from app.models.structured_analysis import StructuredAnalysis as SA2
        query = query.where(Paper.id.in_(
            select(SA2.paper_id).where(
                SA2.datasets_json.ilike(f'%{dataset}%')
            )
        ))
    if method_tag:
        from app.models.structured_analysis import StructuredAnalysis as SA3
        query = query.where(Paper.id.in_(
            select(SA3.paper_id).where(
                SA3.method_tags_json.ilike(f'%{method_tag}%')
            )
        ))
    if validation:
        # Review concept only applies to EXT.ABS. Quick/Deep/Summary are working
        # notes that are never reviewed, so they must not influence this filter.
        from app.models.analysis import AnalysisQueue as _AQ
        _EXT_ONLY = [_AQ.analysis_mode == "extended"]
        if validation == "any":
            query = query.where(Paper.id.in_(
                select(_AQ.paper_id).where(
                    *_EXT_ONLY,
                    _AQ.validation_status.in_(["validated", "rejected", "needs_revision"]),
                )
            ))
        elif validation == "pending":
            # Has an EXT.ABS analysis, but it's never been reviewed
            from sqlalchemy import and_
            has_ext = select(_AQ.paper_id).where(*_EXT_ONLY, _AQ.status == "done")
            has_review = select(_AQ.paper_id).where(
                *_EXT_ONLY,
                _AQ.validation_status.in_(["validated", "rejected", "needs_revision"]),
            )
            query = query.where(and_(Paper.id.in_(has_ext), Paper.id.notin_(has_review)))
        elif validation in ("validated", "rejected", "needs_revision"):
            query = query.where(Paper.id.in_(
                select(_AQ.paper_id).where(*_EXT_ONLY, _AQ.validation_status == validation)
            ))
    if quality:
        from app.models.paper_quality_review import PaperQualityReview as _PQR
        if quality == "any":
            query = query.where(Paper.id.in_(
                select(_PQR.paper_id).where(_PQR.is_current.is_(True))
            ))
        elif quality == "none":
            # Papers without any current quality review
            query = query.where(Paper.id.notin_(
                select(_PQR.paper_id).where(_PQR.is_current.is_(True))
            ))
        elif quality in ("excellent", "good", "adequate", "weak", "unreliable"):
            query = query.where(Paper.id.in_(
                select(_PQR.paper_id).where(
                    _PQR.is_current.is_(True),
                    _PQR.overall_grade == quality,
                )
            ))
    if tutor_check:
        if tutor_check == "none":
            query = query.where(Paper.tutor_check.is_(None))
        elif tutor_check in ("ok", "review", "no"):
            query = query.where(Paper.tutor_check == tutor_check)
    if paper_role:
        if paper_role in ("bibliography", "reviewing", "my_manuscript"):
            query = query.where(Paper.paper_role == paper_role)
    if paper_type:
        query = query.where(Paper.paper_type == paper_type)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Sort
    sort_col = getattr(Paper, sort_by, Paper.created_at)
    if sort_order == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

    # Paginate
    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    papers = result.unique().scalars().all()

    # Fetch labels for all papers in one query
    paper_ids = [p.id for p in papers]
    labels_result = await db.execute(
        select(PaperLabel.paper_id, Label.id, Label.name, Label.color)
        .join(Label, Label.id == PaperLabel.label_id)
        .where(PaperLabel.paper_id.in_(paper_ids))
    ) if paper_ids else None
    paper_labels_map: dict[int, list[dict]] = {}
    if labels_result:
        for pid, lid, lname, lcolor in labels_result.all():
            paper_labels_map.setdefault(pid, []).append({"id": lid, "name": lname, "color": lcolor})

    # Fetch analyses for all papers (ordered by newest first to determine CURRENT per mode)
    from app.models.analysis import AnalysisQueue
    analyses_result = await db.execute(
        select(
            AnalysisQueue.paper_id,
            AnalysisQueue.analysis_mode,
            AnalysisQueue.status,
            AnalysisQueue.zotero_synced,
            AnalysisQueue.validation_status,
            AnalysisQueue.validation_score,
        )
        .where(AnalysisQueue.paper_id.in_(paper_ids), AnalysisQueue.status == "done")
        .order_by(AnalysisQueue.completed_at.desc())
    ) if paper_ids else None
    paper_analyses_map: dict[int, list[dict]] = {}
    if analyses_result:
        # Keep only the most recent (CURRENT) entry per paper+mode
        seen_modes: dict[int, set[str]] = {}
        for pid, mode, status, zsynced, vstatus, vscore in analyses_result.all():
            m = mode or "quick"
            if pid not in seen_modes:
                seen_modes[pid] = set()
            if m not in seen_modes[pid]:
                seen_modes[pid].add(m)
                paper_analyses_map.setdefault(pid, []).append({
                    "mode": m,
                    "status": status,
                    "zotero_synced": bool(zsynced),
                    "validation_status": vstatus,
                    "validation_score": vscore,
                })

    # Fetch notes for all papers
    from app.models.label import PaperNote
    notes_result = await db.execute(
        select(PaperNote.paper_id)
        .where(PaperNote.paper_id.in_(paper_ids))
    ) if paper_ids else None
    paper_has_note: set[int] = set()
    if notes_result:
        for (pid,) in notes_result.all():
            paper_has_note.add(pid)

    # Fetch CURRENT quality review grade per paper (single bulk query)
    from app.models.paper_quality_review import PaperQualityReview
    quality_grade_map: dict[int, str | None] = {}
    if paper_ids:
        qr_result = await db.execute(
            select(PaperQualityReview.paper_id, PaperQualityReview.overall_grade)
            .where(
                PaperQualityReview.paper_id.in_(paper_ids),
                PaperQualityReview.is_current.is_(True),
            )
        )
        for pid, grade in qr_result.all():
            quality_grade_map[pid] = grade

    return PaperListResponse(
        items=[
            _paper_to_summary(
                p,
                paper_labels_map.get(p.id, []),
                paper_analyses_map.get(p.id, []),
                p.id in paper_has_note,
                quality_grade_map.get(p.id),
            )
            for p in papers
        ],
        total=total,
        page=page,
        per_page=per_page,
        pages=math.ceil(total / per_page) if total > 0 else 0,
    )


@router.get("/keywords/all")
async def get_all_keywords(db: AsyncSession = Depends(get_db)):
    """Get all unique keywords with paper counts, sorted by frequency."""
    import json
    from collections import Counter

    result = await db.execute(
        select(Paper.keywords_json).where(Paper.keywords_json != "[]")
    )
    rows = result.scalars().all()

    counts: dict[str, int] = {}  # lowercase -> total count
    forms: dict[str, Counter] = {}  # lowercase -> Counter(original_form)
    for kw_json in rows:
        try:
            kws = json.loads(kw_json) if kw_json else []
            for kw in kws:
                key = kw.strip().lower()
                if not key:
                    continue
                counts[key] = counts.get(key, 0) + 1
                if key not in forms:
                    forms[key] = Counter()
                forms[key][kw.strip()] += 1
        except json.JSONDecodeError:
            continue

    return [
        {"keyword": forms[key].most_common(1)[0][0], "count": count}
        for key, count in sorted(counts.items(), key=lambda x: -x[1])
    ]


@router.get("/fl-techniques/all")
async def get_all_fl_techniques(db: AsyncSession = Depends(get_db)):
    """Get all unique FL techniques with unique paper counts (case-insensitive dedup)."""
    import json
    from collections import Counter
    from app.models.structured_analysis import StructuredAnalysis

    result = await db.execute(
        select(StructuredAnalysis.paper_id, StructuredAnalysis.fl_techniques_json)
        .where(StructuredAnalysis.fl_techniques_json != "[]")
    )
    paper_sets: dict[str, set[int]] = {}  # lowercase -> set of paper_ids
    forms: dict[str, Counter] = {}
    for pid, json_str in result.all():
        try:
            for t in json.loads(json_str or "[]"):
                key = t.strip().lower()
                if not key:
                    continue
                if key not in paper_sets:
                    paper_sets[key] = set()
                    forms[key] = Counter()
                paper_sets[key].add(pid)
                forms[key][t.strip()] += 1
        except json.JSONDecodeError:
            continue
    return [
        {"name": forms[k].most_common(1)[0][0], "count": len(pids)}
        for k, pids in sorted(paper_sets.items(), key=lambda x: -len(x[1]))
    ]


@router.get("/method-tags/all")
async def get_all_method_tags(db: AsyncSession = Depends(get_db)):
    """Get all unique method tags with unique paper counts (case-insensitive dedup)."""
    import json
    from collections import Counter
    from app.models.structured_analysis import StructuredAnalysis

    result = await db.execute(
        select(StructuredAnalysis.paper_id, StructuredAnalysis.method_tags_json)
        .where(StructuredAnalysis.method_tags_json != "[]")
    )
    paper_sets: dict[str, set[int]] = {}
    forms: dict[str, Counter] = {}
    for pid, json_str in result.all():
        try:
            for t in json.loads(json_str or "[]"):
                key = t.strip().lower()
                if not key:
                    continue
                if key not in paper_sets:
                    paper_sets[key] = set()
                    forms[key] = Counter()
                paper_sets[key].add(pid)
                forms[key][t.strip()] += 1
        except json.JSONDecodeError:
            continue
    return [
        {"name": forms[k].most_common(1)[0][0], "count": len(pids)}
        for k, pids in sorted(paper_sets.items(), key=lambda x: -len(x[1]))
    ]


@router.get("/datasets/all")
async def get_all_datasets(db: AsyncSession = Depends(get_db)):
    """Get all unique datasets with unique paper counts (case-insensitive dedup)."""
    import json
    from collections import Counter
    from app.models.structured_analysis import StructuredAnalysis

    result = await db.execute(
        select(StructuredAnalysis.paper_id, StructuredAnalysis.datasets_json)
        .where(StructuredAnalysis.datasets_json != "[]")
    )
    paper_sets: dict[str, set[int]] = {}
    forms: dict[str, Counter] = {}
    for pid, json_str in result.all():
        try:
            for d in json.loads(json_str or "[]"):
                key = d.strip().lower()
                if not key:
                    continue
                if key not in paper_sets:
                    paper_sets[key] = set()
                    forms[key] = Counter()
                paper_sets[key].add(pid)
                forms[key][d.strip()] += 1
        except json.JSONDecodeError:
            continue
    return [
        {"name": forms[k].most_common(1)[0][0], "count": len(pids)}
        for k, pids in sorted(paper_sets.items(), key=lambda x: -len(x[1]))
    ]


@router.get("/keywords/categorized")
async def get_categorized_keywords(db: AsyncSession = Depends(get_db)):
    """Get unique keywords grouped by category (Author Keywords, S2 Fields, etc.)."""
    import json
    from collections import Counter

    result = await db.execute(
        select(Paper.keyword_categories_json).where(Paper.keyword_categories_json != "{}")
    )
    rows = result.scalars().all()

    # Count by lowercase, track most common form per category
    cat_counts: dict[str, dict[str, int]] = {}  # cat -> {lowercase: total_count}
    cat_forms: dict[str, dict[str, Counter]] = {}  # cat -> {lowercase: Counter(form)}
    for cat_json in rows:
        try:
            cats = json.loads(cat_json) if cat_json else {}
            for cat_name, kws in cats.items():
                if cat_name not in cat_counts:
                    cat_counts[cat_name] = {}
                    cat_forms[cat_name] = {}
                for kw in kws:
                    key = kw.strip().lower()
                    if not key:
                        continue
                    cat_counts[cat_name][key] = cat_counts[cat_name].get(key, 0) + 1
                    if key not in cat_forms[cat_name]:
                        cat_forms[cat_name][key] = Counter()
                    cat_forms[cat_name][key][kw.strip()] += 1
        except json.JSONDecodeError:
            continue

    # Build result: use most common form for display, sum counts
    result = {}
    for cat in sorted(cat_counts.keys()):
        items = []
        for key, count in sorted(cat_counts[cat].items(), key=lambda x: -x[1]):
            best_form = cat_forms[cat][key].most_common(1)[0][0]
            items.append({"keyword": best_form, "count": count})
        result[cat] = items
    return result


@router.get("/manuscript-status")
async def get_manuscript_status(db: AsyncSession = Depends(get_db)):
    """Return the latest submission round decision for each my_manuscript paper."""
    from app.models.submission_round import SubmissionRound

    # Get all my_manuscript paper IDs
    ms_result = await db.execute(select(Paper.id).where(Paper.paper_role == "my_manuscript"))
    paper_ids = [r[0] for r in ms_result.all()]
    if not paper_ids:
        return {}

    # For each, get the latest round (highest round_number)
    status: dict[int, dict] = {}
    for pid in paper_ids:
        r = await db.execute(
            select(SubmissionRound)
            .where(SubmissionRound.paper_id == pid)
            .order_by(SubmissionRound.round_number.desc())
            .limit(1)
        )
        latest = r.scalar_one_or_none()
        if latest:
            status[pid] = {
                "round_label": latest.label,
                "decision": latest.decision,
                "decision_at": latest.decision_at,
                "deadline": latest.deadline,
            }
    return status


@router.get("/type-stats")
async def get_type_stats(db: AsyncSession = Depends(get_db)):
    """Return paper count per paper_type."""
    result = await db.execute(
        select(Paper.paper_type, func.count(Paper.id))
        .group_by(Paper.paper_type)
        .order_by(func.count(Paper.id).desc())
    )
    return [{"type": r[0] or "unknown", "count": r[1]} for r in result.all()]


@router.get("/section-latest")
async def get_section_latest(db: AsyncSession = Depends(get_db)):
    """Return the latest updated_at per section for badge system."""
    from app.models.analysis import AnalysisQueue
    from app.models.peer_review import PeerReview
    from app.models.paper_quality_review import PaperQualityReview

    async def latest(stmt):
        r = await db.execute(stmt)
        v = r.scalar_one_or_none()
        return v.isoformat() if v else None

    return {
        "review": await latest(select(func.max(AnalysisQueue.completed_at)).where(AnalysisQueue.analysis_mode == "extended", AnalysisQueue.status == "done")),
        "peer-review": await latest(select(func.max(PeerReview.updated_at))),
        "my-manuscripts": await latest(select(func.max(Paper.updated_at)).where(Paper.paper_role == "my_manuscript")),
        "paper-quality": await latest(select(func.max(PaperQualityReview.updated_at))),
    }


class ImportByDoiRequest(BaseModel):
    doi: str


@router.post("/import-by-doi")
async def import_paper_by_doi(
    body: ImportByDoiRequest,
    db: AsyncSession = Depends(get_db),
):
    """Import a paper by DOI — creates it and enriches from S2/CrossRef."""
    from app.models.paper import Paper

    doi = body.doi.strip().lower()
    if doi.startswith("http"):
        doi = doi.split("doi.org/")[-1]

    # Check if already in DB
    existing = await db.execute(select(Paper).where(func.lower(Paper.doi) == doi))
    ex = existing.scalar_one_or_none()
    if ex:
        return {"status": "exists", "paper_id": ex.id, "title": ex.title}

    # Try S2 first
    title = None
    try:
        from app.clients.semantic_scholar import SemanticScholarClient
        s2 = SemanticScholarClient()
        result = await s2.fetch_metadata(f"DOI:{doi}")
        await s2.close()
        if result and result.title:
            paper = Paper(
                doi=doi, title=result.title, abstract=result.abstract,
                publication_date=result.publication_date, journal=result.journal,
                paper_type=result.paper_type, open_access=result.open_access,
                pdf_url=result.pdf_url, citation_count=result.citation_count, validated=True,
                created_via="import_doi",
            )
            paper.keywords = result.keywords or []
            paper.keyword_categories = result.keyword_categories or {}
            paper.external_ids = result.external_ids or {}
            db.add(paper)
            await db.flush()
            title = result.title

            # Add authors
            for i, a in enumerate(result.authors or []):
                name = a.get("name", "")
                if not name:
                    continue
                auth_result = await db.execute(select(Author).where(Author.name == name))
                author = auth_result.scalar_one_or_none()
                if not author:
                    author = Author(name=name, affiliation=a.get("affiliation"), orcid=a.get("orcid"))
                    db.add(author)
                    await db.flush()
                db.add(PaperAuthor(paper_id=paper.id, author_id=author.id, position=i))

            await db.flush()
            await db.commit()
            return {"status": "imported", "paper_id": paper.id, "title": paper.title, "source": "semantic_scholar"}
    except Exception:
        pass

    # Fallback: CrossRef
    try:
        from app.clients.crossref import resolve_doi
        cr = await resolve_doi(doi)
        if cr and cr.get("title"):
            paper = Paper(
                doi=doi, title=cr["title"], abstract=cr.get("abstract"),
                publication_date=cr.get("publication_date"), journal=cr.get("journal"),
                paper_type=cr.get("paper_type", "journal_article"),
                open_access=cr.get("open_access", False),
                citation_count=cr.get("citation_count", 0), validated=True,
            )
            db.add(paper)
            await db.flush()
            await db.commit()
            return {"status": "imported", "paper_id": paper.id, "title": paper.title, "source": "crossref"}
    except Exception:
        pass

    return {"status": "not_found", "message": f"Could not find paper with DOI: {doi}"}


class CitationRefreshRequest(BaseModel):
    paper_ids: list[int] | None = None


@router.post("/refresh-citations")
async def refresh_citations_batch(
    body: CitationRefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Refresh citation counts via Semantic Scholar. If paper_ids provided, only those."""
    from app.services.citation_refresh import refresh_citations_batch as do_refresh
    ids = body.paper_ids if body else None
    result = await do_refresh(db, paper_ids=ids)
    await db.commit()
    return result


class CreateMyManuscriptRequest(BaseModel):
    title: str
    abstract: str | None = None
    journal: str | None = None
    submission_date: str | None = None  # YYYY-MM-DD
    authors: str | None = None  # comma-separated


@router.post("/my-manuscript")
async def create_my_manuscript(
    body: CreateMyManuscriptRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a paper record with role='my_manuscript' for the user's own submitted paper."""
    paper = Paper(
        title=body.title,
        abstract=body.abstract,
        journal=body.journal,
        publication_date=body.submission_date,
        paper_type="manuscript",
        paper_role="my_manuscript",
        created_via="my_manuscript",
    )
    db.add(paper)
    await db.flush()

    # Add authors if provided (comma-separated)
    if body.authors:
        for i, name in enumerate(body.authors.split(",")):
            name = name.strip()
            if not name:
                continue
            # Find or create author
            result = await db.execute(select(Author).where(Author.name == name))
            author = result.scalar_one_or_none()
            if not author:
                author = Author(name=name)
                db.add(author)
                await db.flush()
            pa = PaperAuthor(paper_id=paper.id, author_id=author.id, position=i)
            db.add(pa)

    await db.commit()
    return {"status": "created", "paper_id": paper.id, "title": paper.title}


class CreateExternalDocumentRequest(BaseModel):
    title: str
    issuing_organization: str | None = None   # saved in Paper.journal
    paper_type: str = "report"                # report | guideline | white_paper | standard
    publication_date: str | None = None        # YYYY-MM-DD
    pdf_url: str | None = None                 # original URL
    abstract: str | None = None
    authors: str | None = None                 # comma-separated names


class ResolveExternalRequest(BaseModel):
    url: str


@router.post("/resolve-external")
async def resolve_external_document(body: ResolveExternalRequest):
    """Resolve a WHO/IRIS document URL (or bare handle) into pre-filled metadata.

    Dispatches to:
      - IrisWhoClient (OAI-PMH) for iris.who.int URLs and bare `10665/NNN` handles
      - WhoWebClient (HTML meta tags) for www.who.int publication pages

    Returns a payload matching the shape of CreateExternalDocumentRequest so the
    frontend "Add External Document" form can auto-populate.
    """
    import re as _re
    from app.clients.iris_who import IrisWhoClient, extract_handle
    from app.clients.who_web import WhoWebClient, WHO_HOST_RE

    url = (body.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    result = None
    source_kind = None

    iris_handle = extract_handle(url) if ("iris.who.int" in url.lower() or _re.match(r"^10665/\d+$", url)) else None

    if iris_handle:
        client = IrisWhoClient()
        try:
            result = await client.get_record(iris_handle)
        finally:
            await client.close()
        source_kind = "iris"
    elif WHO_HOST_RE.search(url):
        client = WhoWebClient()
        try:
            result = await client.resolve(url)
        finally:
            await client.close()
        source_kind = "who_web"
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported URL. Provide an iris.who.int handle URL, a bare 10665/NNN handle, or a www.who.int publication page.",
        )

    if result is None:
        raise HTTPException(status_code=404, detail=f"Could not resolve metadata from {source_kind}")

    return {
        "source": source_kind,
        "title": result.title,
        "abstract": result.abstract,
        "issuing_organization": result.journal,
        "paper_type": result.paper_type,
        "publication_date": result.publication_date,
        "pdf_url": result.pdf_url,
        "authors": ", ".join(a["name"] for a in result.authors if a.get("name")),
        "keywords": result.keywords,
        "external_ids": result.external_ids,
    }


@router.post("/external-document")
async def create_external_document(
    body: CreateExternalDocumentRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a Paper record for grey literature / institutional documents
    (WHO, EU, OECD, ISO, FDA, ...) that do not have a DOI.

    Stored as paper_role='bibliography' so it appears in the main Papers list
    alongside peer-reviewed literature. The issuing organization is written
    into the `journal` field.
    """
    allowed_types = {"report", "guideline", "white_paper", "standard"}
    if body.paper_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"paper_type must be one of {sorted(allowed_types)}")

    paper = Paper(
        title=body.title,
        abstract=body.abstract,
        journal=body.issuing_organization,
        publication_date=body.publication_date,
        pdf_url=body.pdf_url,
        paper_type=body.paper_type,
        paper_role="bibliography",
        created_via="external_document",
        validated=True,
    )
    db.add(paper)
    await db.flush()

    if body.authors:
        for i, name in enumerate(body.authors.split(",")):
            name = name.strip()
            if not name:
                continue
            result = await db.execute(select(Author).where(Author.name == name))
            author = result.scalar_one_or_none()
            if not author:
                author = Author(name=name)
                db.add(author)
                await db.flush()
            pa = PaperAuthor(paper_id=paper.id, author_id=author.id, position=i)
            db.add(pa)

    await db.commit()
    return {"status": "created", "paper_id": paper.id, "title": paper.title}


class UpdatePaperMetadataRequest(BaseModel):
    title: str | None = None
    abstract: str | None = None
    journal: str | None = None
    publication_date: str | None = None
    paper_type: str | None = None
    conference_url: str | None = None
    conference_notes: str | None = None
    github_url: str | None = None
    overleaf_url: str | None = None
    pdf_url: str | None = None


@router.put("/{paper_id}/metadata")
async def update_paper_metadata(
    paper_id: int,
    body: UpdatePaperMetadataRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update basic metadata fields of a paper (title, abstract, journal, date, type)."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    if body.title is not None:
        paper.title = body.title
    if body.abstract is not None:
        paper.abstract = body.abstract
    if body.journal is not None:
        paper.journal = body.journal
    if body.publication_date is not None:
        paper.publication_date = body.publication_date
    if body.paper_type is not None:
        paper.paper_type = body.paper_type
    if body.conference_url is not None:
        paper.conference_url = body.conference_url
    if body.conference_notes is not None:
        paper.conference_notes = body.conference_notes
    if body.github_url is not None:
        paper.github_url = body.github_url
    if body.overleaf_url is not None:
        paper.overleaf_url = body.overleaf_url
    if body.pdf_url is not None:
        paper.pdf_url = body.pdf_url

    await db.commit()
    return {"status": "updated", "paper_id": paper.id}


@router.post("/{paper_id}/mark-published")
async def mark_as_published(
    paper_id: int,
    doi: str = Query(..., description="The DOI assigned upon publication"),
    db: AsyncSession = Depends(get_db),
):
    """Transition a my_manuscript or reviewing paper to bibliography after publication."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if paper.paper_role == "bibliography":
        raise HTTPException(status_code=400, detail="Paper is already in bibliography")

    # Check DOI not already used by another paper
    existing = await db.execute(select(Paper).where(Paper.doi == doi, Paper.id != paper_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"DOI {doi} already exists in another paper")

    paper.doi = doi
    paper.paper_role = "bibliography"
    await db.commit()
    return {"status": "published", "paper_id": paper.id, "doi": doi, "paper_role": "bibliography"}


@router.get("/{paper_id}", response_model=PaperDetail)
async def get_paper(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Get detailed paper information."""
    query = (
        select(Paper)
        .where(Paper.id == paper_id)
        .options(
            selectinload(Paper.sources),
            selectinload(Paper.authors).selectinload(PaperAuthor.author),
            selectinload(Paper.topics).selectinload(PaperTopic.topic),
        )
    )
    result = await db.execute(query)
    paper = result.unique().scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    # Find linked peer review (if any)
    from app.models.peer_review import PeerReview
    pr_result = await db.execute(
        select(PeerReview.id).where(PeerReview.paper_id == paper_id).limit(1)
    )
    pr_id = pr_result.scalar_one_or_none()

    detail = _paper_to_detail(paper)
    detail.peer_review_id = pr_id
    return detail


@router.post("/{paper_id}/enrich")
async def enrich_paper(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Re-enrich a paper's metadata by looking up its DOI on S2, PubMed, CrossRef."""
    import json as json_mod

    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if not paper.doi:
        raise HTTPException(status_code=400, detail="Paper has no DOI to enrich from")

    doi = paper.doi
    enriched_from = None

    # 1. Try Semantic Scholar
    try:
        from app.clients.semantic_scholar import SemanticScholarClient
        s2 = SemanticScholarClient()
        result = await s2.fetch_metadata(f"DOI:{doi}")
        await s2.close()
        if result and result.title:
            paper.title = result.title
            paper.abstract = result.abstract or paper.abstract
            paper.journal = result.journal or paper.journal
            paper.publication_date = result.publication_date or paper.publication_date
            paper.paper_type = result.paper_type or paper.paper_type
            paper.open_access = result.open_access
            paper.pdf_url = result.pdf_url or paper.pdf_url
            paper.citation_count = max(paper.citation_count, result.citation_count)
            # Merge keywords (keep existing, add new from S2)
            existing_kw_lower = set(k.lower() for k in (paper.keywords or []))
            merged_kw = list(paper.keywords or [])
            for kw in (result.keywords or []):
                if kw.lower() not in existing_kw_lower:
                    merged_kw.append(kw)
                    existing_kw_lower.add(kw.lower())
            paper.keywords = merged_kw
            # Merge keyword categories
            merged_cats = dict(paper.keyword_categories or {})
            for cat, kws in (result.keyword_categories or {}).items():
                if cat not in merged_cats:
                    merged_cats[cat] = kws
                else:
                    existing_cat_lower = set(k.lower() for k in merged_cats[cat])
                    for kw in kws:
                        if kw.lower() not in existing_cat_lower:
                            merged_cats[cat].append(kw)
                            existing_cat_lower.add(kw.lower())
            paper.keyword_categories = merged_cats
            paper.external_ids = {**(paper.external_ids or {}), **(result.external_ids or {})}
            paper.validated = True
            enriched_from = "semantic_scholar"

            # Add authors if missing
            from sqlalchemy.orm import selectinload
            pa_result = await db.execute(
                select(PaperAuthor).where(PaperAuthor.paper_id == paper_id)
            )
            if not pa_result.scalars().first() and result.authors:
                for i, a in enumerate(result.authors):
                    name = a.get("name", "")
                    if not name:
                        continue
                    auth_result = await db.execute(select(Author).where(Author.name == name))
                    author = auth_result.scalar_one_or_none()
                    if not author:
                        author = Author(name=name, affiliation=a.get("affiliation"), orcid=a.get("orcid"))
                        db.add(author)
                        await db.flush()
                    db.add(PaperAuthor(paper_id=paper_id, author_id=author.id, position=i))
    except Exception:
        pass

    # 2. Try PubMed if S2 failed
    if not enriched_from:
        try:
            from app.clients.pubmed import PubMedClient
            pubmed = PubMedClient()
            results = await pubmed.search(f'"{doi}"[DOI]', max_results=1)
            await pubmed.close()
            if results:
                r = results[0]
                paper.title = r.title or paper.title
                paper.abstract = r.abstract or paper.abstract
                paper.journal = r.journal or paper.journal
                paper.publication_date = r.publication_date or paper.publication_date
                paper.open_access = r.open_access
                paper.pdf_url = r.pdf_url or paper.pdf_url
                # Merge keywords (keep existing, add new from PubMed)
                existing_kw_lower = set(k.lower() for k in (paper.keywords or []))
                merged_kw = list(paper.keywords or [])
                for kw in (r.keywords or []):
                    if kw.lower() not in existing_kw_lower:
                        merged_kw.append(kw)
                        existing_kw_lower.add(kw.lower())
                paper.keywords = merged_kw
                merged_cats = dict(paper.keyword_categories or {})
                for cat, kws in (r.keyword_categories or {}).items():
                    if cat not in merged_cats:
                        merged_cats[cat] = kws
                    else:
                        existing_cat_lower = set(k.lower() for k in merged_cats[cat])
                        for kw in kws:
                            if kw.lower() not in existing_cat_lower:
                                merged_cats[cat].append(kw)
                                existing_cat_lower.add(kw.lower())
                paper.keyword_categories = merged_cats
                paper.external_ids = {**(paper.external_ids or {}), **(r.external_ids or {})}
                paper.validated = True
                enriched_from = "pubmed"
        except Exception:
            pass

    # 3. Try CrossRef if both failed
    if not enriched_from:
        try:
            from app.clients.crossref import resolve_doi
            cr = await resolve_doi(doi)
            if cr and cr.get("title"):
                paper.title = cr["title"]
                paper.abstract = cr.get("abstract") or paper.abstract
                paper.journal = cr.get("journal") or paper.journal
                paper.publication_date = cr.get("publication_date") or paper.publication_date
                paper.paper_type = cr.get("paper_type") or paper.paper_type
                paper.open_access = cr.get("open_access", False)
                paper.pdf_url = cr.get("pdf_url") or paper.pdf_url
                paper.citation_count = max(paper.citation_count, cr.get("citation_count", 0))
                paper.validated = True
                enriched_from = "crossref"

                # Add authors if missing
                pa_result = await db.execute(
                    select(PaperAuthor).where(PaperAuthor.paper_id == paper_id)
                )
                if not pa_result.scalars().first() and cr.get("authors"):
                    for i, name in enumerate(cr["authors"]):
                        auth_result = await db.execute(select(Author).where(Author.name == name))
                        author = auth_result.scalar_one_or_none()
                        if not author:
                            author = Author(name=name)
                            db.add(author)
                            await db.flush()
                        db.add(PaperAuthor(paper_id=paper_id, author_id=author.id, position=i))
        except Exception:
            pass

    # 4. Extract keywords from local PDF if available.
    # This step runs BEFORE the `enriched_from` gate so a paper with complete
    # metadata but poor keywords (e.g. only Semantic Scholar Fields of Study)
    # still gets its author keywords extracted when the user clicks Enrich.
    pdf_keywords_extracted = False
    if paper.pdf_local_path:
        try:
            from app.services.pdf_keywords import extract_keywords_from_pdf
            from pathlib import Path
            if Path(paper.pdf_local_path).exists():
                pdf_kw = extract_keywords_from_pdf(paper.pdf_local_path)
                if pdf_kw:
                    # PDF is authoritative: replace matching categories
                    existing_cats = paper.keyword_categories or {}
                    existing_cats.update(pdf_kw)
                    paper.keyword_categories = existing_cats
                    # Rebuild flat keywords from all categories (clean)
                    seen: set[str] = set()
                    rebuilt: list[str] = []
                    for cat_kws in existing_cats.values():
                        for kw in cat_kws:
                            if kw.lower() not in seen:
                                rebuilt.append(kw)
                                seen.add(kw.lower())
                    paper.keywords = rebuilt
                    pdf_keywords_extracted = True
        except Exception:
            pass

    # If the external APIs added nothing AND we didn't extract any new PDF
    # keywords, there really is nothing to report. Otherwise we continue the
    # enrichment pipeline (topic reclass + citation refs).
    if not enriched_from and not pdf_keywords_extracted:
        return {"status": "not_found", "message": "Could not enrich from any source"}

    # Reclassify into topics
    from app.services.topic_classifier import TopicClassifier
    await TopicClassifier().classify_paper(db, paper.id, paper.title, paper.abstract)

    # 5. Fetch citation references from S2 if not already cached
    refs_fetched = 0
    if paper.doi or (paper.external_ids or {}).get("s2_id"):
        try:
            from app.models.analysis import CitationLink
            cached = await db.execute(
                select(CitationLink.id).where(CitationLink.paper_id == paper_id, CitationLink.direction == "references").limit(1)
            )
            if not cached.scalar_one_or_none():
                from app.clients.semantic_scholar import SemanticScholarClient
                s2_ref = SemanticScholarClient()
                s2_id = (paper.external_ids or {}).get("s2_id")
                lookup = s2_id if s2_id else f"DOI:{paper.doi}"
                refs = await s2_ref.fetch_references(lookup, limit=100)
                # Build DOI lookup for matching
                all_dois = await db.execute(select(Paper.id, Paper.doi).where(Paper.doi.isnot(None)))
                doi_map = {r[1].lower(): r[0] for r in all_dois.all() if r[1]}
                for ref in refs:
                    link = CitationLink(
                        paper_id=paper_id, direction="references",
                        cited_doi=ref.get("doi"), cited_s2_id=ref.get("s2_id"),
                        cited_title=ref.get("title"), cited_citations=ref.get("citations", 0),
                    )
                    if ref.get("doi") and ref["doi"].lower() in doi_map:
                        link.cited_paper_id = doi_map[ref["doi"].lower()]
                    db.add(link)
                refs_fetched = len(refs)
                await s2_ref.close()
        except Exception:
            pass

    await db.flush()
    result = {
        "status": "enriched",
        "source": enriched_from or "pdf_only",
        "title": paper.title,
    }
    if pdf_keywords_extracted:
        result["pdf_keywords"] = True
    if refs_fetched:
        result["references_fetched"] = refs_fetched
    return result


@router.post("/{paper_id}/extract-pdf-keywords")
async def extract_pdf_keywords(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Extract keywords from the paper's local PDF file."""
    import json as json_mod

    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if not paper.pdf_local_path:
        raise HTTPException(status_code=400, detail="Paper has no local PDF")

    from app.services.pdf_keywords import extract_keywords_from_pdf
    kw_dict = extract_keywords_from_pdf(paper.pdf_local_path)

    if not kw_dict:
        return {"total": 0, "keywords": {}}

    # Merge into existing keywords (don't overwrite)
    existing = set(paper.keywords or [])
    existing_cats = paper.keyword_categories or {}
    new_count = 0
    for cat, kws in kw_dict.items():
        for kw in kws:
            if kw not in existing:
                existing.add(kw)
                new_count += 1
        existing_cats[cat] = kws

    paper.keywords_json = json_mod.dumps(sorted(existing))
    paper.keyword_categories_json = json_mod.dumps(existing_cats)
    await db.flush()
    await db.commit()

    return {"total": new_count, "keywords": kw_dict}


@router.post("/{paper_id}/refresh-citations")
async def refresh_citations_single(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Refresh citation count for a single paper via Semantic Scholar."""
    from app.services.citation_refresh import refresh_citation_single
    result = await refresh_citation_single(db, paper_id)
    await db.commit()
    return result


@router.post("/{paper_id}/rate")
async def rate_paper(paper_id: int, rating: int = Query(..., ge=0, le=5), db: AsyncSession = Depends(get_db)):
    """Set paper rating (1-5 stars, 0 to clear)."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    paper.rating = rating if rating > 0 else None
    await db.flush()
    await db.commit()
    return {"rating": paper.rating}


@router.post("/{paper_id}/tutor-check")
async def set_tutor_check(
    paper_id: int,
    check: str | None = Query(None, description="'ok' | 'review' | 'no' | null to clear"),
    db: AsyncSession = Depends(get_db),
):
    """Set the tutor check flag on a paper.

    This is a per-paper decision ('share with tutor' / 'discuss first' /
    'do not share') that is surfaced on Zotero as a colored tag and as a
    clickable badge in the papers list.
    """
    if check and check not in ("ok", "review", "no"):
        raise HTTPException(status_code=400, detail="check must be 'ok', 'review', 'no' or null")
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    paper.tutor_check = check or None
    await db.flush()
    await db.commit()
    return {"tutor_check": paper.tutor_check}


@router.post("/{paper_id}/toggle-disabled")
async def toggle_disabled(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Toggle the disabled status of a paper.

    When disabling a paper that is currently on Zotero, also remove it from
    Zotero so disabled work never stays on the tutor-facing surface.
    """
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    new_disabled = not (paper.disabled or False)
    paper.disabled = new_disabled

    # If disabling AND the paper is currently on Zotero → remove it.
    removed_from_zotero = False
    zotero_error: str | None = None
    if new_disabled and paper.zotero_key:
        from app.clients.zotero import ZoteroClient
        client = ZoteroClient()
        if client.is_configured():
            try:
                deleted = await client.delete_item(paper.zotero_key)
                if deleted:
                    paper.zotero_key = None
                    removed_from_zotero = True
            except Exception as e:
                zotero_error = str(e)
            finally:
                await client.close()

    await db.flush()
    await db.commit()

    return {
        "disabled": paper.disabled,
        "removed_from_zotero": removed_from_zotero,
        "zotero_error": zotero_error,
    }




@router.get("/{paper_id}/pdf-file")
async def get_paper_pdf(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Serve the local PDF file for a paper."""
    paper = await db.get(Paper, paper_id)
    if not paper or not paper.pdf_local_path:
        raise HTTPException(404, "PDF not found")
    path = Path(paper.pdf_local_path)
    if not path.exists():
        raise HTTPException(404, "PDF file not found on disk")
    return FileResponse(path, media_type="application/pdf", filename=f"{paper.title[:80]}.pdf")


@router.get("/{paper_id}/tex-file")
async def get_paper_tex(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Serve the local .tex source file for a paper."""
    paper = await db.get(Paper, paper_id)
    if not paper or not paper.tex_local_path:
        raise HTTPException(404, "TEX file not found")
    path = Path(paper.tex_local_path)
    if not path.exists():
        raise HTTPException(404, "TEX file not found on disk")
    return FileResponse(path, media_type="application/x-tex", filename=f"{paper.title[:80]}.tex")


@router.get("/{paper_id}/md-file")
async def get_paper_md(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Serve the local .md source file for a paper."""
    paper = await db.get(Paper, paper_id)
    if not paper or not paper.md_local_path:
        raise HTTPException(404, "MD file not found")
    path = Path(paper.md_local_path)
    if not path.exists():
        raise HTTPException(404, "MD file not found on disk")
    return FileResponse(path, media_type="text/markdown", filename=f"{paper.title[:80]}.md")


@router.get("/{paper_id}/supplementary-file")
async def get_paper_supplementary(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Serve the supplementary file for a paper."""
    paper = await db.get(Paper, paper_id)
    if not paper or not paper.supplementary_path:
        raise HTTPException(404, "Supplementary file not found")
    path = Path(paper.supplementary_path)
    if not path.exists():
        raise HTTPException(404, "Supplementary file not found on disk")
    ext = path.suffix.lower()
    media = "application/pdf" if ext == ".pdf" else "application/octet-stream"
    return FileResponse(path, media_type=media, filename=f"{paper.title[:60]}_supplementary{ext}")


@router.post("/{paper_id}/upload-supplementary")
async def upload_supplementary(
    paper_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a supplementary file for a paper."""
    import re as re_mod
    from app.config import settings

    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    content = await file.read()
    fname = file.filename or "supplementary.pdf"
    ext = Path(fname).suffix.lower()

    upload_dir = Path(settings.pdf_storage_path) / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_title = re_mod.sub(r'[^\w\s-]', '', paper.title[:60]).strip().replace(' ', '_')
    out_path = upload_dir / f"{safe_title}_{paper_id}_supplementary{ext}"
    out_path.write_bytes(content)

    paper.supplementary_path = str(out_path)
    await db.flush()
    await db.commit()
    return {"status": "uploaded", "path": str(out_path), "size_kb": len(content) // 1024}


@router.get("/{paper_id}/analysis", response_model=AnalysisSchema | None)
async def get_paper_analysis(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Get synthetic analysis for a paper."""
    query = select(SyntheticAnalysis).where(SyntheticAnalysis.paper_id == paper_id)
    result = await db.execute(query)
    analysis = result.scalar_one_or_none()
    if not analysis:
        return None
    return AnalysisSchema(
        paper_id=analysis.paper_id,
        summary=analysis.summary,
        key_findings=analysis.key_findings,
        methodology=analysis.methodology,
        relevance_score=analysis.relevance_score,
        fl_techniques=analysis.fl_techniques,
        generated_at=analysis.generated_at,
        generator=analysis.generator,
    )
