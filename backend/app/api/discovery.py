"""Discovery trigger API endpoint."""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session
from app.models.topic import Topic
from app.models.user import User
from app.services.discovery import DiscoveryService
from app.api.auth import require_admin

logger = logging.getLogger(__name__)

router = APIRouter()

# Track running discovery state
_discovery_running = False


async def _run_discovery(topic_name: str | None, source: str | None, max_per_source: int):
    """Background task for paper discovery."""
    global _discovery_running
    _discovery_running = True
    discovery = DiscoveryService(download_pdfs=True, validate=True)

    try:
        async with async_session() as db:
            if topic_name:
                result = await db.execute(
                    select(Topic).where(Topic.name.ilike(f"%{topic_name}%"))
                )
                topic = result.scalar_one_or_none()
                if topic:
                    sources = [source] if source else None
                    await discovery.discover_papers(db, topic, sources=sources, max_per_source=max_per_source)
                    await db.commit()
            else:
                await discovery.discover_all_topics(db, max_per_source=max_per_source)
                await db.commit()
    except Exception as e:
        logger.error(f"Discovery error: {e}")
    finally:
        await discovery.close()
        _discovery_running = False


@router.post("/trigger")
async def trigger_discovery(
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin),
    topic: str | None = Query(None, description="Topic name to search"),
    source: str | None = Query(None, description="Specific source to query"),
    max_per_source: int = Query(20, ge=1, le=200),
):
    """Trigger a paper discovery run (runs in background)."""
    if _discovery_running:
        return {"status": "already_running", "message": "A discovery is already in progress"}

    background_tasks.add_task(_run_discovery, topic, source, max_per_source)
    return {
        "status": "started",
        "topic": topic or "all",
        "source": source or "all",
        "max_per_source": max_per_source,
    }


@router.get("/status")
async def discovery_status():
    """Check if a discovery is currently running."""
    return {"running": _discovery_running}
