"""Network graph API — co-keywords, co-authors, citations."""

import logging
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.paper import Paper, PaperAuthor, PaperSource, Author

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_node(paper: Paper, sources: list[str], authors: list[str] | None = None) -> dict:
    return {
        "id": paper.id,
        "title": paper.title[:80] if paper.title else "",
        "source": sources[0] if sources else "unknown",
        "citations": paper.citation_count,
        "doi": paper.doi,
        "keywords": paper.keywords or [],
        "authors": authors or [],
    }


@router.get("/co-keywords")
async def co_keywords_network(
    max_papers: int = Query(100, ge=10, le=500),
    min_shared: int = Query(2, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
):
    """Build co-keyword network: papers linked by shared keywords."""
    # Get top papers by citation count
    result = await db.execute(
        select(Paper)
        .where(Paper.keywords_json.isnot(None), Paper.keywords_json != "[]")
        .order_by(Paper.citation_count.desc())
        .limit(max_papers)
    )
    papers = list(result.scalars().all())

    # Get sources and authors for each paper
    paper_sources = {}
    paper_author_names = {}
    for p in papers:
        src_result = await db.execute(
            select(PaperSource.source_name).where(PaperSource.paper_id == p.id)
        )
        paper_sources[p.id] = [r[0] for r in src_result.all()]

        auth_result = await db.execute(
            select(Author.name)
            .join(PaperAuthor, PaperAuthor.author_id == Author.id)
            .where(PaperAuthor.paper_id == p.id)
        )
        paper_author_names[p.id] = [r[0] for r in auth_result.all()]

    # Build nodes
    nodes = [_build_node(p, paper_sources.get(p.id, []), paper_author_names.get(p.id, [])) for p in papers]

    # Build links by shared keywords
    links = []
    paper_keywords = {p.id: set(kw.lower() for kw in (p.keywords or [])) for p in papers}

    paper_list = list(papers)
    for i in range(len(paper_list)):
        for j in range(i + 1, len(paper_list)):
            p1, p2 = paper_list[i], paper_list[j]
            shared = paper_keywords[p1.id] & paper_keywords[p2.id]
            if len(shared) >= min_shared:
                links.append({
                    "source": p1.id,
                    "target": p2.id,
                    "weight": len(shared),
                    "shared": list(shared)[:5],
                })

    return {
        "nodes": nodes,
        "links": links,
        "stats": {
            "total_nodes": len(nodes),
            "total_links": len(links),
            "type": "co-keywords",
        },
    }


@router.get("/co-authors")
async def co_authors_network(
    max_papers: int = Query(100, ge=10, le=500),
    min_shared: int = Query(1, ge=1, le=5),
    db: AsyncSession = Depends(get_db),
):
    """Build co-author network: papers linked by shared authors."""
    # Get top papers
    result = await db.execute(
        select(Paper)
        .order_by(Paper.citation_count.desc())
        .limit(max_papers)
    )
    papers = list(result.scalars().all())

    # Get sources and authors for each paper
    paper_sources = {}
    paper_authors = {}

    for p in papers:
        src_result = await db.execute(
            select(PaperSource.source_name).where(PaperSource.paper_id == p.id)
        )
        paper_sources[p.id] = [r[0] for r in src_result.all()]

        auth_result = await db.execute(
            select(Author.name)
            .join(PaperAuthor, PaperAuthor.author_id == Author.id)
            .where(PaperAuthor.paper_id == p.id)
        )
        author_names = [r[0] for r in auth_result.all()]
        paper_authors[p.id] = set(n.lower() for n in author_names)

    # Build nodes
    nodes = [_build_node(p, paper_sources.get(p.id, []), [n.title() for n in paper_authors.get(p.id, set())]) for p in papers]

    # Build links by shared authors
    links = []
    paper_list = list(papers)
    for i in range(len(paper_list)):
        for j in range(i + 1, len(paper_list)):
            p1, p2 = paper_list[i], paper_list[j]
            a1 = paper_authors.get(p1.id, set())
            a2 = paper_authors.get(p2.id, set())
            shared = a1 & a2
            if len(shared) >= min_shared:
                links.append({
                    "source": p1.id,
                    "target": p2.id,
                    "weight": len(shared),
                    "shared": list(shared)[:5],
                })

    return {
        "nodes": nodes,
        "links": links,
        "stats": {
            "total_nodes": len(nodes),
            "total_links": len(links),
            "type": "co-authors",
        },
    }


@router.get("/citations")
async def citations_network(
    db: AsyncSession = Depends(get_db),
):
    """Citation network — requires Semantic Scholar data (future).
    Currently returns placeholder structure."""
    return {
        "nodes": [],
        "links": [],
        "stats": {
            "total_nodes": 0,
            "total_links": 0,
            "type": "citations",
        },
        "message": "Citation data requires Semantic Scholar API key. Configure SEMANTIC_SCHOLAR_API_KEY in .env to enable.",
    }
