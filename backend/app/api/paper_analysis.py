"""Paper analysis report API endpoints."""

import logging
from datetime import datetime
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
    mode: str = "quick"  # "quick", "deep", "summary", or "extended"


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

    if body.mode not in ("quick", "deep", "summary", "extended"):
        raise HTTPException(status_code=400, detail="Mode must be 'quick', 'deep', 'summary', or 'extended'")

    # Auto-download PDFs if not already available (both modes benefit from full text)
    pdf_status = []
    if True:  # Always try to get PDFs
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
        from app.services.llm_analysis import generate_paper_analysis
        from app.services.paper_report_generator import get_paper_data, render_paper_report, save_report, generate_pdf, save_markdown, save_latex, _get_next_version
        from app.models.analysis import AnalysisQueue
        from datetime import datetime

        logger.info(f"Starting CLAUDE analysis for {len(body.paper_ids)} papers, mode={body.mode}")

        response = {"status": "completed", "added": 0, "skipped": 0, "message": "", "engine": "claude", "details": []}
        processed = 0
        for paper_id in body.paper_ids:
            start_time = datetime.utcnow()

            result_check = await db.execute(select(Paper).where(Paper.id == paper_id))
            paper = result_check.scalar_one_or_none()
            if not paper:
                continue

            paper_data = await get_paper_data(db, paper_id)
            if not paper_data:
                continue

            # Use unified generate_paper_analysis with prompt v2
            analysis_text = await generate_paper_analysis(
                title=paper.title,
                abstract=paper.abstract,
                journal=paper.journal,
                date=paper.publication_date,
                doi=paper.doi,
                paper_type=paper.paper_type,
                keywords=paper.keywords,
                mode=body.mode,
                pdf_path=paper.pdf_local_path,
                paper_id=paper_id,
            )

            if analysis_text:
                end_time = datetime.utcnow()
                duration_s = int((end_time - start_time).total_seconds())
                chars = len(analysis_text)

                logger.info(f"Claude Opus: paper {paper_id}, {chars} chars, {duration_s}s")

                # Determine version
                version = _get_next_version(paper_id, body.mode)

                # Save raw LLM text immediately (before rendering) to avoid losing
                # expensive Claude output if the render pipeline crashes.
                from pathlib import Path as _P
                _raw_dir = _P(settings.reports_path) / "analysis"
                _raw_dir.mkdir(parents=True, exist_ok=True)
                _raw_path = _raw_dir / f"raw_{body.mode}_{paper_id}_v{version or 1}.txt"
                _raw_path.write_text(analysis_text, encoding="utf-8")
                logger.info(f"Raw LLM text saved: {_raw_path}")

                html = render_paper_report(paper_data, analysis_text, engine="Claude Opus 4.6", mode=body.mode)
                html_path = save_report(html, paper_id, mode=body.mode, version=version)
                md_path = save_markdown(analysis_text, paper_id, body.mode, paper_data, version=version)
                tex_path = save_latex(analysis_text, paper_id, body.mode, paper_data, engine="Claude Opus 4.6", version=version)
                pdf_path = generate_pdf(html_path, tex_path=tex_path)

                # Save as new entry (keep history)
                q = AnalysisQueue(
                    paper_id=paper_id,
                    analysis_mode=body.mode,
                    status="done",
                    html_path=str(html_path),
                    pdf_path=str(pdf_path) if pdf_path else None,
                    md_path=str(md_path),
                    tex_path=str(tex_path),
                    version=version,
                    error_message=f"engine:claude-opus-4-6|chars:{chars}|duration:{duration_s}s",
                    started_at=start_time,
                    completed_at=end_time,
                )
                db.add(q)
                await db.flush()
                await db.commit()
                processed += 1
                logger.info(f"Analysis entry saved to DB for paper {paper_id}")

                # Extract structured data — only if this mode is >= existing best
                _MODE_RANK = {"summary": 1, "extended": 2, "quick": 3, "deep": 4}
                current_rank = _MODE_RANK.get(body.mode, 0)

                # Check if a higher-rank extraction already exists
                from app.models.structured_analysis import StructuredAnalysis
                _existing = await db.execute(
                    select(StructuredAnalysis.analysis_queue_id)
                    .join(AnalysisQueue, StructuredAnalysis.analysis_queue_id == AnalysisQueue.id)
                    .where(StructuredAnalysis.paper_id == paper_id)
                    .order_by(StructuredAnalysis.created_at.desc())
                    .limit(1)
                )
                _existing_sa = _existing.scalar_one_or_none()
                _existing_rank = 0
                if _existing_sa:
                    _eq = await db.get(AnalysisQueue, _existing_sa)
                    if _eq:
                        _existing_rank = _MODE_RANK.get(_eq.analysis_mode or "", 0)

                if current_rank >= _existing_rank:
                    try:
                        from app.services.structured_extractor import extract_structured_data

                        structured = await extract_structured_data(analysis_text)
                        if structured:
                            sa = StructuredAnalysis(
                                paper_id=paper_id,
                                analysis_queue_id=q.id,
                                problem_addressed=structured.get("problem_addressed"),
                                proposed_method=structured.get("proposed_method"),
                                best_metric_name=structured.get("best_metric_name"),
                                best_metric_value=structured.get("best_metric_value"),
                                best_baseline_name=structured.get("best_baseline_name"),
                                best_baseline_value=structured.get("best_baseline_value"),
                                improvement_delta=structured.get("improvement_delta"),
                                privacy_mechanism=structured.get("privacy_mechanism"),
                                privacy_formal=structured.get("privacy_formal"),
                                reproducibility_score=structured.get("reproducibility_score"),
                                novelty_level=structured.get("novelty_level"),
                                relevance=structured.get("relevance"),
                                healthcare_applicable=structured.get("healthcare_applicable"),
                                healthcare_evidence=structured.get("healthcare_evidence"),
                                key_findings_summary=structured.get("key_findings_summary"),
                            )
                            sa.method_tags = structured.get("method_tags", [])
                            sa.fl_techniques = structured.get("fl_techniques", [])
                            sa.datasets = structured.get("datasets", [])
                            sa.baselines = structured.get("baselines", [])
                            sa.limitations_declared = structured.get("limitations_declared", [])
                            sa.limitations_identified = structured.get("limitations_identified", [])
                            sa.extra = structured.get("extra", {})
                            db.add(sa)
                            await db.flush()
                            await db.commit()
                            logger.info(f"Structured data extracted from {body.mode} analysis for paper {paper_id}")
                    except Exception as e:
                        logger.warning(f"Structured extraction failed for paper {paper_id}: {e}")
                else:
                    logger.debug(f"Skipping structured extraction: {body.mode}(rank={current_rank}) < existing(rank={_existing_rank})")

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

        response["added"] = processed
        response["skipped"] = len(body.paper_ids) - processed
        response["message"] = f"{processed} papers analyzed via Claude Opus"
        if pdf_status:
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


