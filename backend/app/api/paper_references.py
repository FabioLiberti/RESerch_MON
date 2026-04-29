"""Paper References API — manage bibliography links between manuscripts and cited papers."""

import json as _json
import logging
import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.database import get_db
from app.models.paper import Author, Paper, PaperAuthor
from app.models.paper_reference import PaperReference
from app.models.label import Label, PaperLabel
from app.models.user import User
from app.services.context_parser import CONTEXT_KEYS, detect_contexts

logger = logging.getLogger(__name__)

router = APIRouter()


class AddReferenceRequest(BaseModel):
    cited_paper_id: int
    context: str | None = None
    contexts: list[str] | None = None
    note: str | None = None
    citations_map: str | None = None


class UpdateReferenceRequest(BaseModel):
    context: str | None = None
    contexts: list[str] | None = None
    note: str | None = None
    citations_map: str | None = None


def _serialize_contexts(values: list[str] | None) -> str | None:
    if not values:
        return None
    cleaned = [v for v in values if v in CONTEXT_KEYS]
    if not cleaned:
        return None
    # de-duplicate while preserving order
    seen: set[str] = set()
    unique = [v for v in cleaned if not (v in seen or seen.add(v))]
    return _json.dumps(unique)


def _parse_contexts(raw: str | None, fallback_single: str | None) -> list[str]:
    if raw:
        try:
            v = _json.loads(raw)
            if isinstance(v, list):
                return [c for c in v if c in CONTEXT_KEYS]
        except Exception:
            pass
    if fallback_single and fallback_single in CONTEXT_KEYS:
        return [fallback_single]
    return []


CONTEXT_LABELS = {
    "introduction": "Introduction",
    "related_work": "Related Work",
    "methodology": "Methodology",
    "comparison": "Comparison / Baseline",
    "results": "Results",
    "discussion": "Discussion",
    "other": "Other",
}


# ---------- BibTeX helpers ----------

_BIB_ENTRY_TYPE = {
    "journal_article": "article",
    "review": "article",
    "preprint": "misc",
    "conference": "inproceedings",
    "extended_abstract": "inproceedings",
    "full_paper": "inproceedings",
    "camera_ready": "inproceedings",
    "poster": "inproceedings",
    "report": "techreport",
    "guideline": "techreport",
    "white_paper": "techreport",
    "standard": "techreport",
    "manuscript": "unpublished",
}

# Short stop-words to skip when picking the "first significant word" of a title
# for the citation key. Standard set used by most Harvard/APA auto-keyers.
_BIB_KEY_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "of", "on", "in", "at", "to", "for",
    "from", "by", "with", "as", "is", "are", "was", "were", "be", "been",
    "this", "that", "these", "those", "it", "its", "into",
}


def _ascii_fold(s: str) -> str:
    """Lowercase + strip diacritics for a deterministic BibTeX key."""
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFKD", s)
    folded = "".join(c for c in nfkd if not unicodedata.combining(c))
    return folded.lower()


def _author_lastname(raw_name: str | None) -> str | None:
    """Extract the last name (best-effort) from a free-form author string.

    Handles:
      "Nguyen, Dinh C."      -> "nguyen"
      "Dinh C. Nguyen"       -> "nguyen"
      "World Health Org..."  -> "world"  (institutional — caller may override)
    """
    if not raw_name:
        return None
    name = raw_name.strip()
    if "," in name:
        surname = name.split(",", 1)[0].strip()
    else:
        parts = name.split()
        surname = parts[-1] if parts else name
    key = _ascii_fold(surname)
    key = re.sub(r"[^a-z]", "", key)
    return key or None


def _first_significant_word(title: str | None) -> str | None:
    """First non-stopword token from the title, lowercased + ASCII-folded."""
    if not title:
        return None
    tokens = re.split(r"\W+", _ascii_fold(title))
    for tok in tokens:
        if tok and len(tok) > 2 and tok not in _BIB_KEY_STOPWORDS:
            return tok
    return tokens[0] if tokens and tokens[0] else None


# Institutional-author heuristic keywords. Only wrap a name in the
# BibTeX "group" braces `{...}` when it explicitly contains one of these
# (too permissive heuristics misclassify names like "Syed Raza Abbas").
_INSTITUTIONAL_KEYWORDS = (
    "organization", "office", "institute", "university", "society",
    "federation", "commission", "ministry", "council", "committee",
    "agency", "association", "department", "foundation", "centre",
    "center", "bureau", "authority", "observatory", "network",
)


def _format_bibtex_author(names: list[str]) -> str:
    """Format a list of author strings as a single BibTeX `author` value.

    - Individual authors: "Last, First Middle" preserved (BibTeX standard).
    - Institutional authors (contain institutional keywords like "Organization",
      "Office", etc.) wrapped in `{...}` so BibTeX parsers treat them as one
      opaque token rather than trying to split into "Last, First".
    """
    out: list[str] = []
    for n in names:
        n = (n or "").strip()
        if not n:
            continue
        low = n.lower()
        is_institutional = any(kw in low for kw in _INSTITUTIONAL_KEYWORDS)
        out.append(f"{{{n}}}" if is_institutional else n)
    return " and ".join(out)


