"""API endpoints for scheduled job management (admin only)."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin
from app.database import get_db
from app.models.app_setting import AppSetting
from app.models.job_run import JobRun
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


class JobConfigUpdate(BaseModel):
    hour: int | None = None
    minute: int | None = None
    enabled: bool | None = None
    notify: bool | None = None


@router.get("")
async def list_jobs(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all scheduled jobs with config and next/last run info."""
    from app.tasks.scheduler import DEFAULT_JOBS, scheduler

    # Load saved config
    result = await db.execute(select(AppSetting).where(AppSetting.key == "scheduled_jobs"))
    setting = result.scalar_one_or_none()
    saved_config = json.loads(setting.value) if setting and setting.value else {}

    jobs = []
    for job_id, defaults in DEFAULT_JOBS.items():
        conf = {**defaults, **saved_config.get(job_id, {})}

        # Get last run
        last_run_result = await db.execute(
            select(JobRun)
            .where(JobRun.job_name == job_id)
            .order_by(JobRun.started_at.desc())
            .limit(1)
        )
        last_run = last_run_result.scalar_one_or_none()

        # Get next run from APScheduler
        next_run = None
        try:
            apjob = scheduler.get_job(job_id)
            if apjob and apjob.next_run_time:
                next_run = apjob.next_run_time.isoformat()
        except Exception:
            pass

        jobs.append({
            "id": job_id,
            "label": conf.get("label", job_id),
            "description": conf.get("description", ""),
            "hour": conf.get("hour", 0),
            "minute": conf.get("minute", 0),
            "enabled": conf.get("enabled", True),
            "notify": conf.get("notify", True),
            "next_run": next_run,
            "last_run": {
                "started_at": last_run.started_at.isoformat() if last_run else None,
                "duration": last_run.duration_seconds if last_run else None,
                "status": last_run.status if last_run else None,
                "summary": last_run.result_summary if last_run else None,
            } if last_run else None,
        })

    return jobs


@router.put("/{job_id}")
async def update_job(
    job_id: str,
    body: JobConfigUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a job's schedule, enabled state, or notification preference."""
    from app.tasks.scheduler import DEFAULT_JOBS, _apply_schedule

    if job_id not in DEFAULT_JOBS:
        raise HTTPException(404, f"Unknown job: {job_id}")

    # Load existing config
    result = await db.execute(select(AppSetting).where(AppSetting.key == "scheduled_jobs"))
    setting = result.scalar_one_or_none()
    config = json.loads(setting.value) if setting and setting.value else {}

    # Merge updates
    if job_id not in config:
        config[job_id] = {}
    if body.hour is not None:
        config[job_id]["hour"] = body.hour
    if body.minute is not None:
        config[job_id]["minute"] = body.minute
    if body.enabled is not None:
        config[job_id]["enabled"] = body.enabled
    if body.notify is not None:
        config[job_id]["notify"] = body.notify

    # Save to DB
    if setting:
        setting.value = json.dumps(config)
    else:
        db.add(AppSetting(key="scheduled_jobs", value=json.dumps(config)))
    await db.commit()

    # Re-apply schedule
    full_config = {k: {**v, **config.get(k, {})} for k, v in DEFAULT_JOBS.items()}
    _apply_schedule(full_config)

    return {"status": "updated", "job_id": job_id}


@router.post("/{job_id}/run")
async def trigger_job(
    job_id: str,
    admin: User = Depends(require_admin),
):
    """Trigger a job to run immediately."""
    from app.tasks.scheduler import daily_discovery_job, citation_refresh_job
    import asyncio

    funcs = {
        "discovery": daily_discovery_job,
        "citation_refresh": citation_refresh_job,
    }
    func = funcs.get(job_id)
    if not func:
        raise HTTPException(404, f"Unknown job: {job_id}")

    # Run in background
    asyncio.ensure_future(func())
    return {"status": "triggered", "job_id": job_id}


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
