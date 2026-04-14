"""User model for authentication."""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.models.paper import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="viewer")  # "admin" or "viewer"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)


class LoginLog(Base):
    __tablename__ = "login_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    username = Column(String, nullable=False)
    ip = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
