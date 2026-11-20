import tempfile
import unittest
from datetime import timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app import accounts, models
from app.database import Base, ensure_columns, get_db
from app.main import app

ENTRY = {
    "brand": "Lada", "model": "Granta", "year": 2018, "mileage": 85000,
    "region": "Екатеринбург", "condition": "good", "categories": ["body"],
    "severity": 0.2, "variant_index": 1, "years": 2, "cost": 73447.0,
    "scenario1": 450403.0, "scenario2": 480000.0, "decision": "repair",
}


class AccountTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            f"sqlite:///{Path(self.tmp.name) / 'test.db'}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)

        def override():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.pop(get_db, None)
        self.engine.dispose()
        self.tmp.cleanup()

    def register(self, email="denis@example.com", password="secret-pass-1", **extra):
        return self.client.post("/api/auth/register", json={"email": email, "password": password, **extra})

    def auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def save(self, session_id="anon-1", headers=None, **extra):
        return self.client.post("/api/history", json={"session_id": session_id, **ENTRY, **extra}, headers=headers or {})


class RegistrationAndLoginTests(AccountTestCase):
    def test_register_returns_token_and_user(self):
        r = self.register(name="  Денис  ")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["user"]["email"], "denis@example.com")
        self.assertEqual(body["user"]["name"], "Денис")
        self.assertTrue(body["token"])

    def test_password_is_stored_hashed(self):
        self.register()
        with self.Session() as db:
            user = db.query(models.User).one()
            self.assertTrue(user.password_hash.startswith("pbkdf2_sha256$"))
            self.assertNotIn("secret-pass-1", user.password_hash)
            token_row = db.query(models.AuthSession).one()
            self.assertNotEqual(token_row.token_hash, self.register("b@example.com").json()["token"])

    def test_email_is_normalized_and_unique(self):
        self.register(email="Denis@Example.com ")
        r = self.register(email="denis@example.com")
        self.assertEqual(r.status_code, 409)

    def test_invalid_email_and_short_password_rejected(self):
        self.assertEqual(self.register(email="not-an-email").status_code, 422)
        self.assertEqual(self.register(password="short").status_code, 422)

    def test_login_with_right_and_wrong_password(self):
        self.register()
        ok = self.client.post("/api/auth/login", json={"email": "DENIS@example.com", "password": "secret-pass-1"})
        self.assertEqual(ok.status_code, 200)
        bad = self.client.post("/api/auth/login", json={"email": "denis@example.com", "password": "wrong-pass-1"})
        self.assertEqual(bad.status_code, 401)
        unknown = self.client.post("/api/auth/login", json={"email": "who@example.com", "password": "secret-pass-1"})
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(bad.json()["detail"], unknown.json()["detail"])

    def test_me_requires_valid_token(self):
        token = self.register().json()["token"]
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.auth("bad")).status_code, 401)
        r = self.client.get("/api/auth/me", headers=self.auth(token))
        self.assertEqual(r.json()["email"], "denis@example.com")

    def test_logout_invalidates_token(self):
        token = self.register().json()["token"]
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.auth(token)).status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.auth(token)).status_code, 401)

    def test_expired_token_is_rejected(self):
        token = self.register().json()["token"]
        with self.Session() as db:
            row = db.query(models.AuthSession).one()
            row.expires_at = accounts.utcnow() - timedelta(minutes=1)
            db.commit()
        self.assertEqual(self.client.get("/api/auth/me", headers=self.auth(token)).status_code, 401)

    def test_malformed_authorization_header_is_rejected(self):
        r = self.client.get("/api/history", headers={"Authorization": "Token abc"})
        self.assertEqual(r.status_code, 401)


