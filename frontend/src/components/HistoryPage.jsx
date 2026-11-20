import { fmt } from "../lib/engine.js";
import { Card } from "./ui.jsx";
import { CirButton } from "./cirrus.jsx";

const ADVISOR_LABELS = {
  sell_as_is: "Продать как есть",
  repair_sell: "Ремонт и продажа",
  repair_keep: "Ремонт и эксплуатация",
  inspect: "Нужно уточнить данные",
  needs_data: "Нужны данные",
};

export default function HistoryPage({ items, onClear, onDelete, onRecalc, loggedIn }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>История расчётов</h2>
        <CirButton variant="ghost" arrow={false} onClick={onClear}>Очистить</CirButton>
      </div>
      <p className="note" style={{ marginTop: 0 }}>
        {loggedIn ? "Расчёты сохраняются в вашем аккаунте." : "Расчёты хранятся на этом устройстве. Войдите в кабинет, чтобы сохранить их в аккаунте."}
      </p>
      {items.length === 0 && (
        <div className="empty-state">
          <div className="ic">▤</div>
          <p>Здесь появятся ваши расчёты</p>
        </div>
      )}
      {items.map((x) => (
        <div className="hist-item" key={x.id || x.ts}>
          <div>
            <b>{x.brand} {x.model}</b>
            <small>
              {new Date(x.ts || x.created_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
              {" · "}{x.region} · {x.mileage.toLocaleString("ru-RU")} км
            </small>
          </div>
          <div className="right">
            <b>{x.decision === "repair" ? "Ремонт → продажа" : x.decision === "sell" ? "Продажа как есть" : "Нужна диагностика"}</b>
            <small>Ремонт {fmt(x.cost)} · Выгода {fmt(Math.max(x.scenario1, x.scenario2))}</small>
            {x.advisor && (
              <small>
                Советчик: {ADVISOR_LABELS[x.advisor.recommendation] || x.advisor.recommendation}
                {" · "}{x.advisor.years} {x.advisor.years === 1 ? "год" : x.advisor.years < 5 ? "года" : "лет"}
              </small>
            )}
            <div className="hist-actions">
              <button type="button" className="link-btn" onClick={() => onRecalc(x)}>Пересчитать</button>
              <button type="button" className="link-btn danger" onClick={() => onDelete(x)}>Удалить</button>
            </div>
          </div>
        </div>
      ))}
    </Card>
  );
}
