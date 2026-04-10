"""API router aggregating all sub-routers."""

from fastapi import APIRouter, Depends

from app.api.auth import router as auth_router, get_current_user, require_admin
from app.api.papers import router as papers_router
from app.api.analytics import router as analytics_router
from app.api.sources import router as sources_router
from app.api.topics import router as topics_router
from app.api.exports import router as exports_router
from app.api.discovery import router as discovery_router
from app.api.reports import router as reports_router
from app.api.paper_analysis import router as paper_analysis_router
from app.api.smart_search import router as smart_search_router
from app.api.network import router as network_router
from app.api.labels import router as labels_router
from app.api.bibliography import router as bibliography_router
from app.api.comparison import router as comparison_router
from app.api.zotero import router as zotero_router
from app.api.app_settings import router as app_settings_router
from app.api.peer_review import router as peer_review_router
from app.api.paper_quality import router as paper_quality_router

api_router = APIRouter(prefix="/api/v1")

# Public routes (no auth required)
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])

# Protected routes (any authenticated user)
api_router.include_router(papers_router, prefix="/papers", tags=["papers"], dependencies=[Depends(get_current_user)])
api_router.include_router(analytics_router, prefix="/analytics", tags=["analytics"], dependencies=[Depends(get_current_user)])
api_router.include_router(sources_router, prefix="/sources", tags=["sources"], dependencies=[Depends(get_current_user)])
api_router.include_router(exports_router, prefix="/exports", tags=["exports"], dependencies=[Depends(get_current_user)])
api_router.include_router(reports_router, prefix="/reports", tags=["reports"], dependencies=[Depends(get_current_user)])

# Admin-only routes
api_router.include_router(topics_router, prefix="/topics", tags=["topics"], dependencies=[Depends(get_current_user)])
api_router.include_router(discovery_router, prefix="/discovery", tags=["discovery"], dependencies=[Depends(get_current_user)])
api_router.include_router(paper_analysis_router, prefix="/analysis", tags=["analysis"], dependencies=[Depends(get_current_user)])
api_router.include_router(smart_search_router, prefix="/smart-search", tags=["smart-search"], dependencies=[Depends(get_current_user)])
api_router.include_router(network_router, prefix="/network", tags=["network"], dependencies=[Depends(get_current_user)])
api_router.include_router(labels_router, prefix="/labels", tags=["labels"], dependencies=[Depends(get_current_user)])
api_router.include_router(bibliography_router, prefix="/bibliography", tags=["bibliography"], dependencies=[Depends(get_current_user)])
api_router.include_router(comparison_router, prefix="/comparison", tags=["comparison"], dependencies=[Depends(get_current_user)])
api_router.include_router(zotero_router, prefix="/zotero", tags=["zotero"], dependencies=[Depends(get_current_user)])
api_router.include_router(app_settings_router, prefix="/app-settings", tags=["app-settings"], dependencies=[Depends(get_current_user)])
api_router.include_router(peer_review_router, prefix="/peer-review", tags=["peer-review"], dependencies=[Depends(get_current_user)])
api_router.include_router(paper_quality_router, prefix="/paper-quality", tags=["paper-quality"], dependencies=[Depends(get_current_user)])
