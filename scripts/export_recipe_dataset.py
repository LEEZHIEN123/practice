"""Parse RECEPI.csv and export a compact JSON food library for the app."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "data" / "RECEPI.csv"
FALLBACK_CSV = Path(
    r"c:\Users\leezh\OneDrive - Universiti Tunku Abdul Rahman\RECEPI.csv"
)
OUT_JSON = ROOT / "lib" / "recipeFoodDataset.json"
OUT_INDEX = ROOT / "lib" / "recipeFoodIndex.json"

FRACTION_UNITS = ("cup", "cups", "teaspoon", "tablespoon", "bunch", "large")


def fix_ingredient_fractions(text: str) -> str:
    """Replace corrupted half-fraction markers like ?cup with ½ cup."""
    pattern = r"\?(" + "|".join(FRACTION_UNITS) + r")\b"
    return re.sub(pattern, r"½ \1", text)


def map_category(cuisine_path: str) -> str:
    path = (cuisine_path or "").lower()
    if "breakfast" in path or "brunch" in path:
        return "breakfast"
    if any(
        token in path
        for token in (
            "dessert",
            "appetizer",
            "snack",
            "drink",
            "bread",
            "quick bread",
        )
    ):
        return "snack"
    if any(token in path for token in ("salad", "side dish")):
        return "lunch"
    return "dinner"


CATEGORY_LABELS = {
    "breakfast": "Breakfast",
    "lunch": "Lunch",
    "dinner": "Dinner",
    "snack": "Snack",
}


def build_tags(cuisine_path: str, category: str, calories: int) -> list[str]:
    tags: list[str] = []

    if calories <= 300:
        tags.append("Under 300 Calories")
    elif calories <= 500:
        tags.append("Under 500 Calories")
    elif calories <= 700:
        tags.append("Under 700 Calories")

    category_label = CATEGORY_LABELS.get(category)
    if category_label:
        tags.append(category_label)

    for part in (cuisine_path or "").split("/"):
        segment = part.strip()
        if segment and segment not in tags:
            tags.append(segment)

    return tags


def parse_nutrition(raw: str) -> dict:
    text = raw or ""

    def find(pattern: str) -> float:
        match = re.search(pattern, text, re.IGNORECASE)
        return float(match.group(1)) if match else 0.0

    protein_g = find(r"Protein\s+([\d.]+)g")
    carbs_g = find(r"Total Carbohydrate\s+([\d.]+)g")
    fat_g = find(r"Total Fat\s+([\d.]+)g")
    fiber_g = find(r"Dietary Fiber\s+([\d.]+)g")
    sodium_mg = find(r"Sodium\s+([\d.]+)mg")
    calories = round(protein_g * 4 + carbs_g * 4 + fat_g * 9)

    return {
        "calories": calories,
        "proteinG": round(protein_g, 1),
        "carbsG": round(carbs_g, 1),
        "fatG": round(fat_g, 1),
        "fiberG": round(fiber_g, 1) if fiber_g else None,
        "sodiumMg": round(sodium_mg) if sodium_mg else None,
    }


def parse_ingredients(raw: str) -> list[str]:
    if not raw:
        return []
    text = fix_ingredient_fractions(raw)
    parts = re.split(r",\s*(?=\d|½|¼|⅓|⅔|\?|1/2|1/3|1/4)", text)
    return [part.strip() for part in parts if part.strip()]


def ensure_full_stop(text: str) -> str:
    text = text.strip()
    if not text:
        return text
    if text[-1] in ".!?":
        return text
    return f"{text}."


def normalize_direction_steps(steps: list[str]) -> list[str]:
    if not steps:
        return []

    merged: list[str] = []
    for step in steps:
        step = step.strip()
        if not step:
            continue

        if step.startswith(")") and merged:
            previous = merged[-1]
            remainder = step[1:].strip()
            merged[-1] = f"{previous})"
            if remainder:
                merged.append(remainder)
            continue

        merged.append(step)

    balanced: list[str] = []
    buffer = ""
    for step in merged:
        buffer = f"{buffer} {step}".strip() if buffer else step
        if buffer.count("(") <= buffer.count(")"):
            balanced.append(buffer)
            buffer = ""
    if buffer:
        balanced.append(buffer)

    consolidated: list[str] = []
    for step in balanced:
        if (
            consolidated
            and len(step) < 24
            and step[0].islower()
            and not step.startswith("(")
        ):
            consolidated[-1] = f"{consolidated[-1]} {step}"
        else:
            consolidated.append(step)

    return [ensure_full_stop(step) for step in consolidated if step.strip()]


def parse_directions(raw: str) -> list[str]:
    if not raw:
        return []

    text = raw.replace("\r\n", "\n").strip()
    if "\n" in text:
        steps: list[str] = []
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            line = re.sub(r"^\d+\.\s*", "", line)
            if line:
                steps.append(line)
        return normalize_direction_steps(steps)

    parts = re.split(r"\s*(?=\d+\.\s)", text)
    steps = [re.sub(r"^\d+\.\s*", "", part).strip() for part in parts if part.strip()]
    return normalize_direction_steps(steps)


def slugify(name: str, index: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"recipe-{index}-{slug[:48]}"


def serving_size(row: dict) -> str | None:
    yield_text = (row.get("yield") or "").strip()
    servings = (row.get("servings") or "").strip()
    if yield_text:
        return yield_text
    if servings:
        return f"{servings} serving(s)"
    return None


def resolve_csv_path() -> Path:
    if DEFAULT_CSV.exists():
        return DEFAULT_CSV
    if FALLBACK_CSV.exists():
        return FALLBACK_CSV
    raise FileNotFoundError(
        f"RECEPI.csv not found at {DEFAULT_CSV} or {FALLBACK_CSV}"
    )


def export_recipes(csv_path: Path) -> list[dict]:
    items: list[dict] = []
    skipped_no_serving = 0
    with csv_path.open(encoding="latin-1", newline="") as handle:
        for index, row in enumerate(csv.DictReader(handle), start=1):
            name = (row.get("recipe_name") or "").strip()
            if not name:
                continue

            serving = serving_size(row)
            if not serving:
                skipped_no_serving += 1
                continue

            nutrition = parse_nutrition(row.get("nutrition") or "")
            fiber_g = nutrition.pop("fiberG")
            sodium_mg = nutrition.pop("sodiumMg")

            item = {
                "id": slugify(name, index),
                "name": name,
                "category": map_category(row.get("cuisine_path") or ""),
                "servingSize": serving,
                "imageUrl": (row.get("img_src") or "").strip() or None,
                "tags": build_tags(
                    row.get("cuisine_path") or "",
                    map_category(row.get("cuisine_path") or ""),
                    nutrition["calories"],
                ),
                "nutrition": {
                    **nutrition,
                    **({"fiberG": fiber_g} if fiber_g else {}),
                    **({"sodiumMg": sodium_mg} if sodium_mg else {}),
                },
                "ingredients": parse_ingredients(row.get("ingredients") or ""),
                "directions": parse_directions(row.get("directions") or ""),
            }
            items.append(item)

    if skipped_no_serving:
        print(f"Skipped {skipped_no_serving} recipes with blank serving size")

    return items


def main() -> None:
    csv_path = resolve_csv_path()
    items = export_recipes(csv_path)
    OUT_JSON.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")

    index_items = [
        {key: value for key, value in item.items() if key not in ("ingredients", "directions")}
        for item in items
    ]
    OUT_INDEX.write_text(
        json.dumps(index_items, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    categories: dict[str, int] = {}
    for item in items:
        categories[item["category"]] = categories.get(item["category"], 0) + 1

    print(f"Read {csv_path}")
    print(f"Exported {len(items)} recipes to {OUT_JSON}")
    print(f"Exported {len(index_items)} list rows to {OUT_INDEX}")
    print("Categories:", categories)


if __name__ == "__main__":
    main()
