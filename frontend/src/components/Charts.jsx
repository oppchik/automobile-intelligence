import { useEffect, useState } from "react";
import { fmt } from "../lib/engine.js";
import { niceTicks, stackSegments } from "../lib/advisor.js";

const ITEM_COLORS = {
  price: "var(--green)",
  resale: "var(--green)",
  transport: "var(--blue)",
  fee: "var(--orange)",
  repair: "var(--red)",
  ownership: "#e08a8a",
};

const LINE_COLORS = {
  sell_as_is: "var(--orange)",
  repair_sell: "var(--green)",
  repair_keep: "var(--blue)",
};

const LINE_LABELS = {
  sell_as_is: "Продать как есть",
  repair_sell: "Ремонт и продажа",
  repair_keep: "Ремонт и эксплуатация",
};

const SCENARIO_ORDER = ["sell_as_is", "repair_sell", "repair_keep"];

function useChartWidth() {
  const query = "(max-width: 520px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return narrow ? 320 : 640;
}

const compact = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  if (abs >= 1e3) return `${Math.round(n / 1e3).toLocaleString("ru-RU")} тыс`;
  return String(Math.round(n));
};

export function CostBenefitChart({ advice }) {
  const W = useChartWidth();
  const rows = SCENARIO_ORDER.map((key) => {
    const scenario = advice.scenarios[key];
    const block = advice.breakdown[key];
    return { key, scenario, block, segments: stackSegments(block.items) };
  });
  const all = rows.flatMap((r) => r.segments.flatMap((s) => [s.from, s.to]));
  const min = Math.min(0, ...all);
  const max = Math.max(0, ...all);
  const ticks = niceTicks(min, max, 4);
  const lo = Math.min(min, ticks[0]);
  const hi = Math.max(max, ticks[ticks.length - 1]);
  const left = 12;
  const right = 12;
  const rowH = 74;
  const top = 8;
  const H = top + rows.length * rowH + 30;
  const x = (v) => left + ((v - lo) / (hi - lo || 1)) * (W - left - right);
  const legendKeys = [...new Set(rows.flatMap((r) => r.block.items.map((i) => i.key)))];
  const legendLabels = Object.fromEntries(rows.flatMap((r) => r.block.items.map((i) => [i.key, i.label])));

  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Затраты и выгоды по сценариям" className="chart-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top} y2={H - 26} className={t === 0 ? "chart-axis" : "chart-grid"} />
            <text x={x(t)} y={H - 10} textAnchor="middle" className="chart-tick">{compact(t)}</text>
          </g>
        ))}
        {rows.map((row, i) => {
          const y = top + i * rowH;
          const muted = !row.scenario.available && row.scenario.value_rub === null;
          const net = row.block.items.reduce((a, b) => a + b.value_rub, 0);
          return (
            <g key={row.key} opacity={row.scenario.available || muted ? 1 : 0.45}>
              <text x={left} y={y + 14} className="chart-label">{row.scenario.label}</text>
              <text x={W - right} y={y + 14} textAnchor="end" className="chart-value">
                {row.scenario.value_rub === null ? "нет данных" : fmt(row.scenario.value_rub)}
              </text>
              {row.segments.map((s) => (
                <rect
                  key={s.key}
                  x={x(Math.min(s.from, s.to))}
                  y={y + 24}
                  width={Math.max(1, Math.abs(x(s.to) - x(s.from)))}
                  height={22}
                  rx={3}
                  style={{ fill: ITEM_COLORS[s.key] }}
                >
                  <title>{`${s.label}: ${fmt(s.value_rub)}`}</title>
                </rect>
              ))}
              <circle cx={x(net)} cy={y + 35} r={5} className="chart-net" />
              {!row.scenario.available && !muted && (
                <text x={left} y={y + 64} className="chart-note">Недоступно: ремонт дороже заданного бюджета</text>
              )}
              {muted && (
                <text x={left} y={y + 64} className="chart-note">Укажите расходы на альтернативный транспорт</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {legendKeys.map((k) => (
          <span key={k}><i style={{ background: ITEM_COLORS[k] }} />{legendLabels[k]}</span>
        ))}
        <span><i className="chart-net-dot" />Итог по сценарию</span>
      </div>
    </div>
  );
}

export function TimelineChart({ advice }) {
  const W = useChartWidth();
  const series = SCENARIO_ORDER.filter((k) => advice.timeline.some((p) => p[k] !== null));
  const values = advice.timeline.flatMap((p) => series.map((k) => p[k]).filter((v) => v !== null));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1;
  const ticks = niceTicks(min - pad, max + pad, 4);
  const lo = Math.min(min, ticks[0]);
  const hi = Math.max(max, ticks[ticks.length - 1]);
  const H = 260;
  const left = 56;
  const right = 16;
  const top = 12;
  const bottom = 34;
  const lastYear = advice.timeline[advice.timeline.length - 1].year;
  const x = (year) => left + (year / (lastYear || 1)) * (W - left - right);
  const y = (v) => top + (1 - (v - lo) / (hi - lo || 1)) * (H - top - bottom);
  const hasKeep = series.includes("repair_keep");

  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Итог по годам" className="chart-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">{compact(t)}</text>
          </g>
        ))}
        {advice.timeline.map((p) => (
          <text key={p.year} x={x(p.year)} y={H - 12} textAnchor="middle" className="chart-tick">
            {p.year === 0 ? "сейчас" : `${p.year} г.`}
          </text>
        ))}
        {series.map((k) => {
          const points = advice.timeline.filter((p) => p[k] !== null);
          const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.year).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(" ");
          return (
            <g key={k}>
              <path d={path} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
                strokeDasharray={k === "repair_keep" ? undefined : "6 5"} style={{ stroke: LINE_COLORS[k] }} />
              {k === "repair_keep" && points.map((p) => (
                <circle key={p.year} cx={x(p.year)} cy={y(p[k])} r={4} style={{ fill: LINE_COLORS[k] }}>
                  <title>{`${p.year === 0 ? "Сейчас" : `Через ${p.year} г.`}: ${fmt(p[k])}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {series.map((k) => (
          <span key={k}><i style={{ background: LINE_COLORS[k] }} />{LINE_LABELS[k]}</span>
        ))}
      </div>
      {!hasKeep && (
        <p className="note">Линия «Ремонт и эксплуатация» появится, когда будут указаны расходы на альтернативный транспорт.</p>
      )}
    </div>
  );
}
