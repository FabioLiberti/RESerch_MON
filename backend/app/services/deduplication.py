"""Paper deduplication across multiple sources."""

import logging
import re

from rapidfuzz import fuzz
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.base import RawPaperResult
from app.models.paper import Paper

logger = logging.getLogger(__name__)

TITLE_SIMILARITY_THRESHOLD = 90  # Levenshtein ratio threshold (0-100)


def normalize_doi(doi: str | None) -> str | None:
    """Normalize DOI for comparison."""
    if not doi:
        return None
    doi = doi.strip().lower()
    doi = re.sub(r"^https?://doi\.org/", "", doi)
    doi = re.sub(r"^doi:", "", doi)
    return doi


def normalize_title(title: str) -> str:
    """Normalize title for fuzzy comparison."""
    title = title.lower().strip()
    title = re.sub(r"[^\w\s]", "", title)
    title = re.sub(r"\s+", " ", title)
    return title


def are_duplicates(paper_a: RawPaperResult, paper_b: RawPaperResult) -> bool:
    """Check if two raw paper results are the same paper."""
    # DOI match (strongest signal)
    doi_a = normalize_doi(paper_a.doi)
    doi_b = normalize_doi(paper_b.doi)
    if doi_a and doi_b and doi_a == doi_b:
        return True

    # Title similarity
    title_a = normalize_title(paper_a.title)
    title_b = normalize_title(paper_b.title)
    ratio = fuzz.ratio(title_a, title_b)
    if ratio >= TITLE_SIMILARITY_THRESHOLD:
        return True

    return False


async def find_existing_paper(
    db: AsyncSession, paper: RawPaperResult
) -> Paper | None:
    """Find an existing paper in the database matching this raw result."""
    # Check by DOI
    doi = normalize_doi(paper.doi)
    if doi:
        result = await db.execute(select(Paper).where(Paper.doi == doi))
        existing = result.scalar_one_or_none()
        if existing:
            return existing

    # Check by title similarity
    # For efficiency, search by first significant words
    title_norm = normalize_title(paper.title)
    words = title_norm.split()[:5]  # First 5 words
    if len(words) >= 3:
        like_pattern = f"%{' '.join(words[:3])}%"
        result = await db.execute(
            select(Paper).where(Paper.title.ilike(like_pattern))
        )
        candidates = result.scalars().all()
        for candidate in candidates:
            candidate_norm = normalize_title(candidate.title)
            if fuzz.ratio(title_norm, candidate_norm) >= TITLE_SIMILARITY_THRESHOLD:
                return candidate

    return None


def deduplicate_results(results: list[RawPaperResult]) -> list[RawPaperResult]:
    """Deduplicate a list of raw paper results, merging data from multiple sources."""
    unique: list[RawPaperResult] = []

    for paper in results:
        found_dup = False
        for i, existing in enumerate(unique):
            if are_duplicates(paper, existing):
                # Merge: keep the one with more data, merge external_ids
                unique[i] = _merge_papers(existing, paper)
                found_dup = True
                break

        if not found_dup:
            unique.append(paper)

    dedup_count = len(results) - len(unique)
    if dedup_count > 0:
        logger.info(f"Deduplicated {dedup_count} papers ({len(results)} -> {len(unique)})")

    return unique


def _merge_papers(existing: RawPaperResult, new: RawPaperResult) -> RawPaperResult:
    """Merge two duplicate paper results, preferring more complete data."""
    # Prefer the one with abstract if the other doesn't have one
    if not existing.abstract and new.abstract:
        existing.abstract = new.abstract

    # Merge authors if existing has fewer
    if len(new.authors) > len(existing.authors):
        existing.authors = new.authors

    # Prefer DOI from either
    if not existing.doi and new.doi:
        existing.doi = new.doi

    # Prefer higher citation count
    existing.citation_count = max(existing.citation_count, new.citation_count)

    # Merge external IDs
    for key, value in new.external_ids.items():
        if value and not existing.external_ids.get(key):
            existing.external_ids[key] = value

    # Prefer PDF URL
    if not existing.pdf_url and new.pdf_url:
        existing.pdf_url = new.pdf_url

    # Merge keywords (union, preserve order)
    if new.keywords:
        existing_set = set(existing.keywords)
        for kw in new.keywords:
            if kw not in existing_set:
                existing.keywords.append(kw)
                existing_set.add(kw)

    return existing
