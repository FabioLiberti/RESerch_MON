"""APScheduler integration — DB-driven job configuration with run logging and email notifications."""

import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.database import async_session

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


# ---------------------------------------------------------------------------
# Job execution functions
# ---------------------------------------------------------------------------

async def run_discovery_job(job_key: str, topic_filter: str | None = None, notify: bool = True, max_per_source: int = 50):
    """Run paper discovery. If topic_filter is set, only that topic is searched."""
    from app.services.discovery import DiscoveryService
    from app.services.analysis import AnalysisService
    from app.services.export_service import ExportService
    from app.services.report_generator import ReportGenerator
    from sqlalchemy import select
    from app.models.topic import Topic

    logger.info(f"=== Discovery Job '{job_key}' Started (topic={topic_filter or 'ALL'}) ===")
    start = datetime.utcnow()
    run_id = await _start_run(job_key)
    summary = ""
    error_msg = ""
    status = "ok"
    details = ""

    discovery = DiscoveryService(download_pdfs=True, validate=True)
    analysis_service = AnalysisService()
    export_service = ExportService()
    report_gen = ReportGenerator()

    try:
        async with async_session() as db:
            if topic_filter:
                # One or more topics (comma-separated)
                topic_names = [t.strip() for t in topic_filter.split(",") if t.strip()]
                results = []
                for tname in topic_names:
                    result = await db.execute(select(Topic).where(Topic.name == tname))
                    topic = result.scalar_one_or_none()
                    if topic:
                        r = await discovery.discover_papers(db, topic, max_per_source=max_per_source)
                        results.append(r)
                    else:
                        logger.warning(f"Topic '{tname}' not found, skipping")
                if not results:
                    summary = f"No matching topics found: {topic_filter}"
                    status = "error"
            else:
                results = await discovery.discover_all_topics(db, max_per_source=max_per_source)

            if results:
                total_new = sum(r.get("new_papers", 0) for r in results)
                summary = f"{total_new} new papers found"

                # Build breakdown
                topic_lines = []
                sources_all: set[str] = set()
                for r in results:
                    t_name = r.get("topic", "Unknown")
                    t_new = r.get("new_papers", 0)
                    t_total = r.get("total_found", 0)
                    t_unique = r.get("unique_found", 0)
                    topic_lines.append(f"  {t_name}: {t_new} new ({t_total} found, {t_unique} unique)")
                    for src in r.get("sources_queried", []):
                        sources_all.add(src)

                details = "By Topic:\n" + "\n".join(topic_lines) if topic_lines else ""
                if sources_all:
                    details += f"\n\nSources queried: {', '.join(sorted(sources_all))}"

            analyzed = await analysis_service.analyze_all_papers(db)
            logger.info(f"Analysis: {analyzed} papers analyzed")

            await export_service.export_json(db)
            await export_service.export_xlsx(db)
            await db.commit()

    except Exception as e:
        logger.error(f"Discovery job '{job_key}' error: {e}", exc_info=True)
        status = "error"
        error_msg = str(e)
        summary = summary or "Failed"
    finally:
        await discovery.close()

    elapsed = (datetime.utcnow() - start).total_seconds()
    logger.info(f"=== Discovery Job '{job_key}' Complete ({elapsed:.1f}s) ===")

    await _finish_run(run_id, status, elapsed, summary, error_msg)

    # Generate report AFTER logging (so we have the run_id)
    report_date = datetime.utcnow().strftime("%Y-%m-%d")
    try:
        async with async_session() as db:
            report_path = await report_gen.generate_daily_report(db, run_id=run_id)
            await db.commit()
            logger.info(f"Report: {report_path}")
    except Exception as e:
        logger.warning(f"Report generation failed: {e}")

    if notify:
        report_link = f"https://resmon.fabioliberti.com/reports?date={report_date}"
        _send_job_email(f"Discovery: {job_key}", status, summary, elapsed, error_msg, details, run_id, report_link)


async def run_citation_refresh_job(job_key: str, notify: bool = True):
    """Refresh citation counts for all papers via Semantic Scholar."""
    logger.info(f"=== Citation Refresh Job '{job_key}' Started ===")
    start = datetime.utcnow()
    run_id = await _start_run(job_key)
    summary = ""
    error_msg = ""
    status = "ok"

    try:
        from app.services.citation_refresh import refresh_citations_batch
        async with async_session() as db:
            result = await refresh_citations_batch(db)
            await db.commit()
            summary = f"{result['total']} checked, {result['updated']} updated, {result.get('errors', 0)} errors"
            logger.info(f"Citations: {summary}")
    except Exception as e:
        logger.error(f"Citation refresh job '{job_key}' error: {e}", exc_info=True)
        status = "error"
        error_msg = str(e)
        summary = "Failed"

    elapsed = (datetime.utcnow() - start).total_seconds()
    logger.info(f"=== Citation Refresh Job '{job_key}' Complete ({elapsed:.1f}s) ===")

    await _finish_run(run_id, status, elapsed, summary, error_msg)
    if notify:
        _send_job_email(f"Citation Refresh: {job_key}", status, summary, elapsed, error_msg, run_id=run_id)


# ---------------------------------------------------------------------------
# Run logging + email
# ---------------------------------------------------------------------------

