"""Import Bibliography API — extract DOIs, resolve via S2, save to DB."""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.paper import Author, Paper, PaperAuthor, PaperSource
from app.models.analysis import SmartSearchJob
from app.models.user import User
from app.api.auth import require_admin
from app.services.bibliography_parser import extract_dois, extract_dois_with_titles

_pubmed_client = None


def _get_pubmed():
    global _pubmed_client
    if _pubmed_client is None:
        from app.clients.pubmed import PubMedClient
        _pubmed_client = PubMedClient()
    return _pubmed_client
from app.services.deduplication import find_existing_paper, normalize_doi
from app.services.topic_classifier import TopicClassifier

logger = logging.getLogger(__name__)

router = APIRouter()

_s2_client = None


def _get_s2():
    global _s2_client
    if _s2_client is None:
        from app.clients.semantic_scholar import SemanticScholarClient
        _s2_client = SemanticScholarClient()
    return _s2_client


class ImportRequest(BaseModel):
    text: str


class ImportResultItem(BaseModel):
    doi: str
    title: str | None = None
    authors: list[str] = []
    year: int | None = None
    journal: str | None = None
    abstract: str | None = None
    source: str = "semantic_scholar"
    status: str = "found"
    db_paper_id: int | None = None
    external_ids: dict = {}
    keywords: list[str] = []
    pdf_url: str | None = None
    open_access: bool = False
    citation_count: int = 0
    publication_date: str | None = None
    paper_type: str = "journal_article"


class ImportResponse(BaseModel):
    total_dois: int
    resolved: int
    not_found: int
    already_in_db: int
    results: list[ImportResultItem]


class SaveImportRequest(BaseModel):
    papers: list[ImportResultItem]
    label_id: int | None = None


async def _try_pubmed_fallback(doi: str, bib_title: str | None, item: ImportResultItem) -> ImportResultItem:
    """Try to resolve a DOI or title via PubMed when S2 fails."""
    pubmed = _get_pubmed()

    try:
        # Try DOI search on PubMed
        logger.info(f"[bibliography] PubMed fallback for DOI: {doi}")
        doi_results = await pubmed.search(f'"{doi}"[DOI]', max_results=1)

        if not doi_results and bib_title:
            # Try title search on PubMed
            logger.info(f"[bibliography] PubMed title fallback: {bib_title[:50]}")
            await asyncio.sleep(0.5)
            doi_results = await pubmed.search(f'"{bib_title}"[Title]', max_results=1)

        if doi_results:
            result = doi_results[0]
            item.title = result.title
            item.authors = [a.get("name", "") for a in result.authors]
            item.abstract = result.abstract
            item.journal = result.journal
            item.publication_date = result.publication_date
            item.paper_type = result.paper_type
            item.open_access = result.open_access
            item.pdf_url = result.pdf_url
            item.keywords = result.keywords or []
            item.external_ids = result.external_ids or {}
            item.source = "pubmed"
            item.status = "found"
            logger.info(f"[bibliography] PubMed resolved: {result.title[:50]}")
            return item
    except Exception as e:
        logger.warning(f"[bibliography] PubMed fallback failed for {doi}: {e}")

    # S2 and PubMed failed — try CrossRef
    try:
        from app.clients.crossref import resolve_doi
        logger.info(f"[bibliography] CrossRef fallback for DOI: {doi}")
        cr = await resolve_doi(doi)
        if cr and cr.get("title"):
            item.title = cr["title"]
            item.authors = cr.get("authors", [])
            item.abstract = cr.get("abstract")
            item.journal = cr.get("journal")
            item.publication_date = cr.get("publication_date")
            item.paper_type = cr.get("paper_type", "journal_article")
            item.open_access = cr.get("open_access", False)
            item.pdf_url = cr.get("pdf_url")
            item.citation_count = cr.get("citation_count", 0)
            item.external_ids = {"doi": doi}
            item.source = "crossref"
            item.status = "found"
            logger.info(f"[bibliography] CrossRef resolved: {cr['title'][:50]}")
            return item
    except Exception as e:
        logger.warning(f"[bibliography] CrossRef fallback failed for {doi}: {e}")

    # All sources failed
    item.status = "not_found"
    item.title = bib_title
    return item


