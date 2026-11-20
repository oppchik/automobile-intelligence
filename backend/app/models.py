from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func

from .database import Base


class HistoryEntry(Base):
    __tablename__ = "history_entries"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True, nullable=False)
    brand = Column(String, nullable=False)
    model = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    mileage = Column(Integer, nullable=False)
    region = Column(String, nullable=False)
    condition = Column(String, nullable=False)
    categories = Column(JSON, nullable=False)
    severity = Column(Float, nullable=False)
    variant_index = Column(Integer, nullable=False)
    years = Column(Integer, nullable=False)
    cost = Column(Float, nullable=False)
    scenario1 = Column(Float, nullable=False)
    scenario2 = Column(Float, nullable=False)
    decision = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    advisor = Column(JSON(none_as_null=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    token_hash = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime, nullable=False)


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True, nullable=False)
    part_key = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