async def _start_run(job_name: str) -> int | None:
    """Create a 'running' record at job start. Returns the run ID."""
    try:
        from app.models.scheduled_job import JobRun
        async with async_session() as db:
            run = JobRun(job_name=job_name, started_at=datetime.utcnow(), status="running")
            db.add(run)
            await db.flush()
            run_id = run.id
            await db.commit()
            return run_id
    except Exception as e:
        logger.warning(f"Failed to start job run: {e}")
        return None


async def _finish_run(run_id: int | None, status: str, duration: float, summary: str = "", error: str = ""):
    """Update a running record to ok/error with results."""
    if not run_id:
        return
    try:
        from app.models.scheduled_job import JobRun
        async with async_session() as db:
            run = await db.get(JobRun, run_id)
            if run:
                run.status = status
                run.duration_seconds = duration
                run.result_summary = summary
                run.error_message = error or None
                await db.commit()
    except Exception as e:
        logger.warning(f"Failed to finish job run: {e}")


def _send_job_email(job_label: str, status: str, summary: str, duration: float, error: str = "", details: str = "", run_id: int | None = None, report_link: str | None = None):
    try:
        from app.config import settings
        if not settings.smtp_user or not settings.smtp_app_password or not settings.notify_email:
            return

        import smtplib
        from email.mime.text import MIMEText
        import threading

        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        icon = "✅" if status == "ok" else "❌"
        subject = f"{icon} [RESerch Monitor] {job_label}: {summary}"
        run_line = f"Run ID:     #{run_id}\n" if run_id else ""
        body = (
            f"Scheduled Job Report\n\n"
            f"{run_line}"
            f"Job:        {job_label}\n"
            f"Status:     {status.upper()}\n"
            f"Executed:   {now}\n"
            f"Duration:   {duration:.1f}s\n"
            f"Result:     {summary}\n"
            f"Server:     {settings.app_env}\n"
        )
        if details:
            body += f"\n--- Breakdown ---\n{details}\n"
        if error:
            body += f"\nError:      {error}\n"
        if report_link:
            body += f"\n--- Report ---\nView full report: {report_link}\n"

        msg = MIMEText(body, "plain")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_user
        msg["To"] = settings.notify_email

        def send():
            try:
                with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
                    server.login(settings.smtp_user, settings.smtp_app_password)
                    server.send_message(msg)
            except Exception as e:
                logger.warning(f"Job email failed: {e}")

        threading.Thread(target=send, daemon=True).start()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Scheduler setup — reads jobs from DB
# ---------------------------------------------------------------------------

JOB_TYPE_FUNCS = {
    "discovery": run_discovery_job,
    "citation_refresh": run_citation_refresh_job,
}


async def _load_and_schedule():
    """Load all enabled jobs from DB and register them with APScheduler."""
    from app.models.scheduled_job import ScheduledJob
    from sqlalchemy import select

    try:
        async with async_session() as db:
            result = await db.execute(select(ScheduledJob).where(ScheduledJob.enabled == True))  # noqa: E712
            jobs = result.scalars().all()

            for job in jobs:
                func = JOB_TYPE_FUNCS.get(job.job_type)
                if not func:
                    logger.warning(f"Unknown job_type '{job.job_type}' for job '{job.job_key}'")
                    continue

                kwargs = {"job_key": job.job_key, "notify": job.notify}
                if job.job_type == "discovery":
                    if job.topic_filter:
                        kwargs["topic_filter"] = job.topic_filter
                    kwargs["max_per_source"] = job.max_per_source or 50

                scheduler.add_job(
                    func, "cron",
                    hour=job.hour, minute=job.minute,
                    id=job.job_key,
                    replace_existing=True,
                    kwargs=kwargs,
                )
                logger.info(f"Job '{job.job_key}' ({job.job_type}) scheduled at {job.hour:02d}:{job.minute:02d} UTC")

    except Exception as e:
        logger.warning(f"Failed to load jobs from DB, seeding defaults: {e}")
        await _seed_default_jobs()
        await _load_and_schedule()


async def _seed_default_jobs():
    """Create the two default jobs if the table is empty."""
    from app.models.scheduled_job import ScheduledJob
    from sqlalchemy import select

    async with async_session() as db:
        existing = await db.execute(select(ScheduledJob).limit(1))
        if existing.scalar_one_or_none() is not None:
            return  # Already seeded

        db.add(ScheduledJob(
            job_key="discovery",
            label="Daily Discovery",
            description="Discover new papers across all topics and sources",
            job_type="discovery",
            hour=6, minute=0,
            enabled=True, notify=True,
        ))
        db.add(ScheduledJob(
            job_key="citation_refresh",
            label="Citation Refresh",
            description="Refresh citation counts via Semantic Scholar",
            job_type="citation_refresh",
            hour=7, minute=0,
            enabled=True, notify=True,
        ))
        await db.commit()
        logger.info("Default scheduled jobs seeded")


def setup_scheduler():
    """Configure and return the scheduler."""
    import asyncio

    async def _setup():
        await _seed_default_jobs()
        await _load_and_schedule()

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(_setup())
        else:
            loop.run_until_complete(_setup())
    except RuntimeError:
        pass

    logger.info("Scheduler configured")
    return scheduler


async def reload_scheduler():
    """Reload all jobs from DB — call after any CRUD operation."""
    # Remove all existing jobs
    for job in scheduler.get_jobs():
        job.remove()
    await _load_and_schedule()
