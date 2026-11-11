from typing import Literal

from pydantic import BaseModel, Field


class CalculateRequest(BaseModel):
    brand: str
    model: str
    year: int = Field(ge=2005, le=2026)
    mileage: int = Field(ge=0)
    region: str
    condition: str = "good"
    description: str = ""
    damage_categories: list[str] = Field(default_factory=list)
    photo_count: int = 0
    photo_severity: Literal["minor", "moderate", "severe"] | None = None


class VariantOut(BaseModel):
    key: str
    name: str
    cost: float
    parts_cost: float
    labor_cost: float
    diagnostic: float
    contingency: float
    eta: str


class CalculateResponse(BaseModel):
    brand: str
    model: str
    year: int
    mileage: int
    region: str
    condition: str
    categories: list[str]
    category_labels: list[str]
    required_parts: list[str]
    consumables: list[tuple[str, float]]
    severity: float
    good_value: float
    after_value: float
    as_is_value: float
    variants: list[VariantOut]
    scale: float


class ScenarioRequest(BaseModel):
    calculation: CalculateResponse
    variant_index: int = Field(ge=0, le=2, default=1)
    years: int = Field(ge=1, le=3, default=2)


class ScenarioResponse(BaseModel):
    cost: float
    scenario1: float
    scenario2: float
    scenario3: float
    upkeep_per_year: float
    decision: str
    decision_label: str
    delta: float
    repair_ratio: float


class HistorySaveRequest(BaseModel):
    session_id: str
    brand: str
    model: str
    year: int
    mileage: int
    region: str
    condition: str
    categories: list[str]
    severity: float
    variant_index: int
    years: int
    cost: float
    scenario1: float
    scenario2: float
    decision: str


class HistoryOut(HistorySaveRequest):
    id: int

    class Config:
        from_attributes = True


class WatchlistToggleRequest(BaseModel):
    session_id: str
    part_key: str


class EstimatePart(BaseModel):
    name: str
    condition: str
    new_price: int
    used_price: int | None
    base_price: int
    cost: float
    amount: int


class EstimateConsumable(BaseModel):
    name: str
    base_price: int
    cost: float
    amount: int


class EstimateLabor(BaseModel):
    key: str
    label: str
    hours: float
    rate: float
    cost: float
    amount: int


class EstimateAmounts(BaseModel):
    parts: int
    labor: int
    diagnostic: int
    contingency: int
    total: int


class EstimateVariant(BaseModel):
    key: str
    name: str
    eta: str
    parts: list[EstimatePart]
    consumables: list[EstimateConsumable]
    labor_lines: list[EstimateLabor]
    parts_markup: float
    labor_multiplier: float
    hourly_rate: float
    parts_cost: float
    labor_cost: float
    diagnostic: float
    contingency: float
    cost: float
    amounts: EstimateAmounts
    savings_vs_dealer: int
    savings_percent: float


class EstimateResponse(BaseModel):
    categories: list[str]
    scale: float
    region: str
    region_coefficient: float
    base_hourly_rate: int
    diagnostic_base: int
    contingency_rate: float
    hours_by_category: dict[str, float]
    total_hours: float
    cheapest: str
    used_parts_applicable: bool
    variants: list[EstimateVariant]


class SeverityPhoto(BaseModel):
    name: str
    status: str
    reason: str | None = None
    severity: str | None = None
    confidence: float | None = None


class SeverityResponse(BaseModel):
    status: str
    message: str
    severity: str | None = None
    confidence: float | None = None
    probabilities: dict[str, float] | None = None
    needs_manual_review: bool
    tau: float | None = None
    photos: list[SeverityPhoto]
    elapsed_ms: int
