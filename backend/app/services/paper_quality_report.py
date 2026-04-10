"""Paper Quality Review report generator — PDF (LaTeX), TEX, MD, TXT.

Same sober academic template as the other reports. Output is suitable for
sharing with academic tutors as a personal scientific quality grading
of an already-published paper.
"""

from __future__ import annotations

import json
import logging
import subprocess
from datetime import datetime
from pathlib import Path

from app.config import settings
from app.models.paper import Paper
from app.models.paper_quality_review import PaperQualityReview
from app.services.app_settings import (
    KEY_PDF_AUTHOR_AFFILIATION,
    KEY_PDF_AUTHOR_SIGNATURE,
    get_setting_sync,
)
from app.services.review_templates import get_template

logger = logging.getLogger(__name__)


GRADE_LABELS: dict[str, str] = {
    "excellent":  "Excellent",
    "good":       "Good",
    "adequate":   "Adequate",
    "weak":       "Weak",
    "unreliable": "Unreliable",
}

GRADE_COLOR: dict[str, str] = {
    "excellent":  "darkgreen",
    "good":       "darkgreen",
    "adequate":   "orange",
    "weak":       "orange",
    "unreliable": "darkred",
}


def _esc(s: str | None) -> str:
    if not s:
        return ""
    return (
        s.replace("\\", "\\textbackslash{}")
        .replace("&", "\\&")
        .replace("%", "\\%")
        .replace("#", "\\#")
        .replace("_", "\\_")
        .replace("$", "\\$")
        .replace("{", "\\{")
        .replace("}", "\\}")
    )


def _parse_rubric(rubric_json: str | None) -> tuple[list[dict], dict]:
    if not rubric_json:
        return [], {}
    try:
        data = json.loads(rubric_json)
    except Exception:
        return [], {}
    if isinstance(data, dict):
        return data.get("items") or [], data.get("extras") or {}
    if isinstance(data, list):
        return data, {}
    return [], {}


# ---------- TXT export ----------

