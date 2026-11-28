import { IconDamage, IconParts, IconMarket, IconAdvisor, IconArrowRight } from "./icons.jsx";

const MODULES = [
  {
    id: "damage",
    icon: <IconDamage />,
    title: "Оценка повреждений",
    text: "Автоматическое распознавание дефектов по фото и расчет стоимости восстановления.",
    to: "calc",
  },
  {
    id: "parts",
    icon: <IconParts />,
    title: "Подбор запчастей",
    text: "Умный поиск оригинальных деталей и аналогов с актуальными ценами от поставщиков.",
    to: "parts",
  },
  {
    id: "market",
    icon: <IconMarket />,
    title: "Рыночная стоимость",
    text: "Анализ реальных цен на рынке с учетом состояния, пробега и истории обслуживания.",
    to: "calc",
  },
  {
    id: "advisor",
    icon: <IconAdvisor />,
    title: "Финансовый советник",
    text: "Прогноз расходов на содержание и рекомендации по оптимизации затрат на авто.",
    to: "calc",
  },
];

function HeroArt() {
  return (
    <svg viewBox="0 0 660 520" role="img" aria-label="Иллюстрация: схема автомобиля с подсветкой">
      <defs>
        <radialGradient id="ha-red">
          <stop offset="0" stopColor="#a1280d" stopOpacity="0.6" />
          <stop offset="1" stopColor="#a1280d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ha-blue">
          <stop offset="0" stopColor="#2f6bff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#2f6bff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ha-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d1d25" />
          <stop offset="1" stopColor="#0b0b0f" />
        </linearGradient>
        <filter id="ha-blur" x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="ha-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <path id="ha-half" d="M330 168C300 168 280 170 262 176L214 256L150 282C120 290 100 296 96 300C80 312 74 328 74 340L72 392C72 408 90 420 118 424L220 440L330 444Z" />
        <g id="ha-detail" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M330 186C305 186 285 190 273 196L238 250L330 255" strokeOpacity="0.38" />
          <path d="M214 256L172 300L162 332" strokeOpacity="0.3" />
          <path d="M104 318L204 308L214 332L124 350Z" fill="#07070a" strokeOpacity="0.8" />
          <path d="M150 396L330 410M190 374L330 382" strokeOpacity="0.3" />
          <path d="M58 340V408C58 416 64 420 72 420H86V336Z" fill="#06060a" strokeOpacity="0.4" />
          <path d="M188 232L166 222L158 236L182 246Z" fill="#101016" strokeOpacity="0.5" />
        </g>
      </defs>

      <circle cx="170" cy="250" r="260" fill="url(#ha-red)" />
      <circle cx="500" cy="300" r="250" fill="url(#ha-blue)" />

      <g stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1">
        {[-3, -2, -1, 0, 1, 2, 3].map((k) => (
          <line key={k} x1={330 + k * 36} y1="330" x2={330 + k * 140} y2="520" />
        ))}
        {[360, 400, 450, 500].map((y) => (
          <line key={y} x1="40" y1={y} x2="620" y2={y} />
        ))}
      </g>

      <ellipse cx="190" cy="452" rx="170" ry="24" fill="#a1280d" opacity="0.5" filter="url(#ha-blur)" />
      <ellipse cx="470" cy="452" rx="170" ry="24" fill="#2f6bff" opacity="0.4" filter="url(#ha-blur)" />

      <g filter="url(#ha-soft)" opacity="0.9">
        <use href="#ha-half" fill="none" stroke="#ff5a36" strokeWidth="5" strokeOpacity="0.55" />
        <use href="#ha-half" fill="none" stroke="#4f8bff" strokeWidth="5" strokeOpacity="0.55" transform="matrix(-1 0 0 1 660 0)" />
      </g>
      <use href="#ha-half" fill="url(#ha-body)" stroke="#ff6a47" strokeWidth="2" />
      <use href="#ha-half" fill="url(#ha-body)" stroke="#6a9bff" strokeWidth="2" transform="matrix(-1 0 0 1 660 0)" />

      <use href="#ha-detail" stroke="#ffd9cf" />
      <use href="#ha-detail" stroke="#d6e4ff" transform="matrix(-1 0 0 1 660 0)" />

      <rect x="270" y="394" width="120" height="26" rx="6" fill="#06060a" stroke="#ffffff" strokeOpacity="0.25" />
      <path d="M284 407H376M284 400H376M284 414H376" stroke="#ffffff" strokeOpacity="0.12" />
      <circle cx="330" cy="332" r="9" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5" />
      <path d="M326 336L330 327L334 336" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5" />

      <g fill="none" stroke="#8e230b" strokeWidth="2.5" strokeLinecap="round">
        <path d="M44 132V112H64" /><path d="M616 132V112H596" />
        <path d="M44 480V500H64" /><path d="M616 480V500H596" />
      </g>
      <circle cx="330" cy="436" r="5" fill="#ff5a36" />
      <circle cx="330" cy="436" r="5" fill="none" stroke="#ff5a36" strokeWidth="2">
        <animate attributeName="r" values="5;18" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0" dur="2.2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export default function HomePage({ onNavigate }) {
  return (
    <div className="home">
      <div className="home-grid" aria-hidden="true" />
      <div className="home-glow" aria-hidden="true" />
      <section className="hero">
        <div className="hero-copy">
          <h1>Интеллектуальная оценка стоимости ремонта и владения авто</h1>
          <p className="hero-lead">
            Точный расчет сметы, поиск запчастей и финансовый советник в одном приложении. Экономьте время и деньги на каждом этапе.
          </p>
          <div className="hero-cta">
            <button type="button" className="btn btn--lg" onClick={() => onNavigate("calc")}>
              Оценить автомобиль
              <IconArrowRight />
            </button>
            <button type="button" className="btn btn--lg btn--glass" onClick={() => onNavigate("help")}>
              Как это работает
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <b>10k+</b>
              <span>Проверенных автомобилей</span>
            </div>
            <div className="stat-sep" aria-hidden="true" />
            <div className="stat">
              <b>98%</b>
              <span>Точность расчетов</span>
            </div>
          </div>
        </div>
        <div className="hero-art" aria-hidden="false">
          <HeroArt />
        </div>
      </section>

      <section className="modules" aria-labelledby="modules-title">
        <div className="modules-head">
          <span className="modules-eyebrow" id="modules-title">Модули платформы</span>
          <h2>Комплексный подход к вашему авто</h2>
        </div>
        <div className="module-grid">
          {MODULES.map((m) => (
            <article key={m.id} className="module">
              <div className="module-ic">{m.icon}</div>
              <div className="module-text">
                <h3>{m.title}</h3>
                <p>{m.text}</p>
              </div>
              <button type="button" className="module-link" onClick={() => onNavigate(m.to)} aria-label={`Подробнее: ${m.title}`}>
                Подробнее
                <IconArrowRight />
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
