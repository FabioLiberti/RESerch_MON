"""Re-enrich existing papers with keyword_categories from their original sources."""

import asyncio
import logging
import sys

sys.path.insert(0, ".")

from app.database import async_session, engine
from app.models.paper import Base, Paper, PaperSource
from sqlalchemy import select

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)


async def enrich_pubmed(session, papers_sources):
    """Re-fetch PubMed papers and extract keyword categories."""
    from app.clients.pubmed import PubMedClient

    client = PubMedClient()
    updated = 0

    for paper_id, source_id in papers_sources:
        if not source_id:
            continue
        try:
            result = await client.fetch_metadata(source_id)
            if result and result.keyword_categories:
                paper = await session.get(Paper, paper_id)
                if paper:
                    paper.keyword_categories_json = __import__("json").dumps(result.keyword_categories)
                    # Also update keywords if richer
                    if result.keywords and len(result.keywords) > len(paper.keywords or []):
                        paper.keywords_json = __import__("json").dumps(result.keywords)
                    updated += 1
        except Exception as e:
            logger.warning(f"PubMed {source_id}: {e}")

    await client.close()
    return updated


async def enrich_arxiv(session, papers_sources):
    """Re-fetch arXiv papers and extract keyword categories."""
    from app.clients.arxiv import ArXivClient

    client = ArXivClient()
    updated = 0

    for paper_id, source_id in papers_sources:
        if not source_id:
            continue
        try:
            result = await client.fetch_metadata(source_id)
            if result and result.keyword_categories:
                paper = await session.get(Paper, paper_id)
                if paper:
                    paper.keyword_categories_json = __import__("json").dumps(result.keyword_categories)
                    if result.keywords:
                        paper.keywords_json = __import__("json").dumps(result.keywords)
                    updated += 1
        except Exception as e:
            logger.warning(f"arXiv {source_id}: {e}")

    await client.close()
    return updated


async def enrich_semantic_scholar(session, papers_sources):
    """Re-fetch S2 papers and extract keyword categories."""
    from app.clients.semantic_scholar import SemanticScholarClient

    client = SemanticScholarClient()
    updated = 0

    for paper_id, source_id in papers_sources:
        if not source_id:
            continue
        try:
            result = await client.fetch_metadata(source_id)
            if result and result.keyword_categories:
                paper = await session.get(Paper, paper_id)
                if paper:
                    paper.keyword_categories_json = __import__("json").dumps(result.keyword_categories)
                    updated += 1
        except Exception as e:
            logger.warning(f"S2 {source_id}: {e}")

    await client.close()
    return updated


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # Get all papers grouped by source
        result = await session.execute(
            select(PaperSource.paper_id, PaperSource.source_id, PaperSource.source_name)
            .order_by(PaperSource.source_name)
        )
        all_sources = result.all()

        by_source = {}
        for paper_id, source_id, source_name in all_sources:
            by_source.setdefault(source_name, []).append((paper_id, source_id))

        total_updated = 0

        # PubMed
        if "pubmed" in by_source:
            papers = by_source["pubmed"]
            logger.info(f"Enriching {len(papers)} PubMed papers...")
            count = await enrich_pubmed(session, papers)
            logger.info(f"PubMed: {count} papers enriched")
            total_updated += count
            await session.commit()

        # arXiv
        if "arxiv" in by_source:
            papers = by_source["arxiv"]
            logger.info(f"Enriching {len(papers)} arXiv papers...")
            count = await enrich_arxiv(session, papers)
            logger.info(f"arXiv: {count} papers enriched")
            total_updated += count
            await session.commit()

        # Semantic Scholar
        if "semantic_scholar" in by_source:
            papers = by_source["semantic_scholar"]
            logger.info(f"Enriching {len(papers)} Semantic Scholar papers...")
            count = await enrich_semantic_scholar(session, papers)
            logger.info(f"S2: {count} papers enriched")
            total_updated += count
            await session.commit()

        logger.info(f"Done! Total papers enriched: {total_updated}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
