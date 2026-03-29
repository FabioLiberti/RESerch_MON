"""API router aggregating all sub-routers."""

from fastapi import APIRouter

from app.api.papers import router as papers_router
from app.api.analytics import router as analytics_router
from app.api.sources import router as sources_router
from app.api.topics import router as topics_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(papers_router, prefix="/papers", tags=["papers"])
api_router.include_router(analytics_router, prefix="/analytics", tags=["analytics"])
api_router.include_router(sources_router, prefix="/sources", tags=["sources"])
api_router.include_router(topics_router, prefix="/topics", tags=["topics"])
