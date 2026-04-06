"""Topics API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.topic import Topic
from app.models.user import User
from app.api.auth import require_admin

router = APIRouter()


class TopicCreate(BaseModel):
    name: str
    description: str | None = None
    keywords: list[str] = []
    source_queries: dict[str, str] = {}
    parent_id: int | None = None


class TopicResponse(BaseModel):
    id: int
    name: str
    description: str | None
    keywords: list[str]
    source_queries: dict[str, str]
    parent_id: int | None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[TopicResponse])
async def list_topics(db: AsyncSession = Depends(get_db)):
    """List all configured topics."""
    result = await db.execute(select(Topic).order_by(Topic.id))
    topics = result.scalars().all()
    return [
        TopicResponse(
            id=t.id,
            name=t.name,
            description=t.description,
            keywords=t.keywords,
            source_queries=t.source_queries,
            parent_id=t.parent_id,
        )
        for t in topics
    ]


@router.post("", response_model=TopicResponse)
async def create_topic(data: TopicCreate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Create a new topic."""
    topic = Topic(name=data.name, description=data.description, parent_id=data.parent_id)
    topic.keywords = data.keywords
    topic.source_queries = data.source_queries
    db.add(topic)
    await db.flush()
    return TopicResponse(
        id=topic.id,
        name=topic.name,
        description=topic.description,
        keywords=topic.keywords,
        source_queries=topic.source_queries,
        parent_id=topic.parent_id,
    )


@router.put("/{topic_id}", response_model=TopicResponse)
async def update_topic(topic_id: int, data: TopicCreate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Update an existing topic."""
    result = await db.execute(select(Topic).where(Topic.id == topic_id))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    topic.name = data.name
    topic.description = data.description
    topic.keywords = data.keywords
    topic.source_queries = data.source_queries
    topic.parent_id = data.parent_id
    await db.flush()

    return TopicResponse(
        id=topic.id,
        name=topic.name,
        description=topic.description,
        keywords=topic.keywords,
        source_queries=topic.source_queries,
        parent_id=topic.parent_id,
    )


@router.delete("/{topic_id}")
async def delete_topic(topic_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Delete a topic."""
    result = await db.execute(select(Topic).where(Topic.id == topic_id))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    await db.delete(topic)
    return {"status": "deleted"}
