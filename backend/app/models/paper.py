"""Paper, Author, and Source models."""

import json
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Paper(Base):
    __tablename__ = "papers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    doi = Column(String(255), unique=True, nullable=True, index=True)
    title = Column(Text, nullable=False)
    abstract = Column(Text, nullable=True)
    publication_date = Column(String(10), nullable=True)  # YYYY-MM-DD
    journal = Column(String(500), nullable=True)
    volume = Column(String(50), nullable=True)
    pages = Column(String(50), nullable=True)
    paper_type = Column(String(50), default="journal_article")  # journal_article, preprint, conference
    open_access = Column(Boolean, default=False)
    pdf_url = Column(Text, nullable=True)
    pdf_local_path = Column(Text, nullable=True)
    citation_count = Column(Integer, default=0)
    # JSON-encoded dict: {pmid, pmcid, arxiv_id, s2_id, ieee_id}
    external_ids_json = Column(Text, default="{}")
    # JSON-encoded list of keywords extracted from abstract/tags
    keywords_json = Column(Text, default="[]")
    # JSON-encoded dict of categorized keywords: {"Author Keywords": [...], "MeSH Terms": [...]}
    keyword_categories_json = Column(Text, default="{}")
    zotero_key = Column(String(100), nullable=True)
    validated = Column(Boolean, default=False)
    disabled = Column(Boolean, default=False)
    rating = Column(Integer, nullable=True)  # 1-5 stars
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    authors = relationship("PaperAuthor", back_populates="paper", cascade="all, delete-orphan")
    sources = relationship("PaperSource", back_populates="paper", cascade="all, delete-orphan")
    topics = relationship("PaperTopic", back_populates="paper", cascade="all, delete-orphan")
    analysis = relationship("SyntheticAnalysis", back_populates="paper", uselist=False)

    @property
    def keywords(self) -> list[str]:
        return json.loads(self.keywords_json) if self.keywords_json else []

    @keywords.setter
    def keywords(self, value: list[str]):
        self.keywords_json = json.dumps(value)

    @property
    def keyword_categories(self) -> dict:
        return json.loads(self.keyword_categories_json) if self.keyword_categories_json else {}

    @keyword_categories.setter
    def keyword_categories(self, value: dict):
        self.keyword_categories_json = json.dumps(value)

    @property
    def external_ids(self) -> dict:
        return json.loads(self.external_ids_json) if self.external_ids_json else {}

    @external_ids.setter
    def external_ids(self, value: dict):
        self.external_ids_json = json.dumps(value)

    def __repr__(self):
        return f"<Paper(id={self.id}, doi='{self.doi}', title='{self.title[:50]}...')>"


class Author(Base):
    __tablename__ = "authors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(300), nullable=False, index=True)
    affiliation = Column(Text, nullable=True)
    orcid = Column(String(50), nullable=True)
    s2_author_id = Column(String(50), nullable=True)

    papers = relationship("PaperAuthor", back_populates="author")

    def __repr__(self):
        return f"<Author(id={self.id}, name='{self.name}')>"


class PaperAuthor(Base):
    __tablename__ = "paper_authors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(Integer, ForeignKey("authors.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, default=0)
    is_corresponding = Column(Boolean, default=False)

    paper = relationship("Paper", back_populates="authors")
    author = relationship("Author", back_populates="papers")


class PaperSource(Base):
    __tablename__ = "paper_sources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    source_name = Column(String(50), nullable=False)  # pubmed, biorxiv, semantic_scholar, arxiv, ieee
    source_id = Column(String(255), nullable=True)  # PMID, arXiv ID, S2 ID, etc.
    fetched_at = Column(DateTime, default=datetime.utcnow)
    raw_metadata_json = Column(Text, default="{}")

    paper = relationship("Paper", back_populates="sources")

    @property
    def raw_metadata(self) -> dict:
        return json.loads(self.raw_metadata_json) if self.raw_metadata_json else {}

    @raw_metadata.setter
    def raw_metadata(self, value: dict):
        self.raw_metadata_json = json.dumps(value, default=str)
