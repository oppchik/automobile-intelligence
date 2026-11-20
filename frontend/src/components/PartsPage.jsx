
import { useEffect, useState } from "react";
import { fmt } from "../lib/engine.js";
import * as api from "../lib/api.js";
import { Card } from "./ui.jsx";
import { CirSearch } from "./cirrus.jsx";

export default function PartsPage({
                                    scale,
                                    region,
                                    regions = [],
                                    onRegionChange,
                                    watchList,
                                    onToggleWatch,
                                    onToast,
                                  }) {
  const [query, setQuery] = useState("");
  const [condition, setCondition] = useState("");
  const [sort, setSort] = useState("price");
  const [maxPrice, setMaxPrice] = useState("");
  const [maxDistance, setMaxDistance] = useState("");
  const [selectedRegion, setSelectedRegion] = useState(region);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSelectedRegion(region);
  }, [region]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const data = await api.fetchParts(selectedRegion, scale, {
          query,
          condition,
          max_price: maxPrice,
          max_distance_km: maxDistance,
          sort_by: sort,
        });

        if (!cancelled) {
          setOffers(Array.isArray(data) ? data.slice(0, 40) : []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setOffers([]);
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    selectedRegion,
    scale,
    query,
    condition,
    maxPrice,
    maxDistance,
    sort,
  ]);

  async function toggle(offer) {
    const wasWatched = watchList.includes(offer.key);
    const remoteResult = await api.toggleWatch(offer.key);

    onToggleWatch(offer.key, remoteResult);

    onToast(
        wasWatched
            ? "Отслеживание отключено"
            : "Уведомим, если цена снизится"
    );
  }

  const regionOptions = [...new Set([
    ...regions,
    selectedRegion,
  ].filter(Boolean))];

  return (
      <Card title="Агрегатор запчастей">
        <div className="parts-filters">

          <div className="parts-search">
            <CirSearch
                placeholder="Поиск по VIN, OEM или названию"
                value={query}
                onChange={setQuery}
            />
          </div>

          <div className="parts-filter">
            <label>Регион</label>
            <select
                value={selectedRegion}
                onChange={(e) => {
                  setSelectedRegion(e.target.value);
                  onRegionChange?.(e.target.value);
                }}
            >
              {regionOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
              ))}
            </select>
          </div>

          <div className="parts-filter">
            <label>Состояние</label>
            <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
            >
              <option value="">Любое</option>
              <option value="new">Новые</option>
              <option value="used">Б/у</option>
            </select>
          </div>

          <div className="parts-filter">
            <label>Максимальная цена, ₽</label>
            <input
                type="number"
                min="0"
                placeholder="Без ограничения"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>

          <div className="parts-filter">
            <label>Расстояние, км</label>
            <input
                type="number"
                min="0"
                placeholder="Без ограничения"
                value={maxDistance}
                onChange={(e) => setMaxDistance(e.target.value)}
            />
          </div>

          <div className="parts-filter">
            <label>Сортировка</label>
            <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
            >
              <option value="price">Сначала дешевле</option>
              <option value="distance">Сначала ближе</option>
            </select>
          </div>
        </div>

        <div className="parts-results">
          {loading && (
              <div className="loading-state">
                <div className="spinner" />
                Загружаем предложения…
              </div>
          )}

          {!loading && offers.length === 0 && (
              <div className="empty-state">
                <div className="ic">⌕</div>
                Предложения не найдены. Попробуйте изменить параметры поиска.
              </div>
          )}

          {!loading && offers.map((offer) => {
            const watched = watchList.includes(offer.key);

            return (
                <article
                    className="parts-offer"
                    key={offer.key + offer.city}
                >
                  <div className="parts-offer-top">
                    <div>
                      <h3>{offer.name}</h3>
                      <small>{offer.oem}</small>
                    </div>

                    <button
                        className={"star-btn" + (watched ? " on" : "")}
                        onClick={() => toggle(offer)}
                        aria-label="Отслеживать цену"
                    >
                      {watched ? "★" : "☆"}
                    </button>
                  </div>

                  <div className="parts-offer-tags">
                <span className={
                    "tag " +
                    (offer.condition === "new" ? "tag-new" : "tag-used")
                }>
                  {offer.condition === "new" ? "Новая" : "Б/у"}
                </span>

                    <span className="parts-delivery">
                  {offer.delivery ? "Доставка доступна" : "Самовывоз"}
                </span>
                  </div>

                  <div className="parts-seller">
                    <div>
                      <small>Продавец</small>
                      <b>{offer.seller}</b>
                    </div>

                    <div>
                      <small>Регион</small>
                      <b>{offer.city}</b>
                    </div>
                  </div>

                  <div className="parts-offer-bottom">
                    <span>{offer.distance_km} км</span>
                    <strong>{fmt(offer.price)}</strong>
                  </div>
                </article>
            );
          })}
        </div>

        <p className="note">
          Добавьте запчасть в отслеживание, нажав ★.
          Вы сможете следить за изменением её стоимости.
        </p>
      </Card>
  );
}
