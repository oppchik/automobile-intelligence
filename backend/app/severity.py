import logging
import math
import sys
import threading
import time
import types
import urllib.request
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from io import BytesIO
from pathlib import Path

logger = logging.getLogger("avto.severity")

MAX_PHOTOS = 6
MAX_BYTES = 8 * 1024 * 1024
MIN_SIDE = 64
MAX_PIXELS = 50_000_000
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MODEL_TIMEOUT = 20.0
LOAD_RETRY_SECONDS = 60.0
DOWNLOAD_TIMEOUT = 15
MAX_PENDING = 2
CLASSES = ("minor", "moderate", "severe")

MESSAGES = {
    "ok": "Тяжесть повреждения определена по фото",
    "low_confidence": "Модель не уверена в оценке — выберите тяжесть вручную",
    "unavailable": "Автоматическое распознавание недоступно — выберите тяжесть вручную",
    "timeout": "Распознавание заняло слишком много времени — выберите тяжесть вручную",
    "busy": "Сервис распознавания занят — повторите позже или выберите тяжесть вручную",
    "error": "Не удалось обработать фото — выберите тяжесть вручную",
    "rejected": "Нет подходящих фото — загрузите JPEG, PNG или WebP или выберите тяжесть вручную",
}


class ModelUnavailable(Exception):
    pass


def _check_image(data):
    from PIL import Image
    if not data:
        return "пустой файл"
    if len(data) > MAX_BYTES:
        return "файл больше 8 МБ"
    try:
        with Image.open(BytesIO(data)) as im:
            if im.format not in ALLOWED_FORMATS:
                return "формат не поддерживается (нужен JPEG, PNG или WebP)"
            width, height = im.size
            if min(width, height) < MIN_SIDE:
                return f"изображение меньше {MIN_SIDE} пикселей по короткой стороне"
            if width * height > MAX_PIXELS:
                return "слишком большое разрешение"
            im.load()
    except Exception:
        return "не удалось прочитать изображение"
    return None


def _valid_result(result):
    probs = result.get("probabilities") if isinstance(result, dict) else None
    if not isinstance(probs, dict) or set(probs) != set(CLASSES):
        return False
    values = [probs[c] for c in CLASSES]
    return (all(isinstance(v, (int, float)) and math.isfinite(v) and 0 <= v <= 1 for v in values)
            and abs(sum(values) - 1) < 0.05)


def _prefetch_weights(root):
    from avtointellekt.ml.scripts.common import BACKBONE_URL, CACHE_DIR
    path = CACHE_DIR / "efficientnet-b0-355c32eb.pth"
    if path.exists():
        return path
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    part = path.with_suffix(".part")
    with urllib.request.urlopen(BACKBONE_URL, timeout=DOWNLOAD_TIMEOUT) as resp, open(part, "wb") as out:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
    part.replace(path)
    return path


def load_real_model():
    root = Path(__file__).resolve().parents[2]
    if not (root / "ml" / "scripts" / "predict.py").exists():
        raise FileNotFoundError("каталог ml/ не найден")
    if "avtointellekt" not in sys.modules:
        package = types.ModuleType("avtointellekt")
        package.__path__ = [str(root)]
        sys.modules["avtointellekt"] = package
    from avtointellekt.ml.scripts.extract_features import load_model
    from avtointellekt.ml.scripts.predict import load_head, predict
    weights = _prefetch_weights(root)
    try:
        model = load_model()
    except RuntimeError:
        weights.unlink(missing_ok=True)
        raise
    head = load_head()
    tau = float(head["tau"])
    if not (math.isfinite(tau) and 0 < tau <= 1):
        raise ValueError("некорректный порог tau")
    return (lambda images: predict(images, model, head)), tau


