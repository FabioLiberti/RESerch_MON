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

logger = logging.getLogger(__name__)

router = APIRouter()


class AddReferenceRequest(BaseModel):
    cited_paper_id: int
    context: str | None = None
    note: str | None = None


class UpdateReferenceRequest(BaseModel):
    context: str | None = None
    note: str | None = None


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


def _format_bibtex_author(names: list[str]) -> str:
    """Format a list of author strings as a single BibTeX `author` value.

    - Individual authors: "Last, First Middle" preserved (BibTeX standard).
    - Institutional authors (no comma, >= 2 words uppercase) wrapped in {{...}}
      so BibTeX styles treat them as one unit instead of "Word, Other".
    """
    out: list[str] = []
    for n in names:
        n = (n or "").strip()
        if not n:
            continue
        is_institutional = (
            "," not in n
            and n.count(" ") >= 2
            and sum(1 for c in n if c.isupper()) >= 2
        )
        out.append(f"{{{n}}}" if is_institutional else n)
    return " and ".join(out)


def _escape_bibtex(value: str | None) -> str:
    """Minimal escaping for values going inside { ... } braces."""
    if not value:
        return ""
    return value.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


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
                "context": ref.PaperReference.context,
                "context_label": CONTEXT_LABELS.get(ref.PaperReference.context, ref.PaperReference.context),
                "note": ref.PaperReference.note,
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
            }
            for ref in refs
        ],
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

    ref = PaperReference(
        manuscript_id=manuscript_id,
        cited_paper_id=body.cited_paper_id,
        context=body.context,
        note=body.note,
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
    """Update context or note of a reference."""
    ref = await db.get(PaperReference, ref_id)
    if not ref:
        raise HTTPException(status_code=404, detail="Reference not found")
    if body.context is not None:
        ref.context = body.context
    if body.note is not None:
        ref.note = body.note
    await db.commit()
    return {"id": ref.id, "context": ref.context, "note": ref.note}


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