class HistoryTests(AccountTestCase):
    def test_anonymous_history_still_works_by_session(self):
        self.save("anon-1")
        self.save("anon-2")
        rows = self.client.get("/api/history", params={"session_id": "anon-1"}).json()
        self.assertEqual(len(rows), 1)
        self.assertIsNotNone(rows[0]["created_at"])
        self.assertEqual(self.client.get("/api/history").json(), [])

    def test_history_belongs_to_user(self):
        a = self.register("a@example.com").json()["token"]
        b = self.register("b@example.com").json()["token"]
        self.save("s-a", self.auth(a))
        self.save("s-a", self.auth(a))
        self.save("s-b", self.auth(b))
        self.assertEqual(len(self.client.get("/api/history", headers=self.auth(a)).json()), 2)
        self.assertEqual(len(self.client.get("/api/history", headers=self.auth(b)).json()), 1)

    def test_user_history_not_visible_by_session_id_without_token(self):
        token = self.register().json()["token"]
        self.save("s-1", self.auth(token))
        self.assertEqual(self.client.get("/api/history", params={"session_id": "s-1"}).json(), [])

    def test_history_survives_new_login(self):
        token = self.register().json()["token"]
        self.save("s-1", self.auth(token), cost=111.0)
        self.client.post("/api/auth/logout", headers=self.auth(token))
        again = self.client.post("/api/auth/login", json={"email": "denis@example.com", "password": "secret-pass-1"}).json()["token"]
        rows = self.client.get("/api/history", headers=self.auth(again)).json()
        self.assertEqual([r["cost"] for r in rows], [111.0])

    def test_registration_claims_anonymous_history(self):
        self.save("anon-1")
        self.save("anon-1")
        self.save("anon-2")
        body = self.register(session_id="anon-1").json()
        self.assertEqual(body["claimed"], 2)
        rows = self.client.get("/api/history", headers=self.auth(body["token"])).json()
        self.assertEqual(len(rows), 2)
        self.assertEqual(self.client.get("/api/history", params={"session_id": "anon-1"}).json(), [])
        self.assertEqual(len(self.client.get("/api/history", params={"session_id": "anon-2"}).json()), 1)

    def test_login_does_not_take_entries_of_another_account(self):
        first = self.register("a@example.com").json()["token"]
        self.save("shared-session", self.auth(first))
        self.register("b@example.com")
        body = self.client.post(
            "/api/auth/login",
            json={"email": "b@example.com", "password": "secret-pass-1", "session_id": "shared-session"},
        ).json()
        self.assertEqual(body["claimed"], 0)
        self.assertEqual(len(self.client.get("/api/history", headers=self.auth(first)).json()), 1)

    def test_advisor_snapshot_is_stored(self):
        token = self.register().json()["token"]
        advisor = {"goal": "keep_using", "years": 5, "recommendation": "repair_keep", "values": {"sell_as_is": 1.5}}
        saved = self.save("s", self.auth(token), advisor=advisor).json()
        self.assertEqual(saved["advisor"], advisor)
        rows = self.client.get("/api/history", headers=self.auth(token)).json()
        self.assertEqual(rows[0]["advisor"], advisor)

    def test_missing_advisor_is_stored_as_sql_null(self):
        self.save("s")
        with self.engine.connect() as conn:
            self.assertIsNone(conn.execute(text("SELECT advisor FROM history_entries")).scalar())

    def test_order_is_newest_first_and_limit_applies(self):
        token = self.register().json()["token"]
        for cost in (1.0, 2.0, 3.0):
            self.save("s", self.auth(token), cost=cost)
        rows = self.client.get("/api/history", headers=self.auth(token), params={"limit": 2}).json()
        self.assertEqual([r["cost"] for r in rows], [3.0, 2.0])
        self.assertEqual(self.client.get("/api/history", headers=self.auth(token), params={"limit": 0}).status_code, 422)

    def test_delete_one_entry_only_own(self):
        a = self.register("a@example.com").json()["token"]
        b = self.register("b@example.com").json()["token"]
        entry = self.save("s", self.auth(a)).json()
        self.assertEqual(self.client.delete(f"/api/history/{entry['id']}", headers=self.auth(b)).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/history/{entry['id']}", headers=self.auth(a)).status_code, 200)
        self.assertEqual(self.client.get("/api/history", headers=self.auth(a)).json(), [])

    def test_delete_anonymous_entry_needs_its_session(self):
        entry = self.save("anon-1").json()
        self.assertEqual(self.client.delete(f"/api/history/{entry['id']}", params={"session_id": "other"}).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/history/{entry['id']}", params={"session_id": "anon-1"}).status_code, 200)

    def test_clear_removes_only_own_entries(self):
        a = self.register("a@example.com").json()["token"]
        b = self.register("b@example.com").json()["token"]
        self.save("s", self.auth(a))
        self.save("s", self.auth(b))
        self.save("anon-1")
        self.client.delete("/api/history", headers=self.auth(a))
        self.assertEqual(self.client.get("/api/history", headers=self.auth(a)).json(), [])
        self.assertEqual(len(self.client.get("/api/history", headers=self.auth(b)).json()), 1)
        self.assertEqual(len(self.client.get("/api/history", params={"session_id": "anon-1"}).json()), 1)


class MigrationTests(unittest.TestCase):
    def test_ensure_columns_upgrades_old_history_table(self):
        with tempfile.TemporaryDirectory() as tmp:
            engine = create_engine(f"sqlite:///{Path(tmp) / 'old.db'}")
            with engine.begin() as conn:
                conn.execute(text(
                    "CREATE TABLE history_entries (id INTEGER PRIMARY KEY, session_id VARCHAR NOT NULL, "
                    "brand VARCHAR NOT NULL, model VARCHAR NOT NULL, year INTEGER NOT NULL, mileage INTEGER NOT NULL, "
                    "region VARCHAR NOT NULL, condition VARCHAR NOT NULL, categories JSON NOT NULL, severity FLOAT NOT NULL, "
                    "variant_index INTEGER NOT NULL, years INTEGER NOT NULL, cost FLOAT NOT NULL, scenario1 FLOAT NOT NULL, "
                    "scenario2 FLOAT NOT NULL, decision VARCHAR NOT NULL, created_at DATETIME)"
                ))
                conn.execute(text(
                    "INSERT INTO history_entries VALUES (1, 's', 'Lada', 'Granta', 2018, 1, 'Москва', 'good', '[]', 0.1, 1, 2, 1.0, 2.0, 3.0, 'sell', NULL)"
                ))
            ensure_columns(engine)
            ensure_columns(engine)
            Base.metadata.create_all(engine)
            columns = {c["name"] for c in inspect(engine).get_columns("history_entries")}
            self.assertIn("user_id", columns)
            self.assertIn("advisor", columns)
            with sessionmaker(bind=engine)() as db:
                row = db.query(models.HistoryEntry).one()
                self.assertEqual((row.brand, row.user_id, row.advisor), ("Lada", None, None))
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
