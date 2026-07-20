"""
Fill incomplete rows in nutrition_dataset_enriched_v5_clean_filled.csv
(rows 501-514 area): demographics, dietary preference, recipe fields.
Rebuild lib/nutritionPlanDataset.json with diet-safe indexing.
"""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

SRC = Path(r"c:\Users\leezh\Downloads\nutrition_dataset_enriched_v5_clean_filled_v2.csv")
if not SRC.exists():
    SRC = Path(r"c:\Users\leezh\Downloads\nutrition_dataset_enriched_v5_clean_filled.csv")
OUT_CSV = SRC
OUT_CSV_FALLBACK = Path(r"c:\Users\leezh\Downloads\nutrition_dataset_enriched_v5_clean_filled_v2.csv")
OUT_JSON = Path(__file__).resolve().parents[1] / "lib" / "nutritionPlanDataset.json"

MEAT_FISH = re.compile(
    r"\b(chicken|turkey|beef|pork|lamb|meat|fish|salmon|tuna|sardine|sardines|"
    r"shrimp|seafood|bacon|ham|sausage|mince|steak|pate|pâté|scotch egg)\b",
    re.I,
)
EGG = re.compile(r"\b(egg|eggs|omelette|omelet)\b", re.I)
DAIRY = re.compile(
    r"\b(milk|cheese|yoghurt|yogurt|butter|cream|custard|ice cream|whey|ghee)\b",
    re.I,
)
HONEY = re.compile(r"\bhoney\b", re.I)


def _strip_stock_phrases(text: str) -> str:
    # Avoid treating "chicken stock/broth" as meat for vegetarian recipe templates.
    return re.sub(
        r"\b(chicken|beef|bone|fish)\s+(stock|broth)\b",
        "vegetable stock",
        text or "",
        flags=re.I,
    )


def infer_diet_from_text(*parts: str) -> str:
    blob = _strip_stock_phrases(" ".join(p or "" for p in parts))
    if MEAT_FISH.search(blob):
        return "Omnivore"
    if EGG.search(blob) or DAIRY.search(blob) or HONEY.search(blob):
        return "Vegetarian"
    return "Vegan"


def meal_compatible(name: str, ingredients: list[str], diet: str) -> bool:
    blob = " ".join([name, *ingredients])
    inferred = infer_diet_from_text(blob)
    if diet == "Omnivore":
        return True
    if diet == "Vegetarian":
        return inferred in ("Vegetarian", "Vegan")
    return inferred == "Vegan"


def sanitize_ingredients_for_diet(ingredients: list[str], diet: str) -> list[str]:
    if diet == "Omnivore":
        return ingredients
    cleaned = []
    for item in ingredients:
        text = _strip_stock_phrases(item)
        # Drop clearly non-vegetarian bits from mislabeled rows.
        if diet in ("Vegetarian", "Vegan") and re.search(
            r"\b(bacon|ham|sausage|pepperoni|prosciutto)\b", text, re.I
        ):
            continue
        if diet == "Vegan" and (
            EGG.search(text) or DAIRY.search(text) or HONEY.search(text)
        ):
            continue
        cleaned.append(text)
    return cleaned


def calc_bmi(weight: float, height: float) -> float | None:
    if not weight or not height:
        return None
    return round(weight / ((height / 100) ** 2), 1)


def split_pipe(s: str | None) -> list[str]:
    return [x.strip() for x in str(s or "").split("|") if x.strip()]


def join_pipe(items: list[str]) -> str:
    return " | ".join(items)


