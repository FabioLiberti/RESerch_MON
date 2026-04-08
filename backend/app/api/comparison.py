"""Comparison API — structured analysis data for cross-paper comparison."""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.paper import Paper
from app.models.label import Label, PaperLabel
from app.models.structured_analysis import StructuredAnalysis
from app.models.user import User
from app.api.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/papers")
async def get_comparison_data(
    paper_ids: str = Query(..., description="Comma-separated paper IDs"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get structured analysis data for multiple papers for comparison."""
    ids = [int(x.strip()) for x in paper_ids.split(",") if x.strip().isdigit()]
    if not ids:
        return []

    result = await db.execute(
        select(StructuredAnalysis, Paper.title, Paper.doi, Paper.publication_date)
        .join(Paper, StructuredAnalysis.paper_id == Paper.id)
        .where(StructuredAnalysis.paper_id.in_(ids))
        .order_by(StructuredAnalysis.created_at.desc())
    )

    # Fetch labels for all requested papers
    label_result = await db.execute(
        select(PaperLabel.paper_id, Label.name, Label.color)
        .join(Label, PaperLabel.label_id == Label.id)
        .where(PaperLabel.paper_id.in_(ids))
    )
    paper_labels: dict[int, list[dict]] = {}
    for pid, lname, lcolor in label_result.all():
        paper_labels.setdefault(pid, []).append({"name": lname, "color": lcolor})

    # Keep only latest per paper
    seen = set()
    items = []
    for row in result.all():
        sa, title, doi, pub_date = row
        if sa.paper_id in seen:
            continue
        seen.add(sa.paper_id)

        items.append({
            "paper_id": sa.paper_id,
            "title": title,
            "doi": doi,
            "publication_date": pub_date,
            "labels": paper_labels.get(sa.paper_id, []),
            "problem_addressed": sa.problem_addressed,
            "proposed_method": sa.proposed_method,
            "fl_techniques": sa.fl_techniques,
            "datasets": sa.datasets,
            "baselines": sa.baselines,
            "best_metric_name": sa.best_metric_name,
            "best_metric_value": sa.best_metric_value,
            "best_baseline_name": sa.best_baseline_name,
            "best_baseline_value": sa.best_baseline_value,
            "improvement_delta": sa.improvement_delta,
            "privacy_mechanism": sa.privacy_mechanism,
            "privacy_formal": sa.privacy_formal,
            "reproducibility_score": sa.reproducibility_score,
            "novelty_level": sa.novelty_level,
            "relevance": sa.relevance,
            "healthcare_applicable": sa.healthcare_applicable,
            "healthcare_evidence": sa.healthcare_evidence,
            "key_findings_summary": sa.key_findings_summary,
            "limitations_declared": sa.limitations_declared,
            "limitations_identified": sa.limitations_identified,
            "extra": sa.extra,
        })

    return items


@router.get("/all")
async def get_all_structured(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all structured analysis data (latest per paper)."""
    result = await db.execute(
        select(StructuredAnalysis, Paper.title, Paper.doi, Paper.publication_date)
        .join(Paper, StructuredAnalysis.paper_id == Paper.id)
        .order_by(StructuredAnalysis.created_at.desc())
    )

    seen = set()
    items = []
    for row in result.all():
        sa, title, doi, pub_date = row
        if sa.paper_id in seen:
            continue
        seen.add(sa.paper_id)

        items.append({
            "paper_id": sa.paper_id,
            "title": title[:80] if title else None,
            "proposed_method": sa.proposed_method,
            "fl_techniques": sa.fl_techniques,
            "best_metric_name": sa.best_metric_name,
            "best_metric_value": sa.best_metric_value,
            "improvement_delta": sa.improvement_delta,
            "privacy_mechanism": sa.privacy_mechanism,
            "novelty_level": sa.novelty_level,
            "relevance": sa.relevance,
            "healthcare_applicable": sa.healthcare_applicable,
        })

    return items


@router.get("/gaps")
async def find_research_gaps(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analyze research gaps from structured analysis data."""
    result = await db.execute(
        select(StructuredAnalysis)
        .order_by(StructuredAnalysis.created_at.desc())
    )

    all_data = result.scalars().all()

    # Aggregate
    from collections import Counter

    technique_counts = Counter()
    dataset_counts = Counter()
    privacy_counts = Counter()
    novelty_counts = Counter()
    relevance_counts = Counter()
    healthcare_count = 0
    all_limitations = []

    seen_papers = set()
    for sa in all_data:
        if sa.paper_id in seen_papers:
            continue
        seen_papers.add(sa.paper_id)

        for t in sa.fl_techniques:
            technique_counts[t] += 1
        for d in sa.datasets:
            dataset_counts[d] += 1
        if sa.privacy_mechanism:
            privacy_counts[sa.privacy_mechanism] += 1
        if sa.novelty_level:
            novelty_counts[sa.novelty_level] += 1
        if sa.relevance:
            relevance_counts[sa.relevance] += 1
        if sa.healthcare_applicable:
            healthcare_count += 1
        all_limitations.extend(sa.limitations_identified)

    return {
        "total_papers_analyzed": len(seen_papers),
        "fl_techniques": dict(technique_counts.most_common(20)),
        "datasets_used": dict(dataset_counts.most_common(20)),
        "privacy_mechanisms": dict(privacy_counts.most_common()),
        "novelty_distribution": dict(novelty_counts),
        "relevance_distribution": dict(relevance_counts),
        "healthcare_applicable_count": healthcare_count,
        "common_limitations": Counter(all_limitations).most_common(10),
    }
