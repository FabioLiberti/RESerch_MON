"""Paper analysis report API endpoints."""

import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.analysis import AnalysisQueue
from app.models.paper import Paper
from app.models.user import User
from app.api.auth import get_current_user, require_admin
from app.services.analysis_worker import enqueue_papers, process_queue, get_worker_status
from app.services.llm_analysis import check_analysis_available, is_claude_configured

logger = logging.getLogger(__name__)

router = APIRouter()


class AnalysisRequest(BaseModel):
    paper_ids: list[int]
    mode: str = "quick"  # "quick" or "deep"


class QueueItemResponse(BaseModel):
    id: int
    paper_id: int
    paper_title: str | None = None
    status: str
    mode: str | None = None
    engine: str | None = None
    error_message: str | None = None
    html_path: str | None = None
    pdf_path: str | None = None
    created_at: str
    completed_at: str | None = None


def _parse_engine(error_message: str | None) -> str:
    """Extract engine name from error_message metadata field."""
    if not error_message:
        return "unknown"
    for part in error_message.split("|"):
        if part.startswith("engine:"):
            engine = part.replace("engine:", "")
            if "opus" in engine:
                return "Claude Opus 4.6"
            if "sonnet" in engine:
                return "Claude Sonnet 4.6"
            if "gemma" in engine:
                return "Gemma4:e4b"
            return engine
    return "unknown"


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

    # Check analysis engine
    if not check_analysis_available():
        raise HTTPException(
            status_code=503,
            detail="No analysis engine available. Configure ANTHROPIC_API_KEY in .env or start Ollama.",
        )

    if body.mode not in ("quick", "deep"):
        raise HTTPException(status_code=400, detail="Mode must be 'quick' or 'deep'")

    # For deep mode, auto-download PDFs if not already available
    pdf_status = []
    if body.mode == "deep":
        from app.services.pdf_manager import PDFManager
        pdf_mgr = PDFManager()

        for paper_id in body.paper_ids:
            paper = await db.get(Paper, paper_id)
            if not paper:
                continue

            if paper.pdf_local_path and Path(paper.pdf_local_path).exists():
                pdf_status.append({"id": paper_id, "status": "ready"})
                continue

            if paper.pdf_url:
                logger.info(f"Auto-downloading PDF for paper {paper_id}: {paper.pdf_url}")
                try:
                    year = paper.publication_date[:4] if paper.publication_date else None
                    source = "download"
                    # Detect source from paper sources
                    from app.models.paper import PaperSource
                    src_result = await db.execute(
                        select(PaperSource.source_name).where(PaperSource.paper_id == paper_id).limit(1)
                    )
                    src_row = src_result.scalar_one_or_none()
                    if src_row:
                        source = src_row

                    pdf_path = await pdf_mgr.download_pdf(
                        paper.pdf_url, paper.title, source, year=year
                    )
                    if pdf_path:
                        paper.pdf_local_path = str(pdf_path)
                        pdf_status.append({"id": paper_id, "status": "downloaded"})
                    else:
                        pdf_status.append({"id": paper_id, "status": "download_failed"})
                except Exception as e:
                    logger.warning(f"PDF download failed for paper {paper_id}: {e}")
                    pdf_status.append({"id": paper_id, "status": "download_failed"})
            else:
                pdf_status.append({"id": paper_id, "status": "no_pdf_url"})

        await pdf_mgr.close()
        await db.flush()

    # With Claude API: run inline (fast, ~5-10s per paper)
    if is_claude_configured():
        from app.services.llm_analysis import generate_paper_analysis, _generate_with_claude, QUICK_ANALYSIS_PROMPT, DEEP_ANALYSIS_PROMPT, extract_text_from_pdf
        from app.services.paper_report_generator import get_paper_data, render_paper_report, save_report, generate_pdf
        from app.models.analysis import AnalysisQueue
        from datetime import datetime

        logger.info(f"Starting CLAUDE analysis for {len(body.paper_ids)} papers, mode={body.mode}")

        processed = 0
        for paper_id in body.paper_ids:
            start_time = datetime.utcnow()
            logger.info(f"Processing paper {paper_id} for {body.mode} analysis")

            result_check = await db.execute(select(Paper).where(Paper.id == paper_id))
            paper = result_check.scalar_one_or_none()
            if not paper:
                logger.warning(f"Paper {paper_id} not found in DB")
                continue

            paper_data = await get_paper_data(db, paper_id)
            if not paper_data:
                logger.warning(f"Paper data not found for {paper_id}")
                continue

            logger.info(f"Paper {paper_id}: title='{paper.title[:40]}', abstract={len(paper.abstract or '')} chars")

            # Build prompt directly here to ensure Claude is used
            kw_str = ", ".join(paper.keywords) if paper.keywords else "N/A"

            if body.mode == "deep" and paper.pdf_local_path:
                full_text = extract_text_from_pdf(paper.pdf_local_path)
                if full_text:
                    prompt = DEEP_ANALYSIS_PROMPT.format(
                        title=paper.title, journal=paper.journal or "N/A",
                        date=paper.publication_date or "N/A", doi=paper.doi or "N/A",
                        paper_type=paper.paper_type or "N/A", keywords=kw_str,
                        full_text=full_text,
                    )
                    max_tokens = 8192
                    logger.info(f"Deep analysis for paper {paper_id}: {len(full_text)} chars from PDF")
                else:
                    prompt = QUICK_ANALYSIS_PROMPT.format(
                        title=paper.title, journal=paper.journal or "N/A",
                        date=paper.publication_date or "N/A", doi=paper.doi or "N/A",
                        paper_type=paper.paper_type or "N/A", keywords=kw_str,
                        abstract=paper.abstract or "",
                    )
                    max_tokens = 4096
                    logger.warning(f"PDF extraction failed for {paper_id}, using quick mode")
            else:
                prompt = QUICK_ANALYSIS_PROMPT.format(
                    title=paper.title, journal=paper.journal or "N/A",
                    date=paper.publication_date or "N/A", doi=paper.doi or "N/A",
                    paper_type=paper.paper_type or "N/A", keywords=kw_str,
                    abstract=paper.abstract or "",
                )
                max_tokens = 4096

            # Call Claude directly — NO Ollama fallback
            logger.info(f"Calling Claude Opus for paper {paper_id}, prompt length: {len(prompt)} chars")
            analysis_text = await _generate_with_claude(prompt, max_tokens, body.mode, paper.title)

            if analysis_text:
                end_time = datetime.utcnow()
                duration_s = int((end_time - start_time).total_seconds())
                chars = len(analysis_text)

                logger.info(f"Claude Opus: paper {paper_id}, {chars} chars, {duration_s}s")

                html = render_paper_report(paper_data, analysis_text, engine="Claude Opus 4.6")
                html_path = save_report(html, paper_id, mode=body.mode)
                pdf_path = generate_pdf(html_path)

                # Save as new entry (keep history)
                q = AnalysisQueue(
                    paper_id=paper_id,
                    analysis_mode=body.mode,
                    status="done",
                    html_path=str(html_path),
                    pdf_path=str(pdf_path) if pdf_path else None,
                    error_message=f"engine:claude-opus-4-6|chars:{chars}|duration:{duration_s}s",
                    started_at=start_time,
                    completed_at=end_time,
                )
                db.add(q)
                await db.flush()
                await db.commit()
                processed += 1
                logger.info(f"Analysis entry saved to DB for paper {paper_id}")

                response["details"].append({
                    "paper_id": paper_id,
                    "title": paper.title[:80],
                    "mode": body.mode,
                    "engine": "Claude Opus 4.6",
                    "chars": chars,
                    "duration_s": duration_s,
                    "report": str(html_path),
                })
            else:
                logger.error(f"Claude returned empty/None for paper {paper_id}")

        await db.flush()
        await db.commit()

        response = {
            "status": "completed",
            "added": processed,
            "skipped": len(body.paper_ids) - processed,
            "message": f"{processed} papers analyzed via Claude Opus",
            "engine": "claude",
            "details": [],
        }
        if body.mode == "deep":
            response["pdf_status"] = pdf_status
        return response

    # Ollama fallback: use queue + background task
    result = await enqueue_papers(db, body.paper_ids, mode=body.mode)
    background_tasks.add_task(process_queue)

    response = {
        "status": "started",
        "added": result["added"],
        "skipped": result["skipped"],
        "message": f"{result['added']} papers queued for {body.mode} analysis (Ollama)",
        "engine": "ollama",
    }
    if body.mode == "deep":
        response["pdf_status"] = pdf_status
    return response


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
    for i, row in enumerate(result.all()):
        q = row[0]
        title = row[1]
        items.append(QueueItemResponse(
            id=q.id,
            paper_id=q.paper_id,
            paper_title=title,
            status=q.status,
            mode=q.analysis_mode or "quick",
            engine=_parse_engine(q.error_message),
            html_path=q.html_path,
            pdf_path=q.pdf_path,
            created_at=q.created_at.isoformat() if q.created_at else "",
            completed_at=q.completed_at.isoformat() if q.completed_at else None,
        ))
    return items


