"""Individual paper analysis report generator — HTML + PDF."""

import logging
import re
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, BaseLoader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.paper import Paper, PaperSource
from app.models.topic import PaperTopic, Topic
from app.models.analysis import SyntheticAnalysis

logger = logging.getLogger(__name__)

# Keyword category mapping
KEYWORD_CATEGORIES = {
    "FL Core": {
        "color": "#6366f1",
        "bg": "rgba(99,102,241,0.15)",
        "terms": [
            "federated learning", "fedavg", "fedprox", "federated averaging",
            "federated optimization", "aggregation", "collaborative learning",
            "distributed learning", "model aggregation", "fedsgd", "scaffold",
            "fednova", "communication round",
        ],
    },
    "Privacy": {
        "color": "#ef4444",
        "bg": "rgba(239,68,68,0.15)",
        "terms": [
            "differential privacy", "privacy", "epsilon", "privacy budget",
            "secure aggregation", "homomorphic encryption", "privacy-preserving",
            "data protection", "anonymization", "gdpr",
        ],
    },
    "Healthcare": {
        "color": "#22c55e",
        "bg": "rgba(34,197,94,0.15)",
        "terms": [
            "healthcare", "clinical", "medical", "hospital", "ehr",
            "electronic health record", "patient", "diagnosis", "imaging",
            "health data", "ehds", "biomedical", "pharmaceutical", "drug",
        ],
    },
    "Systems": {
        "color": "#f59e0b",
        "bg": "rgba(245,158,11,0.15)",
        "terms": [
            "edge computing", "iot", "communication efficiency", "bandwidth",
            "latency", "scalability", "heterogeneous", "resource", "network",
            "distributed system", "cloud", "satellite", "6g", "5g",
        ],
    },
    "Methods": {
        "color": "#8b5cf6",
        "bg": "rgba(139,92,246,0.15)",
        "terms": [
            "experimental", "benchmark", "simulation", "framework", "survey",
            "deep learning", "convolutional", "reinforcement learning",
            "neural network", "transformer", "attention", "optimization",
        ],
    },
}


def categorize_keyword(keyword: str) -> tuple[str, str, str]:
    """Return (category, color, bg_color) for a keyword."""
    kw_lower = keyword.lower()
    for cat_name, cat_info in KEYWORD_CATEGORIES.items():
        for term in cat_info["terms"]:
            if term in kw_lower or kw_lower in term:
                return cat_name, cat_info["color"], cat_info["bg"]
    return "Other", "#6b6b80", "rgba(107,107,128,0.15)"


def markdown_to_html(md_text: str) -> str:
    """Convert markdown analysis text to HTML."""
    if not md_text:
        return ""

    html = md_text

    # Headers: ## Title or **Title**
    html = re.sub(r"^#{1,3}\s*\d*\.?\s*\*{0,2}(.+?)\*{0,2}\s*$", r"<h3>\1</h3>", html, flags=re.MULTILINE)
    html = re.sub(r"^\*\*(\d+\.\s*.+?)\*\*\s*$", r"<h3>\1</h3>", html, flags=re.MULTILINE)

    # Bold
    html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)
    # Italic
    html = re.sub(r"\*(.+?)\*", r"<em>\1</em>", html)

    # List items
    html = re.sub(r"^\s*[-*]\s+", r"<li>", html, flags=re.MULTILINE)
    html = re.sub(r"^\s*\d+\.\s+", r"<li>", html, flags=re.MULTILINE)

    # Paragraphs
    lines = html.split("\n")
    result = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            result.append("")
        elif stripped.startswith("<h3>") or stripped.startswith("<li>"):
            result.append(stripped)
        else:
            result.append(f"<p>{stripped}</p>")

    return "\n".join(result)


