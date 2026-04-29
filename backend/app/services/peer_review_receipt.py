"""Submission Receipt generator for peer reviews.

Produces a single-page PDF (plus TXT) attesting the exact state of a peer
review at submission time:
- Manuscript + reviewer metadata
- Submission timestamp (editable by caller — caller can backdate)
- Recommendation
- SHA-256 hash of the canonicalised review payload (rubric + comments + recommendation)

The receipt is saved into the peer-review attachments folder so that future
modifications to the underlying review do not invalidate the historical record.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import subprocess
from datetime import datetime
from pathlib import Path

from app.models.peer_review import PeerReview
from app.services.review_templates import get_template

logger = logging.getLogger(__name__)


# ---------- Canonical hash ----------

def compute_review_hash(pr: PeerReview) -> str:
    """SHA-256 over a deterministic JSON serialisation of the review payload.

    Sort keys + UTF-8 + no whitespace ensures the same logical review always
    yields the same hash regardless of insertion order or formatting.
    """
    payload = {
        "manuscript_id": pr.manuscript_id or "",
        "title": pr.title or "",
        "template_id": pr.template_id or "",
        "rubric": json.loads(pr.rubric_json) if pr.rubric_json else {},
        "comments_to_authors": pr.comments_to_authors or "",
        "confidential_comments": pr.confidential_comments or "",
        "recommendation": pr.recommendation or "",
    }
    canon = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


# ---------- LaTeX escape helper ----------

def _esc(s: str | None) -> str:
    if not s:
        return ""
    return (
        s.replace("\\", "\\textbackslash{}")
         .replace("&", "\\&")
         .replace("%", "\\%")
         .replace("$", "\\$")
         .replace("#", "\\#")
         .replace("_", "\\_")
         .replace("{", "\\{")
         .replace("}", "\\}")
         .replace("~", "\\textasciitilde{}")
         .replace("^", "\\^{}")
    )


def _safe_filename_token(s: str) -> str:
    """Sanitise a manuscript ID for use in a filename — keep alphanumeric, '-' and '_'."""
    return re.sub(r"[^A-Za-z0-9_\-]", "_", s or "review")


# ---------- TeX build ----------

def build_receipt_tex(pr: PeerReview, submitted_at: datetime, content_hash: str) -> str:
    template = get_template(pr.template_id)
    rec_labels = {v: l for v, l in template.recommendations}
    rec_label = rec_labels.get(pr.recommendation or "", "— not set —")
    rec_color = {
        "accept": "darkgreen",
        "minor_revision": "darkgreen",
        "major_revision": "orange",
        "reject_resubmit": "orange",
        "reject": "darkred",
    }.get(pr.recommendation or "", "gray")

    # Pretty-print the hash in 8-char groups for readability
    pretty_hash = " ".join(content_hash[i:i + 8] for i in range(0, len(content_hash), 8))

    submitted_str = submitted_at.strftime("%Y-%m-%d %H:%M:%S UTC")
    generated_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    return f"""\\documentclass[11pt,a4paper]{{article}}
\\usepackage[utf8]{{inputenc}}
\\usepackage[T1]{{fontenc}}
\\usepackage[english]{{babel}}
\\usepackage{{geometry}}
\\geometry{{a4paper,top=2.4cm,bottom=2.4cm,left=2.6cm,right=2.6cm}}
\\usepackage{{lmodern}}
\\usepackage{{microtype}}
\\usepackage{{xcolor}}
\\usepackage{{titlesec}}
\\usepackage{{tabularx}}
\\usepackage{{booktabs}}
\\usepackage{{fancyhdr}}

\\definecolor{{darkgreen}}{{RGB}}{{0,120,0}}
\\definecolor{{darkred}}{{RGB}}{{180,0,0}}
\\definecolor{{orange}}{{RGB}}{{220,120,0}}
\\definecolor{{ieeeblue}}{{RGB}}{{0,60,120}}

\\setcounter{{secnumdepth}}{{0}}
\\setlength{{\\parskip}}{{0.4em}}
\\setlength{{\\parindent}}{{0pt}}

\\pagestyle{{fancy}}
\\fancyhf{{}}
\\fancyhead[L]{{\\footnotesize\\textsc{{Submission Receipt}}}}
\\fancyhead[R]{{\\footnotesize\\textsc{{Peer Review {_esc(str(pr.id))}}}}}
\\fancyfoot[C]{{\\footnotesize\\thepage}}
\\renewcommand{{\\headrulewidth}}{{0.4pt}}

\\begin{{document}}

\\begin{{center}}
{{\\Large\\bfseries\\scshape\\color{{ieeeblue}} Peer Review --- Submission Receipt}}\\\\[0.4em]
{{\\normalsize\\scshape {_esc(template.journal)}}}
\\end{{center}}

\\vspace{{0.6em}}\\hrule\\vspace{{0.8em}}

\\subsection*{{Manuscript}}
\\noindent\\begin{{tabularx}}{{\\linewidth}}{{@{{}}p{{4.0cm}}X@{{}}}}
\\textbf{{Manuscript ID}}    & {_esc(pr.manuscript_id) or "--"} \\\\
\\textbf{{Title}}            & {_esc(pr.title) or "--"} \\\\
\\textbf{{Target journal}}   & {_esc(pr.target_journal) or _esc(template.journal)} \\\\
\\textbf{{Template}}         & {_esc(template.name)} \\\\
\\end{{tabularx}}

