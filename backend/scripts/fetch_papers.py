#!/usr/bin/env python3
"""CLI script for manual paper discovery."""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings
from app.database import async_session, engine
from app.models.paper import Base
from app.models.topic import Topic
from app.services.discovery import DiscoveryService
from sqlalchemy import select


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("fetch_papers")


async def main():
    parser = argparse.ArgumentParser(description="Fetch scientific papers")
    parser.add_argument(
        "--topic",
        type=str,
        help="Topic name to search (default: all topics)",
        default=None,
    )
    parser.add_argument(
        "--source",
        type=str,
        help="Specific source to query (pubmed, semantic_scholar, arxiv, biorxiv, ieee)",
        default=None,
    )
    parser.add_argument(
        "--max-per-source",
        type=int,
        default=50,
        help="Maximum papers per source (default: 50)",
    )
    args = parser.parse_args()

    # Ensure DB tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed default topics if needed
    from app.main import seed_default_topics
    await seed_default_topics()

    discovery = DiscoveryService()

    try:
        async with async_session() as db:
            if args.topic:
                # Search specific topic
                result = await db.execute(
                    select(Topic).where(Topic.name.ilike(f"%{args.topic}%"))
                )
                topic = result.scalar_one_or_none()
                if not topic:
                    logger.error(f"Topic not found: {args.topic}")
                    # List available topics
                    result = await db.execute(select(Topic))
                    topics = result.scalars().all()
                    logger.info("Available topics:")
                    for t in topics:
                        logger.info(f"  - {t.name}")
                    return

                sources = [args.source] if args.source else None
                result = await discovery.discover_papers(
                    db, topic, sources=sources, max_per_source=args.max_per_source
                )
                await db.commit()
                logger.info(f"\nResult: {result}")
            else:
                # Search all topics
                results = await discovery.discover_all_topics(
                    db, max_per_source=args.max_per_source
                )
                await db.commit()
                logger.info("\nResults:")
                for r in results:
                    logger.info(f"  {r['topic']}: {r['new_papers']} new / {r['unique_found']} unique")
    finally:
        await discovery.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
