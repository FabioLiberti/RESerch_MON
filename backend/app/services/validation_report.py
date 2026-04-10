"""Generate formal validation reports (LaTeX + PDF) for paper analyses."""

import json
import logging
import re
import subprocess
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.analysis import AnalysisQueue
from app.models.paper import Paper

logger = logging.getLogger(__name__)


def _esc(s: str | None) -> str:
    """Escape LaTeX special characters."""
    if not s:
        return ""
    return s.replace('&', '\\&').replace('%', '\\%').replace('#', '\\#').replace('_', '\\_').replace('$', '\\$')


_STATUS_LABEL = {
    "validated": "VALIDATED",
    "rejected": "REJECTED",
    "needs_revision": "NEEDS REVISION",
    "pending": "PENDING REVIEW",
}

_MODE_LABEL = {
    "extended": "Extended Abstract",
    "summary": "Summary",
    "quick": "Quick Analysis",
    "deep": "Deep Analysis",
}

# Rubric items mirror the EXT.ABS section structure (in order).
# Each item is checked OK / flagged Missing / annotated.
RUBRIC_SECTIONS: list[str] = [
    "Abstract",
    "Keywords",
    "Research Context",
    "Purpose",
    "Methodology",
    "Results",
    "Limitations",
    "Implications",
    "Originality",
]


def empty_rubric() -> list[dict]:
    """Return a fresh blank rubric: every section unchecked, not missing, no note."""
    return [
        {"section": s, "checked": False, "missing": False, "note": ""}
        for s in RUBRIC_SECTIONS
    ]


def compute_rubric_score(rubric: list[dict]) -> int | None:
    """Compute a 1-5 score from a rubric.

    Score = checked / (total - missing) * 5, rounded.
    Missing items penalize because they reduce 'checked' but stay in the denominator
    via the section total.
    Returns None for empty rubrics.
    """
    if not rubric:
        return None
    total = len(rubric)
    if total == 0:
        return None
    checked = sum(1 for r in rubric if r.get("checked"))
    # Missing sections never get a check; they reduce the achievable max but
    # we keep total as denominator so missing genuinely lowers the score.
    score = round((checked / total) * 5)
    return max(1, min(5, score)) if checked > 0 else 1


