from pathlib import Path

ML_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = ML_DIR / "data" / "raw"
SOURCE_DIR = RAW_DIR / "source"
CACHE_DIR = ML_DIR / "data" / "cache"
MANIFEST = ML_DIR / "dataset" / "manifest.csv"
SPLIT_SUMMARY = ML_DIR / "dataset" / "split_summary.json"
MODELS_DIR = ML_DIR / "models"
REPORTS_DIR = ML_DIR / "reports"

CLASSES = ["minor", "moderate", "severe"]
CLASS_ALIASES = {
    "minor": "minor", "01-minor": "minor",
    "moderate": "moderate", "02-moderate": "moderate",
    "severe": "severe", "03-severe": "severe",
}
SEED = 42
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")

DATASET_REPO = "spcCodes/Car-Damage-Intensity-Detection"
DATASET_COMMIT = "9cf322a5e7bdf32c87c49b717d479d47fd44fffc"
SOURCE_SUBDIRS = ("task_vision/data/training", "task_vision/data/test")

BACKBONE_NAME = "efficientnet-b0"
BACKBONE_URL = "https://github.com/lukemelas/EfficientNet-PyTorch/releases/download/1.0/efficientnet-b0-355c32eb.pth"
BACKBONE_SHA_PREFIX = "355c32eb"
