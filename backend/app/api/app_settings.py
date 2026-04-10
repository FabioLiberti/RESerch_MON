"""API for runtime app settings (admin only)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin, get_current_user
from app.database import get_db
from app.models.user import User
from app.services.app_settings import (
    DEFAULTS,
    get_all_settings,
    set_setting,
)

router = APIRouter()


class SettingUpdate(BaseModel):
    key: str
    value: str


@router.get("")
async def list_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all known app settings (with current value or default)."""
    return await get_all_settings(db)


@router.put("")
async def update_setting(
    body: SettingUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a single setting (admin only)."""
    if body.key not in DEFAULTS:
        raise HTTPException(status_code=400, detail=f"Unknown setting key: {body.key}")
    await set_setting(db, body.key, body.value)
    return {"key": body.key, "value": body.value}
