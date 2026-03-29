#!/usr/bin/env python3
"""Import papers from FedCompendium XL papers.json into the database."""

import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import async_session, engine
from app.models.paper import Author, Base, Paper, PaperAuthor, PaperSource
from app.models.topic import PaperTopic, Topic
from app.services.deduplication import find_existing_paper, normalize_doi
from app.clients.base import RawPaperResult
from sqlalchemy import select

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("seed_compendium")

PAPERS_JSON = Path(__file__).parent.parent.parent / "_fedcompendiumXL_CC" / "public" / "data" / "papers.json"


async def main():
    if not PAPERS_JSON.exists():
        # Try alternative path
        alt = Path(__file__).parent.parent.parent / "frontend" / "public" / "compendium" / "data" / "papers.json"
        if alt.exists():
            papers_path = alt
        else:
            logger.error(f"Papers JSON not found at {PAPERS_JSON}")
            return
    else:
        papers_path = PAPERS_JSON

    with open(papers_path) as f:
        papers_data = json.load(f)

    logger.info(f"Loaded {len(papers_data)} papers from {papers_path}")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed topics if needed
    from app.main import seed_default_topics
    await seed_default_topics()

    async with async_session() as db:
        # Get FL topic for assignment
        result = await db.execute(select(Topic).where(Topic.name == "Federated Learning"))
        fl_topic = result.scalar_one_or_none()

        imported = 0
        skipped = 0

        for paper_data in papers_data:
            title = paper_data.get("title", "").strip()
            if not title:
                continue

            # Build a RawPaperResult for dedup check
            raw = RawPaperResult(
                source="compendium",
                source_id=paper_data.get("id", ""),
                title=title,
                doi=paper_data.get("url", "").replace("https://doi.org/", "") if paper_data.get("url") and "doi.org" in paper_data["url"] else None,
            )

            # Check for duplicates
            existing = await find_existing_paper(db, raw)
            if existing:
                skipped += 1
                continue

            # Create paper
            paper = Paper(
                title=title,
                abstract=paper_data.get("abstract"),
                publication_date=f"{paper_data.get('year', 2024)}-01-01",
                journal=paper_data.get("conference"),
                paper_type="journal_article",
                open_access=bool(paper_data.get("pdf_link")),
                pdf_url=paper_data.get("pdf_link"),
                citation_count=paper_data.get("citations", 0),
                validated=False,
            )

            # DOI from url
            url = paper_data.get("url") or ""
            if url and "doi.org/" in url:
                paper.doi = url.split("doi.org/")[-1]

            # Keywords from tags + category (real paper metadata)
            tags = paper_data.get("tags", [])
            categories = paper_data.get("category", [])
            paper.keywords = tags + categories

            db.add(paper)
            await db.flush()

            # Add source
            source = PaperSource(
                paper_id=paper.id,
                source_name="compendium",
                source_id=paper_data.get("id", ""),
            )
            db.add(source)

            # Add authors
            for i, author_data in enumerate(paper_data.get("authors", [])):
                name = author_data if isinstance(author_data, str) else author_data.get("name", "")
                if not name:
                    continue

                # Find or create author
                result = await db.execute(select(Author).where(Author.name == name))
                author = result.scalar_one_or_none()
                if not author:
                    affiliation = author_data.get("affiliation") if isinstance(author_data, dict) else None
                    author = Author(name=name, affiliation=affiliation)
                    db.add(author)
                    await db.flush()

                pa = PaperAuthor(paper_id=paper.id, author_id=author.id, position=i)
                db.add(pa)

            # Assign FL topic
            if fl_topic:
                pt = PaperTopic(paper_id=paper.id, topic_id=fl_topic.id, confidence=0.9)
                db.add(pt)

                # Also check for healthcare topic
                tags = paper_data.get("tags", []) + paper_data.get("category", [])
                if any(t in ["healthcare", "medical", "clinical"] for t in tags):
                    result = await db.execute(
                        select(Topic).where(Topic.name.ilike("%healthcare%"))
                    )
                    health_topic = result.scalar_one_or_none()
                    if health_topic:
                        pt2 = PaperTopic(paper_id=paper.id, topic_id=health_topic.id, confidence=0.8)
                        db.add(pt2)

            imported += 1
            logger.info(f"  Imported: {title[:70]}...")

        await db.commit()

    await engine.dispose()
    logger.info(f"\nDone: {imported} imported, {skipped} skipped (duplicates)")


if __name__ == "__main__":
    asyncio.run(main())
