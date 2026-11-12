import importlib.util
import threading
import time
import unittest
from io import BytesIO
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from PIL import Image

from app import main as app_main
from app.engine import run_calculation
from app.severity import MAX_BYTES, MAX_PHOTOS, SeverityService
from test_auint_engine import load_data


def image_bytes(fmt="JPEG", size=(120, 90)):
    buf = BytesIO()
    Image.new("RGB", size, (90, 120, 160)).save(buf, fmt)
    return buf.getvalue()


def model(probs, tau=0.55, calls=None):
    def loader():
        def predict(images):
            if calls is not None:
                calls.append(len(images))
            return [{"probabilities": dict(zip(("minor", "moderate", "severe"), probs))} for _ in images]
        return predict, tau
    return loader


def photos(n=1, fmt="JPEG"):
    return [(f"photo{i}.jpg", image_bytes(fmt)) for i in range(n)]


class ClassificationTests(unittest.TestCase):
    def test_confident_result(self):
        r = SeverityService(model([0.1, 0.2, 0.7])).classify(photos())
        self.assertEqual((r["status"], r["severity"], r["confidence"]), ("ok", "severe", 0.7))
        self.assertFalse(r["needs_manual_review"])
        self.assertEqual(r["photos"][0]["status"], "ok")

    def test_low_confidence_requires_manual_review(self):
        r = SeverityService(model([0.4, 0.35, 0.25])).classify(photos())
        self.assertEqual((r["status"], r["severity"]), ("low_confidence", "minor"))
        self.assertTrue(r["needs_manual_review"])
        self.assertEqual(r["tau"], 0.55)

    def test_probabilities_are_averaged_over_photos(self):
        r = SeverityService(lambda: (lambda images: [
            {"probabilities": {"minor": 0.8, "moderate": 0.1, "severe": 0.1}},
            {"probabilities": {"minor": 0.2, "moderate": 0.7, "severe": 0.1}},
        ], 0.4)).classify(photos(2))
        self.assertEqual(r["probabilities"], {"minor": 0.5, "moderate": 0.4, "severe": 0.1})
        self.assertEqual((r["severity"], r["confidence"]), ("minor", 0.5))
        self.assertEqual([p["severity"] for p in r["photos"]], ["minor", "moderate"])


class FailureProtectionTests(unittest.TestCase):
    def assert_manual(self, r, status):
        self.assertEqual(r["status"], status)
        self.assertIsNone(r["severity"])
        self.assertTrue(r["needs_manual_review"])
        self.assertTrue(r["message"])

    def test_missing_dependencies(self):
        def loader():
            raise ImportError("No module named 'torch'")
        self.assert_manual(SeverityService(loader).classify(photos()), "unavailable")

    def test_weights_cannot_be_loaded(self):
        def loader():
            raise OSError("network is unreachable")
        self.assert_manual(SeverityService(loader).classify(photos()), "unavailable")

    def test_failed_load_is_not_retried_during_cooldown(self):
        now = [0.0]
        attempts = []

        def loader():
            attempts.append(1)
            if len(attempts) == 1:
                raise OSError("down")
            return model([0.1, 0.1, 0.8])()
        service = SeverityService(loader, retry_after=60, clock=lambda: now[0])
        self.assert_manual(service.classify(photos()), "unavailable")
        now[0] = 30
        self.assert_manual(service.classify(photos()), "unavailable")
        self.assertEqual(len(attempts), 1)
        now[0] = 61
        self.assertEqual(service.classify(photos())["status"], "ok")
        self.assertEqual(len(attempts), 2)

    def test_inference_error_is_contained_and_service_recovers(self):
        state = {"fail": True}

        def loader():
            def predict(images):
                if state["fail"]:
                    raise RuntimeError("boom")
                return [{"probabilities": {"minor": 0.1, "moderate": 0.1, "severe": 0.8}} for _ in images]
            return predict, 0.55
        service = SeverityService(loader)
        self.assert_manual(service.classify(photos()), "error")
        state["fail"] = False
        self.assertEqual(service.classify(photos())["status"], "ok")

    def test_timeout(self):
        def loader():
            def predict(images):
                time.sleep(0.6)
                return [{"probabilities": {"minor": 0.1, "moderate": 0.1, "severe": 0.8}} for _ in images]
            return predict, 0.55
        service = SeverityService(loader, timeout=0.1)
        self.assert_manual(service.classify(photos()), "timeout")
        time.sleep(0.7)
        service._timeout = 5
        self.assertEqual(service.classify(photos())["status"], "ok")

    def test_busy_when_queue_is_full(self):
        gate, entered = threading.Event(), threading.Event()

        def loader():
            def predict(images):
                entered.set()
                gate.wait(5)
                return [{"probabilities": {"minor": 0.1, "moderate": 0.1, "severe": 0.8}} for _ in images]
            return predict, 0.55
        service = SeverityService(loader, timeout=10)
        out = []
        workers = [threading.Thread(target=lambda: out.append(service.classify(photos()))) for _ in range(2)]
        workers[0].start()
        self.assertTrue(entered.wait(2))
        workers[1].start()
        deadline = time.time() + 2
        while service._pending < 2 and time.time() < deadline:
            time.sleep(0.01)
        self.assert_manual(service.classify(photos()), "busy")
        gate.set()
        for w in workers:
            w.join(5)
        self.assertEqual([r["status"] for r in out], ["ok", "ok"])

    def test_malformed_model_output(self):
        bad_outputs = [
            [],
            [{"probabilities": {"minor": float("nan"), "moderate": 0.5, "severe": 0.5}}],
            [{"probabilities": {"minor": 0.5, "moderate": 0.5}}],
            [{"probabilities": {"minor": 0.9, "moderate": 0.9, "severe": 0.9}}],
            [{"severity": "minor"}],
            None,
        ]
        for output in bad_outputs:
            with self.subTest(output=output):
                service = SeverityService(lambda o=output: (lambda images: o, 0.55))
                self.assert_manual(service.classify(photos()), "error")


