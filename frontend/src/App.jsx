import { useEffect, useState } from "react";
import Header, { BottomNav } from "./components/Header.jsx";
import CalcPage from "./components/CalcPage.jsx";
import PartsPage from "./components/PartsPage.jsx";
import HistoryPage from "./components/HistoryPage.jsx";
import * as api from "./lib/api.js";
import { load, save } from "./lib/storage.js";

export default function App() {
  const [active, setActive] = useState("calc");
  const [catalog, setCatalog] = useState(null);
  const [history, setHistory] = useState(() => load("ai_history", []));
  const [watchList, setWatchList] = useState(() => load("ai_watchlist", []));
  const [partsCtx, setPartsCtx] = useState(() => load("ai_parts_ctx", { scale: 1, region: "Екатеринбург" }));
  const [toast, setToast] = useState("");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api.fetchCatalog().then((c) => { setCatalog(c); setOffline(!c.online); });
  }, []);

  useEffect(() => {
    api.fetchHistory().then((remote) => { if (remote) setHistory(remote); });
  }, []);

  useEffect(() => save("ai_history", history), [history]);
  useEffect(() => save("ai_watchlist", watchList), [watchList]);
  useEffect(() => save("ai_parts_ctx", partsCtx), [partsCtx]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  async function saveHistory(result, scenarios, variantIndex, years) {
    setPartsCtx({ scale: result.scale, region: result.region });
    const entry = {
      ts: Date.now(), brand: result.brand, model: result.model, year: result.year,
      mileage: result.mileage, region: result.region, condition: result.condition,
      categories: result.categories, severity: result.severity,
      variant_index: variantIndex, years, cost: scenarios.cost,
      scenario1: scenarios.scenario1, scenario2: scenarios.scenario2,
      decision: scenarios.decision,
    };
    const saved = await api.saveHistory(entry);
    setHistory((h) => [entry, ...h].slice(0, 30));
    if (!saved) setOffline(true);
  }

  async function clearHistory() {
    await api.clearHistory();
    setHistory([]);
  }

  async function toggleWatch(key, remoteResult) {
    setWatchList((w) => {
      if (remoteResult !== null) return remoteResult ? [...new Set([...w, key])] : w.filter((k) => k !== key);
      return w.includes(key) ? w.filter((k) => k !== key) : [...w, key];
    });
  }

  if (!catalog) {
    return (
      <div className="app">
        <div className="loading-state" style={{ paddingTop: 120 }}>
          <div className="spinner" />
          <b>Загружаем приложение…</b>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header active={active} onChange={setActive} />
      <main>
        <section className={"tab-panel" + (active === "calc" ? " on" : "")}>
          <CalcPage catalog={catalog} onSaveHistory={saveHistory} offline={offline} />
        </section>
        <section className={"tab-panel" + (active === "parts" ? " on" : "")}>
          <PartsPage
            scale={partsCtx.scale}
            region={partsCtx.region}
            watchList={watchList}
            onToggleWatch={toggleWatch}
            onToast={setToast}
          />
        </section>
        <section className={"tab-panel" + (active === "history" ? " on" : "")}>
          <HistoryPage items={history} onClear={clearHistory} />
        </section>
      </main>
      <BottomNav active={active} onChange={setActive} />
      <div className={"toast" + (toast ? " on" : "")}>{toast}</div>
    </div>
  );
}
