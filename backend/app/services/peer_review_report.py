"""Peer review report generator — PDF (LaTeX) and plain-text formats.

Produces a formal reviewer report suitable for:
    - sharing with the journal editor (PDF)
    - copy-pasting into journal submission systems (TXT)
"""

import json
import logging
import re
import subprocess
from datetime import datetime
from pathlib import Path

from app.config import settings
from app.models.peer_review import PeerReview
from app.services.app_settings import (
    KEY_PDF_AUTHOR_AFFILIATION,
    KEY_PDF_AUTHOR_SIGNATURE,
    get_setting_sync,
)
from app.services.review_templates import get_template

logger = logging.getLogger(__name__)


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
    """Return (items, extras) from the stored rubric payload."""
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

def build_txt(pr: PeerReview) -> str:
    """Plain-text review report, suitable for pasting into journal systems."""
    template = get_template(pr.template_id)
    items, extras = _parse_rubric(pr.rubric_json)
    # Index stored items by key (fallback: by dimension label) so we can match
    # each template dimension with its saved score/comment.
    items_by_key = {(it.get("key") or it.get("dimension", "")).lower(): it for it in items}

    rec_labels = {v: l for v, l in template.recommendations}

    lines: list[str] = []
    lines.append("=" * 72)
    lines.append(f"PEER REVIEW REPORT  —  {template.name.upper()}")
    lines.append(f"{template.journal}")
    lines.append("=" * 72)
    lines.append("")
    lines.append(f"Manuscript: {pr.title}")
    if pr.authors:
        lines.append(f"Authors: {pr.authors}")
    if pr.target_journal:
        lines.append(f"Journal: {pr.target_journal}")
    if pr.manuscript_id:
        lines.append(f"Manuscript ID: {pr.manuscript_id}")
    if pr.reviewer_role:
        lines.append(f"Reviewer role: {pr.reviewer_role}")
    lines.append(f"Review date: {datetime.utcnow().strftime('%Y-%m-%d')}")
    lines.append("")

    # Recommendation
    rec_label = rec_labels.get(pr.recommendation or "", pr.recommendation or "— not set —")
    lines.append("-" * 72)
    lines.append(f"RECOMMENDATION: {rec_label.upper()}")
    lines.append("-" * 72)
    lines.append("")

    # Extras (verbosity, novelty, references, etc.) — rendered before the rubric
    if template.extras:
        lines.append("REVIEWER ASSESSMENT")
        lines.append("-" * 72)
        for ex in template.extras:
            val = extras.get(ex.key)
            lines.append(f"  {ex.label}")
            if val is None or val == "":
                lines.append("      —")
            elif ex.type == "boolean":
                rendered = "Yes" if val in (True, "true", "yes", "1") else "No"
                lines.append(f"      {rendered}")
            elif ex.type == "choice" and ex.choices:
                choice_map = {v: l for v, l in ex.choices}
                lines.append(f"      {choice_map.get(str(val), str(val))}")
            elif ex.type == "text":
                # Indent each line of the free-text answer
                for cline in str(val).splitlines():
                    lines.append(f"      {cline}")
            else:
                lines.append(f"      {val}")
            lines.append("")

    # Rubric scores — only if the template defines numeric dimensions
    if template.dimensions:
        lines.append("EVALUATION BY DIMENSION (1=Poor · 2=Fair · 3=Good · 4=Very good · 5=Excellent)")
        lines.append("-" * 72)
        for dim in template.dimensions:
            it = items_by_key.get(dim.key.lower()) or items_by_key.get(dim.label.lower()) or {}
            sc = it.get("score")
            score_str = f"{sc}/5" if sc else "—"
            lines.append(f"  {dim.label:<40s} {score_str}")
            comment = (it.get("comment") or "").strip()
            if comment:
                for cline in comment.splitlines():
                    lines.append(f"      {cline}")
            lines.append("")

    # Comments to authors
    if pr.comments_to_authors and pr.comments_to_authors.strip():
        lines.append("=" * 72)
        lines.append("COMMENTS TO AUTHORS")
        lines.append("=" * 72)
        lines.append("")
        lines.append(pr.comments_to_authors.strip())
        lines.append("")

    # Confidential comments to editor
    if pr.confidential_comments and pr.confidential_comments.strip():
        lines.append("=" * 72)
        lines.append("CONFIDENTIAL COMMENTS TO EDITOR")
        lines.append("(not visible to authors)")
        lines.append("=" * 72)
        lines.append("")
        lines.append(pr.confidential_comments.strip())
        lines.append("")

    # Footer
    sig = get_setting_sync(KEY_PDF_AUTHOR_SIGNATURE, "").strip()
    aff = get_setting_sync(KEY_PDF_AUTHOR_AFFILIATION, "").strip()
    lines.append("-" * 72)
    if sig:
        lines.append(f"Reviewer: {sig}" + (f" — {aff}" if aff else ""))
    lines.append(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")

    return "\n".join(lines)


# ---------- LaTeX / PDF export ----------

# ---------- Markdown export ----------

def build_md(pr: PeerReview) -> str:
    """Markdown export — same content as TXT but in proper Markdown."""
    template = get_template(pr.template_id)
    items, extras = _parse_rubric(pr.rubric_json)
    items_by_key = {(it.get("key") or it.get("dimension", "")).lower(): it for it in items}
    rec_labels = {v: l for v, l in template.recommendations}
    sig = get_setting_sync(KEY_PDF_AUTHOR_SIGNATURE, "").strip()
    aff = get_setting_sync(KEY_PDF_AUTHOR_AFFILIATION, "").strip()

    out: list[str] = []
    out.append(f"# Peer Review Report — {template.name}")
    out.append(f"*{template.journal}*")
    out.append("")
    out.append(f"**Manuscript:** {pr.title}")
    if pr.authors:
        out.append(f"**Authors:** {pr.authors}")
    if pr.target_journal:
        out.append(f"**Journal:** {pr.target_journal}")
    if pr.manuscript_id:
        out.append(f"**Manuscript ID:** {pr.manuscript_id}")
    if pr.reviewer_role:
        out.append(f"**Reviewer role:** {pr.reviewer_role}")
    out.append(f"**Review date:** {datetime.utcnow().strftime('%Y-%m-%d')}")
    out.append("")
    out.append("---")
    out.append("")

    rec_label = rec_labels.get(pr.recommendation or "", pr.recommendation or "— not set —")
    out.append(f"## Recommendation: **{rec_label}**")
    out.append("")

    if template.extras:
        out.append("## Reviewer Assessment")
        out.append("")
        for ex in template.extras:
            val = extras.get(ex.key)
            out.append(f"### {ex.label}")
            if val is None or val == "":
                out.append("> *— not set —*")
            elif ex.type == "boolean":
                out.append(f"**{'Yes' if val in (True, 'true', 'yes', '1') else 'No'}**")
            elif ex.type == "choice" and ex.choices:
                choice_map = {v: l for v, l in ex.choices}
                out.append(f"**{choice_map.get(str(val), str(val))}**")
            elif ex.type == "text":
                out.append(str(val))
            else:
                out.append(f"**{val}**")
            out.append("")

    if template.dimensions:
        out.append("## Evaluation by Dimension")
        out.append("")
        out.append("*Rating scale: 1=Poor · 2=Fair · 3=Good · 4=Very good · 5=Excellent*")
        out.append("")
        out.append("| Dimension | Score | Comment |")
        out.append("|---|---|---|")
        for dim in template.dimensions:
            it = items_by_key.get(dim.key.lower()) or items_by_key.get(dim.label.lower()) or {}
            sc = it.get("score")
            score_str = f"{sc}/5" if sc else "—"
            comment = (it.get("comment") or "").replace("\n", " ").replace("|", "\\|").strip()
            out.append(f"| {dim.label} | {score_str} | {comment} |")
        out.append("")

    if pr.comments_to_authors and pr.comments_to_authors.strip():
        out.append("## Comments to Authors")
        out.append("")
        out.append(pr.comments_to_authors.strip())
        out.append("")

    if pr.confidential_comments and pr.confidential_comments.strip():
        out.append("## Confidential Comments to Editor")
        out.append("*(not visible to authors)*")
        out.append("")
        out.append(pr.confidential_comments.strip())
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


def _rubric_block(template, rubric_rows: list[str]) -> str:
    """Render the 1-5 rubric table only when the template defines dimensions."""
    if not template.dimensions:
        return ""
    return (
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


def build_tex(pr: PeerReview) -> str:
    template = get_template(pr.template_id)
    items, extras = _parse_rubric(pr.rubric_json)
    items_by_key = {(it.get("key") or it.get("dimension", "")).lower(): it for it in items}

    sig = get_setting_sync(KEY_PDF_AUTHOR_SIGNATURE, "").strip()
    aff = get_setting_sync(KEY_PDF_AUTHOR_AFFILIATION, "").strip()
    generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    if sig:
        footer_line = f"Reviewer: {_esc(sig)}" + (f" --- {_esc(aff)}" if aff else "")
        footer_line += f" \\quad\\textbar\\quad Generated by FL Research Monitor --- {generated_at}"
    else:
        footer_line = f"Generated by FL Research Monitor --- {generated_at}"

    rec_labels = {v: l for v, l in template.recommendations}
    rec_label = rec_labels.get(pr.recommendation or "", "— not set —")
    rec_color = {
        "accept": "darkgreen",
        "minor_revision": "darkgreen",
        "major_revision": "orange",
        "reject_resubmit": "orange",
        "reject": "darkred",
    }.get(pr.recommendation or "", "gray")

    # Build rubric rows from template order (stable layout regardless of storage order)
    rubric_rows: list[str] = []
    for dim in template.dimensions:
        it = items_by_key.get(dim.key.lower()) or items_by_key.get(dim.label.lower()) or {}
        sc = it.get("score")
        score_cell = f"{sc}/5" if sc else "--"
        comment = _esc((it.get("comment") or "").replace("\n", " \\newline "))
        rubric_rows.append(f"{_esc(dim.label)} & {score_cell} & {comment} \\\\\n")

    # Build extras block. Mixes a tabular for short answers (boolean/choice) and
    # a free-form block per text field, so long suggested-references entries flow
    # naturally over multiple lines.
    extras_block = ""
    if template.extras:
        rows = []
        text_blocks: list[str] = []
        for ex in template.extras:
            val = extras.get(ex.key)
            if ex.type == "text":
                txt = (str(val).strip() if val else "")
                if not txt:
                    txt = "--"
                content = _esc(txt).replace("\n", " \\newline ")
                text_blocks.append(
                    f"\\subsection*{{{_esc(ex.label)}}}\n"
                    f"\\noindent {content}\n"
                    f"\\vspace{{0.4em}}\n\n"
                )
            else:
                if val is None or val == "":
                    rendered = "--"
                elif ex.type == "boolean":
                    rendered = "Yes" if val in (True, "true", "yes", "1") else "No"
                elif ex.type == "choice" and ex.choices:
                    choice_map = {v: l for v, l in ex.choices}
                    rendered = choice_map.get(str(val), str(val))
                else:
                    rendered = str(val)
                rows.append(f"{_esc(ex.label)} & {_esc(rendered)} \\\\\n")
        if rows:
            extras_block += (
                "\\subsection*{Reviewer Assessment}\n"
                "\\noindent\\begin{tabularx}{\\linewidth}{@{}X p{4.0cm}@{}}\n"
                "\\hline\n"
                + "".join(rows)
                + "\\hline\n"
                "\\end{tabularx}\n"
                "\\vspace{0.6em}\n\n"
            )
        extras_block += "".join(text_blocks)

    # Body sections
    def _text_block(title: str, content: str | None) -> str:
        if not content or not content.strip():
            return ""
        # Preserve line breaks via \\
        esc_content = _esc(content).replace("\n", " \\newline ")
        return (
            f"\\subsection*{{{title}}}\n"
            f"\\noindent {esc_content}\n"
            f"\\vspace{{0.6em}}\n\n"
        )

    authors_line = f"{{\\normalsize {_esc(pr.authors)}}}\\\\[0.4em]" if pr.authors else ""
    journal_line_parts = []
    if pr.target_journal:
        journal_line_parts.append(f"Journal: {_esc(pr.target_journal)}")
    if pr.manuscript_id:
        journal_line_parts.append(f"ID: {_esc(pr.manuscript_id)}")
    if pr.reviewer_role:
        journal_line_parts.append(_esc(pr.reviewer_role))
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
{{\\Large\\bfseries\\scshape Peer Review Report}}\\\\[0.3em]
{{\\normalsize\\scshape {_esc(template.journal)}}}\\\\[1em]
{{\\large {_esc(pr.title)}}}\\\\[0.4em]
{authors_line}
{{\\small {journal_line}}}
\\end{{center}}

\\vspace{{1em}}
\\hrule
\\vspace{{1em}}

\\noindent\\begin{{tabularx}}{{\\linewidth}}{{@{{}}p{{3.5cm}}X@{{}}}}
\\textbf{{Recommendation}} & \\textcolor{{{rec_color}}}{{\\textbf{{{rec_label.upper()}}}}} \\\\
\\textbf{{Review date}}    & {datetime.utcnow().strftime("%Y-%m-%d")} \\\\
\\end{{tabularx}}

\\vspace{{0.8em}}

{extras_block}
{_rubric_block(template, rubric_rows)}

{_text_block("Comments to Authors", pr.comments_to_authors)}
{_text_block("Confidential Comments to Editor", pr.confidential_comments)}

\\vfill
\\hrule
\\vspace{{0.4em}}
{{\\footnotesize\\textcolor{{gray}}{{{footer_line}}}}}

\\end{{document}}
"""
    return tex


def generate_review_artifacts(pr: PeerReview) -> dict:
    """Generate (or refresh) all four formats: PDF, TEX, MD, TXT.

    All formats are kept synchronized on every call — single source of truth is
    the database state of the PeerReview row. Returns a dict with the four
    Path | None values keyed by format.
    """
    reports_dir = Path(settings.reports_path) / "peer-review"
    reports_dir.mkdir(parents=True, exist_ok=True)

    basename = f"peer_review_{pr.id}"
    tex_path = reports_dir / f"{basename}.tex"
    pdf_path = reports_dir / f"{basename}.pdf"
    txt_path = reports_dir / f"{basename}.txt"
    md_path  = reports_dir / f"{basename}.md"

    # TXT and MD first (fast, always succeed)
    txt_path.write_text(build_txt(pr), encoding="utf-8")
    md_path.write_text(build_md(pr), encoding="utf-8")

    # LaTeX source — always saved, even if pdflatex compile fails afterwards
    tex_path.write_text(build_tex(pr), encoding="utf-8")

    # Remove stale PDF before compile
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
            logger.error(f"pdflatex FAILED for peer review {pr.id} (rc={result.returncode}): {tail}")
    except Exception as e:
        logger.error(f"Peer review PDF generation error: {e}")

    return {
        "pdf": pdf_result,
        "tex": tex_path,
        "md":  md_path,
        "txt": txt_path,
    }