@router.post("/extract", response_model=ImportResponse)
async def extract_and_resolve(
    body: ImportRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Extract DOIs from bibliography text and resolve via Semantic Scholar."""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        dois_with_titles = extract_dois_with_titles(body.text)
    except Exception as e:
        logger.error(f"[bibliography] Parse error: {e}")
        raise HTTPException(status_code=400, detail=f"Parse error: {str(e)[:100]}")

    if not dois_with_titles:
        raise HTTPException(status_code=400, detail="No DOIs found in text")

    # Build title lookup from bibliography text
    bib_titles = {d["doi"]: d["title"] for d in dois_with_titles}
    dois = [d["doi"] for d in dois_with_titles]

    s2 = _get_s2()
    results: list[ImportResultItem] = []
    resolved = 0
    not_found = 0
    already_in_db_count = 0

    for doi in dois:
        item = ImportResultItem(doi=doi)

        # Check if already in DB
        existing = await db.execute(
            select(Paper).where(Paper.doi == normalize_doi(doi))
        )
        existing_paper = existing.scalar_one_or_none()
        if existing_paper:
            item.status = "already_in_db"
            item.title = existing_paper.title
            item.db_paper_id = existing_paper.id
            already_in_db_count += 1
            results.append(item)
            continue

        # Resolve via Semantic Scholar (rate limit: 1 req/sec with key)
        await asyncio.sleep(1.5)
        try:
            result = await s2.fetch_metadata(f"DOI:{doi}")
            if result and result.title:
                item.title = result.title
                item.authors = [a.get("name", "") for a in result.authors]
                item.abstract = result.abstract
                item.journal = result.journal
                item.publication_date = result.publication_date
                item.paper_type = result.paper_type
                item.open_access = result.open_access
                item.pdf_url = result.pdf_url
                item.citation_count = result.citation_count
                item.keywords = result.keywords or []
                item.external_ids = result.external_ids or {}
                item.status = "found"
                resolved += 1

                # Also check by title
                from app.clients.base import RawPaperResult
                raw = RawPaperResult(
                    source="semantic_scholar",
                    source_id=result.source_id,
                    title=result.title,
                    doi=doi,
                )
                existing_by_title = await find_existing_paper(db, raw)
                if existing_by_title:
                    item.status = "already_in_db"
                    item.db_paper_id = existing_by_title.id
                    already_in_db_count += 1
                    resolved -= 1
            else:
                # S2 failed — try PubMed fallback
                item = await _try_pubmed_fallback(doi, bib_titles.get(doi), item)
                if item.status == "found":
                    resolved += 1
                else:
                    not_found += 1
        except Exception as e:
            logger.warning(f"S2 lookup failed for DOI {doi}: {e}")
            # Try PubMed fallback on S2 error too
            item = await _try_pubmed_fallback(doi, bib_titles.get(doi), item)
            if item.status == "found":
                resolved += 1
            else:
                not_found += 1

        results.append(item)

    logger.info(f"[bibliography] Done: {len(dois)} DOIs, {resolved} resolved, {not_found} not found, {already_in_db_count} already in DB")

    # Save to smart_search_jobs for Recent Searches visibility
    import json as json_mod
    from datetime import datetime
    job = SmartSearchJob(
        max_per_source=0,
        search_mode="bibliography",
        status="done",
        total_found=len(results),
        already_in_db=already_in_db_count,
        completed_at=datetime.utcnow(),
    )
    job.keywords = [f"{len(dois)} DOIs imported"]
    job.sources = ["semantic_scholar", "pubmed", "crossref"]
    job.results = [{"doi": r.doi, "title": r.title, "status": r.status} for r in results]
    db.add(job)
    await db.flush()

    return ImportResponse(
        total_dois=len(dois),
        resolved=resolved,
        not_found=not_found,
        already_in_db=already_in_db_count,
        results=results,
    )


@router.post("/save")
async def save_imported(
    body: SaveImportRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Save selected bibliography papers and optionally assign a label to all."""
    from app.models.label import PaperLabel

    classifier = TopicClassifier()
    saved = 0
    labeled = 0
    skipped = 0

    for item in body.papers:
        paper_id = None

        if item.status == "already_in_db" and item.db_paper_id:
            # Already in DB — just assign label
            paper_id = item.db_paper_id

        elif item.status == "found" and item.title:
            # New paper — save
            existing = await db.execute(
                select(Paper).where(Paper.doi == normalize_doi(item.doi))
            )
            existing_paper = existing.scalar_one_or_none()
            if existing_paper:
                paper_id = existing_paper.id
            else:
                paper = Paper(
                    doi=normalize_doi(item.doi),
                    title=item.title,
                    abstract=item.abstract,
                    publication_date=item.publication_date,
                    journal=item.journal,
                    paper_type=item.paper_type,
                    open_access=item.open_access,
                    pdf_url=item.pdf_url,
                    citation_count=item.citation_count,
                    validated=True,
                    created_via="bibliography_import",
                )
                paper.external_ids = item.external_ids
                if item.keywords:
                    paper.keywords = item.keywords
                db.add(paper)
                await db.flush()
                paper_id = paper.id

                db.add(PaperSource(
                    paper_id=paper.id,
                    source_name="semantic_scholar",
                    source_id=item.external_ids.get("s2_id", ""),
                ))

                for i, name in enumerate(item.authors):
                    result = await db.execute(select(Author).where(Author.name == name))
                    author = result.scalar_one_or_none()
                    if not author:
                        author = Author(name=name)
                        db.add(author)
                        await db.flush()
                    db.add(PaperAuthor(paper_id=paper.id, author_id=author.id, position=i))

                await classifier.classify_paper(db, paper.id, paper.title, paper.abstract)
                saved += 1

        elif item.status in ("not_found", "error") and item.doi:
            # Not found — save minimal entry with DOI
            existing = await db.execute(
                select(Paper).where(Paper.doi == normalize_doi(item.doi))
            )
            if existing.scalar_one_or_none():
                skipped += 1
                continue

            paper = Paper(
                doi=normalize_doi(item.doi),
                title=item.title or f"[Unresolved] DOI: {item.doi}",
                paper_type="journal_article",
                validated=False,
                created_via="bibliography_import",
            )
            db.add(paper)
            await db.flush()
            paper_id = paper.id

            db.add(PaperSource(
                paper_id=paper.id,
                source_name="bibliography",
                source_id=item.doi,
            ))
            saved += 1
        else:
            skipped += 1
            continue

        # Assign label
        if paper_id and body.label_id:
            existing_label = await db.execute(
                select(PaperLabel).where(
                    PaperLabel.paper_id == paper_id,
                    PaperLabel.label_id == body.label_id,
                )
            )
            if not existing_label.scalar_one_or_none():
                db.add(PaperLabel(paper_id=paper_id, label_id=body.label_id))
                labeled += 1

    await db.flush()
    return {"saved": saved, "labeled": labeled, "skipped": skipped}
