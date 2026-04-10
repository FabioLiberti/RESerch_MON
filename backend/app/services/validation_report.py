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
    """Return a fresh blank rubric: every section with score=null, not missing."""
    return [
        {"section": s, "score": None, "missing": False, "note": ""}
        for s in RUBRIC_SECTIONS
    ]


def compute_rubric_score(rubric: list[dict], general_score: int | None = None) -> int | None:
    """Compute a 1-5 overall score from a rubric (per-item scores) + general_score.

    - Each rubric item contributes its 1-5 score.
    - Items marked 'missing' contribute 1.
    - Items with no score (None) and not missing are skipped (not yet rated).
    - general_score (for the overall General notes section) also contributes if set.
    Returns None if no values to average.
    """
    values: list[int] = []
    for r in rubric or []:
        if r.get("missing"):
            values.append(1)
        else:
            s = r.get("score")
            if isinstance(s, int) and 1 <= s <= 5:
                values.append(s)
    if isinstance(general_score, int) and 1 <= general_score <= 5:
        values.append(general_score)
    if not values:
        return None
    avg = sum(values) / len(values)
    return max(1, min(5, round(avg)))


_TEMPLATE_MTIME: float | None = None


def _template_mtime() -> float:
    """Mtime of this source file — used as a salt to invalidate the on-disk cache
    whenever the template code changes."""
    global _TEMPLATE_MTIME
    if _TEMPLATE_MTIME is None:
        _TEMPLATE_MTIME = Path(__file__).stat().st_mtime
    return _TEMPLATE_MTIME


