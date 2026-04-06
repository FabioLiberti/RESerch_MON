"""FastAPI application factory."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import engine, async_session
from app.models.paper import Base
from app.models.topic import Topic
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

    # Seed defaults
    await seed_default_topics()

    # Seed admin user
    from app.services.auth import seed_admin_user
    async with async_session() as session:
        await seed_admin_user(session)
        await session.commit()

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
