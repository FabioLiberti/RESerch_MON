"""APScheduler integration for automated paper discovery."""

import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.database import async_session
from app.services.analysis import AnalysisService
from app.services.discovery import DiscoveryService
from app.services.export_service import ExportService
from app.services.report_generator import ReportGenerator

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def daily_discovery_job():
    """Run daily paper discovery across all topics and sources."""
    logger.info("=== Daily Discovery Job Started ===")
    start = datetime.utcnow()

    discovery = DiscoveryService(download_pdfs=True, validate=True)
    analysis_service = AnalysisService()
    export_service = ExportService()
    report_gen = ReportGenerator()

    try:
        async with async_session() as db:
            # 1. Discover papers
            results = await discovery.discover_all_topics(db, max_per_source=50)
            total_new = sum(r["new_papers"] for r in results)
            logger.info(f"Discovery: {total_new} new papers found")

            # 2. Generate analyses
            analyzed = await analysis_service.analyze_all_papers(db)
            logger.info(f"Analysis: {analyzed} papers analyzed")

            # 3. Generate exports
            await export_service.export_json(db)
            await export_service.export_xlsx(db)
            logger.info("Exports: JSON + XLSX generated")

            # 4. Generate daily report
            report_path = await report_gen.generate_daily_report(db)
            logger.info(f"Report: {report_path}")

            await db.commit()

    except Exception as e:
        logger.error(f"Daily job error: {e}", exc_info=True)
    finally:
        await discovery.close()

    elapsed = (datetime.utcnow() - start).total_seconds()
    logger.info(f"=== Daily Discovery Job Complete ({elapsed:.1f}s) ===")


def setup_scheduler():
    """Configure and return the scheduler."""
    # Daily at 06:00 UTC
    scheduler.add_job(
        daily_discovery_job,
        "cron",
        hour=6,
        minute=0,
        id="daily_discovery",
        replace_existing=True,
    )
    logger.info("Scheduler configured: daily discovery at 06:00 UTC")
    return scheduler
