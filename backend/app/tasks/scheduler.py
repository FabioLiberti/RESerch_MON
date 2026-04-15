"""APScheduler integration for automated paper discovery — config-driven with run logging."""

import json
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

# Default job configurations
DEFAULT_JOBS = {
    "discovery": {
        "label": "Daily Discovery",
        "description": "Discover new papers across all topics and sources",
        "hour": 6,
        "minute": 0,
        "enabled": True,
        "notify": True,
    },
    "citation_refresh": {
        "label": "Citation Refresh",
        "description": "Refresh citation counts via Semantic Scholar",
        "hour": 7,
        "minute": 0,
        "enabled": True,
        "notify": True,
    },
}


async def _log_run(job_name: str, status: str, duration: float, summary: str = "", error: str = ""):
    """Persist a job run record."""
    try:
        from app.models.job_run import JobRun
        async with async_session() as db:
            db.add(JobRun(
                job_name=job_name,
                started_at=datetime.utcnow(),
                duration_seconds=duration,
                status=status,
                result_summary=summary,
                error_message=error or None,
            ))
            await db.commit()
    except Exception as e:
        logger.warning(f"Failed to log job run: {e}")


def _send_job_email(job_label: str, status: str, summary: str, duration: float, error: str = ""):
    """Send email notification for a completed job (non-blocking)."""
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
        body = (
            f"Scheduled Job Report\n\n"
            f"Job:      {job_label}\n"
            f"Status:   {status.upper()}\n"
            f"Time:     {now}\n"
            f"Duration: {duration:.1f}s\n"
            f"Result:   {summary}\n"
        )
        if error:
            body += f"Error:    {error}\n"

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


async def _get_job_config() -> dict:
    """Load job configuration from app_settings, falling back to defaults."""
    config = dict(DEFAULT_JOBS)
    try:
        from app.models.app_setting import AppSetting
        from sqlalchemy import select
        async with async_session() as db:
            result = await db.execute(select(AppSetting).where(AppSetting.key == "scheduled_jobs"))
            setting = result.scalar_one_or_none()
            if setting and setting.value:
                saved = json.loads(setting.value)
                for k, v in saved.items():
                    if k in config:
                        config[k].update(v)
    except Exception as e:
        logger.warning(f"Failed to load job config, using defaults: {e}")
    return config


async def daily_discovery_job():
    """Run daily paper discovery across all topics and sources."""
    logger.info("=== Daily Discovery Job Started ===")
    start = datetime.utcnow()
    summary = ""
    error_msg = ""
    status = "ok"

    discovery = DiscoveryService(download_pdfs=True, validate=True)
    analysis_service = AnalysisService()
    export_service = ExportService()
    report_gen = ReportGenerator()

    try:
        async with async_session() as db:
            results = await discovery.discover_all_topics(db, max_per_source=50)
            total_new = sum(r["new_papers"] for r in results)
            summary = f"{total_new} new papers found"
            logger.info(f"Discovery: {summary}")

            analyzed = await analysis_service.analyze_all_papers(db)
            logger.info(f"Analysis: {analyzed} papers analyzed")

            await export_service.export_json(db)
            await export_service.export_xlsx(db)
            logger.info("Exports: JSON + XLSX generated")

            report_path = await report_gen.generate_daily_report(db)
            logger.info(f"Report: {report_path}")

            await db.commit()

    except Exception as e:
        logger.error(f"Daily job error: {e}", exc_info=True)
        status = "error"
        error_msg = str(e)
        summary = summary or "Failed"
    finally:
        await discovery.close()

    elapsed = (datetime.utcnow() - start).total_seconds()
    logger.info(f"=== Daily Discovery Job Complete ({elapsed:.1f}s) ===")

    await _log_run("discovery", status, elapsed, summary, error_msg)

    # Check if notification is enabled
    config = await _get_job_config()
    if config.get("discovery", {}).get("notify", True):
        _send_job_email("Daily Discovery", status, summary, elapsed, error_msg)


async def citation_refresh_job():
    """Refresh citation counts for all papers via Semantic Scholar."""
    logger.info("=== Citation Refresh Job Started ===")
    start = datetime.utcnow()
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
        logger.error(f"Citation refresh error: {e}", exc_info=True)
        status = "error"
        error_msg = str(e)
        summary = "Failed"

    elapsed = (datetime.utcnow() - start).total_seconds()
    logger.info(f"=== Citation Refresh Job Complete ({elapsed:.1f}s) ===")

    await _log_run("citation_refresh", status, elapsed, summary, error_msg)

    config = await _get_job_config()
    if config.get("citation_refresh", {}).get("notify", True):
        _send_job_email("Citation Refresh", status, summary, elapsed, error_msg)


def _apply_schedule(config: dict):
    """Apply job schedule from config dict. Call after scheduler.start()."""
    job_funcs = {
        "discovery": daily_discovery_job,
        "citation_refresh": citation_refresh_job,
    }
    for job_id, job_conf in config.items():
        func = job_funcs.get(job_id)
        if not func:
            continue
        if job_conf.get("enabled", True):
            scheduler.add_job(
                func, "cron",
                hour=job_conf.get("hour", 6),
                minute=job_conf.get("minute", 0),
                id=job_id,
                replace_existing=True,
            )
            logger.info(f"Job '{job_id}' scheduled at {job_conf.get('hour', 6):02d}:{job_conf.get('minute', 0):02d} UTC")
        else:
            try:
                scheduler.remove_job(job_id)
                logger.info(f"Job '{job_id}' disabled")
            except Exception:
                pass


def setup_scheduler():
    """Configure and return the scheduler with default config."""
    import asyncio

    async def _setup():
        config = await _get_job_config()
        _apply_schedule(config)

    # Run async config loader
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(_setup())
        else:
            loop.run_until_complete(_setup())
    except RuntimeError:
        # Fallback: use defaults synchronously
        _apply_schedule(DEFAULT_JOBS)

    logger.info("Scheduler configured")
    return scheduler
