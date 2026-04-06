"""Background worker for paper analysis queue processing."""

import asyncio
import logging
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.analysis import AnalysisQueue
from app.models.paper import Paper
from app.services.llm_analysis import generate_paper_analysis, check_ollama_available
from app.services.paper_report_generator import (
    get_paper_data,
    render_paper_report,
    save_report,
    generate_pdf,
)

logger = logging.getLogger(__name__)

_worker_running = False
_worker_progress = {"total": 0, "completed": 0, "current_paper": None}


def get_worker_status() -> dict:
    return {
        "running": _worker_running,
        **_worker_progress,
    }


async def enqueue_papers(db: AsyncSession, paper_ids: list[int]) -> dict:
    """Add papers to the analysis queue. Skips already queued/done papers."""
    added = 0
    skipped = 0

    for paper_id in paper_ids:
        # Check if already in queue (pending/running/done)
        existing = await db.execute(
            select(AnalysisQueue).where(
                AnalysisQueue.paper_id == paper_id,
                AnalysisQueue.status.in_(["pending", "running", "done"]),
            )
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        # Check paper exists and has abstract
        paper = await db.execute(
            select(Paper).where(Paper.id == paper_id)
        )
        p = paper.scalar_one_or_none()
        if not p or not p.abstract:
            skipped += 1
            continue

        # Remove any previous failed entry
        await db.execute(
            update(AnalysisQueue)
            .where(AnalysisQueue.paper_id == paper_id, AnalysisQueue.status == "failed")
            .values(status="pending", error_message=None, started_at=None, completed_at=None)
        )

        # Check if we just updated a failed one
        existing_failed = await db.execute(
            select(AnalysisQueue).where(AnalysisQueue.paper_id == paper_id)
        )
        if existing_failed.scalar_one_or_none():
            added += 1
            continue

        queue_item = AnalysisQueue(paper_id=paper_id)
        db.add(queue_item)
        added += 1

    await db.flush()
    return {"added": added, "skipped": skipped}


async def process_queue():
    """Process all pending items in the analysis queue. Runs as background task."""
    global _worker_running, _worker_progress

    if _worker_running:
        logger.warning("Analysis worker already running")
        return

    # Check Ollama availability
    if not await check_ollama_available():
        logger.error("Ollama not available — cannot process analysis queue")
        return

    _worker_running = True

    try:
        async with async_session() as db:
            # Count pending
            result = await db.execute(
                select(AnalysisQueue).where(AnalysisQueue.status == "pending")
            )
            pending = list(result.scalars().all())

            _worker_progress = {
                "total": len(pending),
                "completed": 0,
                "current_paper": None,
            }

            logger.info(f"Analysis worker started: {len(pending)} papers to process")

            for item in pending:
                # Mark as running
                item.status = "running"
                item.started_at = datetime.utcnow()
                await db.flush()

                # Get paper data
                paper_data = await get_paper_data(db, item.paper_id)
                if not paper_data:
                    item.status = "failed"
                    item.error_message = "Paper not found"
                    item.completed_at = datetime.utcnow()
                    await db.flush()
                    continue

                paper = paper_data["paper"]
                _worker_progress["current_paper"] = paper.title[:80]

                logger.info(f"Analyzing paper {item.paper_id}: {paper.title[:60]}")

                # Generate analysis via LLM
                analysis_text = await generate_paper_analysis(
                    title=paper.title,
                    abstract=paper.abstract,
                    journal=paper.journal,
                    date=paper.publication_date,
                    doi=paper.doi,
                    paper_type=paper.paper_type,
                    keywords=paper.keywords,
                )

                if not analysis_text:
                    item.status = "failed"
                    item.error_message = "LLM generation failed"
                    item.completed_at = datetime.utcnow()
                    await db.flush()
                    continue

                # Render HTML report
                html = render_paper_report(paper_data, analysis_text)
                html_path = save_report(html, item.paper_id)

                # Generate PDF
                pdf_path = generate_pdf(html_path)

                # Update queue item
                item.status = "done"
                item.html_path = str(html_path)
                item.pdf_path = str(pdf_path) if pdf_path else None
                item.completed_at = datetime.utcnow()
                await db.flush()

                _worker_progress["completed"] += 1
                logger.info(
                    f"Paper {item.paper_id} done "
                    f"({_worker_progress['completed']}/{_worker_progress['total']})"
                )

            await db.commit()
            logger.info("Analysis worker completed")

    except Exception as e:
        logger.error(f"Analysis worker error: {e}")
    finally:
        _worker_running = False
        _worker_progress["current_paper"] = None
