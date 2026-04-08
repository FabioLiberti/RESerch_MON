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
    mode: str = "quick"  # "quick", "deep", or "summary"


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

    if body.mode not in ("quick", "deep", "summary"):
        raise HTTPException(status_code=400, detail="Mode must be 'quick', 'deep', or 'summary'")

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
        from app.services.paper_report_generator import get_paper_data, render_paper_report, save_report, generate_pdf
        from app.models.analysis import AnalysisQueue
        from datetime import datetime

        logger.info(f"Starting CLAUDE analysis for {len(body.paper_ids)} papers, mode={body.mode}")

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

                html = render_paper_report(paper_data, analysis_text, engine="Claude Opus 4.6", mode=body.mode)
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

                # Extract structured data (async, cheap via Haiku)
                try:
                    from app.services.structured_extractor import extract_structured_data
                    from app.models.structured_analysis import StructuredAnalysis

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
                        sa.fl_techniques = structured.get("fl_techniques", [])
                        sa.datasets = structured.get("datasets", [])
                        sa.baselines = structured.get("baselines", [])
                        sa.limitations_declared = structured.get("limitations_declared", [])
                        sa.limitations_identified = structured.get("limitations_identified", [])
                        sa.extra = structured.get("extra", {})
                        db.add(sa)
                        await db.flush()
                        await db.commit()
                        logger.info(f"Structured data extracted for paper {paper_id}")
                except Exception as e:
                    logger.warning(f"Structured extraction failed for paper {paper_id}: {e}")

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

    # Get latest structured analysis
    result = await db.execute(
        select(StructuredAnalysis)
        .where(StructuredAnalysis.paper_id == paper_id)
        .order_by(StructuredAnalysis.created_at.desc())
        .limit(1)
    )
    sa = result.scalar_one_or_none()
    if not sa:
        raise HTTPException(status_code=404, detail="No structured analysis available. Run Quick or Deep analysis first.")

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
        filename=f"analysis_paper_{paper_id}.pdf",
    )
