"""Pydantic schemas for Analytics API."""

from pydantic import BaseModel


class SourceStat(BaseModel):
    name: str
    count: int
    last_fetch: str | None = None


class TopicStat(BaseModel):
    name: str
    count: int


class OverviewStats(BaseModel):
    total_papers: int
    papers_today: int
    papers_this_week: int
    papers_this_month: int
    total_with_pdf: int
    sources: list[SourceStat]
    topics: list[TopicStat]


class TimelinePoint(BaseModel):
    date: str
    count: int
    source: str | None = None


class TimelineResponse(BaseModel):
    data: list[TimelinePoint]
    interval: str


class HeatmapDay(BaseModel):
    date: str
    count: int


class HeatmapResponse(BaseModel):
    data: list[HeatmapDay]
    year: int