MAINTENANCE_UW_ROWS = [
    {
        "Age": "24",
        "Gender": "Female",
        "Height": "168",
        "Weight": "50",
        "Activity Level": "Lightly Active",
        "Fitness Goal": "Maintenance",
        "Dietary Preference": "Omnivore",
        "Daily Calorie Target": "2000",
        "Protein": "85",
        "Carbohydrates": "250",
        "Fat": "65",
        "Breakfast Suggestion": "Porridge or breakfast cereal with full-fat milk, Greek yoghurt and dried fruit",
        "Lunch Suggestion": "Tuna and cucumber sandwich with cheese, plus full-fat yoghurt",
        "Dinner Suggestion": "Chicken with rice, cheese sauce and vegetables",
        "Snack Suggestion": "Cheese and crackers",
        "meals": {
            "Breakfast": {
                "cal": 520,
                "i": [
                    "1 cup porridge oats or breakfast cereal",
                    "1 cup full-fat or fortified milk",
                    "2 tablespoons Greek yoghurt",
                    "1 tablespoon dried fruit",
                    "1 teaspoon honey (optional)",
                ],
                "d": [
                    "Cook porridge or cereal with milk until creamy.",
                    "Top with Greek yoghurt and dried fruit.",
                    "Add honey if desired and serve warm.",
                ],
                "img": "https://images.unsplash.com/photo-1650294411710-c43f289dd5dc?auto=format&fit=crop&w=800&q=80",
            },
            "Lunch": {
                "cal": 560,
                "i": [
                    "2 slices bread",
                    "80 g tuna mixed with 1 tablespoon mayonnaise",
                    "Cucumber slices",
                    "1 slice cheese",
                    "1 small pot full-fat yoghurt",
                ],
                "d": [
                    "Mix tuna with mayonnaise and spread on bread.",
                    "Add cucumber and cheese, then close the sandwich.",
                    "Serve with full-fat yoghurt on the side.",
                ],
                "img": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80",
            },
            "Dinner": {
                "cal": 680,
                "i": [
                    "120 g chicken",
                    "1 cup cooked rice",
                    "1/3 cup cheese sauce",
                    "1 cup mixed vegetables",
                ],
                "d": [
                    "Cook chicken until done.",
                    "Warm cheese sauce and steam vegetables.",
                    "Serve chicken and sauce over rice with vegetables.",
                ],
                "img": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80",
            },
            "Snack": {
                "cal": 290,
                "i": ["40 g cheese", "4-6 crackers"],
                "d": ["Slice cheese and serve with crackers."],
                "img": "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=800&q=80",
            },
        },
    },
    {
        "Age": "27",
        "Gender": "Male",
        "Height": "175",
        "Weight": "54",
        "Activity Level": "Sedentary",
        "Fitness Goal": "Maintenance",
        "Dietary Preference": "Omnivore",
        "Daily Calorie Target": "2100",
        "Protein": "95",
        "Carbohydrates": "260",
        "Fat": "70",
        "Breakfast Suggestion": "Scrambled eggs with grated cheese on buttered toast",
        "Lunch Suggestion": "Creamy chicken soup with beans and a buttered bread roll",
        "Dinner Suggestion": "Fish in creamy sauce with butter-enriched mashed potatoes",
        "Snack Suggestion": "Full-fat yoghurt with mixed nuts and dried fruit",
        "meals": {
            "Breakfast": {
                "cal": 480,
                "i": [
                    "2 eggs",
                    "2 tablespoons grated cheese",
                    "1-2 slices buttered toast",
                    "Salt and pepper to taste",
                ],
                "d": [
                    "Scramble eggs over medium heat until just set.",
                    "Stir in grated cheese.",
                    "Serve on buttered toast.",
                ],
                "img": "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
            },
            "Lunch": {
                "cal": 540,
                "i": [
                    "1.5 cups creamy chicken soup",
                    "1/2 cup beans",
                    "1 buttered bread roll",
                ],
                "d": [
                    "Heat soup and stir in beans until hot.",
                    "Warm or butter the bread roll.",
                    "Serve soup with the roll on the side.",
                ],
                "img": "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80",
            },
            "Dinner": {
                "cal": 700,
                "i": [
                    "140 g white fish fillet",
                    "1/3 cup creamy sauce",
                    "1.5 cups mashed potatoes with butter",
                    "1 cup vegetables",
                ],
                "d": [
                    "Bake or pan-cook the fish until flaky.",
                    "Warm creamy sauce and mash potatoes with butter.",
                    "Plate fish with sauce, mash, and vegetables.",
                ],
                "img": "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80",
            },
            "Snack": {
                "cal": 320,
                "i": [
                    "1 cup full-fat yoghurt",
                    "2 tablespoons mixed nuts",
                    "1 tablespoon dried fruit",
                ],
                "d": [
                    "Spoon yoghurt into a bowl.",
                    "Top with nuts and dried fruit.",
                    "Serve chilled.",
                ],
                "img": "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80",
            },
        },
    },
    {
        "Age": "22",
        "Gender": "Male",
        "Height": "178",
        "Weight": "55",
        "Activity Level": "Lightly Active",
        "Fitness Goal": "Maintenance",
        "Dietary Preference": "Omnivore",
        "Daily Calorie Target": "2200",
        "Protein": "100",
        "Carbohydrates": "280",
        "Fat": "70",
        "Breakfast Suggestion": "Peanut butter and banana toast with full-fat milk",
        "Lunch Suggestion": "Sardines on buttered toast with vegetables",
        "Dinner Suggestion": "Macaroni cheese with chicken, tuna or beans",
        "Snack Suggestion": "Peanut butter on buttered toast",
        "meals": {
            "Breakfast": {
                "cal": 500,
                "i": [
                    "2 slices toast",
                    "2 tablespoons peanut butter",
                    "1 banana, sliced",
                    "1 glass full-fat milk",
                ],
                "d": [
                    "Toast the bread.",
                    "Spread peanut butter and top with banana.",
                    "Serve with a glass of full-fat milk.",
                ],
                "img": "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80",
            },
            "Lunch": {
                "cal": 520,
                "i": [
                    "1 tin sardines",
                    "2 slices buttered toast",
                    "1 cup mixed vegetables",
                ],
                "d": [
                    "Toast and butter the bread.",
                    "Top with sardines.",
                    "Serve with a small side of vegetables.",
                ],
                "img": "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80",
            },
            "Dinner": {
                "cal": 720,
                "i": [
                    "1.5 cups cooked macaroni",
                    "1/2 cup cheese sauce",
                    "100 g chicken, tuna, or beans",
                    "Salt and pepper to taste",
                ],
                "d": [
                    "Warm macaroni with cheese sauce.",
                    "Stir in cooked chicken, tuna, or beans.",
                    "Serve hot.",
                ],
                "img": "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&q=80",
            },
            "Snack": {
                "cal": 280,
                "i": ["1 slice buttered toast", "1 tablespoon peanut butter"],
                "d": ["Toast the bread.", "Spread peanut butter and serve."],
                "img": "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80",
            },
        },
    },
    {
        "Age": "25",
        "Gender": "Female",
        "Height": "162",
        "Weight": "47",
        "Activity Level": "Moderately Active",
        "Fitness Goal": "Maintenance",
        "Dietary Preference": "Vegetarian",
        "Daily Calorie Target": "2000",
        "Protein": "80",
        "Carbohydrates": "260",
        "Fat": "65",
        "Breakfast Suggestion": "Cheese omelette with bread or potatoes",
        "Lunch Suggestion": "Baked beans and grated cheese on toast",
        "Dinner Suggestion": "Bean or lentil casserole with rice and grated cheese",
        "Snack Suggestion": "Fruit milkshake with full-fat milk and ice cream",
        "meals": {
            "Breakfast": {
                "cal": 470,
                "i": [
                    "2 eggs",
                    "30 g grated cheese",
                    "1 slice bread or 1 small boiled potato",
                    "1 teaspoon oil or butter",
                ],
                "d": [
                    "Beat eggs and cook as an omelette.",
                    "Add cheese to melt.",
                    "Serve with bread or potatoes.",
                ],
                "img": "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
            },
            "Lunch": {
                "cal": 480,
                "i": [
                    "1 cup baked beans",
                    "2 tablespoons grated cheese",
                    "2 slices toast",
                ],
                "d": [
                    "Warm baked beans.",
                    "Toast bread and top with beans and cheese.",
                    "Grill briefly to melt cheese if desired.",
                ],
                "img": "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80",
            },
            "Dinner": {
                "cal": 640,
                "i": [
                    "1.5 cups bean or lentil casserole",
                    "1 cup cooked rice",
                    "2 tablespoons grated cheese",
                ],
                "d": [
                    "Heat the casserole until simmering.",
                    "Serve over rice.",
                    "Top with grated cheese.",
                ],
                "img": "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80",
            },
            "Snack": {
                "cal": 310,
                "i": [
                    "1 cup full-fat milk",
                    "1/2 cup fruit",
                    "1 scoop ice cream",
                ],
                "d": [
                    "Blend milk, fruit, and ice cream until smooth.",
                    "Serve immediately.",
                ],
                "img": "https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=800&q=80",
            },
        },
    },
    {
        # Row 514
        "Age": "29",
        "Gender": "Male",
        "Height": "176",
        "Weight": "56",
        "Activity Level": "Lightly Active",
        "Fitness Goal": "Maintenance",
        "Dietary Preference": "Omnivore",
        "Daily Calorie Target": "2100",
        "Protein": "95",
        "Carbohydrates": "270",
        "Fat": "68",
        "Breakfast Suggestion": "Fortified porridge with milk, nut butter and banana",
        "Lunch Suggestion": "Egg mayonnaise sandwich with cheese and fruit yoghurt",
        "Dinner Suggestion": "Shepherd's pie with creamy mash and olive-oil roasted vegetables",
        "Snack Suggestion": "Nuts and cheese on crackers",
        "meals": {
            "Breakfast": {
                "cal": 510,
                "i": [
                    "1 cup fortified porridge oats",
                    "1 cup full-fat milk",
                    "1 tablespoon nut butter",
                    "1 banana, sliced",
                ],
                "d": [
                    "Cook porridge with milk until creamy.",
                    "Stir in nut butter.",
                    "Top with banana and serve warm.",
                ],
                "img": "https://images.unsplash.com/photo-1650294411710-c43f289dd5dc?auto=format&fit=crop&w=800&q=80",
            },
            "Lunch": {
                "cal": 550,
                "i": [
                    "2 slices bread",
                    "1 hard-boiled egg mixed with mayonnaise",
                    "1 slice cheese",
                    "1 small fruit yoghurt",
                ],
                "d": [
                    "Make an egg mayonnaise sandwich with cheese.",
                    "Serve with fruit yoghurt.",
                ],
                "img": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80",
            },
            "Dinner": {
                "cal": 700,
                "i": [
                    "150 g cooked minced meat or lentils",
                    "1 cup mixed vegetables",
                    "1.5 cups creamy mashed potato",
                    "1 tablespoon olive oil",
                ],
                "d": [
                    "Assemble shepherd's pie and bake until golden.",
                    "Serve with vegetables roasted in olive oil.",
                ],
                "img": "https://images.unsplash.com/photo-1574672280600-4accfa113ce9?auto=format&fit=crop&w=800&q=80",
            },
            "Snack": {
                "cal": 300,
                "i": ["2 tablespoons mixed nuts", "2 crackers", "20 g cheese"],
                "d": ["Serve nuts with cheese on crackers."],
                "img": "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&q=80",
            },
        },
    },
]