async def generate_validation_report(db: AsyncSession, paper_id: int) -> Path | None:
    """Generate the formal validation report PDF for a paper.

    Returns the PDF path if generated, None if no validations exist or error.
    """
    paper = await db.get(Paper, paper_id)
    if not paper:
        return None

    # Get all done analyses for this paper
    result = await db.execute(
        select(AnalysisQueue)
        .where(AnalysisQueue.paper_id == paper_id, AnalysisQueue.status == "done")
        .order_by(AnalysisQueue.completed_at.desc())
    )
    all_analyses = list(result.scalars().all())

    # Keep only the latest per mode
    seen_modes: set[str] = set()
    latest_by_mode: list[AnalysisQueue] = []
    for a in all_analyses:
        m = a.analysis_mode or "quick"
        if m not in seen_modes:
            seen_modes.add(m)
            latest_by_mode.append(a)

    # Split into validated and not-validated
    validated = [a for a in latest_by_mode if a.validation_status in ("validated", "rejected", "needs_revision")]
    pending = [a for a in latest_by_mode if a.validation_status not in ("validated", "rejected", "needs_revision")]

    if not validated:
        # No validations at all — don't generate report
        return None

    # Build LaTeX
    title = _esc(paper.title)
    doi = paper.doi or "N/A"
    journal = _esc(paper.journal or "N/A")
    pub_date = paper.publication_date or "N/A"

    # Order: extended, summary, quick, deep
    mode_order = {"extended": 0, "summary": 1, "quick": 2, "deep": 3}
    validated.sort(key=lambda a: mode_order.get(a.analysis_mode or "quick", 9))
    pending.sort(key=lambda a: mode_order.get(a.analysis_mode or "quick", 9))

    validation_blocks = []
    for a in validated:
        mode_label = _MODE_LABEL.get(a.analysis_mode or "quick", a.analysis_mode or "Unknown")
        status = _STATUS_LABEL.get(a.validation_status or "pending", "PENDING")
        score = f"{a.validation_score}/5" if a.validation_score else "N/A"
        date = a.validated_at.strftime("%Y-%m-%d %H:%M") if a.validated_at else "N/A"
        validator = _esc(a.validated_by or "Unknown")
        notes = _esc(a.validation_notes or "No notes provided.")
        version = a.version or 1

        # Status color
        status_color = {
            "validated": "darkgreen",
            "rejected": "darkred",
            "needs_revision": "orange",
        }.get(a.validation_status or "", "gray")

        # Parse rubric if present
        rubric_table = ""
        if a.validation_rubric_json:
            try:
                rubric = json.loads(a.validation_rubric_json)
                if rubric:
                    rows = []
                    for r in rubric:
                        sec = _esc(r.get("section", ""))
                        if r.get("missing"):
                            mark = "\\textcolor{darkred}{\\textbf{MISSING}}"
                        elif r.get("checked"):
                            mark = "\\textcolor{darkgreen}{\\textbf{OK}}"
                        else:
                            mark = "\\textcolor{gray}{--}"
                        item_note = _esc(r.get("note") or "")
                        rows.append(
                            f"{sec} & {mark} & {item_note} \\\\\n"
                        )
                    rubric_table = (
                        "\\vspace{0.4em}\n"
                        "\\noindent\\textbf{Section-by-section rubric:}\n"
                        "\\vspace{0.2em}\n"
                        "\\begin{tabular}{@{}p{3.8cm}p{1.8cm}p{9.0cm}@{}}\n"
                        "\\hline\n"
                        "\\textbf{Section} & \\textbf{Status} & \\textbf{Note} \\\\\n"
                        "\\hline\n"
                        + "".join(rows)
                        + "\\hline\n"
                        "\\end{tabular}\n"
                    )
            except Exception as e:
                logger.warning(f"Failed to render rubric for analysis {a.id}: {e}")

        block = (
            f"\\subsection*{{{mode_label} (v{version})}}\n"
            f"\\begin{{tabular}}{{@{{}}p{{3.5cm}}p{{12cm}}@{{}}}}\n"
            f"\\textbf{{Status}}      & \\textcolor{{{status_color}}}{{\\textbf{{{status}}}}} \\\\\n"
            f"\\textbf{{Score}}       & {score} \\\\\n"
            f"\\textbf{{Date}}        & {date} \\\\\n"
            f"\\textbf{{Validator}}   & {validator} \\\\\n"
            f"\\textbf{{Notes}}       & {notes} \\\\\n"
            f"\\end{{tabular}}\n"
            f"{rubric_table}"
            f"\\vspace{{0.8em}}\n"
        )
        validation_blocks.append(block)

    pending_block = ""
    if pending:
        pending_lines = []
        for a in pending:
            mode_label = _MODE_LABEL.get(a.analysis_mode or "quick", a.analysis_mode or "Unknown")
            version = a.version or 1
            pending_lines.append(f"  \\item {mode_label} (v{version}) --- pending review")
        pending_block = (
            "\\subsection*{Other Available Analyses (Not Yet Validated)}\n"
            "\\begin{itemize}[noitemsep,topsep=0pt]\n"
            + "\n".join(pending_lines) +
            "\n\\end{itemize}\n"
        )

    generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    tex = f"""\\documentclass[11pt,a4paper]{{article}}
\\usepackage[utf8]{{inputenc}}
\\usepackage[T1]{{fontenc}}
\\usepackage[english]{{babel}}
\\usepackage{{geometry}}
\\geometry{{a4paper,top=2.5cm,bottom=2.5cm,left=2.8cm,right=2.8cm}}
\\usepackage{{lmodern}}
\\usepackage{{microtype}}
\\usepackage{{xcolor}}
\\usepackage{{enumitem}}
\\usepackage{{titlesec}}
\\usepackage{{hyperref}}

\\definecolor{{darkgreen}}{{RGB}}{{0,120,0}}
\\definecolor{{darkred}}{{RGB}}{{180,0,0}}
\\definecolor{{orange}}{{RGB}}{{220,120,0}}

\\hypersetup{{colorlinks=false,pdfborder={{0 0 0}}}}
\\setcounter{{secnumdepth}}{{0}}

\\titleformat{{\\subsection}}{{\\normalfont\\normalsize\\bfseries\\scshape}}{{}}{{0pt}}{{}}[\\vspace{{0.2em}}]
\\titlespacing*{{\\subsection}}{{0pt}}{{1em}}{{0.4em}}

\\pagestyle{{plain}}
\\setlength{{\\parskip}}{{0.4em}}
\\setlength{{\\parindent}}{{0pt}}

\\begin{{document}}

\\begin{{center}}
{{\\Large\\bfseries\\scshape Analysis Validation Report}}\\\\[1em]
{{\\large {title}}}\\\\[0.4em]
{{\\small DOI: {doi} \\quad\\textbar\\quad {journal} \\quad\\textbar\\quad {pub_date}}}
\\end{{center}}

\\vspace{{1em}}
\\hrule
\\vspace{{1em}}

\\subsection*{{Validation Results}}

{"".join(validation_blocks)}

{pending_block}

\\vfill
\\hrule
\\vspace{{0.4em}}
{{\\footnotesize\\textcolor{{gray}}{{Generated by FL Research Monitor --- {generated_at}}}}}

\\end{{document}}
"""

    # Save and compile
    reports_dir = Path(settings.reports_path) / "analysis"
    reports_dir.mkdir(parents=True, exist_ok=True)

    basename = f"validation_{paper_id}"
    tex_path = reports_dir / f"{basename}.tex"
    pdf_path = reports_dir / f"{basename}.pdf"

    tex_path.write_text(tex, encoding="utf-8")
    logger.info(f"Validation tex saved: {tex_path}")

    # Compile with pdflatex
    try:
        abs_tex = tex_path.resolve()
        result = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", abs_tex.name],
            capture_output=True, text=True, timeout=60,
            cwd=str(abs_tex.parent),
        )
        tex_pdf = abs_tex.with_suffix(".pdf")
        if tex_pdf.exists() and tex_pdf.stat().st_size > 0:
            # Clean up aux files
            for ext in [".aux", ".log", ".out"]:
                aux = abs_tex.with_suffix(ext)
                if aux.exists():
                    aux.unlink()
            logger.info(f"Validation PDF generated: {pdf_path}")
            return pdf_path
        else:
            logger.warning(f"pdflatex failed for validation report. Return: {result.returncode}")
            return None
    except Exception as e:
        logger.error(f"Validation PDF generation error: {e}")
        return None


