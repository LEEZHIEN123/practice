"""
Fill incomplete rows in nutrition_dataset_enriched_v5_clean.csv
(Muscle Gain + Underweight missing dietary preference / demographics),
then rebuild lib/nutritionPlanDataset.json.

Only rows with Fitness Goal + Dietary Preference + BMI Category are indexed.
"""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

SRC_CSV = Path(r"c:\Users\leezh\Downloads\nutrition_dataset_enriched_v5_clean.csv")
OUT_CSV = Path(r"c:\Users\leezh\Downloads\nutrition_dataset_enriched_v5_clean_filled.csv")
OUT_JSON = Path(__file__).resolve().parents[1] / "lib" / "nutritionPlanDataset.json"

MEAL_RECIPES: dict[str, dict] = {
    "Fortified porridge or cereal and milk": {
        "cal": 520,
        "i": [
            "1 cup fortified porridge oats or cereal",
            "1 cup full-fat milk or fortified plant milk",
            "1 tablespoon nut butter or cream",
            "1 teaspoon honey (optional)",
            "Handful of dried fruit (optional)",
        ],
        "d": [
            "Warm the milk in a small pot over medium heat.",
            "Stir in porridge or cereal and cook until creamy, 3-5 minutes.",
            "Stir in nut butter or cream for extra calories.",
            "Top with honey and dried fruit if desired. Serve warm.",
        ],
        "img": "https://images.unsplash.com/photo-1650294411710-c43f289dd5dc?auto=format&fit=crop&w=800&q=80",
    },
    "Bread/toast with butter or vegetable oil spread and marmalade/jam": {
        "cal": 420,
        "i": [
            "2 slices whole-grain or white bread",
            "2 teaspoons butter or vegetable oil spread",
            "1-2 teaspoons marmalade or jam",
        ],
        "d": [
            "Toast the bread until golden.",
            "Spread generously with butter or oil spread.",
            "Add marmalade or jam and serve.",
        ],
        "img": "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80",
    },
    "Cooked breakfast with scrambled egg, mushrooms, tomato and beans": {
        "cal": 580,
        "i": [
            "2 eggs",
            "1 cup mushrooms, sliced",
            "1 tomato, sliced",
            "1/2 cup baked beans",
            "1 tablespoon vegetable oil",
            "Salt and pepper to taste",
        ],
        "d": [
            "Heat oil in a nonstick pan over medium heat.",
            "Cook mushrooms and tomato until softened.",
            "Scramble the eggs in the pan until just set.",
            "Warm the beans and plate everything together.",
        ],
        "img": "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
    },
    "Milky tea, coffee, hot chocolate or fruit juice": {
        "cal": 220,
        "i": [
            "1 cup milk or fortified plant milk",
            "1 tea bag, coffee, hot chocolate powder, or 1 cup fruit juice",
            "1-2 teaspoons sugar or honey (optional)",
        ],
        "d": [
            "Warm the milk if making tea, coffee, or hot chocolate.",
            "Brew drink as preferred and sweeten if desired.",
            "Or pour chilled fruit juice into a glass and serve.",
        ],
        "img": "https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=800&q=80",
    },
    "Egg mayo, cheese or tuna mayo sandwich": {
        "cal": 520,
        "i": [
            "2 slices bread",
            "1 hard-boiled egg, cheese slice, or 80 g tuna mixed with 1 tablespoon mayonnaise",
            "Lettuce or cucumber slices (optional)",
            "Pinch of salt and pepper",
        ],
        "d": [
            "Prepare the filling (mash egg or tuna with mayonnaise, or slice cheese).",
            "Spread filling on one slice of bread.",
            "Add salad if desired, top with the second slice, and serve.",
        ],
        "img": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80",
    },
    "Fortified soup with toast, bread or cheese on toast": {
        "cal": 480,
        "i": [
            "1.5 cups soup (vegetable, chicken, or cream-based)",
            "2 tablespoons cream or grated cheese to fortify",
            "1-2 slices bread or toast",
            "Optional extra cheese for cheese on toast",
        ],
        "d": [
            "Heat the soup and stir in cream or cheese until melted.",
            "Toast bread if using cheese on toast; melt cheese on top.",
            "Serve soup with toast or bread on the side.",
        ],
        "img": "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80",
    },
    "Stewed fruit and custard or fruit salad with yoghurt and honey": {
        "cal": 390,
        "i": [
            "1 cup stewed fruit or fresh fruit salad",
            "1/2 cup custard or natural yoghurt",
            "1 teaspoon honey",
        ],
        "d": [
            "Warm stewed fruit if preferred, or chill fruit salad.",
            "Spoon custard or yoghurt over the fruit.",
            "Drizzle honey and serve.",
        ],
        "img": "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80",
    },
    "Shepherd's pie with creamy mash and olive-oil roasted vegetables": {
        "cal": 720,
        "i": [
            "150 g cooked minced meat or lentils",
            "1 cup mixed vegetables",
            "1.5 cups creamy mashed potato",
            "1 tablespoon olive oil for roasting vegetables",
            "Salt, pepper, and herbs to taste",
        ],
        "d": [
            "Preheat oven to 190 C (375 F).",
            "Layer meat or lentils with vegetables in a baking dish.",
            "Top with creamy mash and bake 20-25 minutes until golden.",
            "Serve with vegetables roasted in olive oil.",
        ],
        "img": "https://images.unsplash.com/photo-1574672280600-4accfa113ce9?auto=format&fit=crop&w=800&q=80",
    },
    "Pasta with sauce, meat or fish, vegetables, milk/cream and cheese": {
        "cal": 780,
        "i": [
            "1.5 cups cooked pasta",
            "100 g meat or fish",
            "1 cup vegetables",
            "1/3 cup milk or cream",
            "2 tablespoons grated cheese",
            "Salt and pepper to taste",
        ],
        "d": [
            "Cook pasta until al dente; drain.",
            "Cook meat or fish with vegetables in a pan.",
            "Stir in milk or cream and cheese to make a richer sauce.",
            "Toss with pasta and serve hot.",
        ],
        "img": "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&q=80",
    },
    "Fortified mash potato with vegetables, meat or fish": {
        "cal": 680,
        "i": [
            "2 cups mashed potato made with milk and butter",
            "120 g meat or fish",
            "1.5 cups cooked vegetables",
            "1 tablespoon butter or oil",
        ],
        "d": [
            "Cook meat or fish until done.",
            "Steam or saute vegetables.",
            "Mash potato with milk and butter for extra calories.",
            "Plate mash with vegetables and protein.",
        ],
        "img": "https://images.unsplash.com/photo-1518013431117-eb1465fa9792?auto=format&fit=crop&w=800&q=80",
    },
    "Crumble or sponge with custard (full-fat milk or soy milk/cream)": {
        "cal": 560,
        "i": [
            "1 serving fruit crumble or sponge",
            "1/2 cup custard made with full-fat milk or soy milk/cream",
        ],
        "d": [
            "Warm the crumble or sponge if desired.",
            "Pour custard over the top.",
            "Serve as a calorie-dense evening meal option.",
        ],
        "img": "https://images.unsplash.com/photo-1486427944299-d1955d23b34d?auto=format&fit=crop&w=800&q=80",
    },
    "Pate on toast": {
        "cal": 280,
        "i": ["2 tablespoons pate", "1 slice toast"],
        "d": ["Toast the bread.", "Spread pate evenly and serve."],
        "img": "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80",
    },
    "Cheese on toast": {
        "cal": 320,
        "i": ["1-2 slices bread", "40 g cheese", "Butter or oil spread (optional)"],
        "d": ["Toast bread lightly.", "Top with cheese and grill until melted."],
        "img": "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=800&q=80",
    },
    "Slice of quiche": {
        "cal": 310,
        "i": ["1 slice quiche (egg, cheese, and pastry)"],
        "d": ["Warm gently in the oven or microwave.", "Serve as a protein-rich snack."],
        "img": "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
    },
    "Scotch eggs": {
        "cal": 340,
        "i": ["1 scotch egg"],
        "d": ["Serve warm or cold as a filling snack."],
        "img": "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
    },
    "Sausage roll or pork pie": {
        "cal": 360,
        "i": ["1 small sausage roll or pork pie portion"],
        "d": ["Warm if preferred.", "Serve as a calorie-dense snack."],
        "img": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80",
    },
    "Nuts": {
        "cal": 270,
        "i": ["1/4 cup mixed unsalted nuts"],
        "d": ["Portion into a small bowl and enjoy."],
        "img": "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&q=80",
    },
    "Toasted crumpet": {
        "cal": 240,
        "i": ["1 crumpet", "1 teaspoon butter or spread"],
        "d": ["Toast the crumpet.", "Spread with butter and serve warm."],
        "img": "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80",
    },
    "Mini Cornish pasty": {
        "cal": 330,
        "i": ["1 mini Cornish pasty"],
        "d": ["Warm in the oven until heated through.", "Serve as a snack."],
        "img": "https://images.unsplash.com/photo-1574672280600-4accfa113ce9?auto=format&fit=crop&w=800&q=80",
    },
    "Cheese and onion rolls": {
        "cal": 300,
        "i": ["1 cheese and onion roll"],
        "d": ["Warm if desired and serve."],
        "img": "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=800&q=80",
    },
    "Cheese and crackers": {
        "cal": 290,
        "i": ["40 g cheese", "4-6 crackers"],
        "d": ["Slice cheese and serve with crackers."],
        "img": "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=800&q=80",
    },
}

