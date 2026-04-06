"""Papers API endpoints."""

import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.paper import Paper, PaperAuthor, PaperSource, Author
from app.models.topic import PaperTopic, Topic
from app.models.analysis import SyntheticAnalysis
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


def _paper_to_summary(paper: Paper) -> PaperSummary:
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
        citation_count=paper.citation_count,
        external_ids=paper.external_ids,
        validated=paper.validated,
        zotero_key=paper.zotero_key,
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
    sort_by: str = Query("created_at", pattern="^(created_at|publication_date|citation_count|title)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    topic: str | None = None,
    source: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    has_pdf: bool | None = None,
    search: str | None = None,
    keyword: str | None = None,
    author: str | None = None,
    doi: str | None = None,
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
    if search:
        like_term = f"%{search}%"
        query = query.where(Paper.title.ilike(like_term) | Paper.abstract.ilike(like_term))
    if keyword:
        # Search in JSON array stored as text
        kw_term = f'%"{keyword}"%'
        query = query.where(Paper.keywords_json.ilike(kw_term))
    if author:
        query = query.join(PaperAuthor, PaperAuthor.paper_id == Paper.id).join(
            Author, Author.id == PaperAuthor.author_id
        ).where(Author.name.ilike(f"%{author}%"))
    if doi:
        query = query.where(Paper.doi.ilike(f"%{doi}%"))

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

    return PaperListResponse(
        items=[_paper_to_summary(p) for p in papers],
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

    counter: Counter = Counter()
    for kw_json in rows:
        try:
            kws = json.loads(kw_json) if kw_json else []
            for kw in kws:
                counter[kw] += 1
        except json.JSONDecodeError:
            continue

    return [
        {"keyword": kw, "count": count}
        for kw, count in counter.most_common()
    ]


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
    return _paper_to_detail(paper)


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