def apply_meal_block(row: dict, block: dict) -> None:
    for prefix, data in block["meals"].items():
        row[f"{prefix} Suggestion"] = block[f"{prefix} Suggestion"]
        row[f"{prefix} Ingredients"] = join_pipe(data["i"])
        row[f"{prefix} Directions"] = join_pipe(data["d"])
        row[f"{prefix} Calories"] = str(data["cal"])
        row[f"{prefix} Image URL"] = data["img"]
        row[f"{prefix} Recipe Source"] = "template_filled"
    total = sum(int(block["meals"][p]["cal"]) for p in ("Breakfast", "Lunch", "Dinner", "Snack"))
    row["Meals Total Calories"] = str(total)
    h = float(block["Height"])
    w = float(block["Weight"])
    bmi = calc_bmi(w, h)
    row.update(
        {
            "Age": block["Age"],
            "Gender": block["Gender"],
            "Height": block["Height"],
            "Weight": block["Weight"],
            "Activity Level": block["Activity Level"],
            "Fitness Goal": block["Fitness Goal"],
            "Dietary Preference": block["Dietary Preference"],
            "Daily Calorie Target": block["Daily Calorie Target"],
            "Protein": block["Protein"],
            "Carbohydrates": block["Carbohydrates"],
            "Fat": block["Fat"],
            "BMI": str(bmi) if bmi is not None else "",
            "BMI Category": "Underweight",
        }
    )


