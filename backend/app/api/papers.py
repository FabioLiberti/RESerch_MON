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


def _paper_to_summary(paper: Paper, labels: list[dict] | None = None, analyses: list[dict] | None = None, has_note: bool = False) -> PaperSummary:
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
        disabled=paper.disabled or False,
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
    label: str | None = None,
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
    if label:
        query = query.join(PaperLabel, PaperLabel.paper_id == Paper.id).join(
            Label, Label.id == PaperLabel.label_id
        ).where(Label.name == label)

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

    # Fetch analyses for all papers
    from app.models.analysis import AnalysisQueue
    analyses_result = await db.execute(
        select(AnalysisQueue.paper_id, AnalysisQueue.analysis_mode, AnalysisQueue.status)
        .where(AnalysisQueue.paper_id.in_(paper_ids), AnalysisQueue.status == "done")
    ) if paper_ids else None
    paper_analyses_map: dict[int, list[dict]] = {}
    if analyses_result:
        for pid, mode, status in analyses_result.all():
            paper_analyses_map.setdefault(pid, []).append({"mode": mode or "quick", "status": status})

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

    return PaperListResponse(
        items=[_paper_to_summary(p, paper_labels_map.get(p.id, []), paper_analyses_map.get(p.id, []), p.id in paper_has_note) for p in papers],
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
            if result.keywords:
                paper.keywords = result.keywords
            if result.keyword_categories:
                paper.keyword_categories = result.keyword_categories
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
                if r.keywords:
                    paper.keywords = r.keywords
                if r.keyword_categories:
                    paper.keyword_categories = r.keyword_categories
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

    if not enriched_from:
        return {"status": "not_found", "message": "Could not enrich from any source"}

    # 4. Extract keywords from PDF if available
    pdf_keywords_extracted = False
    if paper.pdf_local_path:
        try:
            from app.services.pdf_keywords import extract_keywords_from_pdf
            from pathlib import Path
            if Path(paper.pdf_local_path).exists():
                pdf_kw = extract_keywords_from_pdf(paper.pdf_local_path)
                if pdf_kw:
                    # Merge with existing keyword_categories
                    existing_cats = paper.keyword_categories or {}
                    existing_cats.update(pdf_kw)
                    paper.keyword_categories = existing_cats
                    # Also add to flat keywords list (dedup)
                    existing_kw = set(k.lower() for k in (paper.keywords or []))
                    new_kw = list(paper.keywords or [])
                    for cat_kws in pdf_kw.values():
                        for kw in cat_kws:
                            if kw.lower() not in existing_kw:
                                new_kw.append(kw)
                                existing_kw.add(kw.lower())
                    paper.keywords = new_kw
                    pdf_keywords_extracted = True
        except Exception:
            pass

    # Reclassify into topics
    from app.services.topic_classifier import TopicClassifier
    await TopicClassifier().classify_paper(db, paper.id, paper.title, paper.abstract)

    await db.flush()
    result = {"status": "enriched", "source": enriched_from, "title": paper.title}
    if pdf_keywords_extracted:
        result["pdf_keywords"] = True
    return result


@router.post("/{paper_id}/toggle-disabled")
async def toggle_disabled(paper_id: int, db: AsyncSession = Depends(get_db)):
    """Toggle the disabled status of a paper."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    paper.disabled = not (paper.disabled or False)
    await db.flush()
    return {"disabled": paper.disabled}


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
