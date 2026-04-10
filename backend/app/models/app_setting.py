"""Simple key/value app settings table for runtime-editable configuration."""

from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text

from app.models.paper import Base


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
