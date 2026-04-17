"""Multi-source paper discovery orchestrator."""

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.arxiv import ArXivClient
from app.clients.biorxiv import BioRxivClient
from app.clients.elsevier import ElsevierClient
from app.clients.ieee import IEEEXploreClient
from app.clients.pubmed import PubMedClient
from app.clients.semantic_scholar import SemanticScholarClient
from app.clients.base import RawPaperResult
from app.models.analysis import FetchLog
from app.models.paper import Author, Paper, PaperAuthor, PaperSource
from app.models.topic import PaperTopic, Topic
from app.services.deduplication import deduplicate_results, find_existing_paper, normalize_doi
from app.services.pdf_manager import PDFManager
from app.services.validator import PaperValidator
from app.services.topic_classifier import TopicClassifier

logger = logging.getLogger(__name__)


class DiscoveryService:
    """Orchestrates paper discovery across all configured sources."""

    def __init__(self, download_pdfs: bool = True, validate: bool = True):
        self.download_pdfs = download_pdfs
        self.validate = validate
        self.pdf_manager = PDFManager()
        self.paper_validator = PaperValidator()
        self.topic_classifier = TopicClassifier()
        self.clients = {
            "pubmed": PubMedClient(),
            "semantic_scholar": SemanticScholarClient(),
            "arxiv": ArXivClient(),
            "biorxiv": BioRxivClient(),
            "ieee": IEEEXploreClient(),
            "elsevier": ElsevierClient(),
        }

    async def close(self):
        for client in self.clients.values():
            await client.close()
        await self.pdf_manager.close()
        await self.paper_validator.close()

    async def discover_papers(
        self,
        db: AsyncSession,
        topic: Topic,
        sources: list[str] | None = None,
        max_per_source: int = 50,
        **search_kwargs,
    ) -> dict:
        """Discover papers for a topic across all sources.

        Returns: {total_found, new_papers, sources_queried, errors}
        """
        if sources is None:
            sources = list(self.clients.keys())

        all_results: list[RawPaperResult] = []
        errors: list[str] = []

        for source_name in sources:
            if source_name not in self.clients:
                continue

            client = self.clients[source_name]
            query = topic.source_queries.get(source_name, "")
            if not query:
                # Fallback to keywords
                query = " ".join(topic.keywords[:3]) if topic.keywords else topic.name

            # Log the fetch
            fetch_log = FetchLog(
                source_name=source_name,
                query_topic=topic.name,
                query_text=query,
            )
            db.add(fetch_log)
            await db.flush()

            try:
                logger.info(f"Searching {source_name} for topic '{topic.name}': {query[:80]}")

                if source_name == "biorxiv":
                    results = await client.search(query, max_results=max_per_source, **search_kwargs)
                    # Also search medRxiv for healthcare topics
                    if "healthcare" in topic.name.lower() or "medical" in " ".join(topic.keywords).lower():
                        medrxiv_results = await client.search(
                            query, max_results=max_per_source, server="medrxiv", **search_kwargs
                        )
                        results.extend(medrxiv_results)
                else:
                    results = await client.search(query, max_results=max_per_source, **search_kwargs)

                fetch_log.papers_found = len(results)
                fetch_log.status = "success"
                fetch_log.completed_at = datetime.utcnow()
                all_results.extend(results)

            except Exception as e:
                error_msg = f"{source_name}: {str(e)}"
                logger.error(f"Error searching {source_name}: {e}")
                errors.append(error_msg)
                fetch_log.status = "failed"
                fetch_log.errors = str(e)
                fetch_log.completed_at = datetime.utcnow()

        # Deduplicate across sources
        unique_results = deduplicate_results(all_results)

        # Persist new papers with validation, PDF download, topic classification
        new_count = 0
        for raw_paper in unique_results:
            existing = await find_existing_paper(db, raw_paper)
            if existing:
                await self._add_source_if_new(db, existing, raw_paper)
                await self.topic_classifier.classify_paper(
                    db, existing.id, existing.title, existing.abstract
                )
            else:
                paper = await self._create_paper(db, raw_paper)
                new_count += 1

                # Validate paper existence
                if self.validate:
                    try:
                        validated = await self.paper_validator.validate_paper(
                            paper.external_ids
                        )
                        paper.validated = validated
                    except Exception as e:
                        logger.warning(f"Validation error: {e}")

                # Download PDF
                if self.download_pdfs and raw_paper.pdf_url:
                    try:
                        year = raw_paper.publication_date[:4] if raw_paper.publication_date else None
                        pdf_path = await self.pdf_manager.download_pdf(
                            raw_paper.pdf_url,
                            raw_paper.title,
                            raw_paper.source,
                            year=year,
                        )
                        if pdf_path:
                            paper.pdf_local_path = str(pdf_path)
                            # Extract keywords from PDF
                            try:
                                from app.services.pdf_keywords import extract_keywords_from_pdf
                                pdf_kw = extract_keywords_from_pdf(str(pdf_path))
                                if pdf_kw:
                                    existing_cats = paper.keyword_categories or {}
                                    existing_cats.update(pdf_kw)
                                    paper.keyword_categories = existing_cats
                                    existing_kw = set(k.lower() for k in (paper.keywords or []))
                                    new_kw = list(paper.keywords or [])
                                    for cat_kws in pdf_kw.values():
                                        for kw in cat_kws:
                                            if kw.lower() not in existing_kw:
                                                new_kw.append(kw)
                                                existing_kw.add(kw.lower())
                                    paper.keywords = new_kw
                            except Exception:
                                pass
                    except Exception as e:
                        logger.warning(f"PDF download error: {e}")

                # Fetch citation count from S2 if source didn't provide it
                if paper.citation_count == 0 and paper.doi:
                    try:
                        from app.services.citation_refresh import fetch_s2_citation_count
                        s2_count = await fetch_s2_citation_count(paper.doi)
                        if s2_count and s2_count > 0:
                            paper.citation_count = s2_count
                            logger.debug(f"S2 citation fallback: paper {paper.id} -> {s2_count}")
                    except Exception:
                        pass

                # Classify into topics
                await self.topic_classifier.classify_paper(
                    db, paper.id, paper.title, paper.abstract
                )

        await db.flush()

        # Update fetch logs with new paper count
        for source_name in sources:
            pass  # Already updated per-source

        result = {
            "topic": topic.name,
            "total_found": len(all_results),
            "unique_found": len(unique_results),
            "new_papers": new_count,
            "sources_queried": sources,
            "errors": errors,
        }

        logger.info(
            f"Discovery complete for '{topic.name}': "
            f"{result['total_found']} found, {result['unique_found']} unique, "
            f"{result['new_papers']} new"
        )
        return result

    async def _create_paper(self, db: AsyncSession, raw: RawPaperResult) -> Paper:
        """Create a new Paper record from a raw result."""
        paper = Paper(
            doi=normalize_doi(raw.doi),
            title=raw.title,
            abstract=raw.abstract,
            publication_date=raw.publication_date,
            journal=raw.journal,
            volume=raw.volume,
            pages=raw.pages,
            paper_type=raw.paper_type,
            open_access=raw.open_access,
            pdf_url=raw.pdf_url,
            citation_count=raw.citation_count,
            validated=False,
            created_via="discovery",
        )
        paper.external_ids = raw.external_ids
        if raw.keywords:
            paper.keywords = raw.keywords
        if raw.keyword_categories:
            paper.keyword_categories = raw.keyword_categories
        db.add(paper)
        await db.flush()

        # Add source
        source = PaperSource(
            paper_id=paper.id,
            source_name=raw.source,
            source_id=raw.source_id,
        )
        source.raw_metadata = raw.raw_data
        db.add(source)

        # Add authors
        for i, author_data in enumerate(raw.authors):
            author = await self._find_or_create_author(db, author_data)
            pa = PaperAuthor(
                paper_id=paper.id,
                author_id=author.id,
                position=i,
            )
            db.add(pa)

        return paper

    async def _find_or_create_author(self, db: AsyncSession, data: dict) -> Author:
        """Find existing author or create new one."""
        name = data.get("name", "Unknown")

        # Try exact name match
        result = await db.execute(select(Author).where(Author.name == name))
        author = result.scalar_one_or_none()

        if not author:
            author = Author(
                name=name,
                affiliation=data.get("affiliation"),
                orcid=data.get("orcid"),
                s2_author_id=data.get("s2_author_id"),
            )
            db.add(author)
            await db.flush()

        return author

    async def _add_source_if_new(
        self, db: AsyncSession, paper: Paper, raw: RawPaperResult
    ):
        """Add a source record if this source hasn't been tracked yet."""
        result = await db.execute(
            select(PaperSource).where(
                PaperSource.paper_id == paper.id,
                PaperSource.source_name == raw.source,
            )
        )
        if not result.scalar_one_or_none():
            source = PaperSource(
                paper_id=paper.id,
                source_name=raw.source,
                source_id=raw.source_id,
            )
            source.raw_metadata = raw.raw_data
            db.add(source)

    async def _assign_topic(self, db: AsyncSession, paper_id: int, topic_id: int):
        """Assign a topic to a paper if not already assigned."""
        result = await db.execute(
            select(PaperTopic).where(
                PaperTopic.paper_id == paper_id,
                PaperTopic.topic_id == topic_id,
            )
        )
        if not result.scalar_one_or_none():
            pt = PaperTopic(paper_id=paper_id, topic_id=topic_id, confidence=1.0)
            db.add(pt)

    async def discover_all_topics(
        self, db: AsyncSession, max_per_source: int = 50, **search_kwargs
    ) -> list[dict]:
        """Run discovery for all configured topics."""
        result = await db.execute(select(Topic))
        topics = result.scalars().all()

        results = []
        for topic in topics:
            topic_result = await self.discover_papers(db, topic, max_per_source=max_per_source, **search_kwargs)
            results.append(topic_result)

        return results
