#!/usr/bin/env python3
"""Enrich compendium papers with DOIs by searching Semantic Scholar."""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import async_session, engine
from app.models.paper import Base, Paper, PaperSource
from app.clients.semantic_scholar import SemanticScholarClient
from app.services.validator import PaperValidator
from sqlalchemy import select
from sqlalchemy.orm import selectinload

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger("enrich_dois")


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    s2 = SemanticScholarClient()
    validator = PaperValidator()
    enriched = 0
    failed = 0

    try:
        async with async_session() as db:
            # Get compendium papers without DOI
            result = await db.execute(
                select(Paper)
                .join(Paper.sources)
                .where(PaperSource.source_name == "compendium")
                .where(Paper.doi.is_(None))
                .options(selectinload(Paper.sources))
            )
            papers = result.unique().scalars().all()

            if not papers:
                logger.info("All compendium papers already have DOIs")
                return

            logger.info(f"Enriching {len(papers)} compendium papers without DOI...")

            for paper in papers:
                # Search S2 by exact title
                title_query = paper.title[:100]
                try:
                    results = await s2.search(title_query, max_results=3)
                except Exception as e:
                    logger.warning(f"  S2 search error for '{title_query[:50]}': {e}")
                    failed += 1
                    await asyncio.sleep(2)
                    continue

                # Find best match by title similarity
                from rapidfuzz import fuzz
                best_match = None
                best_score = 0
                for r in results:
                    score = fuzz.ratio(paper.title.lower(), r.title.lower())
                    if score > best_score and score > 85:
                        best_score = score
                        best_match = r

                if best_match and best_match.doi:
                    # Validate DOI
                    valid = await validator.validate_doi(best_match.doi)
                    if valid:
                        paper.doi = best_match.doi
                        paper.validated = True
                        # Update citation count if S2 has higher
                        if best_match.citation_count > paper.citation_count:
                            paper.citation_count = best_match.citation_count
                        # Update external_ids
                        ext = paper.external_ids
                        ext.update({k: v for k, v in best_match.external_ids.items() if v})
                        paper.external_ids = ext
                        enriched += 1
                        logger.info(f"  [OK] {paper.title[:60]}... → DOI:{best_match.doi}")
                    else:
                        failed += 1
                        logger.info(f"  [INVALID DOI] {paper.title[:60]}...")
                else:
                    failed += 1
                    logger.info(f"  [NO MATCH] {paper.title[:60]}...")

                await asyncio.sleep(1.5)  # Rate limit S2

            await db.commit()

    finally:
        await s2.close()
        await validator.close()
        await engine.dispose()

    logger.info(f"\nDone: {enriched} enriched with DOI, {failed} not found")


if __name__ == "__main__":
    asyncio.run(main())
