import { useState } from "react";

const BODY = {
  sedan: {
    path: "M36 176V146C36 136 44 130 56 128L110 120L168 76C176 68 188 64 200 64H322C336 64 346 68 356 76L396 116L478 128C494 132 504 142 506 156L508 176H462A44 44 0 0 0 374 176H174A44 44 0 0 0 86 176Z",
    glass: ["M180 112L206 76H268V112Z", "M278 76H322C332 76 338 80 344 86L374 112H278Z"],
    seams: ["M273 112V176", "M186 118L182 176", "M364 118L368 176"],
    hood: "M396 116L478 128L480 142L404 134Z",
    front: "M462 128L478 128C494 132 504 142 506 156L508 176H462Z",
    head: "M484 134L506 140C508 146 508 150 506 155L486 151Z",
    tail: "M36 142L46 134H52V152H36Z",
    sensors: [[498, 168], [46, 168]],
    wheels: [[130, 184, 34], [418, 184, 34]],
    arch: 44,
  },
  suv: {
    path: "M36 182V140C36 130 44 124 56 122L102 116L150 64C158 56 170 52 182 52H330C344 52 354 56 364 64L396 108L478 122C494 126 504 136 506 152L508 182H466A46 46 0 0 0 374 182H178A46 46 0 0 0 86 182Z",
    glass: ["M160 106L188 66H266V106Z", "M276 66H328C338 66 346 70 352 76L378 106H276Z"],
    seams: ["M271 106V182", "M172 112L168 182", "M368 112L372 182"],
    hood: "M396 108L478 122L480 138L404 128Z",
    front: "M462 122L478 122C494 126 504 136 506 152L508 182H462Z",
    head: "M484 128L506 136C508 142 508 146 506 151L486 147Z",
    tail: "M36 136L46 128H52V148H36Z",
    sensors: [[498, 172], [46, 172]],
    wheels: [[130, 188, 38], [420, 188, 38]],
    arch: 46,
  },
};

const ZONE_NAMES = {
  body: "Передний бампер",
  engine: "Капот",
  optics: "Фары",
  paint: "Кузов и ЛКП",
  suspension: "Колёса и подвеска",
  electronics: "Датчики",
};

export default function CarMap({ categories, labels, onToggle }) {
  const [kind, setKind] = useState("sedan");
  const b = BODY[kind];
  const on = (v) => categories.includes(v);
  const act = (v) => onToggle(v, !on(v));
  const keyAct = (v) => (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      act(v);
    }
  };
  const zoneProps = (v, extra = "") => ({
    className: `zone${extra} ${on(v) ? "on" : ""}`,
    role: "button",
    tabIndex: 0,
    "aria-pressed": on(v),
    "aria-label": labels[v] || ZONE_NAMES[v],
    onClick: () => act(v),
    onKeyDown: keyAct(v),
  });
  const selected = categories.filter((c) => ZONE_NAMES[c]);
  const badge =
    selected.length === 0
      ? null
      : selected.length === 1
        ? `Выбран ${ZONE_NAMES[selected[0]]}`
        : `Выбрано зон: ${selected.length}`;

  return (
    <>
      <div className="card-top">
        <div>
          <h2 style={{ marginBottom: 4 }}>Интерактивная карта</h2>
          <p>Выберите поврежденные зоны на схеме автомобиля</p>
        </div>
        <div className="body-toggle" role="group" aria-label="Тип кузова">
          <button type="button" className={kind === "sedan" ? "on" : ""} aria-pressed={kind === "sedan"} onClick={() => setKind("sedan")}>Седан</button>
          <button type="button" className={kind === "suv" ? "on" : ""} aria-pressed={kind === "suv"} onClick={() => setKind("suv")}>Внедорожник</button>
        </div>
      </div>
      <div className="map-panel">
        {badge ? (
          <div className="map-badge"><i />{badge}</div>
        ) : (
          <div className="map-badge map-badge--empty"><i />Зона не выбрана</div>
        )}
        <svg className="carmap" viewBox="0 0 544 250" role="group" aria-label="Схема автомобиля, вид сбоку">
          <ellipse className="ground" cx="272" cy="226" rx="250" ry="12" />
          <path className="body" d={b.path} />
          {b.glass.map((d) => <path key={d} className="glass" d={d} />)}
          {b.seams.map((d) => <path key={d} d={d} stroke="#2c3036" strokeWidth="1.5" fill="none" />)}
          <path className="shade" d="M36 160H508V176H36Z" />
          {b.wheels.map(([cx, cy, r]) => (
            <g key={cx}>
              <circle className="arch" cx={cx} cy={cy} r={b.arch} />
              <circle className="tyre" cx={cx} cy={cy} r={r} />
              <circle className="rim" cx={cx} cy={cy} r={r * 0.58} />
              <circle className="tyre" cx={cx} cy={cy} r={r * 0.2} />
            </g>
          ))}
          <path d={b.head} fill="#f1f5f9" opacity=".92" />
          <path d={b.tail} fill="#ef4444" opacity=".9" />

          <g {...zoneProps("paint")}>
            <title>{labels.paint}</title>
            <path className="hit" d={b.path} />
          </g>
          <g {...zoneProps("body")}>
            <title>{labels.body}</title>
            <path className="hit" d={b.front} />
          </g>
          <g {...zoneProps("engine")}>
            <title>{labels.engine}</title>
            <path className="hit" d={b.hood} />
          </g>
          <g {...zoneProps("optics")}>
            <title>{labels.optics}</title>
            <path className="hit" d={b.head} />
            <path className="hit" d={b.tail} />
          </g>
          <g {...zoneProps("suspension", " wheel")}>
            <title>{labels.suspension}</title>
            {b.wheels.map(([cx, cy, r]) => <circle key={cx} className="hit" cx={cx} cy={cy} r={r + 2} />)}
          </g>
          <g {...zoneProps("electronics", " dot")}>
            <title>{labels.electronics}</title>
            {b.sensors.map(([cx, cy]) => <circle key={cx} className="hit" cx={cx} cy={cy} r="7" />)}
          </g>
        </svg>
      </div>
    </>
  );
}