async def generate_validation_report(db: AsyncSession, paper_id: int) -> Path | None:
    """Generate (or serve from cache) the formal validation report PDF for a paper.

    Cache strategy:
        The PDF is regenerated only if any of these has changed since last build:
            - latest validated_at among the paper's analyses
            - any rubric/notes/score updated_at (we use validated_at as proxy)
            - mtime of this source file (template code change)
        Otherwise the existing PDF on disk is served as-is.

    Returns the PDF path, or None if no validations exist / build failed.
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

    # ---------- Cache check ----------
    reports_dir_chk = Path(settings.reports_path) / "analysis"
    pdf_path_chk = reports_dir_chk / f"validation_{paper_id}.pdf"
    latest_validation = max(
        (a.validated_at.timestamp() for a in validated if a.validated_at),
        default=0.0,
    )
    cache_floor = max(latest_validation, _template_mtime())
    if pdf_path_chk.exists():
        try:
            if pdf_path_chk.stat().st_mtime >= cache_floor and pdf_path_chk.stat().st_size > 0:
                logger.debug(f"Validation PDF cache hit: {pdf_path_chk}")
                return pdf_path_chk
        except OSError:
            pass

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

        # Parse rubric if present (supports both legacy list and new dict payload)
        rubric_table = ""
        general_score_line = ""
        computed_score_value: int | None = None
        if a.validation_rubric_json:
            try:
                payload = json.loads(a.validation_rubric_json)
                items = payload if isinstance(payload, list) else payload.get("items", [])
                general_score = None if isinstance(payload, list) else payload.get("general_score")
                if items:
                    rows = []
                    for r in items:
                        sec = _esc(r.get("section", ""))
                        if r.get("missing"):
                            mark = "\\textcolor{darkred}{\\textbf{MISSING}}"
                            score_cell = "\\textcolor{darkred}{1/5}"
                        else:
                            sc = r.get("score")
                            if isinstance(sc, int) and 1 <= sc <= 5:
                                stars = "\\textcolor{darkgreen}{" + ("$\\bigstar$" * sc) + "}" + ("$\\star$" * (5 - sc))
                                mark = stars
                                score_cell = f"{sc}/5"
                            else:
                                mark = "\\textcolor{gray}{--}"
                                score_cell = "--"
                        # Legacy compatibility: if no score key but 'checked' is True, treat as 5
                        if r.get("score") is None and r.get("checked") and not r.get("missing"):
                            mark = "\\textcolor{darkgreen}{$\\bigstar\\bigstar\\bigstar\\bigstar\\bigstar$}"
                            score_cell = "5/5"
                        item_note = _esc(r.get("note") or "")
                        rows.append(
                            f"{sec} & {score_cell} & {item_note} \\\\\n"
                        )
                    rubric_table = (
                        "\\vspace{0.4em}\n"
                        "\\noindent\\textbf{Section-by-section rubric:}\n"
                        "\\vspace{0.2em}\n\n"
                        "\\noindent\\begin{tabularx}{\\linewidth}{@{}p{4.2cm}p{1.2cm}X@{}}\n"
                        "\\hline\n"
                        "\\textbf{Section} & \\textbf{Score} & \\textbf{Note} \\\\\n"
                        "\\hline\n"
                        + "".join(rows)
                        + "\\hline\n"
                        "\\end{tabularx}\n"
                    )
                    if isinstance(general_score, int) and 1 <= general_score <= 5:
                        general_score_line = f"\\textbf{{General notes score}} & {general_score}/5 \\\\\n"
                    computed_score_value = compute_rubric_score(items, general_score if isinstance(general_score, int) else None)
            except Exception as e:
                logger.warning(f"Failed to render rubric for analysis {a.id}: {e}")

        computed_line = ""
        if computed_score_value is not None and a.validation_score is not None and computed_score_value != a.validation_score:
            computed_line = f"\\textbf{{Computed score}} & {computed_score_value}/5 \\\\\n"

        score_label = "Reviewer score" if a.validation_score is not None else "Score"
        block = (
            f"\\subsection*{{{mode_label} (v{version})}}\n"
            f"\\noindent\\begin{{tabularx}}{{\\linewidth}}{{@{{}}p{{3.5cm}}X@{{}}}}\n"
            f"\\textbf{{Status}}      & \\textcolor{{{status_color}}}{{\\textbf{{{status}}}}} \\\\\n"
            f"\\textbf{{{score_label}}} & {score} \\\\\n"
            f"{computed_line}"
            f"{general_score_line}"
            f"\\textbf{{Date}}        & {date} \\\\\n"
            f"\\textbf{{Validator}}   & {validator} \\\\\n"
            f"\\textbf{{Notes}}       & {notes} \\\\\n"
            f"\\end{{tabularx}}\n"
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

    # Author signature from app settings (configurable from /settings UI)
    from app.services.app_settings import (
        get_setting_sync,
        KEY_PDF_AUTHOR_SIGNATURE,
        KEY_PDF_AUTHOR_AFFILIATION,
    )
    author_sig = get_setting_sync(KEY_PDF_AUTHOR_SIGNATURE, "").strip()
    author_aff = get_setting_sync(KEY_PDF_AUTHOR_AFFILIATION, "").strip()
    if author_sig:
        author_line = _esc(author_sig)
        if author_aff:
            author_line += " --- " + _esc(author_aff)
        footer_text = f"Reviewed by {author_line} \\quad\\textbar\\quad Generated by FL Research Monitor --- {generated_at}"
    else:
        footer_text = f"Generated by FL Research Monitor --- {generated_at}"

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
\\usepackage{{tabularx}}
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
{{\\footnotesize\\textcolor{{gray}}{{{footer_text}}}}}

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

    # Delete the old PDF first so we never accidentally serve a stale file
    # if pdflatex fails silently below.
    if pdf_path.exists():
        try:
            pdf_path.unlink()
        except OSError as e:
            logger.warning(f"Could not remove stale validation PDF: {e}")

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
            # Compile failed. Log enough to diagnose (last 30 lines of stdout).
            tail = "\n".join((result.stdout or "").splitlines()[-30:])
            logger.error(
                f"pdflatex FAILED for validation report (rc={result.returncode}). "
                f"Last output:\n{tail}"
            )
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
