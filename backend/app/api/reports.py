"""Reports API endpoints."""

import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session
from app.models.analysis import DailyReport
from app.services.analysis import AnalysisService
from app.services.report_generator import ReportGenerator

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("")
async def list_reports(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List all generated reports."""
    result = await db.execute(
        select(DailyReport).order_by(DailyReport.report_date.desc()).limit(limit)
    )
    reports = result.scalars().all()

    return [
        {
            "id": r.id,
            "report_date": r.report_date,
            "total_papers": r.total_papers,
            "new_papers": r.new_papers,
            "html_path": r.html_path,
            "generated_at": str(r.generated_at),
        }
        for r in reports
    ]


@router.get("/{report_date}/html")
async def get_report_html(report_date: str, db: AsyncSession = Depends(get_db)):
    """Get a report as HTML."""
    result = await db.execute(
        select(DailyReport).where(DailyReport.report_date == report_date)
    )
    report = result.scalar_one_or_none()

    if report and report.html_path and Path(report.html_path).exists():
        html = Path(report.html_path).read_text(encoding="utf-8")
        return HTMLResponse(content=html)

    return HTMLResponse(content="<h1>Report not found</h1>", status_code=404)


async def _generate_report_bg(report_date: str | None):
    """Background task for report generation."""
    analysis_service = AnalysisService()
    report_gen = ReportGenerator()

    async with async_session() as db:
        # Run analysis first
        await analysis_service.analyze_all_papers(db)
        # Generate report
        await report_gen.generate_daily_report(db, report_date)
        await db.commit()


@router.post("/generate")
async def generate_report(
    background_tasks: BackgroundTasks,
    report_date: str | None = Query(None, description="Date YYYY-MM-DD (default: today)"),
):
    """Trigger report generation (runs in background)."""
    background_tasks.add_task(_generate_report_bg, report_date)
    return {"status": "generating", "report_date": report_date or "today"}