def _escape_bibtex(value: str | None) -> str:
    """Minimal escaping for values going inside `{ ... }` braces.

    Note: we intentionally do NOT escape `{` / `}` here — those are
    load-bearing in BibTeX (institutional author grouping, math mode, etc.).
    Pre-formatted values from `_format_bibtex_author` can therefore pass
    through verbatim.
    """
    if not value:
        return ""
    return value.replace("\\", "\\\\")


def _build_bibtex_entry(
    entry_type: str,
    key: str,
    fields: list[tuple[str, str | None]],
) -> str:
    """Assemble a BibTeX entry block. Skips fields with falsy values."""
    lines = [f"@{entry_type}{{{key},"]
    kept = [(k, v) for k, v in fields if v]
    for i, (k, v) in enumerate(kept):
        comma = "," if i < len(kept) - 1 else ""
        lines.append(f"  {k:<12} = {{{_escape_bibtex(v)}}}{comma}")
    lines.append("}")
    return "\n".join(lines)


# ---------- Harvard plain-text helpers ----------


def _name_to_harvard(raw: str | None) -> str:
    """Convert an author name to Harvard style: 'Surname, I.N.'

    Examples:
      'Nguyen, Dinh C.'     -> 'Nguyen, D.C.'
      'Dinh C. Nguyen'      -> 'Nguyen, D.C.'
      'World Health Org...' -> 'World Health Organization...'  (institutional, verbatim)
    """
    if not raw:
        return ""
    name = raw.strip()
    if not name:
        return ""
    low = name.lower()
    # Institutional authors: keep verbatim (no surname/initials split)
    if any(kw in low for kw in _INSTITUTIONAL_KEYWORDS):
        return name

    if "," in name:
        last, rest = name.split(",", 1)
        first_parts = rest.strip().split()
    else:
        parts = name.split()
        if not parts:
            return name
        last = parts[-1]
        first_parts = parts[:-1]

    initials_parts: list[str] = []
    for p in first_parts:
        p = p.strip(".")
        if p:
            initials_parts.append(f"{p[0].upper()}.")
    initials = "".join(initials_parts)
    last = last.strip()
    return f"{last}, {initials}" if initials else last


def _format_harvard_authors(names: list[str]) -> str:
    """Format a list of author names in Harvard style.

    - 1 author:  'Nguyen, D.C.'
    - 2 authors: 'Nguyen, D.C. and Pham, Q.V.'
    - 3+:        'Nguyen, D.C., Pham, Q.V. and Smith, J.'
    """
    harvard_names = [_name_to_harvard(n) for n in names if n and n.strip()]
    if not harvard_names:
        return ""
    if len(harvard_names) == 1:
        return harvard_names[0]
    if len(harvard_names) == 2:
        return " and ".join(harvard_names)
    return ", ".join(harvard_names[:-1]) + " and " + harvard_names[-1]


def _format_harvard_reference(
    *,
    entry_type: str,
    authors: list[str],
    year: str | None,
    title: str | None,
    container: str | None,      # journal / booktitle / institution
    volume: str | None,
    pages: str | None,
    doi: str | None,
    url: str | None,
) -> str:
    """Build a single Harvard-style reference line (ready to paste in Word).

    Conventions followed (common Harvard variants, IFKAD-compatible):
      • Authors + (Year) at start
      • Article title in single quotes, 'Journal' in plain text (user can italicize in Word)
      • Volume/issue/pages separated by commas
      • URL/DOI prefixed with 'Available at:'
      • 'n.d.' when year unknown
    """
    auth = _format_harvard_authors(authors)
    y = year or "n.d."
    header = f"{auth} ({y})" if auth else f"({y})"
    t = (title or "").strip().rstrip(".")

    parts: list[str]
    if entry_type == "article":
        # Journal article: Author (Year) 'Title', Journal, vol. X, pp. Y-Z.
        parts = [f"{header} '{t}'"]
        if container:
            parts.append(container)
        if volume:
            vol_str = f"vol. {volume}"
            if pages:
                vol_str += f", pp. {pages}"
            parts.append(vol_str)
        elif pages:
            parts.append(f"pp. {pages}")
        s = ", ".join(parts) + "."
    elif entry_type == "inproceedings":
        # Conference: Author (Year) 'Title', in Proceedings, pp. Y-Z.
        s = f"{header} '{t}'"
        if container:
            s += f", in {container}"
        if pages:
            s += f", pp. {pages}"
        s += "."
    elif entry_type == "techreport":
        # Report / guideline: Author (Year) Title. Institution.
        s = f"{header} {t}."
        if container and container.strip().lower() != (auth or "").strip().lower():
            s += f" {container}."
    elif entry_type == "misc":
        # Preprint / arXiv: Author (Year) 'Title' [Preprint].
        s = f"{header} '{t}' [Preprint]."
    elif entry_type == "unpublished":
        s = f"{header} '{t}' [Unpublished manuscript]."
    else:
        s = f"{header} {t}."

    # Append access link
    if doi:
        s += f" Available at: https://doi.org/{doi}"
    elif url:
        s += f" Available at: {url}"

    # Collapse any accidental double spaces
    return re.sub(r"\s+", " ", s).strip()


