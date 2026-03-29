"""Topic and PaperTopic models."""

import json
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text

from sqlalchemy.orm import relationship

from app.models.paper import Base


class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    # JSON array of search keywords
    keywords_json = Column(Text, default="[]")
    # JSON dict of source-specific queries: {"pubmed": "...", "arxiv": "...", ...}
    source_queries_json = Column(Text, default="{}")
    parent_id = Column(Integer, ForeignKey("topics.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    papers = relationship("PaperTopic", back_populates="topic")
    children = relationship("Topic", backref="parent", remote_side="Topic.id")

    @property
    def keywords(self) -> list[str]:
        return json.loads(self.keywords_json) if self.keywords_json else []

    @keywords.setter
    def keywords(self, value: list[str]):
        self.keywords_json = json.dumps(value)

    @property
    def source_queries(self) -> dict[str, str]:
        return json.loads(self.source_queries_json) if self.source_queries_json else {}

    @source_queries.setter
    def source_queries(self, value: dict[str, str]):
        self.source_queries_json = json.dumps(value)


class PaperTopic(Base):
    __tablename__ = "paper_topics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    topic_id = Column(Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    confidence = Column(Float, default=1.0)

    paper = relationship("Paper", back_populates="topics")
    topic = relationship("Topic", back_populates="papers")