PAPER_REPORT_TEMPLATE = """<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Analysis Report — {{ paper.title[:80] }}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: #0a0a0f; color: #e8e8f0;
    max-width: 800px; margin: 0 auto; padding: 32px 24px;
    line-height: 1.6;
  }
  a { color: #6366f1; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Header */
  .report-header {
    border-bottom: 2px solid #2a2a3e;
    padding-bottom: 24px;
    margin-bottom: 24px;
  }
  .report-title {
    font-size: 20px; font-weight: 700; line-height: 1.4;
    margin-bottom: 12px;
  }
  .report-meta {
    display: grid; grid-template-columns: auto 1fr;
    gap: 4px 16px; font-size: 12px; color: #a0a0b8;
  }
  .meta-label { color: #6b6b80; font-weight: 500; }

  /* Keywords */
  .keywords-section {
    background: #12121a; border: 1px solid #2a2a3e;
    border-radius: 12px; padding: 16px; margin-bottom: 24px;
  }
  .keywords-title {
    font-size: 13px; font-weight: 600; margin-bottom: 12px;
    color: #6b6b80; text-transform: uppercase; letter-spacing: 0.5px;
  }
  .keyword-tag {
    display: inline-block; font-size: 11px; padding: 3px 10px;
    border-radius: 20px; margin: 3px 4px 3px 0; font-weight: 500;
  }
  .keyword-category {
    margin-top: 12px; padding-top: 12px;
    border-top: 1px solid #2a2a3e;
  }
  .category-label {
    font-size: 11px; font-weight: 600; margin-bottom: 6px;
    display: flex; align-items: center; gap: 6px;
  }
  .category-dot {
    width: 8px; height: 8px; border-radius: 50%;
    display: inline-block;
  }

  /* Analysis sections */
  .analysis-content {
    background: #12121a; border: 1px solid #2a2a3e;
    border-radius: 12px; padding: 24px; margin-bottom: 16px;
  }
  .analysis-content h3 {
    font-size: 15px; color: #6366f1; margin: 24px 0 10px;
    padding-bottom: 6px; border-bottom: 1px solid #2a2a3e;
  }
  .analysis-content h3:first-child { margin-top: 0; }
  .analysis-content p {
    font-size: 13px; color: #c8c8d8; margin: 8px 0;
    line-height: 1.7;
  }
  .analysis-content li {
    font-size: 13px; color: #c8c8d8;
    margin: 4px 0 4px 20px; line-height: 1.6;
    list-style: disc;
  }
  .analysis-content strong { color: #e8e8f0; }
  .analysis-content em { color: #a0a0b8; }

  /* Relevance badge */
  .relevance-alta { color: #22c55e; }
  .relevance-media { color: #eab308; }
  .relevance-bassa { color: #ef4444; }

  /* Footer */
  .report-footer {
    margin-top: 32px; padding-top: 16px;
    border-top: 1px solid #2a2a3e;
    font-size: 11px; color: #6b6b80;
    display: flex; justify-content: space-between;
  }

  @media print {
    body { background: white; color: #1a1a2e; max-width: 100%; }
    .analysis-content { background: #f8f9fc; border-color: #e2e8f0; }
    .keywords-section { background: #f8f9fc; border-color: #e2e8f0; }
    .analysis-content h3 { color: #4f46e5; border-color: #e2e8f0; }
    .analysis-content p, .analysis-content li { color: #374151; }
    .report-footer { color: #9ca3af; border-color: #e2e8f0; }
  }
</style>
</head>
<body>

<div class="report-header">
  <div class="report-title">{{ paper.title }}</div>
  <div class="report-meta">
    {% if paper.doi %}
    <span class="meta-label">DOI</span>
    <span><a href="https://doi.org/{{ paper.doi }}" target="_blank">{{ paper.doi }}</a></span>
    {% endif %}
    {% if paper.journal %}
    <span class="meta-label">Journal</span>
    <span>{{ paper.journal }}</span>
    {% endif %}
    <span class="meta-label">Date</span>
    <span>{{ paper.publication_date or 'N/A' }}</span>
    <span class="meta-label">Type</span>
    <span>{{ paper.paper_type }}</span>
    {% if authors %}
    <span class="meta-label">Authors</span>
    <span>{{ authors }}</span>
    {% endif %}
    {% if topics %}
    <span class="meta-label">Topics</span>
    <span>{{ topics }}</span>
    {% endif %}
    {% if sources %}
    <span class="meta-label">Sources</span>
    <span>{{ sources }}</span>
    {% endif %}
  </div>
</div>

<!-- Keywords Section -->
<div class="keywords-section">
  <div class="keywords-title">Keywords</div>
  <div>
    {% for kw in keyword_tags %}
    <span class="keyword-tag" style="background: {{ kw.bg }}; color: {{ kw.color }};">{{ kw.keyword }}</span>
    {% endfor %}
  </div>

  {% if keyword_categories %}
  <div class="keyword-category">
    {% for cat_name, cat_info in keyword_categories.items() %}
    <div class="category-label" style="color: {{ cat_info.color }};">
      <span class="category-dot" style="background: {{ cat_info.color }};"></span>
      {{ cat_name }}: {{ cat_info.keywords | join(', ') }}
    </div>
    {% endfor %}
  </div>
  {% endif %}
</div>

<!-- Analysis Content -->
<div class="analysis-content">
  {{ analysis_html | safe }}
</div>

<div class="report-footer">
  <span>Generated by FL Research Monitor</span>
  <span>{{ generated_at }}</span>
</div>

</body>
</html>"""


