import { fmt } from "../lib/engine.js";
import { Card } from "./ui.jsx";
import { CirButton } from "./cirrus.jsx";

export default function HistoryPage({ items, onClear }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>История расчётов</h2>
        <CirButton variant="ghost" arrow={false} onClick={onClear}>Очистить</CirButton>
      </div>
      {items.length === 0 && (
        <div className="empty-state">
          <div className="ic">▤</div>
          <p>Здесь появятся ваши расчёты</p>
        </div>
      )}
      {items.map((x) => (
        <div className="hist-item" key={x.ts || x.id}>
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
          </div>
        </div>
      ))}
    </Card>
  );
}