def fill_missing_dietary(rows: list[dict]) -> int:
    n = 0
    for r in rows:
        if (r.get("Dietary Preference") or "").strip():
            continue
        if not (r.get("Fitness Goal") or "").strip():
            continue
        diet = infer_diet_from_text(
            r.get("Breakfast Suggestion") or "",
            r.get("Lunch Suggestion") or "",
            r.get("Dinner Suggestion") or "",
            r.get("Snack Suggestion") or "",
            r.get("Breakfast Ingredients") or "",
            r.get("Lunch Ingredients") or "",
            r.get("Dinner Ingredients") or "",
            r.get("Snack Ingredients") or "",
        )
        r["Dietary Preference"] = diet
        n += 1
    return n


def norm_activity(v: str | None) -> str | None:
    raw = str(v or "").strip().lower().replace(" ", "_")
    if raw == "sedentary":
        return "sedentary"
    if raw in ("light", "lightly_active"):
        return "light"
    if raw in ("moderate", "moderately_active"):
        return "moderate"
    if raw in ("very_active", "extra_active"):
        return "very_active"
    return None


def norm_goal(v: str | None) -> str | None:
    raw = str(v or "").strip().lower().replace("_", " ")
    if raw in ("muscle gain", "gain", "gain weight", "gain muscle", "weight gain"):
        return "gain"
    if raw in ("weight loss", "lose", "lose weight", "fat loss"):
        return "lose"
    if raw in ("maintenance", "maintain", "maintain weight", "weight maintenance"):
        return "maintain"
    return None


