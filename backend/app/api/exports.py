"""Exports API endpoints for JSON and XLSX."""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.export_service import ExportService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/json")
async def export_json(db: AsyncSession = Depends(get_db)):
    """Export the full paper registry as JSON."""
    service = ExportService()
    filepath = await service.export_json(db)
    return FileResponse(
        str(filepath),
        media_type="application/json",
        filename="fl_research_registry.json",
    )


@router.get("/xlsx")
async def export_xlsx(db: AsyncSession = Depends(get_db)):
    """Export the full paper registry as XLSX."""
    service = ExportService()
    filepath = await service.export_xlsx(db)
    return FileResponse(
        str(filepath),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="fl_research_registry.xlsx",
    )