PROFILES = [
    dict(Age="22", Gender="Male", Height="178", Weight="55", Activity="Lightly Active", kcal="2200", p="110", c="300", f="65"),
    dict(Age="24", Gender="Female", Height="165", Weight="48", Activity="Lightly Active", kcal="2100", p="95", c="280", f="60"),
    dict(Age="26", Gender="Male", Height="175", Weight="54", Activity="Moderately Active", kcal="2400", p="120", c="320", f="70"),
    dict(Age="21", Gender="Female", Height="160", Weight="46", Activity="Sedentary", kcal="2000", p="90", c="260", f="55"),
    dict(Age="28", Gender="Male", Height="180", Weight="58", Activity="Lightly Active", kcal="2300", p="115", c="310", f="68"),
    dict(Age="23", Gender="Female", Height="168", Weight="50", Activity="Lightly Active", kcal="2200", p="100", c="290", f="62"),
    dict(Age="27", Gender="Male", Height="172", Weight="52", Activity="Moderately Active", kcal="2500", p="125", c="330", f="72"),
    dict(Age="25", Gender="Female", Height="162", Weight="47", Activity="Sedentary", kcal="2000", p="90", c="270", f="55"),
    dict(Age="29", Gender="Male", Height="176", Weight="56", Activity="Lightly Active", kcal="2300", p="115", c="300", f="68"),
    dict(Age="20", Gender="Female", Height="170", Weight="49", Activity="Lightly Active", kcal="2200", p="95", c="295", f="60"),
]


