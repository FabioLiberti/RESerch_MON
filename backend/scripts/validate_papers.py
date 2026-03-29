#!/usr/bin/env python3
"""CLI script to validate all unvalidated papers in the database."""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import async_session, engine
from app.models.paper import Base, Paper
from app.services.validator import PaperValidator
from sqlalchemy import select

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("validate_papers")


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    validator = PaperValidator()
    validated_count = 0
    failed_count = 0

    try:
        async with async_session() as db:
            # Get unvalidated papers
            result = await db.execute(
                select(Paper).where(Paper.validated == False).order_by(Paper.id)
            )
            papers = result.scalars().all()

            if not papers:
                logger.info("All papers are already validated")
                return

            logger.info(f"Validating {len(papers)} unvalidated papers...")

            for paper in papers:
                ext_ids = paper.external_ids
                # Also try DOI directly
                if paper.doi:
                    ext_ids["doi"] = paper.doi

                is_valid = await validator.validate_paper(ext_ids)

                if is_valid:
                    paper.validated = True
                    validated_count += 1
                    logger.info(f"  [OK] {paper.title[:60]}...")
                else:
                    failed_count += 1
                    logger.warning(f"  [FAIL] {paper.title[:60]}... (DOI: {paper.doi})")

                # Be gentle with rate limits
                await asyncio.sleep(0.5)

            await db.commit()

    finally:
        await validator.close()
        await engine.dispose()

    logger.info(
        f"\nValidation complete: {validated_count} validated, {failed_count} failed "
        f"({validated_count + failed_count} total)"
    )


if __name__ == "__main__":
    asyncio.run(main())
