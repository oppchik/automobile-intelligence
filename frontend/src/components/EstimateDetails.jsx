import { fmtRub, fmtHours } from "../lib/engine.js";
import { Card } from "./ui.jsx";

const coef = (n) => "×" + n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const percent = (n) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + "%";
const TYPE_LABEL = { new: "Новая", used: "Б/у" };

export function VariantCompare({ estimate, variantIndex }) {
  const rows = [
    ["Запчасти и материалы", (v) => fmtRub(v.amounts.parts)],
    ["Работы", (v) => fmtRub(v.amounts.labor)],
    ["Диагностика", (v) => fmtRub(v.amounts.diagnostic)],
    ["Непредвиденные расходы", (v) => fmtRub(v.amounts.contingency)],
    ["Итого", (v) => fmtRub(v.amounts.total), "est-total"],
    ["Дешевле дилера", (v) => (v.savings_vs_dealer > 0 ? `${fmtRub(v.savings_vs_dealer)} (−${percent(v.savings_percent)})` : "—")],
    ["Ставка нормо-часа", (v) => `${fmtRub(v.hourly_rate)} / ч`],
  ];
  return (
    <div className="table-wrap est-compare">
      <table>
        <thead>
          <tr>
            <th>Статья</th>
            {estimate.variants.map((v, i) => (
              <th key={v.key} className={i === variantIndex ? "est-on" : ""}>{v.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, get, cls]) => (
            <tr key={label} className={cls || ""}>
              <td>{label}</td>
              {estimate.variants.map((v, i) => (
                <td key={v.key} className={i === variantIndex ? "est-on" : ""}>{get(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EstimateBreakdown({ estimate, variantIndex }) {
  const v = estimate.variants[variantIndex];
  const items = [...v.parts.map((p) => ({ ...p, kind: p.condition })), ...v.consumables.map((c) => ({ ...c, kind: "material" }))];

  return (
    <Card title="Расшифровка сметы" eyebrow={v.name}>
      <div className="est-coefs">
        <div>
          <span>Региональный коэффициент работ</span>
          <b>{coef(estimate.region_coefficient)}</b>
          <small>{estimate.region}</small>
        </div>
        <div>
          <span>Класс автомобиля</span>
          <b>{coef(estimate.scale)}</b>
          <small>масштаб цен по модели</small>
        </div>
        <div>
          <span>Ставка нормо-часа</span>
          <b>{fmtRub(v.hourly_rate)}</b>
          <small>{fmtRub(estimate.base_hourly_rate)} {coef(estimate.region_coefficient)} {coef(estimate.scale)} {coef(v.labor_multiplier)}</small>
        </div>
        <div>
          <span>Наценка на запчасти</span>
          <b>{coef(v.parts_markup)}</b>
          <small>{v.parts_markup > 1 ? "оригинальные детали у дилера" : "без наценки"}</small>
        </div>
      </div>

      <h3 className="est-h">Работы</h3>
      <div className="table-wrap est-wrap">
        <table>
          <thead>
            <tr><th>Категория</th><th className="num">Нормо-часы</th><th className="num">Ставка</th><th className="num">Сумма</th></tr>
          </thead>
          <tbody>
            {v.labor_lines.map((l) => (
              <tr key={l.key}>
                <td>{l.label}</td>
                <td className="num">{fmtHours(l.hours)}</td>
                <td className="num">{fmtRub(l.rate)}</td>
                <td className="num">{fmtRub(l.amount)}</td>
              </tr>
            ))}
            <tr className="est-sub">
              <td>Итого работы</td>
              <td className="num">{fmtHours(estimate.total_hours)}</td>
              <td className="num" />
              <td className="num">{fmtRub(v.amounts.labor)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="est-h">Запчасти и материалы</h3>
      <div className="table-wrap est-wrap">
        <table>
          <thead>
            <tr><th>Позиция</th><th>Тип</th><th className="num">Базовая цена</th><th className="num">Сумма</th></tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.kind + p.name}>
                <td>{p.name}</td>
                <td>
                  {p.kind === "material"
                    ? <span className="tag">Материал</span>
                    : <span className={`tag tag-${p.kind}`}>{TYPE_LABEL[p.kind]}</span>}
                </td>
                <td className="num">{fmtRub(p.base_price)}</td>
                <td className="num">{fmtRub(p.amount)}</td>
              </tr>
            ))}
            <tr className="est-sub">
              <td>Итого запчасти и материалы</td>
              <td />
              <td className="num" />
              <td className="num">{fmtRub(v.amounts.parts)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        Сумма = базовая цена {coef(estimate.scale)} (класс автомобиля) {coef(v.parts_markup)} (наценка варианта).
        {!estimate.used_parts_applicable && v.key === "used" && " В этом ремонте нет заменяемых деталей, поэтому б/у запчасти ничего не меняют: цена совпадает с независимым сервисом."}
      </p>

      <h3 className="est-h">Итоговая сумма</h3>
      <div className="table-wrap est-wrap">
        <table>
          <tbody>
            <tr>
              <td>Запчасти и материалы</td>
              <td className="num">{fmtRub(v.amounts.parts)}</td>
            </tr>
            <tr>
              <td>Работы<small className="est-formula">{fmtHours(estimate.total_hours)} × {fmtRub(v.hourly_rate)}</small></td>
              <td className="num">{fmtRub(v.amounts.labor)}</td>
            </tr>
            <tr>
              <td>Диагностика<small className="est-formula">{fmtRub(estimate.diagnostic_base)} {coef(estimate.region_coefficient)}</small></td>
              <td className="num">{fmtRub(v.amounts.diagnostic)}</td>
            </tr>
            <tr>
              <td>Непредвиденные расходы<small className="est-formula">{Math.round(estimate.contingency_rate * 100)}% от запчастей и работ</small></td>
              <td className="num">{fmtRub(v.amounts.contingency)}</td>
            </tr>
            <tr className="est-total">
              <td>Итого</td>
              <td className="num">{fmtRub(v.amounts.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