@router.get("/costs")
async def analysis_costs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get estimated API costs from all completed analyses."""
    result = await db.execute(
        select(AnalysisQueue)
        .where(AnalysisQueue.status == "done")
        .order_by(AnalysisQueue.completed_at.desc())
    )
    items = result.scalars().all()

    total_cost = 0.0
    by_mode: dict[str, dict] = {}
    recent: list[dict] = []

    for q in items:
        meta = {}
        if q.error_message:
            for part in q.error_message.split("|"):
                if ":" in part:
                    k, v = part.split(":", 1)
                    meta[k] = v

        engine = meta.get("engine", "")
        chars = int(meta["chars"]) if "chars" in meta else 0
        cost = 0.0
        if chars and "opus" in engine.lower():
            est_output = chars // 4
            cost = (2000 * 15 + est_output * 75) / 1_000_000
        elif chars and "sonnet" in engine.lower():
            est_output = chars // 4
            cost = (2000 * 3 + est_output * 15) / 1_000_000
        elif chars and "haiku" in engine.lower():
            est_output = chars // 4
            cost = (2000 * 0.25 + est_output * 1.25) / 1_000_000

        total_cost += cost
        mode = q.analysis_mode or "quick"
        if mode not in by_mode:
            by_mode[mode] = {"count": 0, "cost": 0.0, "chars": 0}
        by_mode[mode]["count"] += 1
        by_mode[mode]["cost"] += cost
        by_mode[mode]["chars"] += chars

        if len(recent) < 20:
            recent.append({
                "paper_id": q.paper_id,
                "mode": mode,
                "chars": chars,
                "cost": round(cost, 4),
                "completed_at": q.completed_at.isoformat() if q.completed_at else None,
            })

    return {
        "total_analyses": len(items),
        "total_estimated_cost": round(total_cost, 4),
        "by_mode": {k: {**v, "cost": round(v["cost"], 4)} for k, v in by_mode.items()},
        "recent": recent,
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
    """Upload a document file for a paper (PDF, .md, .tex, .txt)."""
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    # Validate file extension
    from pathlib import PurePosixPath
    fname = file.filename or "document.pdf"
    ext = PurePosixPath(fname).suffix.lower()
    allowed_ext = {".pdf", ".md", ".tex", ".txt"}
    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed. Allowed: {', '.join(sorted(allowed_ext))}")

    content = await file.read()

    # PDF-specific validation
    if ext == ".pdf":
        if len(content) < 1000:
            raise HTTPException(status_code=400, detail="File too small, likely not a valid PDF")
        if not content[:5].startswith(b"%PDF"):
            raise HTTPException(status_code=400, detail="Invalid PDF file")

    # Save to data/pdfs/uploads/
    pdf_dir = Path(settings.pdf_storage_path) / "uploads"
    pdf_dir.mkdir(parents=True, exist_ok=True)

    # Sanitize filename
    import re
    safe_title = re.sub(r'[^\w\s-]', '', paper.title[:80]).strip().replace(' ', '_')
    pdf_path = pdf_dir / f"{safe_title}_{paper_id}{ext}"

    pdf_path.write_bytes(content)
    paper.pdf_local_path = str(pdf_path)
    await db.flush()

    logger.info(f"PDF uploaded for paper {paper_id}: {pdf_path} ({len(content) / 1024:.0f} KB)")

    return {
        "status": "uploaded",
        "path": str(pdf_path),
        "size_kb": len(content) // 1024,
    }


@router.get("/{paper_id}/summary-card")
async def get_summary_card(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a structured summary card from existing structured analysis data (zero cost)."""
    from app.models.structured_analysis import StructuredAnalysis
    from app.models.paper import Paper, PaperAuthor, Author

    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    # Get structured analysis from Deep analysis (richest data source)
    result = await db.execute(
        select(StructuredAnalysis)
        .join(AnalysisQueue, StructuredAnalysis.analysis_queue_id == AnalysisQueue.id)
        .where(StructuredAnalysis.paper_id == paper_id, AnalysisQueue.analysis_mode == "deep")
        .order_by(StructuredAnalysis.created_at.desc())
        .limit(1)
    )
    sa = result.scalar_one_or_none()
    # Fallback: any structured analysis if no Deep exists yet
    if not sa:
        result = await db.execute(
            select(StructuredAnalysis)
            .where(StructuredAnalysis.paper_id == paper_id)
            .order_by(StructuredAnalysis.created_at.desc())
            .limit(1)
        )
        sa = result.scalar_one_or_none()
    if not sa:
        raise HTTPException(status_code=404, detail="No structured analysis available. Run Deep analysis first.")

    # Get authors
    authors_result = await db.execute(
        select(Author.name)
        .join(PaperAuthor, PaperAuthor.author_id == Author.id)
        .where(PaperAuthor.paper_id == paper_id)
        .order_by(PaperAuthor.position)
    )
    authors = [r[0] for r in authors_result.all()]

    return {
        "paper_id": paper_id,
        "title": paper.title,
        "doi": paper.doi,
        "journal": paper.journal,
        "publication_date": paper.publication_date,
        "authors": authors,
        "keywords": paper.keywords,
        "problem_addressed": sa.problem_addressed,
        "proposed_method": sa.proposed_method,
        "fl_techniques": sa.fl_techniques,
        "datasets": sa.datasets,
        "baselines": sa.baselines,
        "best_metric_name": sa.best_metric_name,
        "best_metric_value": sa.best_metric_value,
        "best_baseline_name": sa.best_baseline_name,
        "best_baseline_value": sa.best_baseline_value,
        "improvement_delta": sa.improvement_delta,
        "privacy_mechanism": sa.privacy_mechanism,
        "privacy_formal": sa.privacy_formal,
        "reproducibility_score": sa.reproducibility_score,
        "novelty_level": sa.novelty_level,
        "relevance": sa.relevance,
        "healthcare_applicable": sa.healthcare_applicable,
        "healthcare_evidence": sa.healthcare_evidence,
        "key_findings_summary": sa.key_findings_summary,
        "limitations_declared": sa.limitations_declared,
        "limitations_identified": sa.limitations_identified,
    }


