"""Analytics API endpoints."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.paper import Paper, PaperSource
from app.models.topic import PaperTopic, Topic
from app.models.analysis import FetchLog
from app.schemas.analytics import (
    HeatmapDay,
    HeatmapResponse,
    OverviewStats,
    SourceStat,
    TimelinePoint,
    TimelineResponse,
    TopicStat,
)

router = APIRouter()


@router.get("/overview", response_model=OverviewStats)
async def get_overview(db: AsyncSession = Depends(get_db)):
    """Dashboard overview statistics."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    week_ago = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
    month_ago = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")

    total = (await db.execute(select(func.count(Paper.id)))).scalar() or 0
    today_count = (
        await db.execute(
            select(func.count(Paper.id)).where(Paper.publication_date == today)
        )
    ).scalar() or 0
    week_count = (
        await db.execute(
            select(func.count(Paper.id)).where(Paper.publication_date >= week_ago)
        )
    ).scalar() or 0
    month_count = (
        await db.execute(
            select(func.count(Paper.id)).where(Paper.publication_date >= month_ago)
        )
    ).scalar() or 0
    pdf_count = (
        await db.execute(
            select(func.count(Paper.id)).where(Paper.pdf_local_path.isnot(None))
        )
    ).scalar() or 0

    # Source breakdown
    source_rows = (
        await db.execute(
            select(PaperSource.source_name, func.count(PaperSource.id))
            .group_by(PaperSource.source_name)
        )
    ).all()

    sources = []
    for name, count in source_rows:
        last_log = (
            await db.execute(
                select(FetchLog.completed_at)
                .where(FetchLog.source_name == name)
                .order_by(FetchLog.completed_at.desc())
                .limit(1)
            )
        ).scalar()
        sources.append(
            SourceStat(name=name, count=count, last_fetch=str(last_log) if last_log else None)
        )

    # Topic breakdown
    topic_rows = (
        await db.execute(
            select(Topic.name, func.count(PaperTopic.id))
            .join(PaperTopic, PaperTopic.topic_id == Topic.id)
            .group_by(Topic.name)
        )
    ).all()
    topics = [TopicStat(name=name, count=count) for name, count in topic_rows]

    return OverviewStats(
        total_papers=total,
        papers_today=today_count,
        papers_this_week=week_count,
        papers_this_month=month_count,
        total_with_pdf=pdf_count,
        sources=sources,
        topics=topics,
    )


@router.get("/timeline", response_model=TimelineResponse)
async def get_timeline(
    interval: str = Query("week", pattern="^(day|week|month)$"),
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Papers added over time."""
    query = select(Paper.publication_date, func.count(Paper.id)).group_by(
        Paper.publication_date
    )
    if date_from:
        query = query.where(Paper.publication_date >= date_from)
    if date_to:
        query = query.where(Paper.publication_date <= date_to)
    query = query.order_by(Paper.publication_date)

    rows = (await db.execute(query)).all()
    data = [TimelinePoint(date=date or "unknown", count=count) for date, count in rows]

    return TimelineResponse(data=data, interval=interval)


@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap(
    year: int = Query(default=2026),
    db: AsyncSession = Depends(get_db),
):
    """GitHub-style activity heatmap."""
    start = f"{year}-01-01"
    end = f"{year}-12-31"

    rows = (
        await db.execute(
            select(Paper.publication_date, func.count(Paper.id))
            .where(Paper.publication_date >= start, Paper.publication_date <= end)
            .group_by(Paper.publication_date)
            .order_by(Paper.publication_date)
        )
    ).all()

    data = [HeatmapDay(date=date, count=count) for date, count in rows if date]
    return HeatmapResponse(data=data, year=year)
