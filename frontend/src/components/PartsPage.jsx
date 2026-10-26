import { useEffect, useMemo, useState } from "react";
import { fmt } from "../lib/engine.js";
import * as api from "../lib/api.js";
import { Card } from "./ui.jsx";
import { CirSearch } from "./cirrus.jsx";

export default function PartsPage({ scale, region, watchList, onToggleWatch, onToast }) {
  const [query, setQuery] = useState("");
  const [condition, setCondition] = useState("");
  const [sort, setSort] = useState("price");
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.fetchParts(region, scale).then((data) => {
      if (!cancelled) { setOffers(data); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [region, scale]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    let list = offers.filter((o) => (!condition || o.condition === condition) &&
      (!q || o.name.toLowerCase().includes(q) || o.oem.toLowerCase().includes(q)));
    list.sort((a, b) => (sort === "price" ? a.price - b.price : a.distance_km - b.distance_km));
    return list.slice(0, 40);
  }, [offers, query, condition, sort]);

  async function toggle(o) {
    const wasWatched = watchList.includes(o.key);
    const remoteResult = await api.toggleWatch(o.key);
    onToggleWatch(o.key, remoteResult);
    onToast(wasWatched ? "Отслеживание отключено" : "Уведомим, если цена снизится");
  }

  return (
    <Card title="Агрегатор запчастей">
      <div className="toolbar">
        <CirSearch placeholder="Поиск по названию или OEM-коду" value={query} onChange={setQuery} />
        <select value={condition} onChange={(e) => setCondition(e.target.value)}>
          <option value="">Любое состояние</option>
          <option value="new">Новые</option>
          <option value="used">Б/у</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="price">Сначала дешевле</option>
          <option value="distance">Сначала ближе</option>
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th></th><th>Деталь</th><th>Состояние</th><th>Продавец</th><th>Город</th><th>Доставка</th><th>Цена</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty-state">Загружаем предложения…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="empty-state">Ничего не найдено</td></tr>
            )}
            {!loading && filtered.map((o) => {
              const watched = watchList.includes(o.key);
              return (
                <tr key={o.key + o.city}>
                  <td>
                    <button className={"star-btn" + (watched ? " on" : "")} onClick={() => toggle(o)}>
                      {watched ? "★" : "☆"}
                    </button>
                  </td>
                  <td><b>{o.name}</b><br /><small style={{ color: "var(--muted)" }}>{o.oem}</small></td>
                  <td><span className={"tag " + (o.condition === "new" ? "tag-new" : "tag-used")}>{o.condition === "new" ? "Новая" : "Б/у"}</span></td>
                  <td>{o.seller}</td>
                  <td>{o.city}<br /><small style={{ color: "var(--muted)" }}>{o.distance_km} км</small></td>
                  <td>{o.delivery ? "Есть" : "Самовывоз"}</td>
                  <td><b>{fmt(o.price)}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">Нажмите ★, чтобы получать уведомления о снижении цены на деталь.</p>
    </Card>
  );
}