def build_validation_zotero_tags(vsum: dict) -> list[str]:
    """Build Zotero tags from a validation summary.

    Generates BOTH emoji-prefixed visible tags (for the Tags column) AND short
    tags (so the user can assign Zotero colored tags 1-9 manually).
    """
    tags: list[str] = []
    overall = vsum.get("overall", "PENDING")

    EMOJI_OVERALL = {
        "FULLY VALIDATED": "✅ Fully Validated",
        "PARTIAL":         "🟡 Partially Validated",
        "REVIEWED":        "🔵 Reviewed",
        "PENDING":         "🕒 Pending Review",
    }
    SHORT_OVERALL = {
        "FULLY VALIDATED": "fully-validated",
        "PARTIAL":         "partially-validated",
        "REVIEWED":        "reviewed",
        "PENDING":         "pending-review",
    }

    if overall in EMOJI_OVERALL:
        tags.append(EMOJI_OVERALL[overall])
        tags.append(SHORT_OVERALL[overall])

    for m in vsum.get("validated_modes", []):
        tags.append(f"✅ Validated · {m}")
        tags.append(f"validated-{m}")
    for m in vsum.get("rejected_modes", []):
        tags.append(f"❌ Rejected · {m}")
        tags.append(f"rejected-{m}")
    for m in vsum.get("needs_revision_modes", []):
        tags.append(f"⚠️ Revision · {m}")
        tags.append(f"needs-revision-{m}")

    return tags


def get_validation_summary(analyses: list[AnalysisQueue]) -> dict:
    """Build a summary of validation status across analyses (for Zotero Extra field)."""
    by_mode: dict[str, dict] = {}
    for a in analyses:
        mode = a.analysis_mode or "quick"
        if mode in by_mode:
            continue
        by_mode[mode] = {
            "status": a.validation_status,
            "score": a.validation_score,
        }

    validated = [m for m, d in by_mode.items() if d["status"] == "validated"]
    rejected = [m for m, d in by_mode.items() if d["status"] == "rejected"]
    revision = [m for m, d in by_mode.items() if d["status"] == "needs_revision"]
    total = len(by_mode)

    if not validated and not rejected and not revision:
        overall = "PENDING"
    elif len(validated) == total:
        overall = "FULLY VALIDATED"
    elif validated:
        overall = "PARTIAL"
    else:
        overall = "REVIEWED"

    return {
        "overall": overall,
        "validated_modes": validated,
        "rejected_modes": rejected,
        "needs_revision_modes": revision,
        "by_mode": by_mode,
    }
