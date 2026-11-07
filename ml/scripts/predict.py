"""Инференс: оценка тяжести повреждения по фото.

    python predict.py photo1.jpg photo2.jpg

Если уверенность модели ниже порога tau, поле needs_manual_review = true:
интерфейс должен предложить пользователю выбрать тяжесть вручную.
"""
import json
import sys

import numpy as np
import torch

from avtointellekt.ml.scripts.common import MODELS_DIR
from avtointellekt.ml.scripts.extract_features import embed, load_model, preprocess


def load_head():
    h = np.load(MODELS_DIR / "severity_head.npz")
    return {k: h[k] for k in h.files}


def predict(paths, model=None, head=None):
    torch.set_num_threads(1)
    model = model or load_model()
    head = head or load_head()
    emb = embed(model, [preprocess(p) for p in paths])  # (n, 2, 1280)
    n, v, d = emb.shape
    z = (emb.reshape(n * v, d) - head["mean"]) / head["scale"]
    logits = z @ head["coef"].T + head["intercept"]
    e = np.exp(logits - logits.max(1, keepdims=True))
    proba = (e / e.sum(1, keepdims=True)).reshape(n, v, -1).mean(axis=1)
    tau = float(head["tau"])
    out = []
    for p, pr in zip(paths, proba):
        k = int(pr.argmax())
        out.append({"file": str(p), "severity": str(head["classes"][k]), "confidence": round(float(pr[k]), 4),
                    "probabilities": {str(c): round(float(x), 4) for c, x in zip(head["classes"], pr)},
                    "needs_manual_review": bool(pr[k] < tau)})
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    print(json.dumps(predict(sys.argv[1:]), ensure_ascii=False, indent=2))
