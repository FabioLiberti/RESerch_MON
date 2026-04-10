"""Helpers to read/write runtime app settings.

Defines well-known setting keys + accessors. Both async (DB session) and sync
(direct sqlite) flavours are exposed because PDF rendering may run from
contexts that don't have an async session handy.
"""

import logging
import sqlite3
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_config
from app.models.app_setting import AppSetting

logger = logging.getLogger(__name__)

# ----- well-known keys -----
KEY_PDF_AUTHOR_SIGNATURE = "pdf.author_signature"
KEY_PDF_AUTHOR_AFFILIATION = "pdf.author_affiliation"

DEFAULTS: dict[str, str] = {
    KEY_PDF_AUTHOR_SIGNATURE: "",
    KEY_PDF_AUTHOR_AFFILIATION: "",
}


# ----- async (preferred when called from API endpoints) -----

async def get_setting(db: AsyncSession, key: str, default: str | None = None) -> str:
    item = await db.get(AppSetting, key)
    if item and item.value is not None:
        return item.value
    return default if default is not None else DEFAULTS.get(key, "")


async def set_setting(db: AsyncSession, key: str, value: str) -> None:
    item = await db.get(AppSetting, key)
    if item:
        item.value = value
        item.updated_at = datetime.utcnow()
    else:
        db.add(AppSetting(key=key, value=value, updated_at=datetime.utcnow()))
    await db.commit()


async def get_all_settings(db: AsyncSession) -> dict[str, str]:
    res = await db.execute(select(AppSetting))
    items = {row.key: (row.value or "") for row in res.scalars().all()}
    # Fill defaults for known keys not yet stored
    for k, default in DEFAULTS.items():
        items.setdefault(k, default)
    return items


# ----- sync (for code paths without an async session) -----

def _resolve_db_path() -> str:
    """Pull the sqlite file path from DATABASE_URL config."""
    url = app_config.database_url
    if url.startswith("sqlite+aiosqlite:///"):
        return url.replace("sqlite+aiosqlite:///", "", 1)
    if url.startswith("sqlite:///"):
        return url.replace("sqlite:///", "", 1)
    return "data/db/research_monitor.db"


def get_setting_sync(key: str, default: str | None = None) -> str:
    """Read a setting via direct sqlite — usable from sync PDF generators."""
    try:
        db_path = _resolve_db_path()
        if not Path(db_path).exists():
            return default if default is not None else DEFAULTS.get(key, "")
        conn = sqlite3.connect(db_path)
        try:
            row = conn.execute(
                "SELECT value FROM app_settings WHERE key = ?", (key,)
            ).fetchone()
            if row and row[0] is not None:
                return row[0]
        finally:
            conn.close()
    except Exception as e:
        logger.warning(f"get_setting_sync({key}) failed: {e}")
    return default if default is not None else DEFAULTS.get(key, "")
