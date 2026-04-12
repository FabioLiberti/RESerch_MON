"""Smart Search API — ad-hoc keyword search across sources (async background)."""

import json
import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session
from app.models.analysis import SmartSearchJob
from app.models.paper import Author, Paper, PaperAuthor, PaperSource
from app.models.topic import Topic
from app.models.user import User
from app.api.auth import require_admin, get_current_user
from app.clients.base import RawPaperResult
from app.services.deduplication import deduplicate_results, find_existing_paper, normalize_doi
from app.services.query_generator import generate_queries

logger = logging.getLogger(__name__)

router = APIRouter()

# Lazy-initialized clients
_clients = None


def _get_clients():
    global _clients
    if _clients is None:
        from app.clients.pubmed import PubMedClient
        from app.clients.arxiv import ArXivClient
        from app.clients.biorxiv import BioRxivClient
        from app.clients.semantic_scholar import SemanticScholarClient
        from app.clients.ieee import IEEEXploreClient
        from app.clients.elsevier import ElsevierClient
        _clients = {
            "pubmed": PubMedClient(),
            "arxiv": ArXivClient(),
            "biorxiv": BioRxivClient(),
            "semantic_scholar": SemanticScholarClient(),
            "ieee": IEEEXploreClient(),
            "elsevier": ElsevierClient(),
        }
    return _clients


# --- Schemas ---

class SearchRequest(BaseModel):
    keywords: list[str]
    sources: list[str] = ["pubmed", "arxiv", "biorxiv"]
    max_per_source: int = 10
    mode: str = "keywords"  # keywords, title, author, doi


class SaveRequest(BaseModel):
    job_id: int
    paper_indices: list[int]


class SaveAsTopicRequest(BaseModel):
    name: str
    keywords: list[str]
    description: str | None = None


# --- Background worker ---

async def _run_smart_search(job_id: int):
    """Background task: execute search across sources and persist results."""
    async with async_session() as db:
        job = await db.get(SmartSearchJob, job_id)
        if not job:
            return

        job.status = "running"
        await db.flush()

        try:
            search_mode = job.search_mode if hasattr(job, "search_mode") and job.search_mode else "keywords"
            queries = generate_queries(job.keywords, mode=search_mode)
            job.queries_used = queries
            clients = _get_clients()

            all_results: list[RawPaperResult] = []

            # Sources that don't support title/author/doi search
            unsupported_modes = {
                "title": {"biorxiv"},
                "author": {"biorxiv"},
                "doi": {"biorxiv", "arxiv", "ieee"},  # S2 + PubMed support DOI lookup
            }
            skip_sources = unsupported_modes.get(search_mode, set())

            for source_name in job.sources:
                if source_name not in clients:
                    continue
                if source_name in skip_sources:
                    logger.info(f"[smart_search:{job_id}] Skipping {source_name} (unsupported for {search_mode} search)")
                    continue
                query = queries.get(source_name, "")
                if not query:
                    continue

                client = clients[source_name]
                try:
                    logger.info(f"[smart_search:{job_id}] Searching {source_name}: {query[:80]}")

                    # DOI mode: use direct metadata lookup instead of search
                    if search_mode == "doi" and hasattr(client, "fetch_metadata"):
                        doi_val = job.keywords[0].strip()
                        for prefix in ["https://doi.org/", "http://doi.org/", "doi:", "DOI:"]:
                            if doi_val.startswith(prefix):
                                doi_val = doi_val[len(prefix):]
                        lookup_id = f"DOI:{doi_val}" if source_name == "semantic_scholar" else doi_val
                        result = await client.fetch_metadata(lookup_id)
                        results = [result] if result else []
                    else:
                        results = await client.search(query, max_results=job.max_per_source)

                    all_results.extend(results)
                    logger.info(f"[smart_search:{job_id}] {source_name}: {len(results)} results")
                except Exception as e:
                    logger.error(f"[smart_search:{job_id}] {source_name} error: {e}")

            # Deduplicate
            unique = deduplicate_results(all_results)

            # Check DB for existing papers and build results
            items = []
            already_count = 0

            for raw in unique:
                existing = await find_existing_paper(db, raw)
                already = existing is not None
                if already:
                    already_count += 1

                items.append({
                    "title": raw.title,
                    "abstract": raw.abstract,
                    "doi": raw.doi,
                    "source": raw.source,
                    "authors": [a.get("name", "") for a in raw.authors],
                    "publication_date": raw.publication_date,
                    "journal": raw.journal,
                    "paper_type": raw.paper_type,
                    "open_access": raw.open_access,
                    "pdf_url": raw.pdf_url,
                    "citation_count": raw.citation_count,
                    "keywords": raw.keywords or [],
                    "external_ids": raw.external_ids or {},
                    "already_in_db": already,
                    "db_paper_id": existing.id if existing else None,
                })

            job.results = items
            job.total_found = len(items)
            job.already_in_db = already_count
            job.status = "done"
            job.completed_at = datetime.utcnow()

            logger.info(f"[smart_search:{job_id}] Done: {len(items)} results, {already_count} already in DB")

        except Exception as e:
            logger.error(f"[smart_search:{job_id}] Failed: {e}")
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()

        await db.commit()