@router.get("/{paper_id}/summary-card-pdf")
async def get_summary_card_pdf(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate and return a 1-page PDF summary card from structured analysis data."""
    from app.models.structured_analysis import StructuredAnalysis
    from app.models.paper import Paper, PaperAuthor, Author

    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    # Get structured analysis from Deep (preferred) or any available
    result = await db.execute(
        select(StructuredAnalysis)
        .join(AnalysisQueue, StructuredAnalysis.analysis_queue_id == AnalysisQueue.id)
        .where(StructuredAnalysis.paper_id == paper_id, AnalysisQueue.analysis_mode == "deep")
        .order_by(StructuredAnalysis.created_at.desc())
        .limit(1)
    )
    sa = result.scalar_one_or_none()
    if not sa:
        result = await db.execute(
            select(StructuredAnalysis)
            .where(StructuredAnalysis.paper_id == paper_id)
            .order_by(StructuredAnalysis.created_at.desc())
            .limit(1)
        )
        sa = result.scalar_one_or_none()
    if not sa:
        raise HTTPException(status_code=404, detail="No structured analysis available")

    authors_result = await db.execute(
        select(Author.name)
        .join(PaperAuthor, PaperAuthor.author_id == Author.id)
        .where(PaperAuthor.paper_id == paper_id)
        .order_by(PaperAuthor.position)
    )
    authors = ", ".join([r[0] for r in authors_result.all()])

    # Build HTML for 1-page summary card
    lims = (sa.limitations_declared or []) + (sa.limitations_identified or [])
    rep_stars = "★" * (sa.reproducibility_score or 0) + "☆" * (5 - (sa.reproducibility_score or 0)) if sa.reproducibility_score else "—"

    def badge(text, color):
        return f'<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:{color};color:#fff">{text}</span>'

    def tag(text, color):
        return f'<span style="display:inline-block;font-size:9px;padding:1px 6px;border-radius:3px;background:{color};color:#fff;margin:1px">{text}</span>'

    novelty_color = {"paradigmatic": "#7e22ce", "moderate": "#1d4ed8", "incremental": "#4b5563"}.get(sa.novelty_level or "", "#4b5563")
    relevance_color = {"Molto Alta": "#15803d", "Alta": "#1d4ed8", "Media": "#d97706", "Bassa": "#4b5563"}.get(sa.relevance or "", "#4b5563")

    fl_tags = " ".join(tag(t, "#4338ca") for t in (sa.fl_techniques or []))
    ds_tags = " ".join(tag(d, "#0f766e") for d in (sa.datasets or []))

    metric_html = ""
    if sa.best_metric_name:
        metric_html = f'<strong>{sa.best_metric_name}:</strong> {sa.best_metric_value or "—"}'
        if sa.improvement_delta is not None:
            metric_html += f' <span style="color:#16a34a">(+{sa.improvement_delta})</span>'
        if sa.best_baseline_name:
            metric_html += f' <span style="color:#6b7280">vs {sa.best_baseline_name}</span>'

    lims_html = "".join(f"<li>{l}</li>" for l in lims) if lims else "<li>—</li>"

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Summary Card — {paper.title[:80]}</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: 'Inter', system-ui, sans-serif; max-width: 780px; margin: 0 auto; padding: 20px; color: #1a1a2e; font-size: 11px; line-height: 1.5; }}
  .header {{ border-bottom: 2px solid #4338ca; padding-bottom: 10px; margin-bottom: 12px; }}
  .title {{ font-size: 15px; font-weight: 700; color: #111; margin-bottom: 4px; }}
  .meta {{ font-size: 9px; color: #6b7280; }}
  .meta a {{ color: #4338ca; }}
  .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }}
  .box {{ background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; }}
  .box-label {{ font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 3px; }}
  .box-text {{ font-size: 10px; color: #1f2937; }}
  .assess {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 10px; }}
  .assess-item {{ text-align: center; background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 4px; }}
  .assess-label {{ font-size: 8px; color: #6b7280; text-transform: uppercase; }}
  .assess-value {{ font-size: 10px; font-weight: 600; margin-top: 2px; }}
  .findings {{ background: #f0f0ff; border: 1px solid #e0e0f0; border-radius: 6px; padding: 8px; margin-bottom: 10px; }}
  .lims {{ font-size: 10px; color: #4b5563; }}
  .lims li {{ margin-bottom: 2px; }}
  .footer {{ font-size: 8px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 6px; margin-top: 10px; }}
</style></head><body>

<div class="header">
  <div class="title">{paper.title} {badge("SUMMARY CARD", "#d97706")}</div>
  <div class="meta">
    Paper ID: {paper_id}
    {f' | DOI: <a href="https://doi.org/{paper.doi}">{paper.doi}</a>' if paper.doi else ''}
    {f' | {paper.journal}' if paper.journal else ''}
    | {paper.publication_date or 'N/A'}
    {f' | {authors}' if authors else ''}
  </div>
</div>

<div class="grid">
  {f'<div class="box"><div class="box-label">Problem</div><div class="box-text">{sa.problem_addressed}</div></div>' if sa.problem_addressed else ''}
  {f'<div class="box"><div class="box-label">Method</div><div class="box-text"><strong>{sa.proposed_method}</strong></div></div>' if sa.proposed_method else ''}
</div>

{f'<div style="margin-bottom:8px"><span style="font-size:9px;font-weight:600;color:#6b7280">FL TECHNIQUES</span> {fl_tags}</div>' if fl_tags else ''}
{f'<div style="margin-bottom:8px"><span style="font-size:9px;font-weight:600;color:#6b7280">DATASETS</span> {ds_tags}</div>' if ds_tags else ''}

{f'<div class="box" style="margin-bottom:10px"><div class="box-label">Performance</div><div class="box-text">{metric_html}</div></div>' if metric_html else ''}

<div class="assess">
  <div class="assess-item"><div class="assess-label">Novelty</div><div class="assess-value">{badge((sa.novelty_level or "—").upper(), novelty_color)}</div></div>
  <div class="assess-item"><div class="assess-label">Relevance</div><div class="assess-value">{badge(sa.relevance or "—", relevance_color)}</div></div>
  <div class="assess-item"><div class="assess-label">Healthcare</div><div class="assess-value">{badge("YES" if sa.healthcare_applicable else "NO", "#15803d" if sa.healthcare_applicable else "#4b5563")}</div></div>
  <div class="assess-item"><div class="assess-label">Privacy</div><div class="assess-value" style="font-size:9px">{sa.privacy_mechanism or "none"}</div></div>
  <div class="assess-item"><div class="assess-label">Reproducibility</div><div class="assess-value" style="color:#d97706">{rep_stars}</div></div>
</div>

{f'<div class="findings"><div class="box-label">Key Findings</div><div class="box-text">{sa.key_findings_summary}</div></div>' if sa.key_findings_summary else ''}

<div><div class="box-label" style="margin-bottom:4px">Limitations</div><ul class="lims">{lims_html}</ul></div>

<div class="footer">Generated by FL Research Monitor | Summary Card from structured analysis data</div>

</body></html>"""

    # Generate PDF
    from app.services.paper_report_generator import generate_pdf, save_report
    html_path = save_report(html, paper_id, mode="summary_card")

    pdf_path = generate_pdf(html_path)
    if not pdf_path or not pdf_path.exists():
        return HTMLResponse(content=html)

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=f"summary_card_{paper_id}.pdf",
    )


