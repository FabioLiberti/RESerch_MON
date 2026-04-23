"""Network graph API — co-keywords, co-authors, citations."""

import logging
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.paper import Paper, PaperAuthor, PaperSource, Author
from app.models.label import Label, PaperLabel

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_node(paper: Paper, sources: list[str], authors: list[str] | None = None) -> dict:
    return {
        "id": paper.id,
        "title": paper.title[:80] if paper.title else "",
        "source": sources[0] if sources else "unknown",
        "citations": paper.citation_count,
        "doi": paper.doi,
        "keywords": paper.keywords or [],
        "authors": authors or [],
    }


@router.get("/co-keywords")
async def co_keywords_network(
    max_papers: int = Query(100, ge=10, le=500),
    min_shared: int = Query(2, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
):
    """Build co-keyword network: papers linked by shared keywords."""
    # Get top papers by citation count
    result = await db.execute(
        select(Paper)
        .where(Paper.keywords_json.isnot(None), Paper.keywords_json != "[]")
        .order_by(Paper.citation_count.desc())
        .limit(max_papers)
    )
    papers = list(result.scalars().all())

    # Get sources and authors for each paper
    paper_sources = {}
    paper_author_names = {}
    for p in papers:
        src_result = await db.execute(
            select(PaperSource.source_name).where(PaperSource.paper_id == p.id)
        )
        paper_sources[p.id] = [r[0] for r in src_result.all()]

        auth_result = await db.execute(
            select(Author.name)
            .join(PaperAuthor, PaperAuthor.author_id == Author.id)
            .where(PaperAuthor.paper_id == p.id)
        )
        paper_author_names[p.id] = [r[0] for r in auth_result.all()]

    # Build nodes
    nodes = [_build_node(p, paper_sources.get(p.id, []), paper_author_names.get(p.id, [])) for p in papers]

    # Build links by shared keywords
    links = []
    paper_keywords = {p.id: set(kw.lower() for kw in (p.keywords or [])) for p in papers}

    paper_list = list(papers)
    for i in range(len(paper_list)):
        for j in range(i + 1, len(paper_list)):
            p1, p2 = paper_list[i], paper_list[j]
            shared = paper_keywords[p1.id] & paper_keywords[p2.id]
            if len(shared) >= min_shared:
                links.append({
                    "source": p1.id,
                    "target": p2.id,
                    "weight": len(shared),
                    "shared": list(shared)[:5],
                })

    return {
        "nodes": nodes,
        "links": links,
        "stats": {
            "total_nodes": len(nodes),
            "total_links": len(links),
            "type": "co-keywords",
        },
    }


@router.get("/co-authors")
async def co_authors_network(
    max_papers: int = Query(100, ge=10, le=500),
    min_shared: int = Query(1, ge=1, le=5),
    db: AsyncSession = Depends(get_db),
):
    """Build co-author network: papers linked by shared authors."""
    # Get top papers
    result = await db.execute(
        select(Paper)
        .order_by(Paper.citation_count.desc())
        .limit(max_papers)
    )
    papers = list(result.scalars().all())

    # Get sources and authors for each paper
    paper_sources = {}
    paper_authors = {}

    for p in papers:
        src_result = await db.execute(
            select(PaperSource.source_name).where(PaperSource.paper_id == p.id)
        )
        paper_sources[p.id] = [r[0] for r in src_result.all()]

        auth_result = await db.execute(
            select(Author.name)
            .join(PaperAuthor, PaperAuthor.author_id == Author.id)
            .where(PaperAuthor.paper_id == p.id)
        )
        author_names = [r[0] for r in auth_result.all()]
        paper_authors[p.id] = set(n.lower() for n in author_names)

    # Build nodes
    nodes = [_build_node(p, paper_sources.get(p.id, []), [n.title() for n in paper_authors.get(p.id, set())]) for p in papers]

    # Build links by shared authors
    links = []
    paper_list = list(papers)
    for i in range(len(paper_list)):
        for j in range(i + 1, len(paper_list)):
            p1, p2 = paper_list[i], paper_list[j]
            a1 = paper_authors.get(p1.id, set())
            a2 = paper_authors.get(p2.id, set())
            shared = a1 & a2
            if len(shared) >= min_shared:
                links.append({
                    "source": p1.id,
                    "target": p2.id,
                    "weight": len(shared),
                    "shared": list(shared)[:5],
                })

    return {
        "nodes": nodes,
        "links": links,
        "stats": {
            "total_nodes": len(nodes),
            "total_links": len(links),
            "type": "co-authors",
        },
    }


@router.get("/citations")
async def citations_network(
    paper_id: int = Query(..., description="Center paper ID for ego-centric citation graph"),
    db: AsyncSession = Depends(get_db),
):
    """Ego-centric citation network for a single paper.
    Fetches references + citations from S2 (cached), shows all linked papers."""
    from app.models.analysis import CitationLink
    from app.config import settings
    import asyncio
    import json as _json

    paper = await db.get(Paper, paper_id)
    if not paper:
        return {"nodes": [], "links": [], "stats": {"total_nodes": 0, "total_links": 0, "type": "citations"}}

    # Special case for manuscripts authored by the user: build the ego-centric
    # graph from the internal bibliography (PaperReference) instead of Semantic
    # Scholar. A my_manuscript paper has no public DOI/S2 entry, so the usual
    # external lookup would return empty.
    if paper.paper_role == "my_manuscript":
        from app.models.paper_reference import PaperReference
        import json as _json_ms
        refs_result = await db.execute(
            select(PaperReference, Paper.title, Paper.doi, Paper.citation_count, Paper.keywords_json)
            .join(Paper, PaperReference.cited_paper_id == Paper.id)
            .where(PaperReference.manuscript_id == paper_id)
        )
        refs_rows = refs_result.all()

        cited_ids_ms = [r.PaperReference.cited_paper_id for r in refs_rows]

        # Batch fetch labels for all cited papers
        labels_by_paper: dict[int, list[dict]] = {}
        if cited_ids_ms:
            labels_q = await db.execute(
                select(PaperLabel.paper_id, Label.name, Label.color)
                .join(Label, PaperLabel.label_id == Label.id)
                .where(PaperLabel.paper_id.in_(cited_ids_ms))
            )
            for pid, lname, lcolor in labels_q.all():
                labels_by_paper.setdefault(pid, []).append({"name": lname, "color": lcolor})

        nodes_map_ms: dict[str, dict] = {}
        links_ms: list[dict] = []

        center_nid_ms = f"db_{paper_id}"
        nodes_map_ms[center_nid_ms] = {
            "id": center_nid_ms, "paper_id": paper_id, "title": (paper.title or "")[:80],
            "citations": paper.citation_count or 0, "doi": paper.doi,
            "source": "manuscript", "in_db": True, "is_center": True,
            "labels": labels_by_paper.get(paper_id, []),
            "keywords": [k.lower() for k in (_json_ms.loads(paper.keywords_json) if paper.keywords_json else [])],
        }

        for row in refs_rows:
            ref = row.PaperReference
            cited_pid = ref.cited_paper_id
            target_nid_ms = f"db_{cited_pid}"
            if target_nid_ms not in nodes_map_ms:
                try:
                    kw_list = [k.lower() for k in _json_ms.loads(row.keywords_json)] if row.keywords_json else []
                except Exception:
                    kw_list = []
                nodes_map_ms[target_nid_ms] = {
                    "id": target_nid_ms, "paper_id": cited_pid,
                    "title": (row.title or "")[:80],
                    "citations": row.citation_count or 0, "doi": row.doi,
                    "source": "database", "in_db": True, "is_center": False,
                    "labels": labels_by_paper.get(cited_pid, []),
                    "keywords": kw_list,
                }
            links_ms.append({"source": center_nid_ms, "target": target_nid_ms, "type": "cites"})

        nodes_ms = list(nodes_map_ms.values())
        return {
            "nodes": nodes_ms,
            "links": links_ms,
            "stats": {
                "total_nodes": len(nodes_ms),
                "total_links": len(links_ms),
                "references": len(links_ms),
                "cited_by": 0,
                "in_db": len(nodes_ms),
                "external": 0,
                "type": "citations",
                "mode": "manuscript_bibliography",
            },
        }

    if not paper.doi and not (paper.external_ids or {}).get("s2_id"):
        return {
            "nodes": [], "links": [],
            "stats": {"total_nodes": 0, "total_links": 0, "type": "citations"},
            "message": "Paper has no DOI or S2 ID — cannot fetch citations.",
        }

    # Build DOI/S2 lookup for all papers in DB
    all_papers_result = await db.execute(
        select(Paper.id, Paper.doi, Paper.external_ids_json, Paper.title, Paper.citation_count)
    )
    doi_to_paper: dict[str, dict] = {}
    s2_to_paper: dict[str, dict] = {}
    for pid, doi, ext_json, title, cites in all_papers_result.all():
        ext = _json.loads(ext_json) if ext_json else {}
        info = {"id": pid, "doi": doi, "title": title, "citations": cites}
        if doi:
            doi_to_paper[doi.lower()] = info
        if ext.get("s2_id"):
            s2_to_paper[ext["s2_id"]] = info

    # Check which directions are already cached
    cached_dirs = await db.execute(
        select(CitationLink.direction).where(CitationLink.paper_id == paper_id).distinct()
    )
    cached_directions = set(r[0] for r in cached_dirs.all())
    need_refs = "references" not in cached_directions
    need_cits = "citations" not in cached_directions

    # Fetch missing directions from S2
    if need_refs or need_cits:
        from app.clients.semantic_scholar import SemanticScholarClient
        s2 = SemanticScholarClient()
        try:
            s2_id = (paper.external_ids or {}).get("s2_id")
            lookup = s2_id if s2_id else f"DOI:{paper.doi}"

            if need_refs:
                refs = await s2.fetch_references(lookup, limit=100)
                for ref in refs:
                    link = CitationLink(
                        paper_id=paper_id, direction="references",
                        cited_doi=ref.get("doi"), cited_s2_id=ref.get("s2_id"),
                        cited_title=ref.get("title"), cited_citations=ref.get("citations", 0),
                    )
                    if ref.get("doi") and ref["doi"].lower() in doi_to_paper:
                        link.cited_paper_id = doi_to_paper[ref["doi"].lower()]["id"]
                    elif ref.get("s2_id") and ref["s2_id"] in s2_to_paper:
                        link.cited_paper_id = s2_to_paper[ref["s2_id"]]["id"]
                    db.add(link)
                logger.info(f"Fetched {len(refs)} references for paper {paper_id}")
                await asyncio.sleep(0.5)

            if need_cits:
                cits = await s2.fetch_citations(lookup, limit=100)
                for cit in cits:
                    link = CitationLink(
                        paper_id=paper_id, direction="citations",
                        cited_doi=cit.get("doi"), cited_s2_id=cit.get("s2_id"),
                        cited_title=cit.get("title"), cited_citations=cit.get("citations", 0),
                    )
                    if cit.get("doi") and cit["doi"].lower() in doi_to_paper:
                        link.cited_paper_id = doi_to_paper[cit["doi"].lower()]["id"]
                    elif cit.get("s2_id") and cit["s2_id"] in s2_to_paper:
                        link.cited_paper_id = s2_to_paper[cit["s2_id"]]["id"]
                    db.add(link)
                logger.info(f"Fetched {len(cits)} citations for paper {paper_id}")

            await db.flush()
            await db.commit()
        except Exception as e:
            logger.warning(f"Citation fetch error for paper {paper_id}: {e}")
        finally:
            await s2.close()

    # Build network from cache
    links_result = await db.execute(
        select(CitationLink).where(CitationLink.paper_id == paper_id)
    )
    citation_links = links_result.scalars().all()

    # Get source for center paper
    src_result = await db.execute(
        select(PaperSource.source_name).where(PaperSource.paper_id == paper_id)
    )
    center_sources = [r[0] for r in src_result.all()]

    # Build nodes and links
    nodes_map: dict[str, dict] = {}
    graph_links = []

    # Center node
    center_nid = f"db_{paper_id}"
    nodes_map[center_nid] = {
        "id": center_nid, "paper_id": paper_id, "title": paper.title[:80],
        "citations": paper.citation_count, "doi": paper.doi,
        "source": center_sources[0] if center_sources else "unknown",
        "in_db": True, "is_center": True,
    }

    refs_count = 0
    cits_count = 0

    for cl in citation_links:
        # Target node
        if cl.cited_paper_id:
            target_nid = f"db_{cl.cited_paper_id}"
            if target_nid not in nodes_map:
                info = doi_to_paper.get((cl.cited_doi or "").lower()) or s2_to_paper.get(cl.cited_s2_id or "")
                nodes_map[target_nid] = {
                    "id": target_nid, "paper_id": cl.cited_paper_id,
                    "title": (info["title"] if info else cl.cited_title or "")[:80],
                    "citations": info["citations"] if info else cl.cited_citations,
                    "doi": cl.cited_doi, "source": "database", "in_db": True, "is_center": False,
                }
        else:
            target_nid = f"ext_{cl.cited_s2_id or cl.cited_doi or cl.id}"
            if target_nid not in nodes_map:
                nodes_map[target_nid] = {
                    "id": target_nid, "paper_id": None,
                    "title": (cl.cited_title or "Unknown")[:80],
                    "citations": cl.cited_citations, "doi": cl.cited_doi,
                    "source": "external", "in_db": False, "is_center": False,
                }

        if cl.direction == "references":
            graph_links.append({"source": center_nid, "target": target_nid, "type": "cites"})
            refs_count += 1
        else:
            graph_links.append({"source": target_nid, "target": center_nid, "type": "cites"})
            cits_count += 1

    nodes = list(nodes_map.values())
    in_db_count = sum(1 for n in nodes if n["in_db"])

    return {
        "nodes": nodes,
        "links": graph_links,
        "stats": {
            "total_nodes": len(nodes),
            "total_links": len(graph_links),
            "references": refs_count,
            "cited_by": cits_count,
            "in_db": in_db_count,
            "external": len(nodes) - in_db_count,
            "type": "citations",
        },
    }
