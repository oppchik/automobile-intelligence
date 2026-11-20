import { useEffect, useRef, useState } from "react";
import { fmt, fmtRub } from "../lib/engine.js";
import * as api from "../lib/api.js";
import {
  ADVISOR_ASSUMPTIONS,
  ADVISOR_LABELS,
  RECOMMENDATION_LABELS,
  buildAdvicePayload,
  snapshotAdvisor,
} from "../lib/advisor.js";
import { Card, Field, Segmented } from "./ui.jsx";
import { CirButton } from "./cirrus.jsx";
import { CostBenefitChart, TimelineChart } from "./Charts.jsx";

const GOALS = [
  { value: "cash_now", label: "Деньги сейчас" },
  { value: "keep_using", label: "Ездить дальше" },
];

const RISKS = [
  { value: "low", label: "Осторожно" },
  { value: "normal", label: "Обычно" },
  { value: "high", label: "Смело" },
];

const REC_CLASS = {
  sell_as_is: "sell",
  repair_sell: "repair",
  repair_keep: "repair",
  inspect: "inspect",
  needs_data: "inspect",
};

const percent = (n) => `${(n * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;

export default function AdvisorCard({ result, scenarios, onSave }) {
  const [conditions, setConditions] = useState(() => ({
    years: 3,
    goal: "cash_now",
    risk: "normal",
    repairBudget: "",
    transport: "",
    annualCost: String(Math.round(scenarios.upkeep_per_year)),
  }));
  const [advice, setAdvice] = useState(null);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    setConditions((c) => ({ ...c, annualCost: String(Math.round(scenarios.upkeep_per_year)) }));
  }, [result, scenarios.upkeep_per_year]);

  useEffect(() => {
    const built = buildAdvicePayload(result, scenarios, conditions);
    if (built.error) {
      setError(built.error);
      return undefined;
    }
    setError("");
    setSaved(false);
    const id = ++requestId.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api.fetchAdvice(built.payload);
        if (id !== requestId.current) return;
        setAdvice(data);
        setPayload(built.payload);
      } catch (e) {
        if (id === requestId.current) setError(e.message);
      } finally {
        if (id === requestId.current) setBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [result, scenarios.cost, scenarios.upkeep_per_year, conditions]);

  const set = (patch) => setConditions((c) => ({ ...c, ...patch }));

  function handleSave() {
    if (!advice || !payload) return;
    onSave(snapshotAdvisor(payload, advice));
    setSaved(true);
  }

  return (
    <Card>
      <div className="advisor-head">
        <h3>Советчик: затраты и выгоды</h3>
        <span className="advisor-status">{busy ? "Пересчитываем…" : advice ? "Расчёт актуален" : ""}</span>
      </div>

      <div className="advisor-conditions">
        <Field label="Цель">
          <Segmented options={GOALS} value={conditions.goal} onChange={(goal) => set({ goal })} />
        </Field>
        <Field label="Срок владения, лет">
          <div className="range-row">
            <input
              type="range" min="1" max="10" step="1" value={conditions.years}
              onChange={(e) => set({ years: +e.target.value })} aria-label="Срок владения, лет"
            />
            <b>{conditions.years}</b>
          </div>
        </Field>
        <div className="row-2">
          <Field label="Бюджет на ремонт, ₽">
            <input
              type="number" min="0" step="1000" inputMode="numeric" placeholder="Без ограничения"
              value={conditions.repairBudget} onChange={(e) => set({ repairBudget: e.target.value })}
            />
          </Field>
          <Field label="Расходы на владение в год, ₽">
            <input
              type="number" min="0" step="1000" inputMode="numeric"
              value={conditions.annualCost} onChange={(e) => set({ annualCost: e.target.value })}
            />
          </Field>
        </div>
        <div className="row-2">
          <Field label="Транспорт взамен в год, ₽">
            <input
              type="number" min="0" step="1000" inputMode="numeric" placeholder="Такси, каршеринг"
              value={conditions.transport} onChange={(e) => set({ transport: e.target.value })}
            />
          </Field>
          <Field label="Осторожность">
            <Segmented options={RISKS} value={conditions.risk} onChange={(risk) => set({ risk })} />
          </Field>
        </div>
      </div>

      <div className="err-text">{error}</div>

      {advice && (
        <div className={busy ? "advisor-body is-busy" : "advisor-body"}>
          <div className={`recommend ${REC_CLASS[advice.recommendation]}`}>
            <div>
              <h3>{RECOMMENDATION_LABELS[advice.recommendation]}</h3>
              <p>{advice.reason}</p>
              {advice.comparison && advice.comparison.second && (
                <p className="advisor-compare">
                  «{ADVISOR_LABELS[advice.comparison.best]}» опережает «{ADVISOR_LABELS[advice.comparison.second]}» на{" "}
                  {fmtRub(advice.comparison.difference_rub)}; для уверенного вывода нужен отрыв не меньше{" "}
                  {fmtRub(advice.comparison.threshold_rub)}.
                </p>
              )}
            </div>
          </div>

          <h4 className="advisor-sub">Затраты и выгоды по сценариям</h4>
          <CostBenefitChart advice={advice} />

          <h4 className="advisor-sub">Как меняется итог со сроком владения</h4>
          <TimelineChart advice={advice} />

          <h4 className="advisor-sub">Как посчитано</h4>
          <div className="explain">
            {Object.entries(advice.breakdown).map(([key, block]) => (
              <details key={key} className="explain-item" open={key === advice.recommendation}>
                <summary>
                  <span>{advice.scenarios[key].label}</span>
                  <b>{advice.scenarios[key].value_rub === null ? "нет данных" : fmtRub(advice.scenarios[key].value_rub)}</b>
                </summary>
                <p className="note">{block.formula}.</p>
                <table className="explain-table">
                  <tbody>
                    {block.items.map((item) => (
                      <tr key={item.key}>
                        <td>{item.label}</td>
                        <td className={item.value_rub < 0 ? "neg" : "pos"}>{fmtRub(item.value_rub)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!block.complete && (
                  <p className="note">Без расходов на альтернативный транспорт итог по этому сценарию не считается.</p>
                )}
              </details>
            ))}
          </div>
          <p className="note">
            Допущения: расходы на продажу {percent(ADVISOR_ASSUMPTIONS.sale_fee_rate)}, потеря стоимости{" "}
            {percent(ADVISOR_ASSUMPTIONS.depreciation_rate)} в год, ставка дисконтирования{" "}
            {percent(ADVISOR_ASSUMPTIONS.discount_rate)}. Будущие платежи приведены к сегодняшним деньгам. Ремонт
            {" "}сейчас: {fmt(advice.repair_cost_rub)}, расходы на владение за {advice.years}{" "}
            {advice.years === 1 ? "год" : advice.years < 5 ? "года" : "лет"}: {fmt(advice.ownership_cost_for_period_rub)}.{" "}
            {advice.note}
          </p>
          <CirButton variant="ghost" arrow={false} onClick={handleSave} disabled={busy || saved}>
            {saved ? "Сохранено в историю" : "Сохранить расчёт в историю"}
          </CirButton>
        </div>
      )}
    </Card>
  );
}
