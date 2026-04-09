"""Pydantic schemas for Paper API."""

from datetime import datetime

from pydantic import BaseModel


class AuthorSchema(BaseModel):
    id: int
    name: str
    affiliation: str | None = None
    orcid: str | None = None

    model_config = {"from_attributes": True}


class TopicAssignment(BaseModel):
    topic_id: int
    topic_name: str
    confidence: float

    model_config = {"from_attributes": True}


class PaperSourceSchema(BaseModel):
    source_name: str
    source_id: str | None = None
    fetched_at: datetime | None = None

    model_config = {"from_attributes": True}


class PaperSummary(BaseModel):
    id: int
    doi: str | None = None
    title: str
    publication_date: str | None = None
    journal: str | None = None
    paper_type: str
    open_access: bool
    has_pdf: bool
    citation_count: int
    sources: list[str]
    topics: list[str]
    keywords: list[str]
    labels: list[dict] = []
    analyses: list[dict] = []
    has_note: bool = False
    disabled: bool = False
    on_zotero: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class PaperDetail(BaseModel):
    id: int
    doi: str | None = None
    title: str
    abstract: str | None = None
    publication_date: str | None = None
    journal: str | None = None
    volume: str | None = None
    pages: str | None = None
    paper_type: str
    open_access: bool
    pdf_url: str | None = None
    has_pdf: bool
    citation_count: int
    external_ids: dict
    validated: bool
    zotero_key: str | None = None
    disabled: bool = False
    authors: list[AuthorSchema]
    topics: list[TopicAssignment]
    keywords: list[str]
    keyword_categories: dict = {}
    source_details: list[PaperSourceSchema]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaperListResponse(BaseModel):
    items: list[PaperSummary]
    total: int
    page: int
    per_page: int
    pages: int


class AnalysisSchema(BaseModel):
    paper_id: int
    summary: str | None = None
    key_findings: list[str]
    methodology: str | None = None
    relevance_score: float
    fl_techniques: list[str]
    generated_at: datetime
    generator: str

    model_config = {"from_attributes": True}