def norm_diet(v: str | None) -> str | None:
    raw = str(v or "").strip().lower()
    if raw in ("omnivore", "vegetarian", "vegan"):
        return raw
    return None


def estimate_macros(name: str, cal: int) -> tuple[int, int, int]:
    cal = max(80, int(cal or 300))
    lower = name.lower()
    p, c, f = 0.25, 0.45, 0.3
    if re.search(r"chicken|turkey|fish|salmon|tuna|egg|tofu|protein|pate|quiche|sardine", lower):
        p, c, f = 0.35, 0.35, 0.3
    elif re.search(r"oatmeal|oat|rice|pasta|bread|toast|porridge|cereal|potato|macaroni", lower):
        p, c, f = 0.15, 0.6, 0.25
    elif re.search(r"nut|avocado|trail|peanut|almond|cheese|butter", lower):
        p, c, f = 0.15, 0.25, 0.6
    return round(cal * p / 4), round(cal * c / 4), round(cal * f / 9)


def rebuild_dataset(rows: list[dict]) -> dict:
    meals: list[dict] = []
    meal_id_by_name: dict[str, int] = {}
    index: dict[str, list[dict]] = defaultdict(list)

    def ensure_meal(
        name: str,
        ingredients: list[str],
        directions: list[str],
        calories,
        image: str,
        row_diet: str,
    ) -> int:
        key = f"{row_diet}|{name.strip().lower()}"
        cal = int(float(calories or 0))
        p, c, f = estimate_macros(name, cal)
        if key in meal_id_by_name:
            mid = meal_id_by_name[key]
            # Keep the lighter calorie version so mixed days stay under Today Calorie.
            if cal > 0 and (meals[mid]["cal"] <= 0 or cal < meals[mid]["cal"]):
                meals[mid]["cal"] = cal
                meals[mid]["p"], meals[mid]["c"], meals[mid]["f"] = p, c, f
                if ingredients:
                    meals[mid]["i"] = ingredients
                if directions:
                    meals[mid]["d"] = directions
                if image:
                    meals[mid]["img"] = image
            return mid
        mid = len(meals)
        meals.append(
            {
                "id": mid,
                "n": name,
                "cal": cal,
                "i": ingredients,
                "d": directions,
                "img": image
                or "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
                "p": p,
                "c": c,
                "f": f,
                "diet": row_diet,
            }
        )
        meal_id_by_name[key] = mid
        return mid

    kept = skipped = 0
    for r in rows:
        goal = norm_goal(r.get("Fitness Goal"))
        diet = norm_diet(r.get("Dietary Preference"))
        bmi = (r.get("BMI Category") or "").strip()
        act = norm_activity(r.get("Activity Level"))
        if not (goal and diet and bmi in ("Underweight", "Normal", "Overweight", "Obese") and act):
            skipped += 1
            continue
        names = {
            "Breakfast": (r.get("Breakfast Suggestion") or "").strip(),
            "Lunch": (r.get("Lunch Suggestion") or "").strip(),
            "Dinner": (r.get("Dinner Suggestion") or "").strip(),
            "Snack": (r.get("Snack Suggestion") or "").strip(),
        }
        if not all(names.values()):
            skipped += 1
            continue

        ids = {}
        diet_label = {"omnivore": "Omnivore", "vegetarian": "Vegetarian", "vegan": "Vegan"}[diet]
        ok = True
        for prefix in ("Breakfast", "Lunch", "Dinner", "Snack"):
            ingredients = sanitize_ingredients_for_diet(
                split_pipe(r.get(f"{prefix} Ingredients")), diet_label
            )
            # If name itself is non-compliant (e.g. "Chicken stir-fry" on vegetarian), skip row.
            if not meal_compatible(names[prefix], ingredients, diet_label):
                ok = False
                break
            ids[prefix] = ensure_meal(
                names[prefix],
                ingredients,
                split_pipe(r.get(f"{prefix} Directions")),
                r.get(f"{prefix} Calories"),
                r.get(f"{prefix} Image URL") or "",
                diet,
            )
        if not ok:
            skipped += 1
            continue

        kcal = str(int(float(r.get("Daily Calorie Target") or 0)) or 0)
        key = f"{act}|{bmi}|{goal}|{diet}|{kcal}"
        combo = {"b": ids["Breakfast"], "l": ids["Lunch"], "di": ids["Dinner"], "s": ids["Snack"]}
        if combo not in index[key]:
            index[key].append(combo)
        kept += 1

    print(f"Indexed {kept} rows; skipped {skipped}")
    return {"meals": meals, "index": dict(index)}


