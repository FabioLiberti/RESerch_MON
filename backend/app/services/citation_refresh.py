"""Citation count refresh service via Semantic Scholar API."""

import asyncio
import logging

import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.paper import Paper

logger = logging.getLogger(__name__)

S2_BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch"
S2_SINGLE_URL = "https://api.semanticscholar.org/graph/v1/paper"
S2_FIELDS = "citationCount,externalIds"


async def refresh_citation_single(db: AsyncSession, paper_id: int) -> dict:
    """Refresh citation count for a single paper via S2."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        return {"status": "not_found"}

    doi = paper.doi
    s2_id = (paper.external_ids or {}).get("s2_id")

    if not doi and not s2_id:
        return {"status": "no_identifier", "paper_id": paper_id}

    lookup = f"DOI:{doi}" if doi else s2_id

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{S2_SINGLE_URL}/{lookup}",
                params={"fields": S2_FIELDS},
            )
            if resp.status_code != 200:
                return {"status": "s2_error", "paper_id": paper_id, "code": resp.status_code}

            data = resp.json()
            new_count = data.get("citationCount", 0)
            old_count = paper.citation_count

            if new_count > old_count:
                paper.citation_count = new_count
                await db.flush()

            return {
                "status": "updated" if new_count > old_count else "unchanged",
                "paper_id": paper_id,
                "old": old_count,
                "new": new_count,
            }
    except Exception as e:
        logger.warning(f"Citation refresh failed for paper {paper_id}: {e}")
        return {"status": "error", "paper_id": paper_id, "error": str(e)}


async def refresh_citations_batch(db: AsyncSession, paper_ids: list[int] | None = None) -> dict:
    """Refresh citation counts for multiple papers via S2 batch API.

    If paper_ids is None, refreshes ALL papers with a DOI.
    Uses S2 batch endpoint (max 500 per request) with rate limiting.
    """
    if paper_ids:
        query = select(Paper).where(Paper.id.in_(paper_ids))
    else:
        query = select(Paper).where(Paper.doi.isnot(None), Paper.doi != "")

    result = await db.execute(query)
    papers = result.scalars().all()

    if not papers:
        return {"total": 0, "updated": 0, "errors": 0}

    # Build lookup map: S2 identifier -> paper
    lookup_map: dict[str, Paper] = {}
    for p in papers:
        if p.doi:
            lookup_map[f"DOI:{p.doi}"] = p
        elif (p.external_ids or {}).get("s2_id"):
            lookup_map[p.external_ids["s2_id"]] = p

    if not lookup_map:
        return {"total": len(papers), "updated": 0, "errors": 0, "no_identifier": len(papers)}

    # Process in batches of 500 (S2 batch limit)
    identifiers = list(lookup_map.keys())
    updated = 0
    errors = 0
    batch_size = 500

    async with httpx.AsyncClient(timeout=30.0) as client:
        for i in range(0, len(identifiers), batch_size):
            batch = identifiers[i:i + batch_size]

            try:
                resp = await client.post(
                    S2_BATCH_URL,
                    params={"fields": S2_FIELDS},
                    json={"ids": batch},
                )

                if resp.status_code != 200:
                    logger.warning(f"S2 batch API returned {resp.status_code}")
                    errors += len(batch)
                    continue

                results = resp.json()

                for item in results:
                    if item is None:
                        continue

                    # Match back to paper
                    ext_ids = item.get("externalIds", {}) or {}
                    paper_doi = ext_ids.get("DOI")
                    s2_id = item.get("paperId")

                    paper = None
                    if paper_doi and f"DOI:{paper_doi}" in lookup_map:
                        paper = lookup_map[f"DOI:{paper_doi}"]
                    elif s2_id and s2_id in lookup_map:
                        paper = lookup_map[s2_id]

                    if not paper:
                        continue

                    new_count = item.get("citationCount", 0)
                    if new_count > paper.citation_count:
                        paper.citation_count = new_count
                        updated += 1

            except Exception as e:
                logger.warning(f"S2 batch request failed: {e}")
                errors += len(batch)

            # Rate limit: ~1 request per second for batches
            if i + batch_size < len(identifiers):
                await asyncio.sleep(1.0)

    await db.flush()

    logger.info(
        f"Citation refresh: {len(papers)} papers, {updated} updated, {errors} errors"
    )

    return {
        "total": len(papers),
        "updated": updated,
        "unchanged": len(papers) - updated - errors,
        "errors": errors,
    }


async def fetch_s2_citation_count(doi: str) -> int | None:
    """Quick lookup: get citation count for a DOI from S2. Returns None on failure."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{S2_SINGLE_URL}/DOI:{doi}",
                params={"fields": "citationCount"},
            )
            if resp.status_code == 200:
                return resp.json().get("citationCount", 0)
    except Exception:
        pass
    return None
