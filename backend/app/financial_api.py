
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Literal

from .financial_advisor import compare_scenarios


router = APIRouter()


class FinancialAdviceRequest(BaseModel):
    as_is_value: float = Field(ge=0)
    after_repair_value: float = Field(ge=0)
    repair_cost: float = Field(ge=0)

    years: int = Field(ge=1, le=10)

    annual_costs: dict[str, float] = Field(default_factory=dict)

    alternative_transport_per_year: float | None = Field(
        default=None,
        ge=0
    )

    goal: Literal["cash_now", "keep_using"] = "cash_now"

    repair_budget: float | None = Field(
        default=None,
        ge=0
    )

    risk: Literal["low", "normal", "high"] = "normal"


@router.post("/api/financial-advice")
def financial_advice(req: FinancialAdviceRequest):
    try:
        return compare_scenarios(**req.model_dump())

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc)
        ) from exc
