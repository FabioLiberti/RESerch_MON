"""FastAPI application factory."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select, text as sqlalchemy_text

from app.api.auth import limiter
from app.config import settings
from app.database import engine, async_session
from app.models.paper import Base
from app.models.topic import Topic
from app.models.review_journal import ReviewerEntry  # noqa: F401 — register with metadata
from app.models.submission_round import SubmissionRound  # noqa: F401 — register with metadata
from app.api.router import api_router

logging.basicConfig(level=getattr(logging, settings.log_level))
logger = logging.getLogger(__name__)

# Default topics seeded on first run
DEFAULT_TOPICS = [
    {
        "name": "Federated Learning",
        "description": "General federated learning research including algorithms, systems, privacy, and optimization",
        "keywords": [
            "federated learning", "federated averaging", "FedAvg", "FedProx",
            "federated optimization", "communication-efficient learning",
            "distributed machine learning", "collaborative learning",
        ],
        "source_queries": {
            "pubmed": '"federated learning"[Title/Abstract]',
            "arxiv": 'ti:"federated learning" OR abs:"federated learning"',
            "semantic_scholar": "federated learning",
            "ieee": '"federated learning"',
            "biorxiv": "federated learning",
        },
    },
    {
        "name": "FL in Healthcare",
        "description": "Federated learning applied to healthcare, clinical studies, medical imaging, and electronic health records",
        "keywords": [
            "federated learning healthcare", "federated learning clinical",
            "federated learning medical", "federated learning hospital",
            "federated learning EHR", "federated learning imaging",
            "privacy-preserving healthcare", "federated clinical trial",
        ],
        "source_queries": {
            "pubmed": '"federated learning"[Title/Abstract] AND ("healthcare"[MeSH Terms] OR "clinical study"[Title/Abstract] OR "hospitals"[MeSH Terms] OR "electronic health records"[MeSH Terms] OR "medical imaging"[Title/Abstract])',
            "arxiv": 'ti:"federated learning" AND (abs:healthcare OR abs:clinical OR abs:medical OR abs:hospital)',
            "semantic_scholar": "federated learning healthcare clinical medical",
            "ieee": '"federated learning" AND ("healthcare" OR "clinical" OR "medical" OR "hospital")',
            "biorxiv": "federated learning healthcare",
        },
    },
    {
        "name": "European Health Data Space",
        "description": "European Health Data Space (EHDS) regulation, implementation, and related health data governance",
        "keywords": [
            "European Health Data Space", "EHDS", "health data governance",
            "health data sharing Europe", "EU health data regulation",
            "cross-border health data", "secondary use health data",
        ],
        "source_queries": {
            "pubmed": '"European Health Data Space"[Title/Abstract] OR ("EHDS"[Title/Abstract] AND "health"[Title/Abstract])',
            "arxiv": 'abs:"European Health Data Space" OR (abs:EHDS AND abs:health)',
            "semantic_scholar": '"European Health Data Space" OR "EHDS" health data',
            "ieee": '"European Health Data Space" OR ("EHDS" AND "health")',
            "biorxiv": "European Health Data Space",
        },
    },
]


async def seed_default_topics():
    """Seed default topics if none exist."""
    async with async_session() as session:
        result = await session.execute(select(Topic).limit(1))
        if result.scalar_one_or_none() is not None:
            return

        logger.info("Seeding default topics...")
        for topic_data in DEFAULT_TOPICS:
            topic = Topic(
                name=topic_data["name"],
                description=topic_data["description"],
            )
            topic.keywords = topic_data["keywords"]
            topic.source_queries = topic_data["source_queries"]
            session.add(topic)

        await session.commit()
        logger.info(f"Seeded {len(DEFAULT_TOPICS)} default topics")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created")

    # Lightweight column migrations (idempotent ALTER TABLE ADD COLUMN IF NOT EXISTS)
    async with engine.begin() as conn:
        for stmt in [
            "ALTER TABLE papers ADD COLUMN paper_role VARCHAR(20) DEFAULT 'bibliography'",
            "ALTER TABLE peer_reviews ADD COLUMN paper_id INTEGER REFERENCES papers(id)",
            "ALTER TABLE submission_rounds ADD COLUMN deadline VARCHAR(10)",
            "ALTER TABLE papers ADD COLUMN conference_url TEXT",
            "ALTER TABLE papers ADD COLUMN conference_notes TEXT",
            "ALTER TABLE papers ADD COLUMN github_url TEXT",
            "ALTER TABLE papers ADD COLUMN created_via VARCHAR(30)",
        ]:
            try:
                await conn.execute(sqlalchemy_text(stmt))
                logger.info(f"Migration applied: {stmt[:60]}...")
            except Exception:
                pass  # Column already exists

    # Seed defaults
    await seed_default_topics()

    # Seed admin user
    from app.services.auth import seed_admin_user
    async with async_session() as session:
        await seed_admin_user(session)
        await session.commit()

    # Reset stuck smart search jobs (running → failed, so they show in UI for retry)
    try:
        from sqlalchemy import update as sql_update
        from app.models.analysis import SmartSearchJob
        async with async_session() as session:
            await session.execute(
                sql_update(SmartSearchJob)
                .where(SmartSearchJob.status.in_(["running", "pending"]))
                .values(status="failed", error_message="Interrupted by server restart")
            )
            await session.commit()
    except Exception:
        pass

    # Start scheduler (only in production)
    if settings.app_env != "development":
        from app.tasks.scheduler import setup_scheduler
        sched = setup_scheduler()
        sched.start()
        logger.info("Scheduler started")

    yield

    # Shutdown scheduler
    if settings.app_env != "development":
        from app.tasks.scheduler import scheduler
        scheduler.shutdown(wait=False)

    await engine.dispose()
    logger.info("Application shutdown")


app = FastAPI(
    title="FL-RESEARCH-MONITOR",
    description="Automated scientific paper discovery system for Federated Learning research",
    version="0.4.0",
    lifespan=lifespan,
)

# Rate limiting (SlowAPI) — per-IP limits on sensitive endpoints
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(api_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
