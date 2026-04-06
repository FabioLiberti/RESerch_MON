"""Paper analysis report API endpoints."""

import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.analysis import AnalysisQueue
from app.models.paper import Paper
from app.models.user import User
from app.api.auth import get_current_user, require_admin
from app.services.analysis_worker import enqueue_papers, process_queue, get_worker_status
from app.services.llm_analysis import check_ollama_available

logger = logging.getLogger(__name__)

router = APIRouter()


class AnalysisRequest(BaseModel):
    paper_ids: list[int]


class QueueItemResponse(BaseModel):
    id: int
    paper_id: int
    paper_title: str | None = None
    status: str
    error_message: str | None = None
    html_path: str | None = None
    pdf_path: str | None = None
    created_at: str
    completed_at: str | None = None


@router.post("/trigger")
async def trigger_analysis(
    body: AnalysisRequest,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Queue papers for LLM analysis and start background processing."""
    if not body.paper_ids:
        raise HTTPException(status_code=400, detail="No paper IDs provided")

    # Check Ollama
    if not await check_ollama_available():
        raise HTTPException(
            status_code=503,
            detail="Ollama is not running or Gemma4 model not available. Start Ollama first.",
        )

    result = await enqueue_papers(db, body.paper_ids)
    background_tasks.add_task(process_queue)

    return {
        "status": "started",
        "added": result["added"],
        "skipped": result["skipped"],
        "message": f"{result['added']} papers queued for analysis",
    }


@router.get("/status")
async def analysis_status(user: User = Depends(get_current_user)):
    """Get current analysis worker status."""
    return get_worker_status()


@router.get("/queue")
async def analysis_queue(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all analysis queue items."""
    result = await db.execute(
        select(AnalysisQueue, Paper.title)
        .join(Paper, AnalysisQueue.paper_id == Paper.id)
        .order_by(AnalysisQueue.created_at.desc())
    )
    items = []
    for row in result.all():
        q = row[0]
        title = row[1]
        items.append(QueueItemResponse(
            id=q.id,
            paper_id=q.paper_id,
            paper_title=title,
            status=q.status,
            error_message=q.error_message,
            html_path=q.html_path,
            pdf_path=q.pdf_path,
            created_at=q.created_at.isoformat() if q.created_at else "",
            completed_at=q.completed_at.isoformat() if q.completed_at else None,
        ))
    return items


@router.get("/reports")
async def list_analysis_reports(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all completed analysis reports."""
    result = await db.execute(
        select(AnalysisQueue, Paper.title)
        .join(Paper, AnalysisQueue.paper_id == Paper.id)
        .where(AnalysisQueue.status == "done")
        .order_by(AnalysisQueue.completed_at.desc())
    )
    items = []
    for row in result.all():
        q = row[0]
        title = row[1]
        items.append(QueueItemResponse(
            id=q.id,
            paper_id=q.paper_id,
            paper_title=title,
            status=q.status,
            html_path=q.html_path,
            pdf_path=q.pdf_path,
            created_at=q.created_at.isoformat() if q.created_at else "",
            completed_at=q.completed_at.isoformat() if q.completed_at else None,
        ))
    return items


@router.get("/{paper_id}/html")
async def get_analysis_html(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the HTML analysis report for a paper."""
    result = await db.execute(
        select(AnalysisQueue).where(
            AnalysisQueue.paper_id == paper_id,
            AnalysisQueue.status == "done",
        )
    )
    item = result.scalar_one_or_none()
    if not item or not item.html_path:
        raise HTTPException(status_code=404, detail="Analysis report not found")

    path = Path(item.html_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report file not found on disk")

    return HTMLResponse(content=path.read_text(encoding="utf-8"))


@router.get("/{paper_id}/pdf")
async def get_analysis_pdf(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download the PDF analysis report for a paper."""
    result = await db.execute(
        select(AnalysisQueue).where(
            AnalysisQueue.paper_id == paper_id,
            AnalysisQueue.status == "done",
        )
    )
    item = result.scalar_one_or_none()
    if not item or not item.pdf_path:
        raise HTTPException(status_code=404, detail="PDF report not available")

    path = Path(item.pdf_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    return FileResponse(
        path=str(path),
        media_type="application/pdf",
        filename=f"analysis_paper_{paper_id}.pdf",
    )
