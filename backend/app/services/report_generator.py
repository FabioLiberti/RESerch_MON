"""Daily/weekly report generator using Jinja2 HTML templates."""

import logging
from datetime import datetime, timedelta
from pathlib import Path

from jinja2 import Environment, BaseLoader
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.analysis import DailyReport, SyntheticAnalysis
from app.models.paper import Paper, PaperAuthor, PaperSource
from app.models.topic import PaperTopic, Topic

logger = logging.getLogger(__name__)

REPORT_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FL Research Monitor — Daily Report {{ report_date }}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: #0a0a0f; color: #e8e8f0;
    max-width: 800px; margin: 0 auto; padding: 32px 24px;
  }
  h1 { font-size: 24px; margin-bottom: 4px; }
  h2 { font-size: 18px; margin: 32px 0 16px; color: #6366f1; }
  h3 { font-size: 14px; margin: 16px 0 8px; }
  .subtitle { color: #6b6b80; font-size: 13px; margin-bottom: 24px; }
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .stat-card {
    background: #12121a; border: 1px solid #2a2a3e; border-radius: 12px; padding: 16px; text-align: center;
  }
  .stat-value { font-size: 28px; font-weight: 700; }
  .stat-label { font-size: 11px; color: #6b6b80; margin-top: 4px; }
  .paper-card {
    background: #12121a; border: 1px solid #2a2a3e; border-radius: 12px;
    padding: 16px; margin-bottom: 12px;
  }
  .paper-title { font-size: 14px; font-weight: 600; line-height: 1.4; }
  .paper-meta { font-size: 11px; color: #6b6b80; margin-top: 6px; }
  .paper-abstract { font-size: 12px; color: #a0a0b8; margin-top: 8px; line-height: 1.5; }
  .tag {
    display: inline-block; font-size: 10px; padding: 2px 8px;
    border-radius: 99px; margin-right: 4px; margin-top: 4px;
  }
  .tag-source { background: #1e3a5f; color: #60a5fa; }
  .tag-topic { background: #312e81; color: #a78bfa; }
  .tag-oa { background: #064e3b; color: #34d399; }
  .analysis { background: #1a1a28; border-radius: 8px; padding: 12px; margin-top: 8px; font-size: 12px; }
  .analysis-label { font-size: 10px; color: #6366f1; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
  .techniques { margin-top: 6px; }
  .footer { text-align: center; color: #6b6b80; font-size: 11px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #2a2a3e; }
  a { color: #6366f1; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<h1>FL Research Monitor</h1>
<p class="subtitle">Daily Report — {{ report_date }}{% if run_id %} · Run #{{ run_id }}{% endif %}</p>
<p style="color:#6b6b80;font-size:11px;">Generated: {{ generated_at }}</p>

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-value" style="color: #6366f1;">{{ total_papers }}</div>
    <div class="stat-label">Total Papers</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color: #22c55e;">{{ new_papers }}</div>
    <div class="stat-label">New Today</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color: #f59e0b;">{{ with_pdf }}</div>
    <div class="stat-label">With PDF</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color: #3b82f6;">{{ validated }}</div>
    <div class="stat-label">Validated</div>
  </div>
</div>

{% if new_papers_list %}
<h2>New Papers ({{ new_papers_list|length }})</h2>
{% for paper in new_papers_list %}
<div class="paper-card">
  <div class="paper-title">
    {% if paper.doi %}<a href="https://doi.org/{{ paper.doi }}" target="_blank">{{ paper.title }}</a>
    {% else %}{{ paper.title }}{% endif %}
  </div>
  <div class="paper-meta">
    {{ paper.authors }} &middot; {{ paper.journal or 'N/A' }} &middot; {{ paper.publication_date }}
  </div>
  <div>
    {% for src in paper.sources %}<span class="tag tag-source">{{ src }}</span>{% endfor %}
    {% for topic in paper.topics %}<span class="tag tag-topic">{{ topic }}</span>{% endfor %}
    {% if paper.open_access %}<span class="tag tag-oa">Open Access</span>{% endif %}
  </div>
  {% if paper.abstract %}
  <div class="paper-abstract">{{ paper.abstract[:300] }}{% if paper.abstract|length > 300 %}...{% endif %}</div>
  {% endif %}
  {% if paper.analysis %}
  <div class="analysis">
    <div class="analysis-label">Analysis</div>
    <div>{{ paper.analysis.summary }}</div>
    {% if paper.analysis.fl_techniques %}
    <div class="techniques">
      <strong style="font-size:10px;color:#6b6b80;">FL Techniques:</strong>
      {% for t in paper.analysis.fl_techniques %}<span class="tag tag-topic">{{ t }}</span>{% endfor %}
    </div>
    {% endif %}
  </div>
  {% endif %}
</div>
{% endfor %}
{% else %}
<h2>No New Papers Today</h2>
<p style="color:#6b6b80;font-size:13px;">No new papers were discovered on {{ report_date }}.</p>
{% endif %}

<div class="footer">
  Generated by FL-Research-Monitor v0.4.0<br>
  Topics: Federated Learning &middot; FL in Healthcare &middot; European Health Data Space
</div>
</body>
</html>"""


class ReportGenerator:
    """Generates daily HTML reports."""

    def __init__(self):
        self.output_dir = settings.reports_dir
        self.env = Environment(loader=BaseLoader())
        self.template = self.env.from_string(REPORT_HTML_TEMPLATE)

    async def generate_daily_report(
        self, db: AsyncSession, report_date: str | None = None, run_id: int | None = None
    ) -> Path:
        """Generate HTML report for a given date (default: today)."""
        if not report_date:
            report_date = datetime.utcnow().strftime("%Y-%m-%d")

        # Total stats
        total_papers = (await db.execute(select(func.count(Paper.id)))).scalar() or 0
        with_pdf = (
            await db.execute(
                select(func.count(Paper.id)).where(Paper.pdf_local_path.isnot(None))
            )
        ).scalar() or 0
        validated = (
            await db.execute(
                select(func.count(Paper.id)).where(Paper.validated == True)
            )
        ).scalar() or 0

        # New papers today
        result = await db.execute(
            select(Paper)
            .where(Paper.created_at >= datetime.strptime(report_date, "%Y-%m-%d"))
            .where(
                Paper.created_at
                < datetime.strptime(report_date, "%Y-%m-%d") + timedelta(days=1)
            )
            .options(
                selectinload(Paper.sources),
                selectinload(Paper.authors).selectinload(PaperAuthor.author),
                selectinload(Paper.topics).selectinload(PaperTopic.topic),
                selectinload(Paper.analysis),
            )
            .order_by(Paper.created_at.desc())
        )
        new_papers = result.unique().scalars().all()

        # Build paper data for template
        papers_data = []
        for p in new_papers:
            analysis_data = None
            if p.analysis:
                analysis_data = {
                    "summary": p.analysis.summary,
                    "fl_techniques": p.analysis.fl_techniques,
                    "methodology": p.analysis.methodology,
                    "relevance_score": p.analysis.relevance_score,
                }

            papers_data.append({
                "title": p.title,
                "doi": p.doi,
                "abstract": p.abstract,
                "publication_date": p.publication_date,
                "journal": p.journal,
                "authors": ", ".join(
                    pa.author.name
                    for pa in sorted(p.authors, key=lambda x: x.position)
                    if pa.author
                )[:100],
                "sources": [s.source_name for s in p.sources],
                "topics": [pt.topic.name for pt in p.topics if pt.topic],
                "open_access": p.open_access,
                "analysis": analysis_data,
            })

        # Render HTML
        generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        html = self.template.render(
            report_date=report_date,
            total_papers=total_papers,
            new_papers=len(new_papers),
            with_pdf=with_pdf,
            validated=validated,
            new_papers_list=papers_data,
            run_id=run_id,
            generated_at=generated_at,
        )

        # Save
        filepath = self.output_dir / f"report_{report_date}.html"
        filepath.write_text(html, encoding="utf-8")

        # Save to DB
        await self._save_report_record(
            db, report_date, total_papers, len(new_papers), str(filepath)
        )

        logger.info(f"Report generated: {filepath} ({len(new_papers)} new papers)")
        return filepath

    async def _save_report_record(
        self,
        db: AsyncSession,
        report_date: str,
        total: int,
        new: int,
        html_path: str,
    ):
        """Save or update report record in DB."""
        result = await db.execute(
            select(DailyReport).where(DailyReport.report_date == report_date)
        )
        report = result.scalar_one_or_none()

        if report:
            report.total_papers = total
            report.new_papers = new
            report.html_path = html_path
            report.generated_at = datetime.utcnow()
        else:
            report = DailyReport(
                report_date=report_date,
                total_papers=total,
                new_papers=new,
                html_path=html_path,
            )
            db.add(report)
