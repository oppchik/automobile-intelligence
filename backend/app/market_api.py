"""API расчёта рыночной оценки по локальным объявлениям."""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from .market_service import estimate_market, load_listings

router = APIRouter()


class MarketRequest(BaseModel):
    brand: str = Field(min_length=1)
    model: str = Field(min_length=1)
    year: int = Field(ge=2005, le=2026)
    mileage: int = Field(ge=0)
    region: str = Field(min_length=1)
    repair_cost: float = Field(ge=0)
    severity: float = Field(ge=0, le=1)


@router.post('/api/market-value')
def market_value(req: MarketRequest):
    return estimate_market(load_listings(), **req.model_dump())