# --- Endpoints ---

@router.post("/search")
async def start_search(
    body: SearchRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Start a Smart Search job. Runs inline and returns when done."""
    if not body.keywords:
        raise HTTPException(status_code=400, detail="No keywords provided")

    if body.mode not in ("keywords", "title", "author", "doi"):
        raise HTTPException(status_code=400, detail="Invalid mode. Use: keywords, title, author, doi")

    job = SmartSearchJob(max_per_source=body.max_per_source, search_mode=body.mode)
    job.keywords = body.keywords
    job.sources = body.sources
    db.add(job)
    await db.flush()

    job_id = job.id

    # Run inline — commit first so the job is visible, then execute
    await db.commit()
    await _run_smart_search(job_id)

    return {"job_id": job_id, "status": "started"}


@router.get("/status/{job_id}")
async def get_job_status(
    job_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll the status of a Smart Search job."""
    job = await db.get(SmartSearchJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    response = {
        "job_id": job.id,
        "status": job.status,
        "keywords": job.keywords,
        "mode": job.search_mode or "keywords",
        "sources": job.sources,
        "total_found": job.total_found,
        "already_in_db": job.already_in_db,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }

    # Include results only when done
    if job.status == "done":
        response["results"] = job.results
        response["queries_used"] = job.queries_used

    return response


@router.get("/recent")
async def recent_searches(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List recent Smart Search jobs."""
    result = await db.execute(
        select(SmartSearchJob)
        .order_by(SmartSearchJob.created_at.desc())
        .limit(10)
    )
    jobs = result.scalars().all()

    return [
        {
            "job_id": j.id,
            "status": j.status,
            "keywords": j.keywords,
            "mode": j.search_mode or "keywords",
            "sources": j.sources,
            "total_found": j.total_found,
            "already_in_db": j.already_in_db,
            "error_message": j.error_message,
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
        }
        for j in jobs
    ]


@router.post("/save")
async def save_papers(
    body: SaveRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Save selected papers from a completed Smart Search job to the database."""
    from app.services.topic_classifier import TopicClassifier

    job = await db.get(SmartSearchJob, body.job_id)
    if not job or job.status != "done":
        raise HTTPException(status_code=400, detail="Job not found or not completed")

    results = job.results
    classifier = TopicClassifier()
    saved = 0
    saved_map: dict[int, int] = {}  # idx → paper_id
    skipped = 0

    for idx in body.paper_indices:
        if idx < 0 or idx >= len(results):
            continue

        item = results[idx]
        if item.get("already_in_db"):
            skipped += 1
            continue

        # Check again
        raw = RawPaperResult(
            source=item["source"],
            source_id=item.get("external_ids", {}).get("arxiv_id") or item.get("external_ids", {}).get("s2_id") or "",
            title=item["title"],
            abstract=item.get("abstract"),
            doi=item.get("doi"),
            authors=[{"name": n} for n in item.get("authors", [])],
            publication_date=item.get("publication_date"),
            journal=item.get("journal"),
            paper_type=item.get("paper_type", "journal_article"),
            open_access=item.get("open_access", False),
            pdf_url=item.get("pdf_url"),
            citation_count=item.get("citation_count", 0),
            keywords=item.get("keywords", []),
            external_ids=item.get("external_ids", {}),
        )

        existing = await find_existing_paper(db, raw)
        if existing:
            skipped += 1
            continue

        # Create paper
        paper = Paper(
            doi=normalize_doi(item.get("doi")),
            title=item["title"],
            abstract=item.get("abstract"),
            publication_date=item.get("publication_date"),
            journal=item.get("journal"),
            paper_type=item.get("paper_type", "journal_article"),
            open_access=item.get("open_access", False),
            pdf_url=item.get("pdf_url"),
            citation_count=item.get("citation_count", 0),
            validated=False,
        )
        paper.external_ids = item.get("external_ids", {})
        if item.get("keywords"):
            paper.keywords = item["keywords"]
        db.add(paper)
        await db.flush()

        # Add source
        source = PaperSource(
            paper_id=paper.id,
            source_name=item["source"],
            source_id=item.get("external_ids", {}).get("arxiv_id") or item.get("external_ids", {}).get("s2_id") or "",
        )
        db.add(source)

        # Add authors
        for i, name in enumerate(item.get("authors", [])):
            result = await db.execute(select(Author).where(Author.name == name))
            author = result.scalar_one_or_none()
            if not author:
                author = Author(name=name)
                db.add(author)
                await db.flush()
            db.add(PaperAuthor(paper_id=paper.id, author_id=author.id, position=i))

        # Classify
        await classifier.classify_paper(db, paper.id, paper.title, paper.abstract)
        saved_map[idx] = paper.id
        saved += 1

    # Update job results to reflect saved state
    updated = job.results
    for idx in body.paper_indices:
        if 0 <= idx < len(updated):
            updated[idx]["already_in_db"] = True
            if idx in saved_map:
                updated[idx]["db_paper_id"] = saved_map[idx]
    job.results = updated

    await db.flush()
    return {"saved": saved, "skipped": skipped, "saved_ids": saved_map}


@router.post("/resume/{job_id}")
async def resume_job(
    job_id: int,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Re-launch a pending or failed Smart Search job."""
    job = await db.get(SmartSearchJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in ("pending", "failed"):
        raise HTTPException(status_code=400, detail=f"Job is {job.status}, cannot resume")

    job.status = "pending"
    job.error_message = None
    job.completed_at = None
    job.results_json = None
    job.total_found = 0
    job.already_in_db = 0
    await db.flush()

    background_tasks.add_task(_run_smart_search, job_id)
    return {"job_id": job_id, "status": "resumed"}


@router.delete("/{job_id}")
async def delete_job(
    job_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a Smart Search job."""
    job = await db.get(SmartSearchJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await db.delete(job)
    return {"status": "deleted"}


@router.post("/save-as-topic")
async def save_as_topic(
    body: SaveAsTopicRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new topic from Smart Search keywords with auto-generated queries."""
    if not body.keywords:
        raise HTTPException(status_code=400, detail="No keywords provided")

    existing = await db.execute(select(Topic).where(Topic.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Topic '{body.name}' already exists")

    queries = generate_queries(body.keywords)

    topic = Topic(
        name=body.name,
        description=body.description or f"Auto-generated from Smart Search: {', '.join(body.keywords)}",
    )
    topic.keywords = body.keywords
    topic.source_queries = queries
    db.add(topic)
    await db.flush()

    return {
        "id": topic.id,
        "name": topic.name,
        "keywords": body.keywords,
        "source_queries": queries,
    }