\\subsection*{{Submission}}
\\noindent\\begin{{tabularx}}{{\\linewidth}}{{@{{}}p{{4.0cm}}X@{{}}}}
\\textbf{{Submitted at}}     & \\textbf{{{submitted_str}}} \\\\
\\textbf{{Recommendation}}   & \\textcolor{{{rec_color}}}{{\\textbf{{{rec_label}}}}} \\\\
\\textbf{{Receipt generated}} & {generated_str} \\\\
\\end{{tabularx}}

\\subsection*{{Integrity Hash}}
\\noindent The SHA-256 hash below is computed over a canonical JSON serialisation of the review payload (rubric, comments to authors, confidential comments, recommendation, manuscript ID, title, template). Any subsequent change to the review fields will yield a different hash, allowing post-hoc verification of the submitted state.

\\vspace{{0.4em}}
\\noindent\\fbox{{\\parbox{{0.96\\linewidth}}{{
\\centering\\ttfamily\\small {pretty_hash}
}}}}

\\subsection*{{Attestation}}
\\noindent The reviewer attests that the review identified by the hash above was submitted on the date and time stated, with the recommendation indicated. This receipt is intended for archival and audit purposes (proof of timely submission, dispute resolution, longitudinal tracking of reviewer activity). It is automatically generated by ResMon at the moment the review status transitioned to {{\\itshape submitted}}, and is preserved as an immutable attachment of the peer review record.

\\vfill
\\hrule\\vspace{{0.4em}}
{{\\footnotesize\\textcolor{{gray}}{{ResMon --- {_esc(template.journal)} --- Peer Review {pr.id} --- Receipt generated {generated_str}}}}}

\\end{{document}}
"""


def build_receipt_txt(pr: PeerReview, submitted_at: datetime, content_hash: str) -> str:
    template = get_template(pr.template_id)
    rec_labels = {v: l for v, l in template.recommendations}
    rec_label = rec_labels.get(pr.recommendation or "", "(not set)")
    pretty_hash = " ".join(content_hash[i:i + 8] for i in range(0, len(content_hash), 8))
    return f"""PEER REVIEW --- SUBMISSION RECEIPT
{template.journal}
================================================================

MANUSCRIPT
  Manuscript ID    : {pr.manuscript_id or '--'}
  Title            : {pr.title or '--'}
  Target journal   : {pr.target_journal or template.journal}
  Template         : {template.name}

SUBMISSION
  Submitted at     : {submitted_at.strftime('%Y-%m-%d %H:%M:%S UTC')}
  Recommendation   : {rec_label}
  Receipt generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}

INTEGRITY HASH (SHA-256)
  {pretty_hash}

================================================================
This receipt is generated by ResMon at the moment the peer review
transitioned to status `submitted`. The hash is computed over a
canonical JSON of the review payload (rubric + comments to authors
+ confidential comments + recommendation + manuscript metadata).
Any subsequent edit to those fields will yield a different hash.
================================================================
"""


# ---------- Generate ----------

def generate_submission_receipt(
    pr: PeerReview,
    *,
    submitted_at: datetime | None = None,
    output_dir: Path,
) -> dict:
    """Generate the receipt as PDF + TXT in `output_dir`. Returns a dict
    with the file paths and the content hash. PDF compilation is best-effort
    — TXT is always produced.
    """
    submitted_at = submitted_at or datetime.utcnow()
    content_hash = compute_review_hash(pr)

    output_dir.mkdir(parents=True, exist_ok=True)
    ts_token = submitted_at.strftime("%Y%m%d-%H%M%S")
    msid_token = _safe_filename_token(pr.manuscript_id or f"PR{pr.id}")
    basename = f"SubmissionReceipt_{msid_token}_{ts_token}"

    txt_path = output_dir / f"{basename}.txt"
    tex_path = output_dir / f"{basename}.tex"
    pdf_path = output_dir / f"{basename}.pdf"

    txt_path.write_text(build_receipt_txt(pr, submitted_at, content_hash), encoding="utf-8")
    tex_path.write_text(build_receipt_tex(pr, submitted_at, content_hash), encoding="utf-8")

    # Compile PDF (best-effort — fall through on failure, txt+tex remain)
    try:
        result = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", tex_path.name],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(tex_path.parent),
        )
        if not (pdf_path.exists() and pdf_path.stat().st_size > 0):
            tail = "\n".join((result.stdout or "").splitlines()[-30:])
            logger.warning(f"Submission receipt pdflatex failed for pr {pr.id}: rc={result.returncode}\n{tail}")
        # Cleanup auxiliary files
        for ext in (".aux", ".log", ".out"):
            aux = tex_path.with_suffix(ext)
            if aux.exists():
                aux.unlink()
    except Exception as e:
        logger.warning(f"Submission receipt pdflatex error for pr {pr.id}: {e}")

    return {
        "txt": txt_path,
        "tex": tex_path,
        "pdf": pdf_path if pdf_path.exists() else None,
        "hash": content_hash,
        "submitted_at": submitted_at,
        "basename": basename,
    }