def main() -> None:
    with SRC.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = [r for r in reader if (r.get("Fitness Goal") or "").strip() != "Fitness Goal"]

    # Fill / replace incomplete Maintenance+Underweight rows; append only if fewer than 5.
    maint_idxs = [
        i
        for i, r in enumerate(rows)
        if (r.get("Fitness Goal") or "").strip() == "Maintenance"
        and (r.get("BMI Category") or "").strip() == "Underweight"
        and (
            not (r.get("Breakfast Calories") or "").strip()
            or not (r.get("Dietary Preference") or "").strip()
        )
    ]
    print("incomplete maintenance UW idxs", maint_idxs)

    complete_maint = sum(
        1
        for r in rows
        if (r.get("Fitness Goal") or "").strip() == "Maintenance"
        and (r.get("BMI Category") or "").strip() == "Underweight"
        and (r.get("Breakfast Calories") or "").strip()
        and (r.get("Dietary Preference") or "").strip()
    )

    for n, block in enumerate(MAINTENANCE_UW_ROWS):
        if n < len(maint_idxs):
            apply_meal_block(rows[maint_idxs[n]], block)
        elif complete_maint + len(maint_idxs) < len(MAINTENANCE_UW_ROWS) and n >= complete_maint:
            blank = {k: "" for k in fieldnames}
            apply_meal_block(blank, block)
            rows.append(blank)
            complete_maint += 1

    diet_filled = fill_missing_dietary(rows)
    print(f"Filled dietary preference on {diet_filled} rows")

    target = OUT_CSV
    try:
        with target.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        print(f"Wrote {target} ({len(rows)} rows)")
    except PermissionError:
        target = OUT_CSV_FALLBACK
        with target.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        print(f"Source locked; wrote {target} ({len(rows)} rows)")

    payload = rebuild_dataset(rows)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT_JSON}; meals={len(payload['meals'])} keys={len(payload['index'])}")
    for needle in ("Underweight|maintain|omnivore", "Underweight|maintain|vegetarian", "Underweight|gain|omnivore"):
        keys = [k for k in payload["index"] if needle in k]
        print(needle, {k: len(payload["index"][k]) for k in keys})


if __name__ == "__main__":
    main()
