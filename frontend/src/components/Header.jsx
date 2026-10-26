import { CirTabs } from "./cirrus.jsx";

const TABS = [
  { id: "calc", label: "Расчёт", icon: "⌂" },
  { id: "parts", label: "Запчасти", icon: "◫" },
  { id: "history", label: "История", icon: "▤" },
];

export default function Header({ active, onChange }) {
  return (
    <header className="header">
      <div className="header-row">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">LOGO</div>
          <span className="brand-name">[Название проекта]</span>
        </div>
        <div className="tabs-desktop">
          <CirTabs
            name="main-nav"
            value={active}
            onChange={onChange}
            options={TABS.map((t) => ({ value: t.id, label: t.label }))}
          />
        </div>
      </div>
      <div className="hero">
        <h1>Чинить или продавать? <b>Ответ в цифрах.</b></h1>
        <p>Оценим ремонт, найдём запчасти, сравним с рынком и покажем, что выгоднее именно для вашей машины.</p>
      </div>
    </header>
  );
}

export function BottomNav({ active, onChange }) {
  return (
    <nav className="tabs-mobile">
      {TABS.map((t) => (
        <button key={t.id} className={active === t.id ? "on" : ""} onClick={() => onChange(t.id)}>
          <span className="tab-ic">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
