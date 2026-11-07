"""Обучение классификатора тяжести повреждений (minor / moderate / severe).

Схема: предобученная EfficientNet-B0 (заморожена) даёт эмбеддинги, поверх них обучается
логистическая регрессия. Гиперпараметр C выбирается кросс-валидацией на train
(по группам почти-дубликатов). Порог уверенности для ручного режима выбирается по val.
Тестовая выборка используется один раз, для итоговых метрик.
"""
import csv
import json
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, balanced_accuracy_score, classification_report,
                             cohen_kappa_score, confusion_matrix, f1_score)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.preprocessing import StandardScaler

from avtointellekt.ml.scripts.common import (BACKBONE_NAME, BACKBONE_SHA_PREFIX, BACKBONE_URL, CACHE_DIR, CLASSES,
                    DATASET_COMMIT, DATASET_REPO, MANIFEST, MODELS_DIR, REPORTS_DIR, SEED)

C_GRID = [0.0001, 0.0003, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1.0]
TAU_GRID = [round(t, 2) for t in np.arange(0.40, 0.951, 0.05)]
TAU_TARGET_ACC, TAU_MIN_COVERAGE, TAU_DEFAULT = 0.75, 0.40, 0.70
N_BOOT = 1000

LOG = []


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    LOG.append(s)


def load():
    with open(MANIFEST, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    n = len(rows)
    chunks = sorted(CACHE_DIR.glob(f"feat_{BACKBONE_NAME}_*.npy"))
    cnn = np.concatenate([np.load(p) for p in chunks])
    assert cnn.shape[0] == n, f"feature count {cnn.shape[0]} != manifest rows {n}"
    hand = np.load(CACHE_DIR / "handcrafted.npy")
    y = np.array([CLASSES.index(r["label"]) for r in rows])
    split = np.array([r["split"] for r in rows])
    groups = np.array([int(r["group_id"]) for r in rows])
    return rows, cnn, hand, y, split, groups


def metrics(y_true, y_pred):
    rep = classification_report(y_true, y_pred, labels=range(3), target_names=CLASSES,
                                output_dict=True, zero_division=0)
    return {
        "n": int(len(y_true)),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1_score(y_true, y_pred, average="macro", labels=range(3), zero_division=0)),
        "quadratic_weighted_kappa": float(cohen_kappa_score(y_true, y_pred, weights="quadratic")),
        "minor_severe_confusions": int(np.sum(np.abs(y_true - y_pred) == 2)),
        "per_class": {c: {k: float(rep[c][k]) for k in ("precision", "recall", "f1-score")} | {"support": int(rep[c]["support"])}
                      for c in CLASSES},
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=range(3)).tolist(),
    }


def bootstrap_ci(y_true, y_pred, rng):
    accs, f1s = [], []
    n = len(y_true)
    for _ in range(N_BOOT):
        idx = rng.integers(0, n, n)
        accs.append(accuracy_score(y_true[idx], y_pred[idx]))
        f1s.append(f1_score(y_true[idx], y_pred[idx], average="macro", labels=range(3), zero_division=0))
    q = lambda a: [float(np.percentile(a, 2.5)), float(np.percentile(a, 97.5))]
    return {"accuracy_ci95": q(accs), "macro_f1_ci95": q(f1s)}


def tta_proba(clf, scaler, feats):
    """feats: (n, 2, d) -> усреднённые вероятности по оригиналу и отражению."""
    n, v, d = feats.shape
    p = clf.predict_proba(scaler.transform(feats.reshape(n * v, d))).reshape(n, v, -1)
    return p.mean(axis=1)


def plot_cm(cm, title, path):
    cm = np.array(cm)
    fig, ax = plt.subplots(figsize=(4.6, 4.0), dpi=150)
    ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(3)); ax.set_yticks(range(3))
    ax.set_xticklabels(CLASSES); ax.set_yticklabels(CLASSES)
    ax.set_xlabel("Predicted"); ax.set_ylabel("True"); ax.set_title(title, fontsize=10)
    for i in range(3):
        for j in range(3):
            ax.text(j, i, cm[i, j], ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() / 2 else "black")
    fig.tight_layout(); fig.savefig(path); plt.close(fig)


