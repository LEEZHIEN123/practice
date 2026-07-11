"""Sync recipe imageUrl fields from RECEPI.csv img_src into the app datasets."""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "data" / "RECEPI.csv"
FALLBACK_CSV = Path(
    r"c:\Users\leezh\OneDrive - Universiti Tunku Abdul Rahman\RECEPI.csv"
)
OUT_JSON = ROOT / "lib" / "recipeFoodDataset.json"
OUT_INDEX = ROOT / "lib" / "recipeFoodIndex.json"


def resolve_csv_path() -> Path:
    # Prefer the OneDrive source of truth when present, else project data copy.
    if FALLBACK_CSV.exists():
        return FALLBACK_CSV
    if DEFAULT_CSV.exists():
        return DEFAULT_CSV
    raise FileNotFoundError(
        f"RECEPI.csv not found at {FALLBACK_CSV} or {DEFAULT_CSV}"
    )


def load_img_by_name(csv_path: Path) -> dict[str, str]:
    by_name: dict[str, str] = {}
    # Prefer utf-8; fall back to latin-1 for older exports.
    for encoding in ("utf-8", "latin-1"):
        try:
            with csv_path.open(encoding=encoding, newline="") as handle:
                for row in csv.DictReader(handle):
                    name = (row.get("recipe_name") or "").strip()
                    img = (row.get("img_src") or "").strip()
                    if name and img:
                        by_name[name.lower()] = img
            break
        except UnicodeDecodeError:
            by_name.clear()
            continue
    return by_name


def sync_file(path: Path, by_name: dict[str, str]) -> tuple[int, int]:
    items = json.loads(path.read_text(encoding="utf-8"))
    updated = 0
    missing = 0
    for item in items:
        key = str(item.get("name") or "").strip().lower()
        src = by_name.get(key)
        if not src:
            missing += 1
            continue
        if item.get("imageUrl") != src:
            item["imageUrl"] = src
            updated += 1
    path.write_text(
        json.dumps(items, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return updated, missing


def main() -> None:
    csv_path = resolve_csv_path()
    by_name = load_img_by_name(csv_path)
    if not by_name:
        raise SystemExit(f"No recipe images found in {csv_path}")

    ds_updated, ds_missing = sync_file(OUT_JSON, by_name)
    idx_updated, idx_missing = sync_file(OUT_INDEX, by_name)

    print(f"Read {csv_path} ({len(by_name)} recipes with img_src)")
    print(f"Updated {OUT_JSON.name}: {ds_updated} (missing name match: {ds_missing})")
    print(f"Updated {OUT_INDEX.name}: {idx_updated} (missing name match: {idx_missing})")


if __name__ == "__main__":
    main()
