from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True, nullable=False)
    part_key = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
