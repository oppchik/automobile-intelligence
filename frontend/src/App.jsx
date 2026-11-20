import { useEffect, useState } from "react";
import Header, { BottomNav } from "./components/Header.jsx";
import CalcPage from "./components/CalcPage.jsx";
import PartsPage from "./components/PartsPage.jsx";
import SellerMap from "./components/SellerMap.jsx";
import HistoryPage from "./components/HistoryPage.jsx";
import AccountPage from "./components/AccountPage.jsx";
import * as api from "./lib/api.js";
import { load, save } from "./lib/storage.js";

export default function App() {
  const [active, setActive] = useState("calc");
  const [catalog, setCatalog] = useState(null);
  const [history, setHistory] = useState(() => load("ai_history", []));
  const [watchList, setWatchList] = useState(() => load("ai_watchlist", []));
  const [partsCtx, setPartsCtx] = useState(() => load("ai_parts_ctx", { scale: 1, region: "Екатеринбург" }));
  const [picked, setPicked] = useState(() => load("ai_picked_point", null));
  const [toast, setToast] = useState("");
  const [offline, setOffline] = useState(false);
  const [user, setUser] = useState(null);
  const [recalc, setRecalc] = useState(null);
  const [selectedParts, setSelectedParts] = useState(() => load("ai_selected_parts", []));

  useEffect(() => {
    api.fetchCatalog().then((c) => { setCatalog(c); setOffline(!c.online); });
  }, []);

  useEffect(() => {
    (async () => {
      setUser(await api.fetchMe());
      const remote = await api.fetchHistory();
      if (remote) setHistory(remote);
    })();
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setToast("Сессия истекла, войдите снова");
    };
    window.addEventListener("ai-auth-expired", onExpired);
    return () => window.removeEventListener("ai-auth-expired", onExpired);
  }, []);

  useEffect(() => save("ai_history", history), [history]);
  useEffect(() => save("ai_watchlist", watchList), [watchList]);
  useEffect(() => save("ai_selected_parts", selectedParts), [selectedParts]);
  useEffect(() => save("ai_parts_ctx", partsCtx), [partsCtx]);
  useEffect(() => save("ai_picked_point", picked), [picked]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  async function saveHistory(result, scenarios, variantIndex, years, advisor) {
    setPartsCtx({ scale: result.scale, region: result.region });
    const entry = {
      ts: Date.now(), brand: result.brand, model: result.model, year: result.year,
      mileage: result.mileage, region: result.region, condition: result.condition,
      categories: result.categories, severity: result.severity,
      variant_index: variantIndex, years, cost: scenarios.cost,
      scenario1: scenarios.scenario1, scenario2: scenarios.scenario2,
      decision: scenarios.decision, advisor: advisor || null,
    };
    const saved = await api.saveHistory(entry);
    setHistory((h) => [saved || entry, ...h].slice(0, 50));
    if (!saved) setOffline(true);
    if (advisor) setToast(saved ? "Расчёт сохранён в историю" : "Сохранено только на этом устройстве");
  }

  async function deleteHistoryItem(item) {
    if (item.id && !(await api.deleteHistoryItem(item.id))) return setToast("Не удалось удалить запись");
    setHistory((h) => h.filter((x) => (item.id ? x.id !== item.id : x.ts !== item.ts)));
  }

  function recalcFromHistory(item) {
    setRecalc({ entry: item, nonce: Date.now() });
    setActive("calc");
  }

  async function handleAuth(mode, form) {
    const res = await api.authenticate(mode, form);
    if (res.error) return res;
    setUser(res.user);
    const remote = await api.fetchHistory();
    if (remote) setHistory(remote);
    setToast(mode === "register" ? "Аккаунт создан" : "Вы вошли в аккаунт");
    return {};
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setHistory([]);
    setToast("Вы вышли из аккаунта");
  }

  async function clearHistory() {
    await api.clearHistory();
    setHistory([]);
  }

  function addPartToEstimate(part) {
    setSelectedParts((items) => [...items.filter((item) => item.key !== part.key), { key: part.key, name: part.name, oem: part.oem, price: part.price, seller: part.seller, condition: part.condition, quantity: 1 }]);
    setToast("Деталь добавлена в смету");
    setActive("calc");
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
          <CalcPage catalog={catalog} onSaveHistory={saveHistory} offline={offline} prefill={recalc} selectedParts={selectedParts} onRemovePart={(key) => setSelectedParts((items) => items.filter((item) => item.key !== key))} />
        </section>
        <section className={"tab-panel" + (active === "parts" ? " on" : "")}>
          <PartsPage
            scale={partsCtx.scale}
            region={partsCtx.region}
            watchList={watchList}
            onToggleWatch={toggleWatch}
            onToast={setToast}
            onAddToEstimate={addPartToEstimate}
          />
        </section>
        <section className={"tab-panel" + (active === "map" ? " on" : "")}>
          <SellerMap
            regions={catalog.regions}
            region={partsCtx.region}
            scale={partsCtx.scale}
            active={active === "map"}
            picked={picked}
            onPick={setPicked}
            onToast={setToast}
          />
        </section>
        <section className={"tab-panel" + (active === "history" ? " on" : "")}>
          <HistoryPage
            items={history}
            onClear={clearHistory}
            onDelete={deleteHistoryItem}
            onRecalc={recalcFromHistory}
            loggedIn={!!user}
          />
        </section>
        <section className={"tab-panel" + (active === "account" ? " on" : "")}>
          <AccountPage
            user={user}
            historyCount={history.length}
            offline={offline}
            onAuth={handleAuth}
            onLogout={handleLogout}
            onOpenHistory={() => setActive("history")}
          />
        </section>
      </main>
      <BottomNav active={active} onChange={setActive} />
      <div className={"toast" + (toast ? " on" : "")}>{toast}</div>
    </div>
  );
}