def main():
    rows, cnn, hand, y, split, groups = load()
    tr, va, te = (split == s for s in ("train", "val", "test"))
    log(f"samples: train={tr.sum()} val={va.sum()} test={te.sum()}")
    rng = np.random.default_rng(SEED)

    def two_view(idx):
        X = cnn[idx].reshape(-1, cnn.shape[-1])
        return X, np.repeat(y[idx], 2)

    # ---- 1. выбор C кросс-валидацией на train ----
    tr_idx = np.where(tr)[0]
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
    cv_scores = {}
    for C in C_GRID:
        fold_f1 = []
        for a, b in cv.split(tr_idx, y[tr_idx], groups[tr_idx]):
            ia, ib = tr_idx[a], tr_idx[b]
            Xa, ya = two_view(ia)
            sc = StandardScaler().fit(Xa)
            clf = LogisticRegression(C=C, max_iter=3000, class_weight="balanced").fit(sc.transform(Xa), ya)
            pred = tta_proba(clf, sc, cnn[ib]).argmax(1)
            fold_f1.append(f1_score(y[ib], pred, average="macro"))
        cv_scores[C] = (float(np.mean(fold_f1)), float(np.std(fold_f1)))
        log(f"CV C={C:<6} macro-F1 = {cv_scores[C][0]:.3f} +- {cv_scores[C][1]:.3f}")
    best_C = max(cv_scores, key=lambda c: cv_scores[c][0])
    log(f"best C = {best_C}")

    # ---- 2. финальная модель на train ----
    Xtr, ytr = two_view(tr_idx)
    scaler = StandardScaler().fit(Xtr)
    clf = LogisticRegression(C=best_C, max_iter=3000, class_weight="balanced").fit(scaler.transform(Xtr), ytr)
    P = {name: tta_proba(clf, scaler, cnn[m]) for name, m in (("val", va), ("test", te))}
    Y = {"val": y[va], "test": y[te]}

    # ---- 3. порог уверенности для ручного режима: выбор ТОЛЬКО по val ----
    def coverage_table(p, yt):
        conf, pred = p.max(1), p.argmax(1)
        out = []
        for t in TAU_GRID:
            m = conf >= t
            out.append({"tau": t, "coverage": float(m.mean()),
                        "accuracy_on_accepted": float((pred[m] == yt[m]).mean()) if m.any() else None})
        return out
    cov = {k: coverage_table(P[k], Y[k]) for k in P}
    ok = [r for r in cov["val"] if r["accuracy_on_accepted"] is not None
          and r["accuracy_on_accepted"] >= TAU_TARGET_ACC and r["coverage"] >= TAU_MIN_COVERAGE]
    tau = ok[0]["tau"] if ok else TAU_DEFAULT
    tau_rule = (f"наименьший порог, при котором на val точность среди принятых >= {TAU_TARGET_ACC} "
                f"и покрытие >= {TAU_MIN_COVERAGE}" if ok else f"условие не выполнено, использован порог по умолчанию {TAU_DEFAULT}")
    log(f"manual-review threshold tau = {tau}  ({tau_rule})")

    # ---- 4. метрики ----
    results = {"val": {}, "test": {}}
    for k in ("val", "test"):
        pred = P[k].argmax(1)
        results[k]["model"] = metrics(Y[k], pred)
        results[k]["model"].update(bootstrap_ci(Y[k], pred, rng))
        conf = P[k].max(1); acc_m = conf >= tau
        results[k]["with_manual_fallback"] = {
            "tau": tau, "auto_coverage": float(acc_m.mean()),
            "accuracy_on_auto": float((pred[acc_m] == Y[k][acc_m]).mean()) if acc_m.any() else None,
            "sent_to_manual": int((~acc_m).sum())}
        results[k]["coverage_table"] = cov[k]
        # бейзлайны
        dm = DummyClassifier(strategy="most_frequent").fit(np.zeros((tr.sum(), 1)), y[tr_idx])
        results[k]["baseline_majority"] = metrics(Y[k], dm.predict(np.zeros((len(Y[k]), 1))))
    rf = RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced",
                                random_state=SEED, n_jobs=1).fit(hand[tr], y[tr])
    for k, m in (("val", va), ("test", te)):
        results[k]["baseline_handcrafted_rf"] = metrics(Y[k], rf.predict(hand[m]))

    for k in ("val", "test"):
        r = results[k]
        log(f"\n=== {k.upper()} (n={r['model']['n']}) ===")
        for name in ("model", "baseline_handcrafted_rf", "baseline_majority"):
            m = r[name]
            log(f"{name:26s} acc={m['accuracy']:.3f}  bal_acc={m['balanced_accuracy']:.3f}  "
                f"macro-F1={m['macro_f1']:.3f}  QWK={m['quadratic_weighted_kappa']:.3f}  "
                f"minor<->severe={m['minor_severe_confusions']}")
        log(f"model 95% CI: acc {r['model']['accuracy_ci95']}  macro-F1 {r['model']['macro_f1_ci95']}")
        fb = r["with_manual_fallback"]
        log(f"manual fallback (tau={tau}): auto {fb['auto_coverage']:.0%} of cases, accuracy on auto = "
            f"{fb['accuracy_on_auto']:.3f}, sent to manual = {fb['sent_to_manual']}")
        log(classification_report(Y[k], P[k].argmax(1), target_names=CLASSES, digits=3, zero_division=0))
        log("confusion matrix (rows=true, cols=pred):", r["model"]["confusion_matrix"])
        (REPORTS_DIR / f"classification_report_{k}.txt").write_text(
            classification_report(Y[k], P[k].argmax(1), target_names=CLASSES, digits=3, zero_division=0), encoding="utf-8")
        plot_cm(r["model"]["confusion_matrix"], f"Confusion matrix — {k} (n={r['model']['n']})",
                REPORTS_DIR / f"confusion_matrix_{k}.png")

    fig, ax = plt.subplots(figsize=(5.2, 3.8), dpi=150)
    for k, st in (("val", "o-"), ("test", "s--")):
        pts = [(r["coverage"], r["accuracy_on_accepted"]) for r in cov[k] if r["accuracy_on_accepted"] is not None]
        ax.plot([p[0] for p in pts], [p[1] for p in pts], st, label=k, markersize=3)
    ax.axvline(results["val"]["with_manual_fallback"]["auto_coverage"], color="gray", lw=0.6, ls=":")
    ax.set_xlabel("Share handled automatically (coverage)"); ax.set_ylabel("Accuracy on automatic cases")
    ax.grid(alpha=0.3); ax.legend(); ax.set_title("Accuracy vs. manual-review share", fontsize=10)
    fig.tight_layout(); fig.savefig(REPORTS_DIR / "coverage_accuracy.png"); plt.close(fig)

    # ---- 5. артефакты ----
    MODELS_DIR.mkdir(exist_ok=True)
    np.savez(MODELS_DIR / "severity_head.npz", mean=scaler.mean_, scale=scaler.scale_,
             coef=clf.coef_, intercept=clf.intercept_, classes=np.array(CLASSES), tau=np.array(tau))
    card = {
        "task": "damage severity classification (3 classes)", "classes": CLASSES,
        "backbone": {"name": BACKBONE_NAME, "frozen": True, "weights_url": BACKBONE_URL,
                     "weights_sha256_prefix": BACKBONE_SHA_PREFIX,
                     "preprocess": "resize shorter side to 256 (bicubic), center crop 224, ImageNet mean/std; "
                                   "embedding = global-average-pooled conv features (1280-d); TTA = original + horizontal flip"},
        "head": {"type": "multinomial logistic regression on standardized embeddings", "C": best_C,
                 "class_weight": "balanced", "file": "severity_head.npz"},
        "manual_fallback": {"tau": tau, "rule": tau_rule,
                            "meaning": "if max class probability < tau the UI must ask the user to choose severity manually"},
        "dataset": {"source": f"https://github.com/{DATASET_REPO}", "commit": DATASET_COMMIT,
                    "manifest": "ml/dataset/manifest.csv", "summary": "ml/dataset/split_summary.json"},
        "metrics_file": "ml/reports/metrics.json", "seed": SEED,
        "limitations": [
            "only severity is predicted; damaged parts are NOT predicted (the dataset has no part labels)",
            "severity labels are subjective and the source dataset has no stated annotation protocol or license",
            "validation/test sets are small (139 / 167 images): see confidence intervals in metrics.json"],
    }
    (MODELS_DIR / "model_card.json").write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
    out = {"cv_macro_f1": {str(c): {"mean": m, "std": s} for c, (m, s) in cv_scores.items()},
           "best_C": best_C, "tau": tau, "tau_rule": tau_rule, "results": results}
    (REPORTS_DIR / "metrics.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    (REPORTS_DIR / "train_log.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    log("\nartifacts saved to ml/models and ml/reports")


if __name__ == "__main__":
    sys.exit(main())