class WarmUpTests(unittest.TestCase):
    def test_model_is_loaded_before_the_first_request(self):
        loads = []

        def loader():
            loads.append(1)
            return model([0.1, 0.1, 0.8])()
        service = SeverityService(loader)
        service.warm_up()
        service._executor.submit(lambda: None).result(2)
        self.assertEqual(len(loads), 1)
        self.assertEqual(service.classify(photos())["status"], "ok")
        self.assertEqual(len(loads), 1)

    def test_failed_warm_up_does_not_raise_and_is_not_retried_at_once(self):
        loads = []

        def loader():
            loads.append(1)
            raise ImportError("torch")
        service = SeverityService(loader)
        service.warm_up()
        service._executor.submit(lambda: None).result(2)
        self.assertEqual(service.classify(photos())["status"], "unavailable")
        self.assertEqual(len(loads), 1)


class InputValidationTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.service = SeverityService(model([0.1, 0.1, 0.8], calls=self.calls))

    def rejected(self, files):
        r = self.service.classify(files)
        self.assertEqual(r["status"], "rejected")
        self.assertIsNone(r["severity"])
        self.assertEqual(self.calls, [])
        return r

    def test_no_photos(self):
        self.rejected([])

    def test_too_many_photos(self):
        self.rejected(photos(MAX_PHOTOS + 1))

    def test_invalid_files_are_rejected_with_reasons(self):
        good = image_bytes()
        cases = {
            "empty": b"",
            "text": b"not an image",
            "too_large": b"0" * (MAX_BYTES + 1),
            "tiny": image_bytes(size=(20, 20)),
            "bmp": image_bytes("BMP"),
            "gif": image_bytes("GIF"),
            "truncated": good[: len(good) // 2],
        }
        for name, data in cases.items():
            with self.subTest(case=name):
                r = self.rejected([(name, data)])
                self.assertEqual(r["photos"][0]["status"], "rejected")
                self.assertTrue(r["photos"][0]["reason"])

    def test_valid_photos_are_processed_next_to_invalid_ones(self):
        r = self.service.classify([("ok.jpg", image_bytes()), ("bad.txt", b"x"), ("ok.png", image_bytes("PNG"))])
        self.assertEqual(r["status"], "ok")
        self.assertEqual([p["status"] for p in r["photos"]], ["ok", "rejected", "ok"])
        self.assertEqual(self.calls, [2])

    def test_supported_formats(self):
        for fmt in ("JPEG", "PNG", "WEBP"):
            with self.subTest(fmt=fmt):
                self.assertEqual(self.service.classify([("p", image_bytes(fmt))])["status"], "ok")


class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app_main.app)

    def post(self, service, files):
        with mock.patch.object(app_main, "severity_service", service):
            return self.client.post("/api/vision/severity",
                                    files=[("photos", (n, b, "application/octet-stream")) for n, b in files])

    def test_success(self):
        r = self.post(SeverityService(model([0.1, 0.2, 0.7])), photos(2))
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual((body["status"], body["severity"]), ("ok", "severe"))
        self.assertEqual(len(body["photos"]), 2)

    def test_failures_never_become_http_errors(self):
        def broken():
            raise ImportError("torch")
        for service, files, status in (
            (SeverityService(broken), photos(), "unavailable"),
            (SeverityService(model([0.1, 0.2, 0.7])), [("x.txt", b"zzz")], "rejected"),
            (SeverityService(model([0.1, 0.2, 0.7])), photos(MAX_PHOTOS + 1), "rejected"),
        ):
            with self.subTest(status=status):
                r = self.post(service, files)
                self.assertEqual(r.status_code, 200)
                self.assertEqual(r.json()["status"], status)
                self.assertIsNone(r.json()["severity"])

    def test_request_without_files(self):
        with mock.patch.object(app_main, "severity_service", SeverityService(model([0.1, 0.2, 0.7]))):
            r = self.client.post("/api/vision/severity")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "rejected")


