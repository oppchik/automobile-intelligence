import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../lib/api.js";
import { fmtRub } from "../lib/engine.js";
import { load, save } from "../lib/storage.js";
import {
  ageText, deliveryText, formatDate, freshness, geolocationMessage, groupSellers, hasCoordinates,
  pickupText, pinLabel, plural, resolveOrigin, sortGroups,
} from "../lib/sellers.js";
import { Card } from "./ui.jsx";
import { CirButton, CirCheck, CirSearch } from "./cirrus.jsx";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

function FreshBadge({ age }) {
  const f = freshness(age);
  return <span className={`fresh fresh--${f.level}`}>{f.label}</span>;
}

function textNode(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

export default function SellerMap({ regions, region, scale, active, picked, onPick, onToast }) {
  const [city, setCity] = useState(region);
  const [data, setData] = useState(null);
  const [offers, setOffers] = useState([]);
  const [query, setQuery] = useState("");
  const [condition, setCondition] = useState("");
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [maxAge, setMaxAge] = useState(0);
  const [sort, setSort] = useState("price");
  const [showSource, setShowSource] = useState(() => load("ai_map_show_source", true));
  const [selectedId, setSelectedId] = useState(null);
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState("");
  const [mapState, setMapState] = useState("idle");
  const [tileFailed, setTileFailed] = useState(false);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const layerRef = useRef(null);
  const markersRef = useRef(new Map());
  const fitKeyRef = useRef("");
  const centerRef = useRef(null);

  useEffect(() => setCity(region), [region]);
  useEffect(() => save("ai_map_show_source", showSource), [showSource]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setSelectedId(null);
    Promise.all([api.fetchSellers(city), api.fetchParts(city, scale)]).then(([sellers, parts]) => {
      if (cancelled) return;
      setData(sellers);
      setOffers(parts);
    });
    return () => { cancelled = true; };
  }, [city, scale]);

  const center = data ? data.center : null;
  centerRef.current = center;
  const resolved = useMemo(
    () => (center ? resolveOrigin(center, position) : { origin: null, reason: null, distance: null }),
    [center, position],
  );
  const origin = resolved.origin;
  const hasQuery = query.trim().length > 0;

  const groups = useMemo(() => {
    if (!data) return [];
    return sortGroups(
      groupSellers({ sellers: data.sellers, offers, query, condition, deliveryOnly, maxAge, origin }),
      sort,
    );
  }, [data, offers, query, condition, deliveryOnly, maxAge, origin, sort]);

  const selected = groups.find((g) => g.seller.id === selectedId) || null;
  const pickedHere = picked && picked.id === selectedId;
  const pickedGroup = picked && data ? data.sellers.find((s) => s.id === picked.id) : null;

  useEffect(() => {
    if (!active || mapRef.current || mapState === "failed") return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [mod] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
        if (cancelled || !containerRef.current) return;
        const L = mod.default || mod;
        const start = centerRef.current ? [centerRef.current.lat, centerRef.current.lon] : [56, 60];
        const map = L.map(containerRef.current).setView(start, 11);
        let loaded = 0;
        let failed = 0;
        const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION });
        tiles.on("tileload", () => { loaded += 1; setTileFailed(false); });
        tiles.on("tileerror", () => {
          failed += 1;
          if (loaded === 0 && failed >= 3) setTileFailed(true);
        });
        tiles.addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        leafletRef.current = L;
        mapRef.current = map;
        setMapState("ready");
      } catch {
        if (!cancelled) setMapState("failed");
      }
    })();
    return () => { cancelled = true; };
  }, [active, mapState]);

  useEffect(() => () => {
    if (mapRef.current) mapRef.current.remove();
    mapRef.current = null;
  }, []);

  useEffect(() => {
    if (!active || mapState !== "ready") return undefined;
    const id = setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 60);
    return () => clearTimeout(id);
  }, [active, mapState]);

  useEffect(() => {
    if (mapState !== "ready") return;
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    layer.clearLayers();
    markersRef.current.clear();
    const points = [];
    for (const g of groups) {
      if (!hasCoordinates(g.seller)) continue;
      const on = g.seller.id === selectedId;
      const isPicked = picked && picked.id === g.seller.id;
      const label = textNode("span", `${isPicked ? "★ " : ""}${pinLabel(g, hasQuery)}`);
      const icon = L.divIcon({
        className: `seller-pin seller-pin--${g.seller.condition}${on ? " seller-pin--on" : ""}`,
        html: label,
        iconSize: [70, 30],
        iconAnchor: [35, 36],
      });
      const marker = L.marker([g.seller.lat, g.seller.lon], {
        icon, title: g.seller.seller, keyboard: true, zIndexOffset: on ? 1000 : 0,
      });
      marker.bindTooltip(textNode("span", g.seller.seller), { direction: "top", offset: [0, -34] });
      marker.on("click", () => setSelectedId(g.seller.id));
      marker.addTo(layer);
      markersRef.current.set(g.seller.id, marker);
      points.push([g.seller.lat, g.seller.lon]);
    }
    if (origin) {
      L.circleMarker([origin.lat, origin.lon], {
        radius: 7, color: "#ffffff", weight: 2, fillColor: "#2e7def", fillOpacity: 1,
      }).bindTooltip("Вы здесь").addTo(layer);
    }
    const key = `${city}|${groups.map((g) => g.seller.id).join(",")}`;
    if (fitKeyRef.current !== key) {
      fitKeyRef.current = key;
      if (points.length > 1) map.fitBounds(points, { padding: [48, 48], maxZoom: 13 });
      else if (points.length === 1) map.setView(points[0], 13);
      else if (center) map.setView([center.lat, center.lon], 10);
    }
  }, [mapState, groups, selectedId, origin, hasQuery, city, center, picked]);

  useEffect(() => {
    if (mapState !== "ready" || !selected) return;
    const map = mapRef.current;
    const target = [selected.seller.lat, selected.seller.lon];
    if (!map.getBounds().pad(-0.15).contains(target)) map.panTo(target);
  }, [mapState, selected]);

  function locate() {
    if (!navigator.geolocation) {
      setGeoMessage(geolocationMessage("unsupported"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGeoMessage("");
        setLocating(false);
      },
      (error) => {
        setGeoMessage(geolocationMessage(error));
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  }

  function togglePick(seller) {
    if (picked && picked.id === seller.id) {
      onPick(null);
      onToast("Выбор точки покупки отменён");
      return;
    }
    onPick({ id: seller.id, seller: seller.seller, city: seller.city, kind: seller.kind });
    onToast("Точка покупки выбрана");
  }

  const distanceNote = origin ? "от вас" : "от центра города";

  return (
    <div className="seller-map">
      {picked && (
        <div className="picked">
          <div>
            <small>Выбранная точка покупки</small>
            <b>{picked.seller}</b>
            <span>{picked.kind}, {picked.city}</span>
            {pickedGroup && (
              <span>{pickupText(pickedGroup)} · {deliveryText(pickedGroup)}</span>
            )}
            {pickedGroup && showSource && (
              <span>{pickedGroup.source}, цены на {formatDate(pickedGroup.price_date)}</span>
            )}
          </div>
          <button type="button" className="link-btn" onClick={() => onPick(null)}>Сбросить</button>
        </div>
      )}
      <Card title="Карта продавцов запчастей">
        <div className="toolbar">
          <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Город">
            {regions.map((r) => <option key={r}>{r}</option>)}
          </select>
          <CirSearch placeholder="Деталь или OEM-код" value={query} onChange={setQuery} />
          <select value={condition} onChange={(e) => setCondition(e.target.value)} aria-label="Состояние">
            <option value="">Любое состояние</option>
            <option value="new">Новые</option>
            <option value="used">Б/у</option>
          </select>
          <select value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} aria-label="Возраст цены">
            <option value={0}>Любая давность</option>
            <option value={3}>Не старше 3 дней</option>
            <option value={7}>Не старше 7 дней</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортировка">
            <option value="price">Сначала дешевле</option>
            <option value="distance">Сначала ближе</option>
          </select>
        </div>
        <div className="map-opts">
          <CirCheck checked={deliveryOnly} onChange={setDeliveryOnly}>Только с доставкой</CirCheck>
          <CirCheck checked={showSource} onChange={setShowSource}>Показывать источник и дату цены</CirCheck>
          {position
            ? <button type="button" className="link-btn" onClick={() => { setPosition(null); setGeoMessage(""); }}>Не учитывать моё местоположение</button>
            : <button type="button" className="link-btn" onClick={locate} disabled={locating}>{locating ? "Определяем…" : "Рядом со мной"}</button>}
        </div>
        {geoMessage && <p className="map-msg">{geoMessage}</p>}
        {resolved.reason === "far" && (
          <p className="map-msg">Вы находитесь в {resolved.distance} км от выбранного города — расстояние считаем от центра города.</p>
        )}
        {data && data.online === false && (
          <p className="map-msg">Сервер недоступен — показаны локальные демонстрационные данные.</p>
        )}

        <div className="map-grid">
          <div className="map-box">
            <div ref={containerRef} className={"map-canvas" + (mapState === "failed" ? " off" : "")} />
            {mapState === "failed" && (
              <div className="map-fallback">Карту не удалось загрузить — список продавцов и условия доступны рядом.</div>
            )}
            {mapState === "ready" && tileFailed && (
              <div className="map-tilewarn">Подложка карты не загружается — точки продавцов показаны без неё.</div>
            )}
            {mapState === "idle" && <div className="map-fallback">Загружаем карту…</div>}
          </div>
          <div className="seller-list" role="list">
            {!data && <div className="empty-state">Загружаем продавцов…</div>}
            {data && groups.length === 0 && <div className="empty-state">Нет продавцов по выбранным условиям</div>}
            {groups.map((g) => {
              const s = g.seller;
              return (
                <button
                  type="button" role="listitem" key={s.id}
                  className={"seller-item" + (s.id === selectedId ? " on" : "")}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="seller-item__top">
                    <b>{s.seller}</b>
                    <span className={"tag " + (s.condition === "new" ? "tag-new" : "tag-used")}>{s.condition === "new" ? "Новая" : "Б/у"}</span>
                    {picked && picked.id === s.id && <span className="tag">Выбрано</span>}
                  </span>
                  <small>{s.kind} · {g.distance} км {distanceNote}</small>
                  <small>{s.delivery ? "Самовывоз и доставка" : "Только самовывоз"}</small>
                  <span className="seller-item__price">
                    {hasQuery
                      ? `от ${fmtRub(g.bestPrice)}`
                      : `${g.offers.length} ${plural(g.offers.length, ["предложение", "предложения", "предложений"])}`}
                  </span>
                  {showSource && (
                    <small className="seller-item__src">
                      {s.source} · цены на {formatDate(s.price_date)} ({ageText(s.price_age_days)}) <FreshBadge age={s.price_age_days} />
                    </small>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <p className="note">Продавцы, условия, цены и даты — демонстрационные данные проекта; положение точек на карте условное.</p>
      </Card>

      {selected && (
        <Card title={selected.seller.seller} eyebrow={`${selected.seller.kind} · ${selected.seller.city}`}>
          <div className="seller-facts">
            <div>
              <span>Получение</span>
              <b>{pickupText(selected.seller)}</b>
              <b>{deliveryText(selected.seller)}</b>
            </div>
            <div>
              <span>Расстояние</span>
              <b>{selected.distance} км</b>
              <small>{distanceNote}</small>
            </div>
            {showSource && (
              <div>
                <span>Источник цены</span>
                <b>{selected.seller.source}</b>
                <small>Цены на {formatDate(selected.seller.price_date)}, {ageText(selected.seller.price_age_days)}</small>
                <FreshBadge age={selected.seller.price_age_days} />
              </div>
            )}
          </div>
          {showSource && freshness(selected.seller.price_age_days).level === "stale" && (
            <p className="map-msg">Цены могли устареть — уточните их у продавца перед покупкой.</p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Деталь</th><th>OEM</th><th className="num">Цена</th></tr>
              </thead>
              <tbody>
                {selected.offers.slice(0, 12).map((o) => (
                  <tr key={o.key}>
                    <td><b>{o.name}</b></td>
                    <td>{o.oem}</td>
                    <td className="num"><b>{fmtRub(o.price)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="seller-actions">
            <CirButton arrow={false} onClick={() => togglePick(selected.seller)}>
              {pickedHere ? "Отменить выбор" : "Выбрать точку покупки"}
            </CirButton>
          </div>
        </Card>
      )}
    </div>
  );
}
