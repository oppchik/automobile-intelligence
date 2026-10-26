/*
 * Компоненты из UI-кита Cirrus (uiverse.io/ui-kits/cirrus by uiverse-astronaut),
 * перенесённые в React 1:1 по разметке и классам, с токенами проекта.
 */

export function CirButton({ children, arrow = true, variant = "default", className = "", ...props }) {
  const cls = ["cir-btn", variant === "ghost" ? "cir-btn--ghost" : "", className].filter(Boolean).join(" ");
  return (
    <button className={cls} type="button" {...props}>
      {children}
      {arrow && (
        <svg className="cir-btn__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 17 17 7" />
          <path d="M7 7h10v10" />
        </svg>
      )}
    </button>
  );
}

export function CirTabs({ name, options, value, onChange }) {
  return (
    <div className="cir-tabs" role="tablist">
      {options.map((o) => (
        <label key={o.value} className="cir-tabs__t-wrap">
          <input
            className="cir-tabs__r"
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span className="cir-tabs__t" role="tab" onClick={() => onChange(o.value)}>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export function CirSearch({ placeholder, value, onChange, kbd }) {
  return (
    <label className="cir-search">
      <svg className="cir-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.34-4.34" />
      </svg>
      <input className="cir-search__field" type="search" placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
      {kbd && <kbd className="cir-search__kbd">{kbd}</kbd>}
    </label>
  );
}

export function CirCheck({ checked, onChange, children }) {
  return (
    <label className="cir-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="cir-check__box" aria-hidden="true" />
      <span className="cir-check__label">{children}</span>
    </label>
  );
}
