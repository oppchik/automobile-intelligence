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