class RubricItem(BaseModel):
    section: str
    score: int | None = None  # 1-5 per-section reviewer score
    missing: bool = False
    note: str = ""


class ValidationRequest(BaseModel):
    status: str  # validated, rejected, needs_revision
    score: int | None = None  # 1-5 — final REVIEWER score (overrides computed)
    notes: str | None = None
    general_score: int | None = None  # 1-5 score given to General notes section
    rubric: list[RubricItem] | None = None


@router.post("/queue/{queue_id}/validate")
async def validate_analysis(
    queue_id: int,
    body: ValidationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set validation status, score, notes, and rubric for an analysis entry."""
    import json as _json
    from app.services.validation_report import compute_rubric_score

    if body.status not in ("validated", "rejected", "needs_revision", "pending"):
        raise HTTPException(status_code=400, detail="Invalid status")
    if body.score is not None and (body.score < 1 or body.score > 5):
        raise HTTPException(status_code=400, detail="Score must be 1-5")

    item = await db.get(AnalysisQueue, queue_id)
    if not item:
        raise HTTPException(status_code=404, detail="Analysis not found")

    item.validation_status = body.status
    item.validation_notes = body.notes
    item.validated_at = datetime.utcnow()
    item.validated_by = user.username

    if body.rubric is not None:
        rubric_list = [r.model_dump() for r in body.rubric]
        # Persist the rubric AND the general_score together, so the modal can rebuild state
        payload = {"items": rubric_list, "general_score": body.general_score}
        item.validation_rubric_json = _json.dumps(payload, ensure_ascii=False)
        # Reviewer score wins; otherwise auto-compute
        if body.score is not None:
            item.validation_score = body.score
        else:
            item.validation_score = compute_rubric_score(rubric_list, body.general_score)
    else:
        item.validation_score = body.score
        item.validation_rubric_json = None

    await db.flush()
    await db.commit()
    return {
        "status": item.validation_status,
        "score": item.validation_score,
        "validated_at": item.validated_at.isoformat() if item.validated_at else None,
        "validated_by": item.validated_by,
        "rubric": _json.loads(item.validation_rubric_json) if item.validation_rubric_json else None,
    }


def _split_md_sections(md_text: str) -> dict[str, str]:
    """Split a markdown analysis into sections by H2 headings (## Section)."""
    if not md_text:
        return {}
    sections: dict[str, str] = {}
    current = "_preamble"
    buffer: list[str] = []
    for line in md_text.splitlines():
        if line.startswith("## "):
            if buffer:
                sections[current] = "\n".join(buffer).strip()
            current = line[3:].strip()
            buffer = []
        else:
            buffer.append(line)
    if buffer:
        sections[current] = "\n".join(buffer).strip()
    return sections


@router.get("/{paper_id}/diff")
async def analysis_diff(
    paper_id: int,
    queue_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compare an analysis (queue_id) with the previous version of the same mode.

    Returns a section-by-section diff with status: unchanged | modified | added | removed.
    """
    current = await db.get(AnalysisQueue, queue_id)
    if not current or current.paper_id != paper_id:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Find the previous version of the same mode
    conditions = [
        AnalysisQueue.paper_id == paper_id,
        AnalysisQueue.analysis_mode == current.analysis_mode,
        AnalysisQueue.status == "done",
        AnalysisQueue.id != queue_id,
    ]
    if current.completed_at:
        conditions.append(AnalysisQueue.completed_at < current.completed_at)
    result = await db.execute(
        select(AnalysisQueue)
        .where(*conditions)
        .order_by(AnalysisQueue.completed_at.desc())
        .limit(1)
    )
    previous = result.scalar_one_or_none()
    if not previous:
        raise HTTPException(status_code=404, detail="No previous version available for this mode")

    if not current.md_path or not previous.md_path:
        raise HTTPException(status_code=404, detail="Markdown files missing for one of the versions")

    cur_path = Path(current.md_path)
    prev_path = Path(previous.md_path)
    if not cur_path.exists() or not prev_path.exists():
        raise HTTPException(status_code=404, detail="Markdown files not found on disk")

    cur_text = cur_path.read_text(encoding="utf-8")
    prev_text = prev_path.read_text(encoding="utf-8")

    cur_sections = _split_md_sections(cur_text)
    prev_sections = _split_md_sections(prev_text)

    all_sections: list[str] = []
    seen = set()
    # Preserve order: previous first then any new in current
    for s in list(prev_sections.keys()) + list(cur_sections.keys()):
        if s in seen or s == "_preamble":
            continue
        seen.add(s)
        all_sections.append(s)

    diffs = []
    for sec in all_sections:
        in_prev = sec in prev_sections
        in_cur = sec in cur_sections
        if in_prev and in_cur:
            # Normalize whitespace for comparison
            norm_p = " ".join(prev_sections[sec].split())
            norm_c = " ".join(cur_sections[sec].split())
            status = "unchanged" if norm_p == norm_c else "modified"
        elif in_cur:
            status = "added"
        else:
            status = "removed"
        diffs.append({
            "section": sec,
            "status": status,
            "prev_text": prev_sections.get(sec, ""),
            "curr_text": cur_sections.get(sec, ""),
        })

    return {
        "current": {"id": current.id, "version": current.version or 1, "mode": current.analysis_mode},
        "previous": {"id": previous.id, "version": previous.version or 1, "mode": previous.analysis_mode},
        "sections": diffs,
        "summary": {
            "modified": sum(1 for d in diffs if d["status"] == "modified"),
            "unchanged": sum(1 for d in diffs if d["status"] == "unchanged"),
            "added": sum(1 for d in diffs if d["status"] == "added"),
            "removed": sum(1 for d in diffs if d["status"] == "removed"),
        },
    }


class DiffLLMRequest(BaseModel):
    section: str
    prev_text: str
    curr_text: str


@router.post("/diff/llm-summary")
async def diff_llm_summary(
    body: DiffLLMRequest,
    user: User = Depends(get_current_user),
):
    """Use Haiku to summarize semantic differences between two versions of a section."""
    from app.config import settings
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="Anthropic API not configured")

    prompt = f"""Sei un editor scientifico. Confronta queste DUE versioni della sezione "{body.section}" di un Extended Abstract e produci una sintesi delle differenze SEMANTICHE in 2-4 bullet point brevi (in italiano).

VERSIONE PRECEDENTE:
{body.prev_text}

VERSIONE NUOVA:
{body.curr_text}

REGOLE:
- Solo differenze di sostanza (concetti, dati, conclusioni). Ignora differenze puramente stilistiche o di formattazione.
- Massimo 4 bullet, ognuno di 1-2 righe.
- Se non ci sono differenze rilevanti, rispondi: "Nessuna differenza sostanziale (solo riformulazioni)."
- Formato: bullet con `- ` davanti.
"""

    try:
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text if msg.content else ""
        return {
            "section": body.section,
            "summary": text,
            "input_tokens": msg.usage.input_tokens,
            "output_tokens": msg.usage.output_tokens,
        }
    except Exception as e:
        logger.error(f"Diff LLM summary failed: {e}")
        raise HTTPException(status_code=500, detail=f"LLM call failed: {e}")


@router.get("/validation-stats")
async def validation_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate validation stats for the dashboard card.

    Only counts EXT.ABS analyses — Quick/Deep/Summary are working notes that are
    never reviewed, so including them would inflate the 'pending' count and
    misrepresent progress.
    """
    from sqlalchemy import func
    from datetime import timedelta

    EXT = AnalysisQueue.analysis_mode == "extended"

    total_done = (await db.execute(
        select(func.count(AnalysisQueue.id)).where(AnalysisQueue.status == "done", EXT)
    )).scalar() or 0

    by_status = {}
    for s in ("validated", "rejected", "needs_revision"):
        cnt = (await db.execute(
            select(func.count(AnalysisQueue.id)).where(
                AnalysisQueue.status == "done",
                EXT,
                AnalysisQueue.validation_status == s,
            )
        )).scalar() or 0
        by_status[s] = cnt

    pending = (await db.execute(
        select(func.count(AnalysisQueue.id)).where(
            AnalysisQueue.status == "done",
            EXT,
            AnalysisQueue.validation_status.is_(None),
        )
    )).scalar() or 0

    week_ago = datetime.utcnow() - timedelta(days=7)
    this_week = (await db.execute(
        select(func.count(AnalysisQueue.id)).where(
            EXT,
            AnalysisQueue.validated_at >= week_ago,
        )
    )).scalar() or 0

    avg_score_row = (await db.execute(
        select(func.avg(AnalysisQueue.validation_score)).where(
            EXT,
            AnalysisQueue.validation_score.isnot(None),
        )
    )).scalar()
    avg_score = round(float(avg_score_row), 2) if avg_score_row else None

    return {
        "total_done": total_done,
        "validated": by_status["validated"],
        "rejected": by_status["rejected"],
        "needs_revision": by_status["needs_revision"],
        "pending": pending,
        "this_week": this_week,
        "avg_score": avg_score,
    }


class SectionEdit(BaseModel):
    section: str
    text: str


class ForkRequest(BaseModel):
    """Create a new analysis version by applying section edits from the reviewer."""
    edits: list[SectionEdit]


@router.post("/queue/{queue_id}/fork")
async def fork_analysis(
    queue_id: int,
    body: ForkRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new analysis version applying reviewer's section edits.

    Flow:
        1. Load current analysis markdown from md_path
        2. Split into sections by H2 headers
        3. Replace edited sections with the reviewer's text
        4. Reassemble markdown preserving order
        5. Generate HTML / TEX / PDF via paper_report_generator
        6. Insert new AnalysisQueue row with version+1, engine="reviewer_edit"
        7. Return new queue_id so the caller can validate against it
    """
    from sqlalchemy.orm import selectinload
    from app.models.paper import PaperAuthor
    from app.services.paper_report_generator import (
        render_paper_report,
        save_report,
        save_markdown,
        save_latex,
        generate_pdf,
    )

    # 1. Load original analysis row
    original = await db.get(AnalysisQueue, queue_id)
    if not original:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if not original.md_path:
        raise HTTPException(status_code=400, detail="Original analysis has no markdown file to edit")
    md_file = Path(original.md_path)
    if not md_file.exists():
        raise HTTPException(status_code=404, detail="Original markdown file not found on disk")

    # 2. Load and split markdown
    raw = md_file.read_text(encoding="utf-8")
    # Strip YAML front-matter if present
    body_md = raw
    if raw.startswith("---"):
        end = raw.find("---", 3)
        if end > 0:
            body_md = raw[end + 3:].lstrip("\n")

    sections = _split_md_sections(body_md)

    # 3. Apply edits
    edit_map = {e.section: e.text for e in body.edits}
    edited_any = False
    for sec_name, new_text in edit_map.items():
        if sec_name in sections and sections[sec_name] != new_text:
            sections[sec_name] = new_text
            edited_any = True

    if not edited_any:
        raise HTTPException(status_code=400, detail="No effective edits provided")

    # 4. Reassemble markdown (preamble first, then sections in original order)
    lines: list[str] = []
    # Re-build from the original to preserve ordering. Scan the original again
    # and output each section with new content if edited.
    buf: list[str] = []
    current_section = "_preamble"
    for line in body_md.splitlines():
        if line.startswith("## "):
            # Flush previous
            if current_section == "_preamble":
                lines.extend(buf)
            else:
                lines.append(sections.get(current_section, "\n".join(buf).strip()))
                lines.append("")
            current_section = line[3:].strip()
            lines.append(line)
            lines.append("")
            buf = []
        else:
            buf.append(line)
    # Flush last section
    if current_section == "_preamble":
        lines.extend(buf)
    else:
        lines.append(sections.get(current_section, "\n".join(buf).strip()))

    new_markdown = "\n".join(lines).rstrip() + "\n"

    # 5. Load paper + build paper_data expected by the generators
    p_res = await db.execute(
        select(Paper)
        .where(Paper.id == original.paper_id)
        .options(selectinload(Paper.authors).selectinload(PaperAuthor.author))
    )
    paper = p_res.unique().scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    authors_str = ", ".join(
        pa.author.name for pa in sorted(paper.authors, key=lambda x: x.position) if pa.author
    )
    paper_data = {
        "paper": paper,
        "authors": authors_str,
        "topics": [],
        "sources": [],
    }

    mode = original.analysis_mode or "extended"
    # 6. Determine new version number (max existing + 1 across queue AND disk)
    max_v_row = await db.execute(
        select(AnalysisQueue.version).where(
            AnalysisQueue.paper_id == paper.id,
            AnalysisQueue.analysis_mode == mode,
        )
    )
    existing_versions = [v for (v,) in max_v_row.all() if v]
    from app.services.paper_report_generator import _get_next_version
    disk_next = _get_next_version(paper.id, mode)
    new_version = max(max(existing_versions, default=0) + 1, disk_next)

    # 7. Render and save the new artifacts
    try:
        html = render_paper_report(paper_data, new_markdown, engine="reviewer-edit", mode=mode)
        html_path = save_report(html, paper.id, mode=mode, version=new_version)
        md_path = save_markdown(new_markdown, paper.id, mode, paper_data, version=new_version)
        tex_path = save_latex(new_markdown, paper.id, mode, paper_data, engine="reviewer-edit", version=new_version)
        pdf_path = generate_pdf(html_path, tex_path)
    except Exception as e:
        logger.error(f"Fork analysis render failed: {e}")
        raise HTTPException(status_code=500, detail=f"Could not generate new version files: {e}")

    # 8. Persist new AnalysisQueue entry
    now = datetime.utcnow()
    new_row = AnalysisQueue(
        paper_id=paper.id,
        analysis_mode=mode,
        status="done",
        error_message=f"engine:reviewer-edit|chars:{len(new_markdown)}|parent:{queue_id}",
        html_path=str(html_path),
        pdf_path=str(pdf_path) if pdf_path else None,
        md_path=str(md_path),
        tex_path=str(tex_path),
        version=new_version,
        zotero_synced=False,
        created_at=now,
        started_at=now,
        completed_at=now,
    )
    db.add(new_row)
    await db.flush()
    await db.commit()
    await db.refresh(new_row)

    logger.info(
        f"Fork: paper {paper.id} mode={mode} v{original.version} -> v{new_version} "
        f"(edited sections: {list(edit_map.keys())}) new queue_id={new_row.id}"
    )
    return {
        "queue_id": new_row.id,
        "version": new_version,
        "paper_id": paper.id,
        "mode": mode,
        "edited_sections": list(edit_map.keys()),
        "pdf_path": str(pdf_path) if pdf_path else None,
        "md_path": str(md_path),
    }


@router.get("/review-queue")
async def review_queue(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List analyses pending review (or marked needs_revision), ordered by paper rating desc."""
    from sqlalchemy import or_, desc
    from app.models.label import Label, PaperLabel

    # Review is currently only meaningful for EXT.ABS (the shareable artifact).
    # Quick and Deep are working notes, Summary is auxiliary — none are reviewed.
    result = await db.execute(
        select(AnalysisQueue, Paper)
        .join(Paper, Paper.id == AnalysisQueue.paper_id)
        .where(
            AnalysisQueue.status == "done",
            AnalysisQueue.analysis_mode == "extended",
            or_(
                AnalysisQueue.validation_status.is_(None),
                AnalysisQueue.validation_status == "needs_revision",
            ),
        )
        # Order: highest-rated papers first. Within the same paper, NEWEST version
        # first so the dedupe below keeps the current (not superseded) entry.
        .order_by(desc(Paper.rating).nulls_last(), AnalysisQueue.completed_at.desc())
    )
    rows = result.all()

    # Bulk-load labels for all papers in the queue (single query, no N+1)
    paper_ids = list({p.id for _, p in rows})
    labels_by_paper: dict[int, list[dict]] = {pid: [] for pid in paper_ids}
    if paper_ids:
        lbl_res = await db.execute(
            select(PaperLabel.paper_id, Label.name, Label.color)
            .join(Label, Label.id == PaperLabel.label_id)
            .where(PaperLabel.paper_id.in_(paper_ids))
        )
        for pid, name, color in lbl_res.all():
            labels_by_paper.setdefault(pid, []).append({"name": name, "color": color})

    # Keep only the latest version per (paper_id, mode) — older superseded entries skipped
    seen: set[tuple[int, str]] = set()
    out: list[dict] = []
    for aq, paper in rows:
        key = (paper.id, aq.analysis_mode or "quick")
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "queue_id": aq.id,
            "paper_id": paper.id,
            "title": paper.title,
            "doi": paper.doi,
            "journal": paper.journal,
            "publication_date": paper.publication_date,
            "rating": paper.rating,
            "labels": labels_by_paper.get(paper.id, []),
            "mode": aq.analysis_mode or "quick",
            "version": aq.version or 1,
            "validation_status": aq.validation_status,
            "completed_at": aq.completed_at.isoformat() if aq.completed_at else None,
        })
    return out


def _parse_rubric_payload(json_str: str | None) -> dict:
    """Parse stored rubric payload supporting both legacy (list) and new (dict) format."""
    import json as _json
    from app.services.validation_report import empty_rubric

    if not json_str:
        return {"items": empty_rubric(), "general_score": None}
    try:
        data = _json.loads(json_str)
    except Exception:
        return {"items": empty_rubric(), "general_score": None}
    if isinstance(data, list):
        # Legacy format: list of items with checked/missing/note
        items = []
        for it in data:
            items.append({
                "section": it.get("section", ""),
                # Migrate legacy 'checked' bool to score: True -> 5, False -> None
                "score": 5 if it.get("checked") else None,
                "missing": it.get("missing", False),
                "note": it.get("note", ""),
            })
        return {"items": items, "general_score": None}
    if isinstance(data, dict):
        return {
            "items": data.get("items") or empty_rubric(),
            "general_score": data.get("general_score"),
        }
    return {"items": empty_rubric(), "general_score": None}


@router.get("/queue/{queue_id}/rubric-template")
async def get_rubric_template(
    queue_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the rubric (items + general_score) for an analysis. Blank template if unset."""
    from app.services.validation_report import empty_rubric

    item = await db.get(AnalysisQueue, queue_id)
    if not item:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if item.validation_rubric_json:
        return {**_parse_rubric_payload(item.validation_rubric_json), "from_existing": True}
    return {"items": empty_rubric(), "general_score": None, "from_existing": False}


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
            "md_path": q.md_path,
            "tex_path": q.tex_path,
            "version": q.version or 1,
            "zotero_synced": bool(q.zotero_synced) if q.zotero_synced is not None else False,
            "validation_status": q.validation_status,
            "validation_score": q.validation_score,
            "validation_notes": q.validation_notes,
            "validation_rubric": __import__("json").loads(q.validation_rubric_json) if q.validation_rubric_json else None,
            "validated_at": q.validated_at.isoformat() if q.validated_at else None,
            "validated_by": q.validated_by,
        })
    return result_list


@router.get("/{paper_id}/html")
async def get_analysis_html(
    paper_id: int,
    queue_id: int | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get HTML analysis report for a paper. If queue_id is given, serve that specific entry."""
    if queue_id:
        item = await db.get(AnalysisQueue, queue_id)
        if not item or item.paper_id != paper_id:
            raise HTTPException(status_code=404, detail="Analysis report not found")
    else:
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
    queue_id: int | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download PDF analysis report for a paper. If queue_id is given, serve that specific entry."""
    if queue_id:
        item = await db.get(AnalysisQueue, queue_id)
        if not item or item.paper_id != paper_id:
            raise HTTPException(status_code=404, detail="PDF report not available")
    else:
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
        filename=path.name,
    )


@router.get("/{paper_id}/validation-report")
async def get_validation_report_pdf(
    paper_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate (on demand) and serve the validation report PDF for a paper."""
    from app.services.validation_report import generate_validation_report

    pdf_path = await generate_validation_report(db, paper_id)
    if not pdf_path or not pdf_path.exists():
        raise HTTPException(
            status_code=404,
            detail="No validation report available — at least one analysis must be reviewed first",
        )
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=pdf_path.name,
    )


@router.get("/{paper_id}/md")
async def get_analysis_md(
    paper_id: int,
    queue_id: int | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download Markdown analysis file."""
    if queue_id:
        item = await db.get(AnalysisQueue, queue_id)
        if not item or item.paper_id != paper_id:
            raise HTTPException(status_code=404, detail="Markdown file not available")
    else:
        result = await db.execute(
            select(AnalysisQueue).where(
                AnalysisQueue.paper_id == paper_id,
                AnalysisQueue.status == "done",
            ).order_by(AnalysisQueue.completed_at.desc()).limit(1)
        )
        item = result.scalar_one_or_none()
    if not item or not item.md_path:
        raise HTTPException(status_code=404, detail="Markdown file not available")
    path = Path(item.md_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Markdown file not found on disk")
    return FileResponse(path=str(path), media_type="text/markdown", filename=path.name)


@router.get("/{paper_id}/tex")
async def get_analysis_tex(
    paper_id: int,
    queue_id: int | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download LaTeX analysis file."""
    if queue_id:
        item = await db.get(AnalysisQueue, queue_id)
        if not item or item.paper_id != paper_id:
            raise HTTPException(status_code=404, detail="LaTeX file not available")
    else:
        result = await db.execute(
            select(AnalysisQueue).where(
                AnalysisQueue.paper_id == paper_id,
                AnalysisQueue.status == "done",
            ).order_by(AnalysisQueue.completed_at.desc()).limit(1)
        )
        item = result.scalar_one_or_none()
    if not item or not item.tex_path:
        raise HTTPException(status_code=404, detail="LaTeX file not available")
    path = Path(item.tex_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="LaTeX file not found on disk")
    return FileResponse(path=str(path), media_type="application/x-tex", filename=path.name)
