import { Brand } from "./Logo.jsx";
import { IconDamage, IconParts, IconMarket } from "./icons.jsx";

const NAV = [
  { id: "calc", label: "Оценка" },
  { id: "parts", label: "Запчасти" },
  { id: "map", label: "Рынок" },
  { id: "history", label: "История" },
  { id: "help", label: "Помощь" },
];

const IconClock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);
const IconUser = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

const BOTTOM = [
  { id: "calc", label: "Оценка", icon: <IconDamage /> },
  { id: "parts", label: "Запчасти", icon: <IconParts /> },
  { id: "map", label: "Рынок", icon: <IconMarket /> },
  { id: "history", label: "История", icon: <IconClock /> },
  { id: "account", label: "Кабинет", icon: <IconUser /> },
];

const shortName = (user) => {
  const raw = (user.name || user.email.split("@")[0]).trim();
  const parts = raw.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[1][0].toUpperCase()}.` : raw;
};

export default function Header({ active, onChange, user }) {
  return (
    <header className="header">
      <div className="header-row">
        <div className="header-left">
          <Brand onClick={() => onChange("home")} />
          <nav className="nav" aria-label="Основное меню">
            {NAV.map((t) => (
              <button
                key={t.id}
                type="button"
                className={active === t.id ? "on" : ""}
                aria-current={active === t.id ? "page" : undefined}
                onClick={() => onChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        {user ? (
          <button type="button" className="user-box" onClick={() => onChange("account")} aria-label="Личный кабинет">
            <span className="user-text">
              <small>Личный кабинет</small>
              <b>{shortName(user)}</b>
            </span>
            <span className="user-avatar" aria-hidden="true">{(user.name || user.email)[0].toUpperCase()}</span>
          </button>
        ) : (
          <button type="button" className="login-btn" onClick={() => onChange("account")}>Вход</button>
        )}
      </div>
    </header>
  );
}

export function BottomNav({ active, onChange }) {
  return (
    <nav className="tabs-mobile" aria-label="Быстрая навигация">
      {BOTTOM.map((t) => (
        <button key={t.id} type="button" className={active === t.id ? "on" : ""} onClick={() => onChange(t.id)}>
          <span className="tab-ic">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