class PhotoSeverityCalculationTests(unittest.TestCase):
    def setUp(self):
        self.base = dict(load_data()["scenarios"][0]["input"])
        self.base.update(photo_count=0)

    def calc(self, **extra):
        args = {k: v for k, v in self.base.items()}
        args.update(extra)
        return run_calculation(**args)

    def test_default_behaviour_is_unchanged(self):
        a = self.calc(photo_count=3)
        b = self.calc(photo_count=3, photo_severity=None)
        self.assertEqual(a.severity, b.severity)
        self.assertEqual(a.as_is_value, b.as_is_value)

    def test_severity_grows_with_photo_class_and_costs_stay_the_same(self):
        minor, moderate, severe = (self.calc(photo_severity=s) for s in ("minor", "moderate", "severe"))
        self.assertAlmostEqual(moderate.severity - minor.severity, 0.06)
        self.assertAlmostEqual(severe.severity - minor.severity, 0.12)
        self.assertGreater(minor.as_is_value, severe.as_is_value)
        for other in (moderate, severe):
            self.assertEqual([v.cost for v in other.variants], [v.cost for v in minor.variants])
            self.assertEqual(other.categories, minor.categories)

    def test_photo_class_replaces_photo_count_bonus(self):
        self.assertEqual(self.calc(photo_count=0, photo_severity="minor").severity,
                         self.calc(photo_count=6, photo_severity="minor").severity)

    def test_api_accepts_and_validates_photo_severity(self):
        client = TestClient(app_main.app)
        payload = dict(self.base)
        plain = client.post("/api/calculate", json=payload).json()
        severe = client.post("/api/calculate", json=dict(payload, photo_severity="severe")).json()
        self.assertAlmostEqual(severe["severity"] - plain["severity"], 0.12)
        self.assertEqual(client.post("/api/calculate", json=dict(payload, photo_severity="critical")).status_code, 422)
        self.assertEqual(client.post("/api/estimate", json=dict(payload, photo_severity="moderate")).status_code, 200)


WEIGHTS = Path(__file__).resolve().parents[1] / "ml" / "data" / "cache" / "efficientnet-b0-355c32eb.pth"


@unittest.skipUnless(importlib.util.find_spec("torch") and importlib.util.find_spec("efficientnet_pytorch") and WEIGHTS.exists(),
                     "нужны torch, efficientnet_pytorch и скачанные веса ml/data/cache")
class RealModelTests(unittest.TestCase):
    def test_real_model_returns_valid_result(self):
        r = SeverityService().classify([("synthetic.jpg", image_bytes(size=(320, 240)))])
        self.assertIn(r["status"], ("ok", "low_confidence"))
        self.assertIn(r["severity"], ("minor", "moderate", "severe"))
        self.assertAlmostEqual(sum(r["probabilities"].values()), 1.0, places=2)
        self.assertEqual(r["needs_manual_review"], r["status"] == "low_confidence")


if __name__ == "__main__":
    unittest.main()
