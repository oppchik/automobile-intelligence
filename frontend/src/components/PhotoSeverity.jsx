import { Segmented } from "./ui.jsx";
import { SEVERITY_NAMES, SEVERITY_OPTIONS, percent, severitySource } from "../lib/severity.js";

export default function PhotoSeverity({ result, loading, value, onChange }) {
  if (loading) {
    return (
      <div className="sev">
        <div className="sev-head"><i className="sev-spin" />Анализируем фото…</div>
      </div>
    );
  }
  if (!result) return null;

  const source = severitySource(result, value);
  const rejected = result.photos.filter((p) => p.status === "rejected" && p.reason);
  const hint = result.severity ? SEVERITY_NAMES[result.severity] : null;

  return (
    <div className={`sev sev-${result.status}`}>
      <div className="sev-title">Распознавание по фото</div>
      {result.status === "ok" ? (
        <div className="sev-head">Тяжесть по фото: <b>{hint}</b> · уверенность {percent(result.confidence)}</div>
      ) : (
        <div className="sev-head">{result.message}</div>
      )}
      {result.status === "low_confidence" && hint && (
        <div className="note">Модель склоняется к: {hint} ({percent(result.confidence)})</div>
      )}
      {result.probabilities && (
        <div className="sev-bars">
          {SEVERITY_OPTIONS.map((o) => (
            <div key={o.value} className="sev-row">
              <span>{o.label}</span>
              <div className="sev-bar"><i style={{ width: percent(result.probabilities[o.value] || 0) }} /></div>
              <b>{percent(result.probabilities[o.value] || 0)}</b>
            </div>
          ))}
        </div>
      )}
      {rejected.length > 0 && (
        <ul className="sev-rej">
          {rejected.map((p, i) => <li key={i}>{p.name}: {p.reason}</li>)}
        </ul>
      )}
      <div className="sev-ctl">
        <span>Тяжесть повреждения (можно исправить)</span>
        <Segmented options={SEVERITY_OPTIONS} value={value} onChange={onChange} />
      </div>
      <div className="sev-foot">
        {source === "model" && "Принято значение модели"}
        {source === "manual" && `Выбрано вручную${result.status === "ok" ? ` (модель: ${hint})` : ""}`}
        {source === "none" && "Тяжесть не указана: учитывается только количество фото"}
        {value && <button type="button" className="link-btn" onClick={() => onChange(null)}>Не указывать</button>}
      </div>
      <p className="note">Модель оценивает только тяжесть, а не повреждённые детали — категории отметьте выше.</p>
    </div>
  );
}
