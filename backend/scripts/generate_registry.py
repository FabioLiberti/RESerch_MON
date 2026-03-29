#!/usr/bin/env python3
"""CLI script to generate JSON + XLSX registry exports."""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import async_session, engine
from app.models.paper import Base
from app.services.export_service import ExportService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("generate_registry")


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    service = ExportService()

    async with async_session() as db:
        logger.info("Generating JSON registry...")
        json_path = await service.export_json(db)
        logger.info(f"JSON: {json_path}")

        logger.info("Generating XLSX registry...")
        xlsx_path = await service.export_xlsx(db)
        logger.info(f"XLSX: {xlsx_path}")

    await engine.dispose()
    logger.info("Registry generation complete")


if __name__ == "__main__":
    asyncio.run(main())
