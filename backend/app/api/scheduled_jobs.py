"""API endpoints for scheduled job management (admin only) — full CRUD."""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin
from app.database import get_db
from app.models.scheduled_job import ScheduledJob, JobRun
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateJobRequest(BaseModel):
    label: str
    description: str = ""
    job_type: str = "discovery"      # discovery | citation_refresh
    hour: int = 6
    minute: int = 0
    enabled: bool = True
    notify: bool = True
    topic_filter: str | None = None  # topic name, or None for all
    max_per_source: int = 50
    year_from: int | None = None
    year_to: int | None = None


class UpdateJobRequest(BaseModel):
    label: str | None = None
    description: str | None = None
    hour: int | None = None
    minute: int | None = None
    enabled: bool | None = None
    max_per_source: int | None = None
    year_from: int | None = None
    year_to: int | None = None
    notify: bool | None = None
    topic_filter: str | None = None


def _serialize_job(job: ScheduledJob, last_run: JobRun | None = None, next_run_iso: str | None = None) -> dict:
    return {
        "id": job.id,
        "job_key": job.job_key,
        "label": job.label,
        "description": job.description,
        "job_type": job.job_type,
        "hour": job.hour,
        "minute": job.minute,
        "enabled": job.enabled,
        "notify": job.notify,
        "topic_filter": job.topic_filter,
        "max_per_source": job.max_per_source or 50,
        "year_from": job.year_from,
        "year_to": job.year_to,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "next_run": next_run_iso,
        "last_run": {
            "started_at": last_run.started_at.isoformat() if last_run and last_run.started_at else None,
            "duration": last_run.duration_seconds if last_run else None,
            "status": last_run.status if last_run else None,
            "summary": last_run.result_summary if last_run else None,
        } if last_run else None,
    }


@router.get("")
async def list_jobs(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all scheduled jobs with last run info."""
    from app.tasks.scheduler import scheduler

    result = await db.execute(select(ScheduledJob).order_by(ScheduledJob.id))
    jobs = result.scalars().all()

    out = []
    for job in jobs:
        # Check if currently running
        running_result = await db.execute(
            select(JobRun).where(JobRun.job_name == job.job_key, JobRun.status == "running").limit(1)
        )
        is_running = running_result.scalar_one_or_none() is not None

        # Last completed run
        lr_result = await db.execute(
            select(JobRun).where(JobRun.job_name == job.job_key, JobRun.status != "running").order_by(JobRun.started_at.desc()).limit(1)
        )
        last_run = lr_result.scalar_one_or_none()

        # Next run from APScheduler
        next_run = None
        try:
            apjob = scheduler.get_job(job.job_key)
            if apjob and apjob.next_run_time:
                next_run = apjob.next_run_time.isoformat()
        except Exception:
            pass

        sj = _serialize_job(job, last_run, next_run)
        sj["is_running"] = is_running
        out.append(sj)

    return out


@router.post("")
async def create_job(
    body: CreateJobRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new scheduled job."""
    if body.job_type not in ("discovery", "citation_refresh"):
        raise HTTPException(400, "job_type must be 'discovery' or 'citation_refresh'")

    # Generate unique key
    import re
    base_key = re.sub(r'[^a-z0-9]+', '_', body.label.lower()).strip('_')
    job_key = base_key
    suffix = 1
    while True:
        existing = await db.execute(select(ScheduledJob).where(ScheduledJob.job_key == job_key))
        if existing.scalar_one_or_none() is None:
            break
        suffix += 1
        job_key = f"{base_key}_{suffix}"

    job = ScheduledJob(
        job_key=job_key,
        label=body.label,
        description=body.description,
        job_type=body.job_type,
        hour=body.hour,
        minute=body.minute,
        enabled=body.enabled,
        notify=body.notify,
        topic_filter=body.topic_filter if body.job_type == "discovery" else None,
        max_per_source=body.max_per_source,
        year_from=body.year_from,
        year_to=body.year_to,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Reload scheduler
    from app.tasks.scheduler import reload_scheduler
    await reload_scheduler()

    return _serialize_job(job)


@router.put("/{job_id}")
async def update_job(
    job_id: int,
    body: UpdateJobRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a scheduled job."""
    job = await db.get(ScheduledJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    if body.label is not None:
        job.label = body.label
    if body.description is not None:
        job.description = body.description
    if body.hour is not None:
        job.hour = body.hour
    if body.minute is not None:
        job.minute = body.minute
    if body.enabled is not None:
        job.enabled = body.enabled
    if body.notify is not None:
        job.notify = body.notify
    if body.topic_filter is not None:
        job.topic_filter = body.topic_filter or None
    if body.max_per_source is not None:
        job.max_per_source = body.max_per_source
    if body.year_from is not None:
        job.year_from = body.year_from or None
    if body.year_to is not None:
        job.year_to = body.year_to or None

    await db.commit()

    from app.tasks.scheduler import reload_scheduler
    await reload_scheduler()

    return {"status": "updated", "job_id": job.id}


@router.delete("/{job_id}")
async def delete_job(
    job_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a scheduled job permanently."""
    job = await db.get(ScheduledJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    await db.delete(job)
    await db.commit()

    from app.tasks.scheduler import reload_scheduler
    await reload_scheduler()

    return {"status": "deleted", "job_id": job_id}


@router.post("/{job_id}/run")
async def trigger_job(
    job_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a job to run immediately."""
    from app.tasks.scheduler import JOB_TYPE_FUNCS

    job = await db.get(ScheduledJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    func = JOB_TYPE_FUNCS.get(job.job_type)
    if not func:
        raise HTTPException(400, f"Unknown job_type: {job.job_type}")

    kwargs = {"job_key": job.job_key, "notify": job.notify}
    if job.job_type == "discovery":
        if job.topic_filter:
            kwargs["topic_filter"] = job.topic_filter
        kwargs["max_per_source"] = job.max_per_source or 50
        if job.year_from:
            kwargs["year_from"] = job.year_from
        if job.year_to:
            kwargs["year_to"] = job.year_to

    asyncio.ensure_future(func(**kwargs))
    return {"status": "triggered", "job_key": job.job_key}


@router.get("/runs")
async def get_job_runs(
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get job execution history."""
    result = await db.execute(
        select(JobRun).order_by(JobRun.started_at.desc()).limit(limit)
    )
    runs = result.scalars().all()
    return [
        {
            "id": r.id,
            "job_name": r.job_name,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "duration_seconds": r.duration_seconds,
            "status": r.status,
            "result_summary": r.result_summary,
            "error_message": r.error_message,
        }
        for r in runs
    ]


@router.get("/types")
async def get_job_types(admin: User = Depends(require_admin)):
    """List available job types for the creation form."""
    return [
        {"value": "discovery", "label": "Discovery", "description": "Search for new papers across academic sources"},
        {"value": "citation_refresh", "label": "Citation Refresh", "description": "Refresh citation counts via Semantic Scholar"},
    ]