def calc_bmi(weight: float, height: float) -> float | None:
    if not weight or not height:
        return None
    return round(weight / ((height / 100) ** 2), 1)


def clean_meal_name(raw: str, meal_type: str) -> str:
    s = (raw or "").replace("\n", " ").replace("\r", " ").strip()
    s = re.sub(r"^[\s\x00-\x1f\ufffd·•]+", "", s)
    s = re.sub(r"\s+", " ", s).strip(" .")
    low = s.lower()
    mapping = [
        ("fortified porridge", "Fortified porridge or cereal and milk"),
        ("bread/toast with butter", "Bread/toast with butter or vegetable oil spread and marmalade/jam"),
        ("cooked breakfast", "Cooked breakfast with scrambled egg, mushrooms, tomato and beans"),
        ("cup of milky tea", "Milky tea, coffee, hot chocolate or fruit juice"),
        ("egg mayo", "Egg mayo, cheese or tuna mayo sandwich"),
        ("fortified soup", "Fortified soup with toast, bread or cheese on toast"),
        ("stewed fruit", "Stewed fruit and custard or fruit salad with yoghurt and honey"),
        ("shepherd", "Shepherd's pie with creamy mash and olive-oil roasted vegetables"),
        ("pasta dish", "Pasta with sauce, meat or fish, vegetables, milk/cream and cheese"),
        ("fortified mash", "Fortified mash potato with vegetables, meat or fish"),
        ("crumble or sponge", "Crumble or sponge with custard (full-fat milk or soy milk/cream)"),
        ("pât", "Pate on toast"),
        ("pate", "Pate on toast"),
        ("cheese on toast", "Cheese on toast"),
        ("slice of quiche", "Slice of quiche"),
        ("scotch eggs", "Scotch eggs"),
        ("sausage roll", "Sausage roll or pork pie"),
        ("toasted crumpet", "Toasted crumpet"),
        ("mini cornish", "Mini Cornish pasty"),
        ("cheese and onion", "Cheese and onion rolls"),
        ("cheese and crackers", "Cheese and crackers"),
        ("nuts", "Nuts"),
    ]
    for needle, name in mapping:
        if needle in low:
            return name
    defaults = {
        "breakfast": "Fortified porridge or cereal and milk",
        "lunch": "Fortified soup with toast, bread or cheese on toast",
        "dinner": "Pasta with sauce, meat or fish, vegetables, milk/cream and cheese",
        "snack": "Nuts",
    }
    return s or defaults[meal_type]


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