def build_txt(pr: PaperQualityReview, paper: Paper) -> str:
    template = get_template(pr.template_id)
    items, extras = _parse_rubric(pr.rubric_json)
    items_by_key = {(it.get("key") or it.get("dimension", "")).lower(): it for it in items}

    out: list[str] = []
    out.append("=" * 72)
    out.append("PAPER QUALITY ASSESSMENT")
    out.append("=" * 72)
    out.append("")
    out.append(f"Paper: {paper.title}")
    if paper.doi:
        out.append(f"DOI: {paper.doi}")
    if paper.journal:
        out.append(f"Journal: {paper.journal}")
    if paper.publication_date:
        out.append(f"Publication date: {paper.publication_date}")
    out.append(f"Assessment version: v{pr.version}")
    out.append(f"Assessment date: {datetime.utcnow().strftime('%Y-%m-%d')}")
    out.append("")

    grade_label = GRADE_LABELS.get(pr.overall_grade or "", "— not set —")
    out.append("-" * 72)
    score_str = f"{pr.overall_score}/5" if pr.overall_score else "—"
    out.append(f"OVERALL GRADE: {grade_label.upper()}    Score: {score_str}")
    out.append("-" * 72)
    out.append("")

    if pr.overall_assessment and pr.overall_assessment.strip():
        out.append("OVERALL ASSESSMENT")
        out.append("-" * 72)
        out.append(pr.overall_assessment.strip())
        out.append("")

    if template.dimensions:
        out.append("EVALUATION BY DIMENSION (1=Poor · 2=Fair · 3=Good · 4=Very good · 5=Excellent)")
        out.append("-" * 72)
        for dim in template.dimensions:
            it = items_by_key.get(dim.key.lower()) or items_by_key.get(dim.label.lower()) or {}
            sc = it.get("score")
            score_str = f"{sc}/5" if sc else "—"
            out.append(f"  {dim.label:<42s} {score_str}")
            comment = (it.get("comment") or "").strip()
            if comment:
                for cline in comment.splitlines():
                    out.append(f"      {cline}")
            out.append("")

    if template.extras:
        out.append("ADDITIONAL ASSESSMENT")
        out.append("-" * 72)
        for ex in template.extras:
            val = extras.get(ex.key)
            out.append(f"  {ex.label}")
            if val is None or val == "":
                out.append("      —")
            elif ex.type == "boolean":
                out.append(f"      {'Yes' if val in (True, 'true', 'yes', '1') else 'No'}")
            elif ex.type == "choice" and ex.choices:
                cm = {v: l for v, l in ex.choices}
                out.append(f"      {cm.get(str(val), str(val))}")
            elif ex.type == "text":
                for ln in str(val).splitlines():
                    out.append(f"      {ln}")
            else:
                out.append(f"      {val}")
            out.append("")

    sig = get_setting_sync(KEY_PDF_AUTHOR_SIGNATURE, "").strip()
    aff = get_setting_sync(KEY_PDF_AUTHOR_AFFILIATION, "").strip()
    out.append("-" * 72)
    if sig:
        line = f"Reviewer: {sig}"
        if aff:
            line += f" — {aff}"
        out.append(line)
    out.append(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    out.append("")
    return "\n".join(out)


# ---------- Markdown export ----------

def build_md(pr: PaperQualityReview, paper: Paper) -> str:
    template = get_template(pr.template_id)
    items, extras = _parse_rubric(pr.rubric_json)
    items_by_key = {(it.get("key") or it.get("dimension", "")).lower(): it for it in items}

    sig = get_setting_sync(KEY_PDF_AUTHOR_SIGNATURE, "").strip()
    aff = get_setting_sync(KEY_PDF_AUTHOR_AFFILIATION, "").strip()

    out: list[str] = []
    out.append(f"# Paper Quality Assessment")
    out.append("")
    out.append(f"**Paper:** {paper.title}")
    if paper.doi:
        out.append(f"**DOI:** {paper.doi}")
    if paper.journal:
        out.append(f"**Journal:** {paper.journal}")
    if paper.publication_date:
        out.append(f"**Publication date:** {paper.publication_date}")
    out.append(f"**Assessment version:** v{pr.version}")
    out.append(f"**Assessment date:** {datetime.utcnow().strftime('%Y-%m-%d')}")
    out.append("")
    out.append("---")
    out.append("")

    grade_label = GRADE_LABELS.get(pr.overall_grade or "", "— not set —")
    score_str = f"{pr.overall_score}/5" if pr.overall_score else "—"
    out.append(f"## Overall grade: **{grade_label}** — Score: **{score_str}**")
    out.append("")

    if pr.overall_assessment and pr.overall_assessment.strip():
        out.append("## Overall assessment")
        out.append("")
        out.append(pr.overall_assessment.strip())
        out.append("")

    if template.dimensions:
        out.append("## Evaluation by dimension")
        out.append("")
        out.append("*Rating scale: 1=Poor · 2=Fair · 3=Good · 4=Very good · 5=Excellent*")
        out.append("")
        out.append("| Dimension | Score | Comment |")
        out.append("|---|---|---|")
        for dim in template.dimensions:
            it = items_by_key.get(dim.key.lower()) or items_by_key.get(dim.label.lower()) or {}
            sc = it.get("score")
            sc_str = f"{sc}/5" if sc else "—"
            comment = (it.get("comment") or "").replace("\n", " ").replace("|", "\\|").strip()
            out.append(f"| {dim.label} | {sc_str} | {comment} |")
        out.append("")

    if template.extras:
        out.append("## Additional assessment")
        out.append("")
        for ex in template.extras:
            val = extras.get(ex.key)
            out.append(f"### {ex.label}")
            if val is None or val == "":
                out.append("> *— not set —*")
            elif ex.type == "boolean":
                out.append(f"**{'Yes' if val in (True, 'true', 'yes', '1') else 'No'}**")
            elif ex.type == "choice" and ex.choices:
                cm = {v: l for v, l in ex.choices}
                out.append(f"**{cm.get(str(val), str(val))}**")
            elif ex.type == "text":
                out.append(str(val))
            else:
                out.append(f"**{val}**")
            out.append("")

    out.append("---")
    if sig:
        line = f"*Reviewer: {sig}"
        if aff:
            line += f" — {aff}"
        line += "*"
        out.append(line)
    out.append(f"*Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*")
    out.append("")
    return "\n".join(out)


# ---------- LaTeX export ----------

def build_tex(pr: PaperQualityReview, paper: Paper) -> str:
    template = get_template(pr.template_id)
    items, extras = _parse_rubric(pr.rubric_json)
    items_by_key = {(it.get("key") or it.get("dimension", "")).lower(): it for it in items}

    sig = get_setting_sync(KEY_PDF_AUTHOR_SIGNATURE, "").strip()
    aff = get_setting_sync(KEY_PDF_AUTHOR_AFFILIATION, "").strip()
    generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    if sig:
        footer_line = f"Reviewer: {_esc(sig)}"
        if aff:
            footer_line += f" --- {_esc(aff)}"
        footer_line += f" \\quad\\textbar\\quad Generated by FL Research Monitor --- {generated_at}"
    else:
        footer_line = f"Generated by FL Research Monitor --- {generated_at}"

    grade_label = GRADE_LABELS.get(pr.overall_grade or "", "-- not set --")
    grade_color = GRADE_COLOR.get(pr.overall_grade or "", "gray")
    score_cell = f"{pr.overall_score}/5" if pr.overall_score else "--"

    # Rubric rows
    rubric_rows: list[str] = []
    for dim in template.dimensions:
        it = items_by_key.get(dim.key.lower()) or items_by_key.get(dim.label.lower()) or {}
        sc = it.get("score")
        sc_cell = f"{sc}/5" if sc else "--"
        comment = _esc((it.get("comment") or "").replace("\n", " \\newline "))
        rubric_rows.append(f"{_esc(dim.label)} & {sc_cell} & {comment} \\\\\n")

    # Extras
    extras_block = ""
    if template.extras:
        rows = []
        for ex in template.extras:
            val = extras.get(ex.key)
            if val is None or val == "":
                rendered = "--"
            elif ex.type == "boolean":
                rendered = "Yes" if val in (True, "true", "yes", "1") else "No"
            elif ex.type == "choice" and ex.choices:
                cm = {v: l for v, l in ex.choices}
                rendered = cm.get(str(val), str(val))
            elif ex.type == "text":
                rendered = str(val)
            else:
                rendered = str(val)
            rows.append(f"{_esc(ex.label)} & {_esc(rendered)} \\\\\n")
        if rows:
            extras_block = (
                "\\subsection*{Additional Assessment}\n"
                "\\noindent\\begin{tabularx}{\\linewidth}{@{}p{6.5cm}X@{}}\n"
                "\\hline\n"
                + "".join(rows)
                + "\\hline\n"
                "\\end{tabularx}\n"
                "\\vspace{0.6em}\n\n"
            )

    overall_block = ""
    if pr.overall_assessment and pr.overall_assessment.strip():
        content = _esc(pr.overall_assessment).replace("\n", " \\newline ")
        overall_block = (
            "\\subsection*{Overall Assessment}\n"
            f"\\noindent {content}\n"
            "\\vspace{0.6em}\n\n"
        )

    rubric_block = ""
    if template.dimensions:
        rubric_block = (
            "\\subsection*{Evaluation by Dimension}\n"
            "\\noindent{\\footnotesize\\textit{Rating scale: 1=Poor $\\cdot$ 2=Fair $\\cdot$ 3=Good $\\cdot$ 4=Very good $\\cdot$ 5=Excellent}}\n"
            "\\vspace{0.2em}\n\n"
            "\\noindent\\begin{tabularx}{\\linewidth}{@{}p{5.4cm}p{1.2cm}X@{}}\n"
            "\\hline\n"
            "\\textbf{Dimension} & \\textbf{Score} & \\textbf{Comment} \\\\\n"
            "\\hline\n"
            + "".join(rubric_rows)
            + "\\hline\n"
            "\\end{tabularx}\n"
            "\\vspace{0.8em}\n"
        )

    journal_line_parts = []
    if paper.doi:
        journal_line_parts.append(f"DOI: {_esc(paper.doi)}")
    if paper.journal:
        journal_line_parts.append(_esc(paper.journal))
    if paper.publication_date:
        journal_line_parts.append(_esc(paper.publication_date))
    journal_line = " \\quad\\textbar\\quad ".join(journal_line_parts)

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
\\newcommand{{\\newline}}{{\\\\}}

\\begin{{document}}

\\begin{{center}}
{{\\Large\\bfseries\\scshape Paper Quality Assessment}}\\\\[1em]
{{\\large {_esc(paper.title)}}}\\\\[0.4em]
{{\\small {journal_line}}}
\\end{{center}}

\\vspace{{1em}}
\\hrule
\\vspace{{1em}}

\\noindent\\begin{{tabularx}}{{\\linewidth}}{{@{{}}p{{3.5cm}}X@{{}}}}
\\textbf{{Overall grade}}  & \\textcolor{{{grade_color}}}{{\\textbf{{{grade_label.upper()}}}}} \\\\
\\textbf{{Overall score}}  & {score_cell} \\\\
\\textbf{{Version}}        & v{pr.version} \\\\
\\textbf{{Date}}           & {datetime.utcnow().strftime("%Y-%m-%d")} \\\\
\\end{{tabularx}}

\\vspace{{0.8em}}

{overall_block}
{rubric_block}
{extras_block}

\\vfill
\\hrule
\\vspace{{0.4em}}
{{\\footnotesize\\textcolor{{gray}}{{{footer_line}}}}}

\\end{{document}}
"""
    return tex


# ---------- Generate all four formats ----------

def generate_review_artifacts(pr: PaperQualityReview, paper: Paper) -> dict:
    reports_dir = Path(settings.reports_path) / "paper-quality"
    reports_dir.mkdir(parents=True, exist_ok=True)

    basename = f"paper_quality_{paper.id}_v{pr.version}"
    tex_path = reports_dir / f"{basename}.tex"
    pdf_path = reports_dir / f"{basename}.pdf"
    txt_path = reports_dir / f"{basename}.txt"
    md_path  = reports_dir / f"{basename}.md"

    txt_path.write_text(build_txt(pr, paper), encoding="utf-8")
    md_path.write_text(build_md(pr, paper), encoding="utf-8")
    tex_path.write_text(build_tex(pr, paper), encoding="utf-8")

    if pdf_path.exists():
        try:
            pdf_path.unlink()
        except OSError:
            pass

    pdf_result: Path | None = None
    try:
        result = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", tex_path.name],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(tex_path.parent),
        )
        if pdf_path.exists() and pdf_path.stat().st_size > 0:
            for ext in [".aux", ".log", ".out"]:
                aux = tex_path.with_suffix(ext)
                if aux.exists():
                    aux.unlink()
            pdf_result = pdf_path
        else:
            tail = "\n".join((result.stdout or "").splitlines()[-30:])
            logger.error(f"pdflatex FAILED for paper-quality {pr.id} (rc={result.returncode}): {tail}")
    except Exception as e:
        logger.error(f"Paper quality PDF generation error: {e}")

    return {"pdf": pdf_result, "tex": tex_path, "md": md_path, "txt": txt_path}
