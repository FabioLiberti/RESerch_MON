"""Sources API endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.analysis import FetchLog
from app.models.paper import PaperSource

router = APIRouter()


@router.get("")
async def list_sources(db: AsyncSession = Depends(get_db)):
    """List all sources with stats."""
    source_names = ["pubmed", "biorxiv", "semantic_scholar", "arxiv", "ieee"]
    sources = []

    for name in source_names:
        count = (
            await db.execute(
                select(func.count(PaperSource.id)).where(PaperSource.source_name == name)
            )
        ).scalar() or 0

        last_log = (
            await db.execute(
                select(FetchLog)
                .where(FetchLog.source_name == name)
                .order_by(FetchLog.completed_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        sources.append({
            "name": name,
            "paper_count": count,
            "last_fetch": str(last_log.completed_at) if last_log and last_log.completed_at else None,
            "last_status": last_log.status if last_log else "never",
        })

    return sources


@router.get("/{source_name}/logs")
async def get_source_logs(
    source_name: str,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get fetch history for a source."""
    query = (
        select(FetchLog)
        .where(FetchLog.source_name == source_name)
        .order_by(FetchLog.started_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "source_name": log.source_name,
            "query_topic": log.query_topic,
            "started_at": str(log.started_at),
            "completed_at": str(log.completed_at) if log.completed_at else None,
            "papers_found": log.papers_found,
            "papers_new": log.papers_new,
            "status": log.status,
            "errors": log.errors,
        }
        for log in logs
    ]