def split_pipe(s: str | None) -> list[str]:
    return [x.strip() for x in str(s or "").split("|") if x.strip()]


def estimate_macros(name: str, cal: int) -> tuple[int, int, int]:
    cal = max(80, int(cal or 300))
    lower = name.lower()
    p, c, f = 0.25, 0.45, 0.3
    if re.search(r"chicken|turkey|fish|salmon|tuna|egg|tofu|protein|pate|quiche|scotch", lower):
        p, c, f = 0.35, 0.35, 0.3
    elif re.search(r"oatmeal|oat|rice|pasta|bread|toast|porridge|cereal|crumpet|potato", lower):
        p, c, f = 0.15, 0.6, 0.25
    elif re.search(r"nut|avocado|trail|peanut|almond|cheese|butter", lower):
        p, c, f = 0.15, 0.25, 0.6
    return round(cal * p / 4), round(cal * c / 4), round(cal * f / 9)


def fill_incomplete(rows: list[dict]) -> int:
    incomplete = [
        i
        for i, r in enumerate(rows)
        if (r.get("Fitness Goal") or "").strip()
        and (r.get("BMI Category") or "").strip()
        and not (r.get("Dietary Preference") or "").strip()
    ]
    for n, i in enumerate(incomplete):
        r = rows[i]
        prof = PROFILES[n % len(PROFILES)]
        height = float(prof["Height"])
        weight = float(prof["Weight"])
        bmi = calc_bmi(weight, height)
        r.update(
            {
                "Age": prof["Age"],
                "Gender": prof["Gender"],
                "Height": prof["Height"],
                "Weight": prof["Weight"],
                "Activity Level": prof["Activity"],
                "Fitness Goal": "Muscle Gain",
                "Dietary Preference": "Omnivore",
                "Daily Calorie Target": prof["kcal"],
                "Protein": prof["p"],
                "Carbohydrates": prof["c"],
                "Fat": prof["f"],
                "BMI": str(bmi) if bmi is not None else "",
                "BMI Category": "Underweight",
            }
        )
        for meal_type, col in [
            ("breakfast", "Breakfast Suggestion"),
            ("lunch", "Lunch Suggestion"),
            ("dinner", "Dinner Suggestion"),
            ("snack", "Snack Suggestion"),
        ]:
            raw = r.get(col) or ""
            if meal_type == "lunch" and not str(raw).strip():
                name = "Fortified soup with toast, bread or cheese on toast"
            else:
                name = clean_meal_name(str(raw), meal_type)
            recipe = MEAL_RECIPES.get(name) or {
                "cal": 350,
                "i": [f"1 serving {name}", "Include protein, carbs, and healthy fats"],
                "d": [f"Prepare {name} with fresh ingredients.", "Serve a balanced portion."],
                "img": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
            }
            prefix = meal_type.capitalize()
            r[col] = name
            r[f"{prefix} Ingredients"] = " | ".join(recipe["i"])
            r[f"{prefix} Directions"] = " | ".join(recipe["d"])
            r[f"{prefix} Calories"] = str(recipe["cal"])
            r[f"{prefix} Image URL"] = recipe["img"]
            r[f"{prefix} Recipe Source"] = "template_filled"
        r["Meals Total Calories"] = str(
            sum(int(float(r.get(f"{p} Calories") or 0)) for p in ("Breakfast", "Lunch", "Dinner", "Snack"))
        )
        rows[i] = r
    return len(incomplete)