@router.post("/{paper_id}/upload-pdf")
async def upload_pdf(
    paper_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF file for a paper (for deep analysis when auto-download is not available)."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    # Validate file
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    content = await file.read()
    if len(content) < 1000:
        raise HTTPException(status_code=400, detail="File too small, likely not a valid PDF")

    # Check PDF magic bytes
    if not content[:5].startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Invalid PDF file")

    # Save to data/pdfs/uploads/
    pdf_dir = Path(settings.pdf_storage_path) / "uploads"
    pdf_dir.mkdir(parents=True, exist_ok=True)

    # Sanitize filename
    import re
    safe_title = re.sub(r'[^\w\s-]', '', paper.title[:80]).strip().replace(' ', '_')
    pdf_path = pdf_dir / f"{safe_title}_{paper_id}.pdf"

    pdf_path.write_bytes(content)
    paper.pdf_local_path = str(pdf_path)
    await db.flush()

    logger.info(f"PDF uploaded for paper {paper_id}: {pdf_path} ({len(content) / 1024:.0f} KB)")

    return {
        "status": "uploaded",
        "path": str(pdf_path),
        "size_kb": len(content) // 1024,
    }


@router.get("/{paper_id}/history")
async def analysis_history(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all analysis runs for a paper (history)."""
    result = await db.execute(
        select(AnalysisQueue)
        .where(AnalysisQueue.paper_id == paper_id)
        .order_by(AnalysisQueue.completed_at.desc())
    )
    items = result.scalars().all()
    result_list = []
    for q in items:
        # Parse metadata from error_message field (format: "engine:X|chars:Y|duration:Zs")
        meta = {}
        if q.error_message:
            for part in q.error_message.split("|"):
                if ":" in part:
                    k, v = part.split(":", 1)
                    meta[k] = v

        engine = meta.get("engine", "gemma4-local")
        chars = int(meta["chars"]) if "chars" in meta else None
        cost = None
        if chars and "opus" in engine.lower():
            # Rough estimate: input ~2K tokens + output ~chars/4 tokens
            est_output = chars // 4
            cost = round((2000 * 15 + est_output * 75) / 1_000_000, 4)
        elif chars and "sonnet" in engine.lower():
            est_output = chars // 4
            cost = round((2000 * 3 + est_output * 15) / 1_000_000, 4)

        result_list.append({
            "id": q.id,
            "mode": q.analysis_mode or "quick",
            "status": q.status,
            "engine": engine,
            "chars": chars,
            "cost": cost,
            "started_at": q.started_at.isoformat() if q.started_at else None,
            "completed_at": q.completed_at.isoformat() if q.completed_at else None,
            "duration_s": int((q.completed_at - q.started_at).total_seconds()) if q.started_at and q.completed_at else None,
            "html_path": q.html_path,
            "pdf_path": q.pdf_path,
        })
    return result_list


@router.get("/{paper_id}/html")
async def get_analysis_html(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the most recent HTML analysis report for a paper."""
    result = await db.execute(
        select(AnalysisQueue).where(
            AnalysisQueue.paper_id == paper_id,
            AnalysisQueue.status == "done",
        ).order_by(AnalysisQueue.completed_at.desc()).limit(1)
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
    """Download the most recent PDF analysis report for a paper."""
    result = await db.execute(
        select(AnalysisQueue).where(
            AnalysisQueue.paper_id == paper_id,
            AnalysisQueue.status == "done",
        ).order_by(AnalysisQueue.completed_at.desc()).limit(1)
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