class SeverityService:
    def __init__(self, loader=load_real_model, timeout=MODEL_TIMEOUT, retry_after=LOAD_RETRY_SECONDS,
                 clock=time.monotonic):
        self._loader = loader
        self._timeout = timeout
        self._retry_after = retry_after
        self._clock = clock
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="severity")
        self._lock = threading.Lock()
        self._pending = 0
        self._model = None
        self._failed_at = None

    def _get_model(self):
        if self._model is not None:
            return self._model
        if self._failed_at is not None and self._clock() - self._failed_at < self._retry_after:
            raise ModelUnavailable("повторная загрузка отложена")
        began = time.perf_counter()
        try:
            self._model = self._loader()
        except Exception as exc:
            logger.warning("severity model is unavailable: %s: %s", type(exc).__name__, exc)
            self._failed_at = self._clock()
            raise ModelUnavailable(str(exc)) from exc
        self._failed_at = None
        logger.info("severity model loaded in %.1f s", time.perf_counter() - began)
        return self._model

    def _warm(self):
        try:
            self._get_model()
        except ModelUnavailable:
            pass

    def warm_up(self):
        with self._lock:
            self._pending += 1
        self._executor.submit(self._warm).add_done_callback(self._release)

    def _infer(self, images):
        predict, tau = self._get_model()
        return predict(images), tau

    def _release(self, _future):
        with self._lock:
            self._pending -= 1

    def _respond(self, status, items, started, **extra):
        body = {"status": status, "message": MESSAGES[status], "severity": None, "confidence": None,
                "probabilities": None, "needs_manual_review": True, "tau": None,
                "photos": items, "elapsed_ms": int((self._clock() - started) * 1000)}
        body.update(extra)
        return body

    def classify(self, photos):
        started = self._clock()
        items = [{"name": str(name)[:100] or "photo", "status": "rejected", "reason": None,
                  "severity": None, "confidence": None} for name, _ in photos]
        if not photos or len(photos) > MAX_PHOTOS:
            reason = "не загружено ни одного фото" if not photos else f"не более {MAX_PHOTOS} фото за раз"
            for item in items:
                item["reason"] = reason
            body = self._respond("rejected", items, started)
            body["message"] = f"{reason[0].upper()}{reason[1:]} — выберите тяжесть вручную"
            return body
        valid = []
        try:
            for index, (_, data) in enumerate(photos):
                reason = _check_image(data)
                if reason:
                    items[index]["reason"] = reason
                else:
                    valid.append(index)
        except ImportError:
            return self._respond("unavailable", items, started)
        if not valid:
            return self._respond("rejected", items, started)

        with self._lock:
            if self._pending >= MAX_PENDING:
                return self._respond("busy", items, started)
            self._pending += 1
        try:
            future = self._executor.submit(self._infer, [BytesIO(photos[i][1]) for i in valid])
        except RuntimeError:
            with self._lock:
                self._pending -= 1
            return self._respond("error", items, started)
        future.add_done_callback(self._release)
        try:
            results, tau = future.result(timeout=self._timeout)
        except FutureTimeout:
            future.cancel()
            return self._respond("timeout", items, started)
        except ModelUnavailable:
            return self._respond("unavailable", items, started)
        except Exception:
            logger.exception("severity inference failed")
            return self._respond("error", items, started)

        if not isinstance(results, (list, tuple)) or len(results) != len(valid) or not all(_valid_result(r) for r in results):
            logger.error("severity model returned an unexpected result")
            return self._respond("error", items, started)
        for index, result in zip(valid, results):
            probs = result["probabilities"]
            best = max(CLASSES, key=lambda c: probs[c])
            items[index].update(status="ok", severity=best, confidence=round(float(probs[best]), 4))
        mean = {c: sum(r["probabilities"][c] for r in results) / len(results) for c in CLASSES}
        best = max(CLASSES, key=lambda c: mean[c])
        confidence = round(mean[best], 4)
        needs_review = confidence < tau
        return self._respond(
            "low_confidence" if needs_review else "ok", items, started,
            severity=best, confidence=confidence, tau=tau, needs_manual_review=needs_review,
            probabilities={c: round(mean[c], 4) for c in CLASSES},
        )


severity_service = SeverityService()
