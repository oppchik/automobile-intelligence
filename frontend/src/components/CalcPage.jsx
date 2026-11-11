import { useEffect, useRef, useState } from "react";
import { fmt } from "../lib/engine.js";
import { suggestedSeverity } from "../lib/severity.js";
import * as api from "../lib/api.js";
import { Card, Field, Segmented } from "./ui.jsx";
import { CirButton, CirCheck } from "./cirrus.jsx";
import { VariantCompare, EstimateBreakdown } from "./EstimateDetails.jsx";
import PhotoSeverity from "./PhotoSeverity.jsx";

const DECISION_ICON = { repair: "✓", sell: "○", inspect: "!" };

export default function CalcPage({ catalog, onSaveHistory, offline }) {
  const brands = catalog.brands;
  const regions = catalog.regions;
  const conditions = catalog.conditions;
  const damageCategories = catalog.damage_categories;

  const [brand, setBrand] = useState(Object.keys(brands)[0]);
  const [model, setModel] = useState(Object.keys(brands[Object.keys(brands)[0]])[0]);
  const [year, setYear] = useState(2018);
  const [mileage, setMileage] = useState(85000);
  const [region, setRegion] = useState(regions[0]);
  const [condition, setCondition] = useState("good");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [severityResult, setSeverityResult] = useState(null);
  const [severityLoading, setSeverityLoading] = useState(false);
  const [photoSeverity, setPhotoSeverity] = useState(null);
  const classifyRef = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [variantIndex, setVariantIndex] = useState(1);
  const [years, setYears] = useState(2);
  const [scenarios, setScenarios] = useState(null);
  const [estimate, setEstimate] = useState(null);

  useEffect(() => { setModel(Object.keys(brands[brand])[0]); }, [brand]); // eslint-disable-line

  function toggleCategory(value, checked) {
    setCategories((prev) => (checked ? [...new Set([...prev, value])] : prev.filter((c) => c !== value)));
  }

  function handlePhotos(e) {
    const files = [...e.target.files].slice(0, 6);
    setPhotos(files.map((f) => URL.createObjectURL(f)));
    runClassification(files);
  }

  async function runClassification(files) {
    if (classifyRef.current) classifyRef.current.abort();
    setSeverityResult(null);
    setPhotoSeverity(null);
    if (files.length === 0) return setSeverityLoading(false);
    const controller = new AbortController();
    classifyRef.current = controller;
    setSeverityLoading(true);
    const res = await api.classifyPhotos(files, controller.signal);
    if (controller.signal.aborted || !res) return;
    setSeverityResult(res);
    setPhotoSeverity(suggestedSeverity(res));
    setSeverityLoading(false);
  }

  async function handleCalculate() {
    if (!(year >= 2005 && year <= 2026)) return setError("Укажите год выпуска от 2005 до 2026");
    if (!(mileage >= 0)) return setError("Укажите пробег");
    if (!description.trim() && categories.length === 0 && photos.length === 0) {
      return setError("Опишите проблему, отметьте категорию или загрузите фото");
    }
    setError("");
    setLoading(true);
    setResult(null);
    setScenarios(null);
    setEstimate(null);

    const payload = {
      brand, model, year: +year, mileage: +mileage, region, condition,
      description, damage_categories: categories, photo_count: photos.length, photo_severity: photoSeverity,
    };
    const started = Date.now();
    const r = await api.calculate(payload);
    const [s, e] = await Promise.all([api.fetchScenarios(r, variantIndex, years), api.fetchEstimate(payload, r)]);
    const elapsed = Date.now() - started;
    if (elapsed < 500) await new Promise((res) => setTimeout(res, 500 - elapsed));

    setResult(r);
    setScenarios(s);
    setEstimate(e);
    setLoading(false);
    onSaveHistory(r, s, variantIndex, years);
  }

  async function changeVariant(i) {
    setVariantIndex(i);
    if (!result) return;
    const s = await api.fetchScenarios(result, i, years);
    setScenarios(s);
    onSaveHistory(result, s, i, years);
  }

  async function changeYears(y) {
    setYears(y);
    if (!result) return;
    const s = await api.fetchScenarios(result, variantIndex, y);
    setScenarios(s);
  }

  return (
    <div className="grid-2">
      <Card title="Ваш автомобиль">
        <div className="row-2 field">
          <Field label="Марка">
            <select value={brand} onChange={(e) => setBrand(e.target.value)}>
              {Object.keys(brands).map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Модель">
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {Object.keys(brands[brand]).map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <div className="row-2 field">
          <Field label="Год выпуска">
            <input type="number" min="2005" max="2026" value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
          <Field label="Пробег, км">
            <input type="number" min="0" step="1000" value={mileage} onChange={(e) => setMileage(e.target.value)} />
          </Field>
        </div>
        <div className="row-2 field">
          <Field label="Регион">
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              {regions.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Состояние до поломки">
            <select value={condition} onChange={(e) => setCondition(e.target.value)}>
              {conditions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Что случилось">
          <textarea
            placeholder="Например: ДТП, удар в переднюю часть, повреждены бампер, капот и фара"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Категории повреждений (можно уточнить вручную)">
          <div className="damage-grid">
            {damageCategories.map((c) => (
              <CirCheck key={c.value} checked={categories.includes(c.value)} onChange={(ch) => toggleCategory(c.value, ch)}>
                {c.label}
              </CirCheck>
            ))}
          </div>
        </Field>
        <Field label=" ">
          <label className="dropzone" htmlFor="photo-input">📷 Загрузить фото повреждений</label>
          <input id="photo-input" type="file" accept="image/*" multiple hidden onChange={handlePhotos} />
          {photos.length > 0 && (
            <div className="thumbs">{photos.map((src, i) => <img key={i} src={src} alt="" />)}</div>
          )}
          <PhotoSeverity result={severityResult} loading={severityLoading} value={photoSeverity} onChange={setPhotoSeverity} />
        </Field>
        <CirButton className="cir-btn--block" arrow={false} onClick={handleCalculate} disabled={loading || severityLoading}>
          Рассчитать
        </CirButton>
        <div className="err-text">{error}</div>
      </Card>

      {loading && (
        <Card>
          <div className="loading-state">
            <div className="spinner" />
            <b>Анализируем повреждения и рынок…</b>
            <p className="note">Считаем смету, ищем запчасти, сравниваем объявления</p>
          </div>
        </Card>
      )}

      {!loading && !result && (
        <Card>
          <div className="empty-state">
            <div className="ic">◔</div>
            <h3>Первая оценка за пару минут</h3>
            <p className="note">Заполните данные слева — опишите проблему текстом, отметьте категории или загрузите фото.</p>
          </div>
        </Card>
      )}

      {!loading && result && scenarios && (
        <ResultView
          result={result} scenarios={scenarios} estimate={estimate} variantIndex={variantIndex}
          onVariantChange={changeVariant} years={years} onYearsChange={changeYears}
          offline={offline || !result.online}
        />
      )}
    </div>
  );
}

function ResultView({ result, scenarios, estimate, variantIndex, onVariantChange, years, onYearsChange, offline }) {
  const s = scenarios;
  const variant = result.variants[variantIndex];
  const maxAbs = Math.max(Math.abs(s.scenario1), Math.abs(s.scenario2), Math.abs(s.scenario3), 1);
  const breakeven = result.as_is_value + s.cost;
  const margin = result.after_value ? ((result.after_value - breakeven) / breakeven) * 100 : 0;
  const best = Math.max(s.scenario1, s.scenario2);
  const severityLevel = result.severity < 0.2 ? 0 : result.severity < 0.4 ? 1 : 2;
  const severityName = ["лёгкие", "средние", "тяжёлые"][severityLevel];

  return (
    <div>
      {offline && (
        <div className="offline-banner">● Офлайн-режим: сервер расчётов недоступен, показаны данные локального движка</div>
      )}

      <Card>
        <span className={`badge badge-${severityLevel}`}><i className="dot" />Повреждения: {severityName}</span>
        <h3 style={{ marginTop: 10 }}>{result.brand} {result.model}, {result.year} · {result.mileage.toLocaleString("ru-RU")} км</h3>
        <div className="chips">
          {result.category_labels.map((p) => <span key={p} className="chip">{p}</span>)}
        </div>
      </Card>

      <div className={`recommend ${s.decision}`}>
        <div className="ic">{DECISION_ICON[s.decision]}</div>
        <div>
          <h3>{s.decision_label}</h3>
          <p>
            {s.decision === "repair" &&
              `Ремонт (${variant.name.toLowerCase()}) обойдётся в ${fmt(s.cost)}. После ремонта машину можно продать за ${fmt(result.after_value)}. Выгода относительно продажи сейчас — ${fmt(s.delta)}.`}
            {s.decision === "sell" &&
              `Ремонт стоит ${fmt(s.cost)}, а прирост цены после него — ${fmt(result.after_value - result.as_is_value)}. Продажа как есть выгоднее на ${fmt(Math.abs(s.delta))}.`}
            {s.decision === "inspect" &&
              `Разница между сценариями небольшая (${fmt(Math.abs(s.delta))}), а доля ремонта в цене авто — ${Math.round(s.repair_ratio * 100)}%. Стоит очно подтвердить смету в сервисе перед решением.`}
          </p>
        </div>
      </div>

      <Card title="Смета ремонта">
        <div className="variants">
          {result.variants.map((v, i) => (
            <label key={v.name} className={"variant" + (i === variantIndex ? " on" : "")}>
              <input type="radio" name="variant" checked={i === variantIndex} onChange={() => onVariantChange(i)} />
              <div className="v-label">{v.name}</div>
              <div className="v-sum">{fmt(v.cost)}</div>
              <div className="split-bar"><i style={{ width: `${(v.partsCost ?? v.parts_cost) / v.cost * 100}%` }} /></div>
              <small>Запчасти {fmt(v.partsCost ?? v.parts_cost)} · Работа {fmt(v.laborCost ?? v.labor_cost)}</small>
              <small>Срок: {v.eta}</small>
              {estimate && estimate.cheapest === v.key && <small className="v-best">Самый выгодный по цене</small>}
              {estimate && estimate.variants[i].savings_vs_dealer > 0 && (
                <small>Дешевле дилера на {fmt(estimate.variants[i].savings_vs_dealer)}</small>
              )}
              {estimate && !estimate.used_parts_applicable && v.key === "used" && (
                <small>Заменяемых деталей нет — цена как у независимого сервиса</small>
              )}
            </label>
          ))}
        </div>
        {estimate && <VariantCompare estimate={estimate} variantIndex={variantIndex} />}
      </Card>

      {estimate && <EstimateBreakdown estimate={estimate} variantIndex={variantIndex} />}

      <Card title="Рыночная цена автомобиля">
        <div className="kv-grid">
          <div><span>В хорошем состоянии (с учётом состояния до поломки)</span><b>{fmt(result.good_value)}</b></div>
          <div><span>Как есть (с повреждениями)</span><b>{fmt(result.as_is_value)}</b></div>
          <div><span>После ремонта</span><b>{fmt(result.after_value)}</b></div>
        </div>
        <p className="note">Оценка основана на аналогичных объявлениях с учётом региона, года, пробега и состояния до поломки.</p>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Три сценария</h3>
          <Segmented
            options={[1, 2, 3].map((n) => ({ value: n, label: `${n} ${n === 1 ? "год" : "года"}` }))}
            value={years}
            onChange={onYearsChange}
          />
        </div>

        <Scenario label="1. Продажа как есть" value={s.scenario1} max={maxAbs} color="var(--orange)" win={best === s.scenario1}
          note="Сумма, которую вы получите сразу, без вложений" />
        <Scenario label="2. Ремонт → продажа" value={s.scenario2} max={maxAbs} color="var(--green)" win={best === s.scenario2}
          note="Цена после ремонта минус затраты на ремонт" />
        <Scenario label={`3. Ремонт → эксплуатация, ${years} ${years === 1 ? "год" : "года"}`} value={s.scenario3} max={maxAbs} color="var(--blue)"
          note={`Остаточная стоимость минус ремонт и расходы на владение (${fmt(s.upkeep_per_year)} в год)`} />

        <p className="note">
          <b>Точка безубыточности:</b> ремонт окупится, если продать машину дороже {fmt(breakeven)}.
          {" "}Прогноз {fmt(result.after_value)} {margin >= 0 ? "выше" : "ниже"} этого порога на {Math.abs(margin).toFixed(1)}%.
        </p>
      </Card>

      <p className="note">Расчёт носит справочный характер и служит вторым мнением. Используются демонстрационные данные по ценам и нормо-часам.</p>
    </div>
  );
}

function Scenario({ label, value, max, color, win, note }) {
  const isNeg = value < 0;
  return (
    <div className={"scenario" + (win ? " win" : "")}>
      <div className="s-head"><span>{label}</span><span>{fmt(value)}</span></div>
      <div className="s-bar"><i style={{ width: `${Math.max(2, Math.abs(value) / max * 100)}%`, background: isNeg ? "var(--red)" : color }} /></div>
      <small>{note}</small>
    </div>
  );
}
