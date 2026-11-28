import { IconCheck } from "./icons.jsx";

export const STEPS = ["Автомобиль", "Повреждения", "Смета", "Рынок", "Отчет"];

export default function Stepper({ current, reachable, onStep }) {
  return (
    <ol className="stepper" aria-label="Шаги оценки" style={{ listStyle: "none" }}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        const clickable = done && n <= reachable;
        const cls = "step" + (active ? " is-active" : "") + (done ? " is-done" : "");
        return (
          <li key={label} style={{ display: "contents" }}>
            <button
              type="button"
              className={cls}
              disabled={!clickable}
              aria-current={active ? "step" : undefined}
              onClick={() => clickable && onStep(n)}
            >
              <span className="step-dot">{done ? <IconCheck /> : n}</span>
              <span>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
