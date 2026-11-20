import { useState } from "react";
import { Card, Field, Segmented } from "./ui.jsx";
import { CirButton } from "./cirrus.jsx";

const MODES = [
  { value: "login", label: "Войти" },
  { value: "register", label: "Регистрация" },
];

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "";

export default function AccountPage({ user, historyCount, offline, onAuth, onLogout, onOpenHistory }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return setError("Введите email и пароль");
    if (mode === "register" && password.length < 8) return setError("Пароль должен быть не короче 8 символов");
    setError("");
    setBusy(true);
    const res = await onAuth(mode, {
      email,
      password,
      ...(mode === "register" && name.trim() ? { name: name.trim() } : {}),
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    setPassword("");
  }

  if (user) {
    return (
      <Card title="Личный кабинет">
        <div className="account-head">
          <div className="avatar" aria-hidden="true">{(user.name || user.email).slice(0, 1).toUpperCase()}</div>
          <div>
            <b>{user.name || user.email}</b>
            {user.name && <small>{user.email}</small>}
            {user.created_at && <small>В сервисе с {formatDate(user.created_at)}</small>}
          </div>
        </div>
        <div className="kv-grid account-stats">
          <div><span>Сохранённых расчётов</span><b>{historyCount}</b></div>
          <div><span>Хранение истории</span><b>В аккаунте</b></div>
          <div><span>Доступ</span><b>{offline ? "Нет связи" : "С любого устройства"}</b></div>
        </div>
        <p className="note">История расчётов привязана к аккаунту и хранится на сервере: после входа с другого устройства она будет на месте.</p>
        <div className="account-actions">
          <CirButton arrow={false} onClick={onOpenHistory}>Открыть историю</CirButton>
          <CirButton variant="ghost" arrow={false} onClick={onLogout}>Выйти</CirButton>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Личный кабинет">
      <p className="note" style={{ marginTop: 0 }}>
        Войдите, чтобы история расчётов хранилась в аккаунте. Расчёты, сделанные на этом устройстве до входа,
        будут привязаны к аккаунту.
      </p>
      <div style={{ margin: "14px 0" }}>
        <Segmented options={MODES} value={mode} onChange={(m) => { setMode(m); setError(""); }} />
      </div>
      <form onSubmit={submit} className="auth-form">
        {mode === "register" && (
          <Field label="Имя (необязательно)">
            <input type="text" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field label="Email">
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={mode === "register" ? "Пароль (не короче 8 символов)" : "Пароль"}>
          <input
            type="password" autoComplete={mode === "register" ? "new-password" : "current-password"}
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <CirButton className="cir-btn--block" arrow={false} type="submit" disabled={busy}>
          {busy ? "Подождите…" : mode === "register" ? "Создать аккаунт" : "Войти"}
        </CirButton>
        <div className="err-text">{error}</div>
      </form>
    </Card>
  );
}
