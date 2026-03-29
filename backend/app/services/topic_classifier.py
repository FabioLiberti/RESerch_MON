"""Topic classification via keyword-weighted matching."""

import logging
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.topic import PaperTopic, Topic

logger = logging.getLogger(__name__)


def compute_topic_confidence(
    title: str, abstract: str | None, keywords: list[str]
) -> float:
    """Compute confidence score for a topic based on keyword matching.

    Returns a score between 0.0 and 1.0:
    - Title match: 0.4 per keyword (higher weight)
    - Abstract match: 0.2 per keyword
    - Capped at 1.0
    """
    if not keywords:
        return 0.0

    text_title = title.lower()
    text_abstract = (abstract or "").lower()
    score = 0.0
    matched = 0

    for keyword in keywords:
        kw = keyword.lower()

        # Title match (higher weight)
        if kw in text_title:
            score += 0.4
            matched += 1
            continue

        # Abstract match
        if kw in text_abstract:
            score += 0.2
            matched += 1

    # Bonus for multiple keyword matches
    if matched >= 3:
        score += 0.1

    return min(score, 1.0)


class TopicClassifier:
    """Classifies papers into topics based on keyword matching."""

    async def classify_paper(
        self,
        db: AsyncSession,
        paper_id: int,
        title: str,
        abstract: str | None,
    ) -> list[dict]:
        """Classify a paper into all matching topics.

        Returns list of {topic_id, topic_name, confidence}.
        """
        result = await db.execute(select(Topic))
        topics = result.scalars().all()

        assignments = []
        for topic in topics:
            confidence = compute_topic_confidence(title, abstract, topic.keywords)

            if confidence > 0.0:
                # Check if assignment already exists
                existing = await db.execute(
                    select(PaperTopic).where(
                        PaperTopic.paper_id == paper_id,
                        PaperTopic.topic_id == topic.id,
                    )
                )
                paper_topic = existing.scalar_one_or_none()

                if paper_topic:
                    # Update confidence if changed
                    if abs(paper_topic.confidence - confidence) > 0.01:
                        paper_topic.confidence = confidence
                else:
                    paper_topic = PaperTopic(
                        paper_id=paper_id,
                        topic_id=topic.id,
                        confidence=confidence,
                    )
                    db.add(paper_topic)

                assignments.append({
                    "topic_id": topic.id,
                    "topic_name": topic.name,
                    "confidence": confidence,
                })

        return assignments