def rebuild_dataset(rows: list[dict]) -> dict:
    meals: list[dict] = []
    meal_id_by_name: dict[str, int] = {}
    index: dict[str, list[dict]] = defaultdict(list)

    def ensure_meal(name: str, ingredients: list[str], directions: list[str], calories, image: str) -> int:
        key = name.strip().lower()
        if key in meal_id_by_name:
            return meal_id_by_name[key]
        mid = len(meals)
        cal = int(float(calories or 0))
        p, c, f = estimate_macros(name, cal)
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
        # Strict: all three personalization conditions required (+ activity for indexing)
        if not (goal and diet and bmi in ("Underweight", "Normal", "Overweight", "Obese") and act):
            skipped += 1
            continue
        b_name = (r.get("Breakfast Suggestion") or "").strip()
        l_name = (r.get("Lunch Suggestion") or "").strip()
        d_name = (r.get("Dinner Suggestion") or "").strip()
        s_name = (r.get("Snack Suggestion") or "").strip()
        if not (b_name and l_name and d_name and s_name):
            skipped += 1
            continue
        bid = ensure_meal(
            b_name,
            split_pipe(r.get("Breakfast Ingredients")),
            split_pipe(r.get("Breakfast Directions")),
            r.get("Breakfast Calories"),
            r.get("Breakfast Image URL") or "",
        )
        lid = ensure_meal(
            l_name,
            split_pipe(r.get("Lunch Ingredients")),
            split_pipe(r.get("Lunch Directions")),
            r.get("Lunch Calories"),
            r.get("Lunch Image URL") or "",
        )
        did = ensure_meal(
            d_name,
            split_pipe(r.get("Dinner Ingredients")),
            split_pipe(r.get("Dinner Directions")),
            r.get("Dinner Calories"),
            r.get("Dinner Image URL") or "",
        )
        sid = ensure_meal(
            s_name,
            split_pipe(r.get("Snack Ingredients")),
            split_pipe(r.get("Snack Directions")),
            r.get("Snack Calories"),
            r.get("Snack Image URL") or "",
        )
        kcal = str(int(float(r.get("Daily Calorie Target") or 0)) or 0)
        key = f"{act}|{bmi}|{goal}|{diet}|{kcal}"
        combo = {"b": bid, "l": lid, "di": did, "s": sid}
        if combo not in index[key]:
            index[key].append(combo)
        kept += 1

    print(f"Indexed {kept} complete rows; skipped {skipped}")
    return {"meals": meals, "index": dict(index)}


def main() -> None:
    with SRC_CSV.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = [r for r in reader if (r.get("Fitness Goal") or "").strip() != "Fitness Goal"]

    filled = fill_incomplete(rows)
    print(f"Filled {filled} incomplete rows")

    try:
        with SRC_CSV.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        print(f"Updated {SRC_CSV}")
    except PermissionError:
        with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        print(f"Source CSV locked; wrote {OUT_CSV}")

    payload = rebuild_dataset(rows)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT_JSON}")
    print(f"meals={len(payload['meals'])} index_keys={len(payload['index'])}")
    uw = [k for k in payload["index"] if "Underweight|gain|omnivore" in k]
    print("Underweight+gain+omnivore:", {k: len(payload["index"][k]) for k in uw})


if __name__ == "__main__":
    main()
