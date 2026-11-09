from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import schemas, models
from .database import Base, engine, get_db
from .data import BRANDS, REGIONS, CONDITIONS, CONDITION_LABELS, DAMAGE_CATEGORIES
from .engine import run_calculation, compute_scenarios, build_part_offers, CalculationResult, Variant
from .repair_estimator import calculate_detailed_repair

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Авто-Интеллект API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # в проде сузить до домена фронтенда
    allow_methods=["*"],
    allow_headers=["*"],
)


def _to_response(r: CalculationResult) -> schemas.CalculateResponse:
    return schemas.CalculateResponse(
        brand=r.brand, model=r.model, year=r.year, mileage=r.mileage,
        region=r.region, condition=r.condition, categories=r.categories,
        category_labels=[DAMAGE_CATEGORIES[k]["label"] for k in r.categories],
        required_parts=r.required_parts,
        consumables=[(n, p) for n, p in r.consumables],
        severity=r.severity, good_value=r.good_value, after_value=r.after_value,
        as_is_value=r.as_is_value, scale=r.scale,
        variants=[
            schemas.VariantOut(
                key=v.key, name=v.name, cost=v.cost, parts_cost=v.parts_cost,
                labor_cost=v.labor_cost, diagnostic=v.diagnostic,
                contingency=v.contingency, eta=v.eta,
            ) for v in r.variants
        ],
    )


def _from_response(c: schemas.CalculateResponse) -> CalculationResult:
    variants = [
        Variant(key=v.key, name=v.name, parts_cost=v.parts_cost, labor_cost=v.labor_cost,
                diagnostic=v.diagnostic, contingency=v.contingency, eta=v.eta)
        for v in c.variants
    ]
    return CalculationResult(
        brand=c.brand, model=c.model, year=c.year, mileage=c.mileage, region=c.region,
        condition=c.condition, categories=c.categories, required_parts=c.required_parts,
        consumables=[tuple(x) for x in c.consumables], severity=c.severity,
        good_value=c.good_value, after_value=c.after_value, as_is_value=c.as_is_value,
        variants=variants, scale=c.scale,
    )


@app.get("/api/catalog")
def get_catalog():
    """Справочники для форм — фронтенд не хранит копию каталога у себя."""
    return {
        "brands": BRANDS,
        "regions": list(REGIONS.keys()),
        "conditions": [{"value": k, "label": CONDITION_LABELS[k]} for k in CONDITIONS],
        "damage_categories": [
            {"value": k, "label": v["label"]}
            for k, v in DAMAGE_CATEGORIES.items() if not v.get("hidden")
        ],
    }


def _validate_request(req: schemas.CalculateRequest) -> None:
    if req.brand not in BRANDS or req.model not in BRANDS[req.brand]:
        raise HTTPException(400, "Неизвестная марка или модель")
    if req.region not in REGIONS:
        raise HTTPException(400, "Неизвестный регион")
    if req.condition not in CONDITIONS:
        raise HTTPException(400, "Неизвестное состояние")


@app.post("/api/calculate", response_model=schemas.CalculateResponse)
def calculate(req: schemas.CalculateRequest):
    _validate_request(req)
    result = run_calculation(
        brand=req.brand, model=req.model, year=req.year, mileage=req.mileage,
        region=req.region, condition=req.condition, description=req.description,
        damage_categories=req.damage_categories, photo_count=req.photo_count,
    )
    return _to_response(result)


@app.post("/api/estimate", response_model=schemas.EstimateResponse)
def estimate(req: schemas.CalculateRequest):
    _validate_request(req)
    return calculate_detailed_repair(**req.model_dump())


@app.post("/api/scenarios", response_model=schemas.ScenarioResponse)
def scenarios(req: schemas.ScenarioRequest):
    result = _from_response(req.calculation)
    s = compute_scenarios(result, req.variant_index, req.years)
    return schemas.ScenarioResponse(
        cost=s.cost, scenario1=s.scenario1, scenario2=s.scenario2, scenario3=s.scenario3,
        upkeep_per_year=s.upkeep_per_year, decision=s.decision, decision_label=s.decision_label,
        delta=s.delta, repair_ratio=s.repair_ratio,
    )


@app.get("/api/parts")
def parts(region: str, scale: float = 1.0):
    if region not in REGIONS:
        raise HTTPException(400, "Неизвестный регион")
    return build_part_offers(scale, region)


@app.get("/api/history", response_model=list[schemas.HistoryOut])
def list_history(session_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(models.HistoryEntry)
        .filter(models.HistoryEntry.session_id == session_id)
        .order_by(models.HistoryEntry.created_at.desc())
        .limit(30)
        .all()
    )
    return rows


@app.post("/api/history", response_model=schemas.HistoryOut)
def save_history(req: schemas.HistorySaveRequest, db: Session = Depends(get_db)):
    entry = models.HistoryEntry(**req.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.delete("/api/history")
def clear_history(session_id: str, db: Session = Depends(get_db)):
    db.query(models.HistoryEntry).filter(models.HistoryEntry.session_id == session_id).delete()
    db.commit()
    return {"ok": True}


@app.get("/api/watchlist")
def list_watchlist(session_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(models.WatchlistItem)
        .filter(models.WatchlistItem.session_id == session_id)
        .all()
    )
    return [r.part_key for r in rows]


@app.post("/api/watchlist/toggle")
def toggle_watchlist(req: schemas.WatchlistToggleRequest, db: Session = Depends(get_db)):
    existing = (
        db.query(models.WatchlistItem)
        .filter(
            models.WatchlistItem.session_id == req.session_id,
            models.WatchlistItem.part_key == req.part_key,
        )
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        return {"watching": False}
    db.add(models.WatchlistItem(session_id=req.session_id, part_key=req.part_key))
    db.commit()
    return {"watching": True}


@app.post("/api/vision/classify")
def vision_classify(description: str = "", photo_count: int = 0):
    """Заглушка CV-модуля.

    Сейчас возвращает эвристическую оценку тяжести по тексту и количеству
    фото — ту же, что использует /api/calculate. Контракт рассчитан на
    замену: реальный сервис должен принимать файлы изображений (multipart)
    и возвращать список категорий повреждений с уверенностью модели.
    См. README → «Как подключить реальную CV-модель».
    """
    from .engine import detect_categories
    categories = detect_categories(description, [])
    return {
        "categories": categories,
        "source": "heuristic-baseline",
        "note": "Эвристика на ключевых словах — не нейросеть. См. README.",
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}