@router.get("/{manuscript_id}")
async def list_references(
    manuscript_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all papers cited by a manuscript, with their metadata."""
    result = await db.execute(
        select(PaperReference, Paper.title, Paper.doi, Paper.journal, Paper.publication_date, Paper.citation_count, Paper.disabled, Paper.rating, Paper.keywords_json)
        .join(Paper, PaperReference.cited_paper_id == Paper.id)
        .where(PaperReference.manuscript_id == manuscript_id)
        .order_by(PaperReference.created_at.asc())
    )
    refs = result.all()

    def _ctx_label(key: str) -> str:
        return CONTEXT_LABELS.get(key, key)

    import json as _json

    # Fetch labels for all cited papers in one query
    cited_ids = [r.PaperReference.cited_paper_id for r in refs]
    paper_labels_map: dict[int, list[dict]] = {}
    if cited_ids:
        labels_result = await db.execute(
            select(PaperLabel.paper_id, Label.name, Label.color)
            .join(Label, PaperLabel.label_id == Label.id)
            .where(PaperLabel.paper_id.in_(cited_ids))
        )
        for pid, lname, lcolor in labels_result.all():
            paper_labels_map.setdefault(pid, []).append({"name": lname, "color": lcolor})

    # Fetch first author (position=0) + total author count for each cited paper in one query
    paper_authors_map: dict[int, dict] = {}
    if cited_ids:
        authors_result = await db.execute(
            select(PaperAuthor.paper_id, Author.name, PaperAuthor.position)
            .join(Author, PaperAuthor.author_id == Author.id)
            .where(PaperAuthor.paper_id.in_(cited_ids))
            .order_by(PaperAuthor.paper_id, PaperAuthor.position.asc())
        )
        for pid, aname, apos in authors_result.all():
            if pid not in paper_authors_map:
                paper_authors_map[pid] = {"first_author": aname, "author_count": 0}
            paper_authors_map[pid]["author_count"] += 1

    return {
        "manuscript_id": manuscript_id,
        "references": [
            {
                "id": ref.PaperReference.id,
                "cited_paper_id": ref.PaperReference.cited_paper_id,
                "title": ref.title,
                "doi": ref.doi,
                "journal": ref.journal,
                "publication_date": ref.publication_date,
                "citation_count": ref.citation_count or 0,
                "disabled": bool(ref.disabled),
                "rating": ref.rating,
                "keywords": [k.lower() for k in _json.loads(ref.keywords_json)] if ref.keywords_json else [],
                "labels": paper_labels_map.get(ref.PaperReference.cited_paper_id, []),
                "first_author": (paper_authors_map.get(ref.PaperReference.cited_paper_id) or {}).get("first_author"),
                "author_count": (paper_authors_map.get(ref.PaperReference.cited_paper_id) or {}).get("author_count", 0),
                "context": ref.PaperReference.context,
                "context_label": CONTEXT_LABELS.get(ref.PaperReference.context, ref.PaperReference.context),
                "contexts": _parse_contexts(ref.PaperReference.contexts_json, ref.PaperReference.context),
                "contexts_labels": [
                    _ctx_label(c) for c in _parse_contexts(ref.PaperReference.contexts_json, ref.PaperReference.context)
                ],
                "note": ref.PaperReference.note,
                "citations_map": ref.PaperReference.citations_map,
            }
            for ref in refs
        ],
        "total": len(refs),
    }


@router.get("/{manuscript_id}/bibtex")
async def export_bibtex(
    manuscript_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export the manuscript's bibliography as a BibTeX (.bib) file.

    Unlike the old client-side export, this generates standards-compliant entries
    with proper `@type{...}` (article / inproceedings / techreport / misc),
    citation keys in `lastnameYEARword` form (e.g. `nguyen2024federated`),
    a joined `author` field from the paper_authors table, and DOI/URL fields.
    Suitable for direct use with Harvard BibTeX styles (agsm, dcu, harvard) in
    LaTeX / Overleaf.
    """
    # Fetch ordered references with paper metadata
    refs_rows = await db.execute(
        select(
            PaperReference.id,
            PaperReference.cited_paper_id,
            PaperReference.note,
            Paper.title,
            Paper.doi,
            Paper.journal,
            Paper.publication_date,
            Paper.paper_type,
            Paper.volume,
            Paper.pages,
            Paper.pdf_url,
            Paper.external_ids_json,
        )
        .join(Paper, PaperReference.cited_paper_id == Paper.id)
        .where(PaperReference.manuscript_id == manuscript_id)
        .order_by(PaperReference.created_at.asc())
    )
    refs = list(refs_rows.all())
    if not refs:
        return Response(content="% No references in this manuscript.\n", media_type="text/plain")

    # Fetch authors for all cited papers in one query, ordered by position
    cited_ids = [r.cited_paper_id for r in refs]
    authors_by_paper: dict[int, list[str]] = {}
    authors_rows = await db.execute(
        select(PaperAuthor.paper_id, Author.name, PaperAuthor.position)
        .join(Author, PaperAuthor.author_id == Author.id)
        .where(PaperAuthor.paper_id.in_(cited_ids))
        .order_by(PaperAuthor.paper_id, PaperAuthor.position)
    )
    for pid, aname, _pos in authors_rows.all():
        authors_by_paper.setdefault(pid, []).append(aname)

    # Pass 1: build raw entries with candidate keys
    proto: list[dict] = []
    for r in refs:
        names = authors_by_paper.get(r.cited_paper_id, [])
        year = (r.publication_date or "")[:4] if r.publication_date else ""
        first_author = names[0] if names else None
        lastname = _author_lastname(first_author) or "anon"
        first_word = _first_significant_word(r.title) or "untitled"
        # ASCII-fold first word & trim to 20 chars to keep keys readable
        first_word = re.sub(r"[^a-z0-9]", "", first_word)[:20] or "untitled"
        base_key = f"{lastname}{year or 'nd'}{first_word}"

        entry_type = _BIB_ENTRY_TYPE.get(r.paper_type or "", "misc")

        # Map external IDs to URL/eprint
        ext_ids: dict = {}
        try:
            ext_ids = _json.loads(r.external_ids_json) if r.external_ids_json else {}
        except Exception:
            ext_ids = {}

        url = None
        eprint = None
        if r.doi:
            url = f"https://doi.org/{r.doi}"
        elif ext_ids.get("arxiv_id"):
            eprint = ext_ids["arxiv_id"]
            url = f"https://arxiv.org/abs/{eprint}"
        elif ext_ids.get("pmid"):
            url = f"https://pubmed.ncbi.nlm.nih.gov/{ext_ids['pmid']}"
        elif ext_ids.get("iris_url"):
            url = ext_ids["iris_url"]
        elif r.pdf_url:
            url = r.pdf_url

        # Decide which container field to use based on entry type
        container_field = None
        container_value = r.journal
        if entry_type == "article":
            container_field = "journal"
        elif entry_type == "inproceedings":
            container_field = "booktitle"
        elif entry_type == "techreport":
            container_field = "institution"

        fields: list[tuple[str, str | None]] = [
            ("author", _format_bibtex_author(names) if names else None),
            ("title", r.title),
            (container_field or "howpublished", container_value),
            ("year", year or None),
            ("volume", r.volume),
            ("pages", r.pages),
            ("doi", r.doi),
        ]
        if eprint:
            fields.append(("eprint", eprint))
            fields.append(("archivePrefix", "arXiv"))
        if url:
            fields.append(("url", url))
        if r.note:
            fields.append(("note", r.note))

        proto.append({
            "key": base_key,
            "type": entry_type,
            "fields": fields,
        })

    # Pass 2: disambiguate duplicate keys (append 'a', 'b', ...)
    seen: dict[str, int] = {}
    for p in proto:
        n = seen.get(p["key"], 0)
        seen[p["key"]] = n + 1
    # Build counter per key for suffix assignment during emission
    counts: dict[str, int] = {}
    final_keys: list[str] = []
    for p in proto:
        k = p["key"]
        if seen[k] == 1:
            final_keys.append(k)
        else:
            idx = counts.get(k, 0)
            counts[k] = idx + 1
            final_keys.append(f"{k}{chr(ord('a') + idx)}")

    blocks = [
        _build_bibtex_entry(p["type"], final_keys[i], p["fields"])
        for i, p in enumerate(proto)
    ]
    body = (
        f"% BibTeX export — manuscript #{manuscript_id}, {len(refs)} references\n"
        f"% Generated by RESMON. Works with Harvard styles (e.g. agsm, harvard, dcu).\n\n"
        + "\n\n".join(blocks)
        + "\n"
    )
    return Response(
        content=body,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="bibliography_{manuscript_id}.bib"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/{manuscript_id}/harvard")
async def export_harvard(
    manuscript_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export the manuscript's bibliography as Harvard-style plain text.

    Ready to paste into Word / Google Docs (IFKAD and most social-sciences
    conferences require Harvard referencing). Each entry on its own line,
    entries separated by a blank line, alphabetically sorted by first
    author's surname (Harvard standard).

    Unlike the BibTeX export, there is no syntax to parse — this is ready-to-read
    text. User may need to apply italic formatting to journal/book names
    manually in the target document.
    """
    refs_rows = await db.execute(
        select(
            PaperReference.id,
            PaperReference.cited_paper_id,
            Paper.title,
            Paper.doi,
            Paper.journal,
            Paper.publication_date,
            Paper.paper_type,
            Paper.volume,
            Paper.pages,
            Paper.pdf_url,
            Paper.external_ids_json,
        )
        .join(Paper, PaperReference.cited_paper_id == Paper.id)
        .where(PaperReference.manuscript_id == manuscript_id)
    )
    refs = list(refs_rows.all())
    if not refs:
        return Response(
            content="No references in this manuscript.\n",
            media_type="text/plain; charset=utf-8",
        )

    # Fetch authors for all cited papers in one query, ordered by position
    cited_ids = [r.cited_paper_id for r in refs]
    authors_by_paper: dict[int, list[str]] = {}
    authors_rows = await db.execute(
        select(PaperAuthor.paper_id, Author.name, PaperAuthor.position)
        .join(Author, PaperAuthor.author_id == Author.id)
        .where(PaperAuthor.paper_id.in_(cited_ids))
        .order_by(PaperAuthor.paper_id, PaperAuthor.position)
    )
    for pid, aname, _pos in authors_rows.all():
        authors_by_paper.setdefault(pid, []).append(aname)

    # Build reference lines
    entries: list[tuple[str, str]] = []  # (sort_key, formatted_line)
    for r in refs:
        names = authors_by_paper.get(r.cited_paper_id, [])
        year = (r.publication_date or "")[:4] if r.publication_date else None
        entry_type = _BIB_ENTRY_TYPE.get(r.paper_type or "", "misc")

        ext_ids: dict = {}
        try:
            ext_ids = _json.loads(r.external_ids_json) if r.external_ids_json else {}
        except Exception:
            ext_ids = {}
        url = None
        if not r.doi:
            if ext_ids.get("arxiv_id"):
                url = f"https://arxiv.org/abs/{ext_ids['arxiv_id']}"
            elif ext_ids.get("pmid"):
                url = f"https://pubmed.ncbi.nlm.nih.gov/{ext_ids['pmid']}"
            elif ext_ids.get("iris_url"):
                url = ext_ids["iris_url"]
            elif r.pdf_url:
                url = r.pdf_url

        line = _format_harvard_reference(
            entry_type=entry_type,
            authors=names,
            year=year,
            title=r.title,
            container=r.journal,
            volume=r.volume,
            pages=r.pages,
            doi=r.doi,
            url=url,
        )

        # Sort key: first author's surname (lowercased, folded) + year
        first_author = names[0] if names else ""
        surname_key = _author_lastname(first_author) or _ascii_fold(first_author) or "zzz"
        sort_key = f"{surname_key}_{year or '9999'}"
        entries.append((sort_key, line))

    entries.sort(key=lambda e: e[0])
    body = "\n\n".join(line for _, line in entries) + "\n"
    return Response(
        content=body,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="bibliography_{manuscript_id}_harvard.txt"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/{manuscript_id}/reverse")
async def list_cited_by(
    manuscript_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all manuscripts that cite this paper (reverse lookup)."""
    result = await db.execute(
        select(PaperReference, Paper.title, Paper.paper_role)
        .join(Paper, PaperReference.manuscript_id == Paper.id)
        .where(PaperReference.cited_paper_id == manuscript_id)
        .order_by(PaperReference.created_at.asc())
    )
    refs = result.all()

    return {
        "paper_id": manuscript_id,
        "cited_by": [
            {
                "manuscript_id": ref.PaperReference.manuscript_id,
                "manuscript_title": ref.title,
                "manuscript_role": ref.paper_role,
                "context": ref.PaperReference.context,
                "note": ref.PaperReference.note,
                "citations_map": ref.PaperReference.citations_map,
            }
            for ref in refs
        ],
    }


# ---------- Bibliography import (paste-text → resolved references) ----------
# Two-step flow: (1) preview parses + resolves via S2, returns proposals;
# (2) apply persists user-confirmed selections as Paper rows + PaperReference
# links to this manuscript.

class BibImportPreviewRequest(BaseModel):
    text: str


class BibImportApplyItem(BaseModel):
    title: str | None = None
    doi: str | None = None
    arxiv: str | None = None
    abstract: str | None = None
    journal: str | None = None
    publication_date: str | None = None
    authors: list[str] = []
    keywords: list[str] = []
    s2_id: str | None = None
    paper_type: str | None = None
    citation_count: int = 0
    matched_paper_id: int | None = None  # if already in DB, link directly
    needs_verification: bool = False     # set by frontend for ambiguous matches


class BibImportApplyRequest(BaseModel):
    items: list[BibImportApplyItem]
    label_id: int | None = None              # main label, applied to ALL papers
    verification_label_id: int | None = None # secondary label, applied ONLY to items
                                              # flagged ``needs_verification`` so the
                                              # user can later filter the list and
                                              # punctually verify those entries


def _normalise_for_compare(s: str) -> str:
    """Lowercase and strip non-alphanumeric for fuzzy title matching."""
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _title_similarity(a: str | None, b: str | None) -> float:
    """Jaccard similarity over alphanumeric tokens — robust to formatting noise."""
    if not a or not b:
        return 0.0
    ta = set(re.findall(r"[a-z0-9]+", a.lower()))
    tb = set(re.findall(r"[a-z0-9]+", b.lower()))
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


@router.post("/{manuscript_id}/import-preview")
async def import_bibliography_preview(
    manuscript_id: int,
    body: BibImportPreviewRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 1: parse the pasted bibliography text, look up each reference
    against Semantic Scholar (DOI > arXiv > title) and return proposals.

    No DB writes. The frontend renders the proposals, lets the user deselect
    bad matches, then calls ``/import-apply`` with the curated list.
    """
    from app.services.bibliography_parser import split_references, parse_reference
    from app.services.deduplication import normalize_doi

    if not body.text.strip():
        raise HTTPException(400, "No text provided")

    manuscript = await db.get(Paper, manuscript_id)
    if not manuscript:
        raise HTTPException(404, "Manuscript not found")

    raw_refs = split_references(body.text)
    if not raw_refs:
        raise HTTPException(400, "Could not split text into individual references")

    # S2 client (rate-limited, 1 req / ~1.5 s)
    import asyncio as _asyncio
    s2_client = None
    try:
        from app.clients.semantic_scholar import SemanticScholarClient
        s2_client = SemanticScholarClient()
    except Exception as e:
        logger.warning(f"S2 client unavailable: {e}")

    # Pre-fetch existing references of this manuscript so we can flag duplicates
    existing = await db.execute(
        select(PaperReference.cited_paper_id).where(PaperReference.manuscript_id == manuscript_id)
    )
    already_linked = {row[0] for row in existing.all()}

    items: list[dict] = []

    for raw in raw_refs:
        parsed = parse_reference(raw)
        item: dict = {
            "raw": parsed["raw"][:300],
            "parsed_title": parsed["title"],
            "parsed_doi": parsed["doi"],
            "parsed_arxiv": parsed["arxiv"],
            "parsed_year": parsed["year"],
            "parsed_first_author": parsed["first_author"],
            "status": "not_found",
            "title": None,
            "doi": parsed["doi"],
            "arxiv": parsed["arxiv"],
            "abstract": None,
            "journal": None,
            "publication_date": None,
            "authors": [],
            "keywords": [],
            "s2_id": None,
            "paper_type": None,
            "citation_count": 0,
            "matched_paper_id": None,
            "already_linked": False,
            "similarity": 0.0,
        }

        # 1) Try existing DB lookup by DOI first
        if parsed["doi"]:
            r = await db.execute(select(Paper).where(Paper.doi == normalize_doi(parsed["doi"])))
            existing_paper = r.scalar_one_or_none()
            if existing_paper:
                item.update({
                    "status": "in_db",
                    "title": existing_paper.title,
                    "matched_paper_id": existing_paper.id,
                    "similarity": 1.0,
                    "already_linked": existing_paper.id in already_linked,
                })
                items.append(item)
                continue

        # 2) Try S2 lookup — DOI > arXiv > title
        if s2_client is not None:
            await _asyncio.sleep(1.2)  # courteous rate limit
            try:
                if parsed["doi"]:
                    r = await s2_client.fetch_metadata(f"DOI:{parsed['doi']}")
                elif parsed["arxiv"]:
                    r = await s2_client.fetch_metadata(f"arXiv:{parsed['arxiv']}")
                elif parsed["title"]:
                    results = await s2_client.search(parsed["title"], max_results=3)
                    r = results[0] if results else None
                else:
                    r = None
            except Exception as e:
                logger.warning(f"S2 lookup failed: {e}")
                r = None

            if r and r.title:
                # Compute similarity for the title-based path; for DOI/arXiv
                # treat as 1.0 (exact lookup).
                sim = 1.0 if (parsed["doi"] or parsed["arxiv"]) else _title_similarity(r.title, parsed["title"])
                item["similarity"] = round(sim, 2)
                item["title"] = r.title
                item["doi"] = r.doi or parsed["doi"]
                item["abstract"] = r.abstract
                item["journal"] = r.journal
                item["publication_date"] = r.publication_date
                item["authors"] = [a.get("name", "") for a in (r.authors or [])]
                item["keywords"] = r.keywords or []
                item["s2_id"] = r.source_id
                item["paper_type"] = r.paper_type
                item["citation_count"] = r.citation_count or 0

                # Existing in DB by DOI?
                if item["doi"]:
                    rr = await db.execute(select(Paper).where(Paper.doi == normalize_doi(item["doi"])))
                    existing_paper = rr.scalar_one_or_none()
                    if existing_paper:
                        item["status"] = "in_db"
                        item["matched_paper_id"] = existing_paper.id
                        item["already_linked"] = existing_paper.id in already_linked
                        items.append(item)
                        continue
                # Existing in DB by title (fuzzy) — best-effort, only if highly similar
                rr = await db.execute(
                    select(Paper).where(Paper.title.ilike(f"%{(item['title'] or '')[:60]}%"))
                )
                candidates = rr.scalars().all()
                for cand in candidates:
                    if _title_similarity(cand.title, item["title"]) > 0.92:
                        item["status"] = "in_db"
                        item["matched_paper_id"] = cand.id
                        item["already_linked"] = cand.id in already_linked
                        break
                else:
                    item["status"] = "found_s2" if sim >= 0.65 else "ambiguous"

        items.append(item)

    summary = {
        "parsed": len(raw_refs),
        "in_db":   sum(1 for i in items if i["status"] == "in_db"),
        "found":   sum(1 for i in items if i["status"] == "found_s2"),
        "ambiguous": sum(1 for i in items if i["status"] == "ambiguous"),
        "not_found": sum(1 for i in items if i["status"] == "not_found"),
        "already_linked": sum(1 for i in items if i.get("already_linked")),
    }
    return {"manuscript_id": manuscript_id, "summary": summary, "items": items}


@router.post("/{manuscript_id}/import-apply")
async def import_bibliography_apply(
    manuscript_id: int,
    body: BibImportApplyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 2: persist user-confirmed import items.

    For each item: if ``matched_paper_id`` is set, just create the
    PaperReference link to that paper. Otherwise create a new Paper row
    (with authors / source / topic classification) and the PaperReference.
    Skips items already linked to this manuscript.
    """
    from app.services.deduplication import normalize_doi
    from app.services.topic_classifier import TopicClassifier

    manuscript = await db.get(Paper, manuscript_id)
    if not manuscript:
        raise HTTPException(404, "Manuscript not found")
    if not body.items:
        return {"created": 0, "linked": 0, "skipped": 0}

    from app.models.label import PaperLabel as _PaperLabel, Label as _Label

    # Validate the optional label IDs once up-front
    if body.label_id is not None:
        exists = await db.get(_Label, body.label_id)
        if not exists:
            raise HTTPException(404, f"Label {body.label_id} not found")
    if body.verification_label_id is not None:
        exists = await db.get(_Label, body.verification_label_id)
        if not exists:
            raise HTTPException(404, f"Verification label {body.verification_label_id} not found")

    classifier = TopicClassifier()
    created = 0
    linked = 0
    skipped = 0
    labeled = 0
    flagged_for_verification = 0

    # Pre-fetch existing PaperReference rows to avoid duplicate links
    existing = await db.execute(
        select(PaperReference.cited_paper_id).where(PaperReference.manuscript_id == manuscript_id)
    )
    already_linked = {row[0] for row in existing.all()}

    for item in body.items:
        paper_id: int | None = item.matched_paper_id

        # If we don't have a matched paper, create one
        if paper_id is None:
            if not item.title:
                skipped += 1
                continue
            # Re-check by DOI to avoid double-create under a race
            if item.doi:
                rr = await db.execute(
                    select(Paper).where(Paper.doi == normalize_doi(item.doi))
                )
                ex = rr.scalar_one_or_none()
                if ex:
                    paper_id = ex.id

        if paper_id is None:
            # Create new Paper
            paper = Paper(
                doi=normalize_doi(item.doi) if item.doi else None,
                title=item.title,
                abstract=item.abstract,
                journal=item.journal,
                publication_date=item.publication_date,
                paper_type=item.paper_type or "journal_article",
                citation_count=item.citation_count or 0,
                paper_role="bibliography",
                validated=bool(item.s2_id or item.doi),
                created_via="bibliography_import",
            )
            try:
                if item.keywords:
                    paper.keywords = item.keywords
                if item.s2_id:
                    paper.external_ids = {"s2_id": item.s2_id}
            except Exception:
                pass
            db.add(paper)
            await db.flush()
            paper_id = paper.id

            # Authors
            for i, name in enumerate(item.authors):
                if not name:
                    continue
                rr = await db.execute(select(Author).where(Author.name == name))
                au = rr.scalar_one_or_none()
                if not au:
                    au = Author(name=name)
                    db.add(au)
                    await db.flush()
                db.add(PaperAuthor(paper_id=paper.id, author_id=au.id, position=i))

            # Topic classify (best-effort)
            try:
                await classifier.classify_paper(db, paper.id, paper.title, paper.abstract)
            except Exception as e:
                logger.warning(f"Topic classification failed for paper {paper.id}: {e}")

            created += 1

        # Apply main label (if requested) — idempotent: skip if already applied
        if body.label_id is not None and paper_id is not None:
            already = await db.execute(
                select(_PaperLabel).where(
                    _PaperLabel.paper_id == paper_id,
                    _PaperLabel.label_id == body.label_id,
                )
            )
            if already.scalar_one_or_none() is None:
                db.add(_PaperLabel(paper_id=paper_id, label_id=body.label_id))
                labeled += 1

        # Apply verification label only to items flagged as needing verification.
        # Useful for audit follow-up: the user filters papers by this label to
        # check titles/authors/year against the original bibliography text.
        if (
            body.verification_label_id is not None
            and paper_id is not None
            and item.needs_verification
        ):
            already = await db.execute(
                select(_PaperLabel).where(
                    _PaperLabel.paper_id == paper_id,
                    _PaperLabel.label_id == body.verification_label_id,
                )
            )
            if already.scalar_one_or_none() is None:
                db.add(_PaperLabel(paper_id=paper_id, label_id=body.verification_label_id))
                flagged_for_verification += 1

        # Link to manuscript (skip duplicates)
        if paper_id in already_linked or paper_id == manuscript_id:
            skipped += 1
            continue

        ref = PaperReference(
            manuscript_id=manuscript_id,
            cited_paper_id=paper_id,
        )
        db.add(ref)
        already_linked.add(paper_id)
        linked += 1

    await db.commit()
    return {
        "manuscript_id": manuscript_id,
        "created": created,
        "linked": linked,
        "skipped": skipped,
        "labeled": labeled,
        "flagged_for_verification": flagged_for_verification,
    }


@router.get("/{manuscript_id}/keywords")
async def bibliography_keywords(
    manuscript_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate keywords from all papers cited by this manuscript, with counts."""
    result = await db.execute(
        select(Paper.keywords_json)
        .join(PaperReference, PaperReference.cited_paper_id == Paper.id)
        .where(PaperReference.manuscript_id == manuscript_id)
    )
    rows = result.all()

    import json as _json
    counts: dict[str, int] = {}
    for (kw_json,) in rows:
        if not kw_json:
            continue
        for kw in _json.loads(kw_json):
            kw_clean = kw.strip()
            if kw_clean:
                counts[kw_clean.lower()] = counts.get(kw_clean.lower(), 0) + 1

    # Sort alphabetically
    sorted_kws = sorted(counts.items(), key=lambda x: x[0])

    return {
        "manuscript_id": manuscript_id,
        "total_papers": len(rows),
        "keywords": [{"keyword": kw, "count": c} for kw, c in sorted_kws],
    }


@router.post("/{manuscript_id}")
async def add_reference(
    manuscript_id: int,
    body: AddReferenceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a paper to the manuscript's bibliography."""
    # Verify both papers exist
    manuscript = await db.get(Paper, manuscript_id)
    if not manuscript:
        raise HTTPException(status_code=404, detail="Manuscript not found")
    cited = await db.get(Paper, body.cited_paper_id)
    if not cited:
        raise HTTPException(status_code=404, detail="Cited paper not found in database")
    if manuscript_id == body.cited_paper_id:
        raise HTTPException(status_code=400, detail="A paper cannot cite itself")

    # Check for duplicates
    existing = await db.execute(
        select(PaperReference).where(
            PaperReference.manuscript_id == manuscript_id,
            PaperReference.cited_paper_id == body.cited_paper_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="This paper is already in the bibliography")

    contexts_json_value = _serialize_contexts(body.contexts)
    # If only `contexts` is provided, mirror its first value into `context` for back-compat
    primary_context = body.context if body.context is not None else (body.contexts[0] if body.contexts else None)

    ref = PaperReference(
        manuscript_id=manuscript_id,
        cited_paper_id=body.cited_paper_id,
        context=primary_context,
        contexts_json=contexts_json_value,
        note=body.note,
        citations_map=body.citations_map,
    )
    db.add(ref)
    await db.flush()
    await db.commit()
    logger.info(f"Reference added: manuscript={manuscript_id} cites paper={body.cited_paper_id}")
    return {"id": ref.id, "manuscript_id": manuscript_id, "cited_paper_id": body.cited_paper_id}


@router.put("/ref/{ref_id}")
async def update_reference(
    ref_id: int,
    body: UpdateReferenceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update context(s), note or citations_map of a reference."""
    ref = await db.get(PaperReference, ref_id)
    if not ref:
        raise HTTPException(status_code=404, detail="Reference not found")
    if body.contexts is not None:
        # New multi-context path: keep `context` mirrored to first item for back-compat
        ref.contexts_json = _serialize_contexts(body.contexts)
        ref.context = body.contexts[0] if body.contexts else None
    elif body.context is not None:
        ref.context = body.context
        # Keep contexts_json in sync when only the legacy field is set
        ref.contexts_json = _serialize_contexts([body.context]) if body.context else None
    if body.note is not None:
        ref.note = body.note
    if body.citations_map is not None:
        ref.citations_map = body.citations_map
    await db.commit()
    return {
        "id": ref.id,
        "context": ref.context,
        "contexts": _parse_contexts(ref.contexts_json, ref.context),
        "note": ref.note,
        "citations_map": ref.citations_map,
    }


class AutoDetectApplyRequest(BaseModel):
    # Map of ref_id -> list of context keys to apply. Caller curates this list
    # from the preview endpoint output (typically by ticking checkboxes per row).
    selections: dict[int, list[str]]


@router.post("/{manuscript_id}/auto-detect-contexts")
async def auto_detect_contexts(
    manuscript_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Preview-only: parse each reference's citations_map and propose contexts.

    Does NOT persist anything. Frontend renders the preview, user picks rows
    and contexts to apply, then calls the matching apply endpoint.
    """
    rows = await db.execute(
        select(PaperReference, Paper.title)
        .join(Paper, PaperReference.cited_paper_id == Paper.id)
        .where(PaperReference.manuscript_id == manuscript_id)
        .order_by(PaperReference.created_at.asc())
    )
    items = []
    for r in rows.all():
        ref: PaperReference = r.PaperReference
        current = _parse_contexts(ref.contexts_json, ref.context)
        parsed = detect_contexts(ref.citations_map)
        items.append({
            "ref_id": ref.id,
            "cited_paper_id": ref.cited_paper_id,
            "title": r.title,
            "citations_map": ref.citations_map,
            "current_contexts": current,
            "suggested_contexts": parsed["contexts"],
            "evidence": parsed["evidence"],
        })
    return {"manuscript_id": manuscript_id, "items": items}


@router.post("/{manuscript_id}/apply-detected-contexts")
async def apply_detected_contexts(
    manuscript_id: int,
    body: AutoDetectApplyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist user-confirmed context selections from the auto-detect preview.

    Body: {"selections": {ref_id: [context_keys]}}.
    Only refs that belong to this manuscript_id are touched. Empty list clears
    contexts (`contexts_json` -> NULL, `context` -> NULL).
    """
    if not body.selections:
        return {"updated": 0}

    ref_ids = list(body.selections.keys())
    rows = await db.execute(
        select(PaperReference).where(
            PaperReference.id.in_(ref_ids),
            PaperReference.manuscript_id == manuscript_id,
        )
    )
    refs = {ref.id: ref for ref in rows.scalars().all()}

    updated = 0
    for ref_id, contexts in body.selections.items():
        ref = refs.get(int(ref_id))
        if not ref:
            continue
        cleaned = [c for c in (contexts or []) if c in CONTEXT_KEYS]
        ref.contexts_json = _serialize_contexts(cleaned)
        ref.context = cleaned[0] if cleaned else None
        updated += 1
    await db.commit()
    return {"manuscript_id": manuscript_id, "updated": updated}


@router.delete("/ref/{ref_id}")
async def delete_reference(
    ref_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a paper from the manuscript's bibliography."""
    ref = await db.get(PaperReference, ref_id)
    if not ref:
        raise HTTPException(status_code=404, detail="Reference not found")
    await db.delete(ref)
    await db.commit()
    return {"deleted": ref_id}