def build_keyword_data(keywords: list[str]) -> tuple[list[dict], dict]:
    """Build keyword tags with colors and category grouping."""
    tags = []
    categories: dict[str, dict] = {}

    for kw in keywords:
        cat_name, color, bg = categorize_keyword(kw)
        tags.append({"keyword": kw, "color": color, "bg": bg, "category": cat_name})

        if cat_name not in categories:
            categories[cat_name] = {"color": color, "keywords": []}
        categories[cat_name]["keywords"].append(kw)

    return tags, categories


async def get_paper_data(db: AsyncSession, paper_id: int) -> dict | None:
    """Fetch full paper data for report generation."""
    result = await db.execute(
        select(Paper).where(Paper.id == paper_id)
    )
    paper = result.scalar_one_or_none()
    if not paper:
        return None

    # Get authors
    from app.models.paper import Author, PaperAuthor
    authors_result = await db.execute(
        select(Author)
        .join(PaperAuthor)
        .where(PaperAuthor.paper_id == paper_id)
        .order_by(PaperAuthor.position)
    )
    authors = [a.name for a in authors_result.scalars().all()]

    # Get topics
    topics_result = await db.execute(
        select(Topic)
        .join(PaperTopic)
        .where(PaperTopic.paper_id == paper_id)
    )
    topics = [t.name for t in topics_result.scalars().all()]

    # Get sources
    sources_result = await db.execute(
        select(PaperSource).where(PaperSource.paper_id == paper_id)
    )
    sources = [s.source_name for s in sources_result.scalars().all()]

    return {
        "paper": paper,
        "authors": ", ".join(authors) if authors else None,
        "topics": ", ".join(topics) if topics else None,
        "sources": ", ".join(sources) if sources else None,
    }


def render_paper_report(paper_data: dict, analysis_text: str, engine: str = "Claude Opus") -> str:
    """Render the HTML report for a single paper."""
    paper = paper_data["paper"]
    keywords = paper.keywords or []

    keyword_tags, keyword_categories = build_keyword_data(keywords)
    analysis_html = markdown_to_html(analysis_text)

    env = Environment(loader=BaseLoader(), autoescape=True)
    template = env.from_string(PAPER_REPORT_TEMPLATE)

    return template.render(
        paper=paper,
        authors=paper_data["authors"],
        topics=paper_data["topics"],
        sources=paper_data["sources"],
        engine=engine,
        keyword_tags=keyword_tags,
        keyword_categories=keyword_categories,
        analysis_html=analysis_html,
        generated_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    )


def save_report(html: str, paper_id: int, mode: str = "quick") -> Path:
    """Save HTML report to disk and return the path."""
    reports_dir = Path(settings.reports_path) / "analysis"
    reports_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    path = reports_dir / f"paper_{paper_id}_{mode}_{timestamp}.html"
    path.write_text(html, encoding="utf-8")
    logger.info(f"Report saved: {path}")
    return path


PDF_OVERRIDE_CSS = """
    body { background: white !important; color: #1a1a2e !important; }
    .report-header { border-color: #d1d5db !important; }
    .report-title { color: #111827 !important; }
    .report-meta { color: #374151 !important; }
    .meta-label { color: #6b7280 !important; }
    .keywords-section { background: #f9fafb !important; border-color: #e5e7eb !important; }
    .keywords-title { color: #374151 !important; }
    .analysis-content { background: #ffffff !important; border-color: #e5e7eb !important; }
    .analysis-content h3 { color: #4338ca !important; border-color: #e5e7eb !important; }
    .analysis-content p { color: #1f2937 !important; }
    .analysis-content li { color: #1f2937 !important; }
    .analysis-content strong { color: #111827 !important; }
    .analysis-content em { color: #4b5563 !important; }
    .report-footer { color: #6b7280 !important; border-color: #e5e7eb !important; }
    .keyword-category { border-color: #e5e7eb !important; }
    .category-label { color: #374151 !important; }
    a { color: #4338ca !important; }
"""


def generate_pdf(html_path: Path) -> Path | None:
    """Generate PDF from HTML report with light-theme colors for readability."""
    import os
    # Ensure homebrew libraries are findable (macOS)
    if "DYLD_FALLBACK_LIBRARY_PATH" not in os.environ:
        os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = "/opt/homebrew/lib"
    try:
        from weasyprint import HTML, CSS
        pdf_path = html_path.with_suffix(".pdf")
        html_doc = HTML(filename=str(html_path))
        css_override = CSS(string=PDF_OVERRIDE_CSS)
        html_doc.write_pdf(str(pdf_path), stylesheets=[css_override])
        logger.info(f"PDF generated: {pdf_path}")
        return pdf_path
    except ImportError:
        logger.warning("weasyprint not installed, skipping PDF generation")
        return None
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        return None
