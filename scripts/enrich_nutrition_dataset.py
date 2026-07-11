"""
Enrich nutrition_dataset.csv with:
  - BMI / BMI category from Height (cm) + Weight (kg)
  - Per meal (breakfast/lunch/dinner/snack): ingredients, directions,
    calories, and food image URL

Recipe text (ingredients / directions / calories):
  --recipes-from-google -> Gemini + Google Search grounding (uses EXPO_PUBLIC_GEMINI_API_KEY)

Image URLs:
  --images-from-search  -> first result from web image search
    google     (GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX)
    duckduckgo (default free fallback)

Fallbacks if Google recipe lookup fails:
  local recipe library, then keyword templates
"""

from __future__ import annotations

import csv
import json
import re
import ssl
import time
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = Path(r"c:\Users\leezh\Downloads\nutrition_dataset (1).csv")
OUT_DIR = Path(r"c:\Users\leezh\Downloads")
OUT_CSV = OUT_DIR / "nutrition_dataset_enriched_v5_clean.csv"
OUT_JSON = OUT_DIR / "nutrition_dataset_enriched_v5_clean.json"
OUT_MEALS = OUT_DIR / "nutrition_meal_catalog_v5_clean.json"
IMAGE_CACHE = OUT_DIR / "nutrition_food_image_cache.json"
RECIPE_CACHE = OUT_DIR / "nutrition_google_recipe_cache.json"
LOCAL_RECIPES = ROOT / "lib" / "recipeFoodDataset.json"

MEAL_COLS = {
    "breakfast": "Breakfast Suggestion",
    "lunch": "Lunch Suggestion",
    "dinner": "Dinner Suggestion",
    "snack": "Snack Suggestion",
}

STOPWORDS = {
    "with",
    "and",
    "a",
    "an",
    "the",
    "of",
    "on",
    "in",
    "to",
    "for",
    "whole",
    "wheat",
    "brown",
    "mixed",
    "fresh",
}

# Most-specific first. Each key maps to a stable food photo that matches that food.
# AND rules first (all tokens must appear), then OR rules (first matching token wins).
CURATED_AND_IMAGES: list[tuple[tuple[str, ...], str]] = [
    (("apple", "peanut"), "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=800&q=80"),
    (("apple", "almond"), "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=800&q=80"),
    (("banana", "peanut"), "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80"),
    (("banana", "almond"), "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80"),
]

CURATED_FOOD_IMAGES: list[tuple[tuple[str, ...], str]] = [
    (("trail mix",), "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/2021-05-15_04_45_03_A_sample_of_a_homemade_trail_mix_in_the_Franklin_Farm_section_of_Oak_Hill%2C_Fairfax_County%2C_Virginia.jpg/800px-2021-05-15_04_45_03_A_sample_of_a_homemade_trail_mix_in_the_Franklin_Farm_section_of_Oak_Hill%2C_Fairfax_County%2C_Virginia.jpg"),
    (("protein shake", "protein smoothie"), "https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=800&q=80"),
    (("protein bar",), "https://images.unsplash.com/photo-1622484212850-eb596d769edc?auto=format&fit=crop&w=800&q=80"),
    (("tofu scramble",), "https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?auto=format&fit=crop&w=800&q=80"),
    (("avocado toast",), "https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?auto=format&fit=crop&w=800&q=80"),
    (("stir-fry", "stir fry"), "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80"),
    (("oatmeal", "oats"), "https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Oatmeal.jpg/800px-Oatmeal.jpg"),
    (("greek yogurt", "yogurt"), "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80"),
    (("granola",), "https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Granola%2C_yogurt%2C_fruit._%281%29.jpg/800px-Granola%2C_yogurt%2C_fruit._%281%29.jpg"),
    (("salmon",), "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80"),
    (("tuna",), "https://images.unsplash.com/photo-1625944230945-1b987ce6f4e6?auto=format&fit=crop&w=800&q=80"),
    (("lentil",), "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/EgFoodLentilSoup.jpg/800px-EgFoodLentilSoup.jpg"),
    (("quinoa",), "https://images.unsplash.com/photo-1505576399279-5650cc05af8d?auto=format&fit=crop&w=800&q=80"),
    (("chickpea", "hummus"), "https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=800&q=80"),
    (("black bean", "bean burger"), "https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=800&q=80"),
    (("tofu",), "https://images.unsplash.com/photo-1600289031464-74d1b75648f2?auto=format&fit=crop&w=800&q=80"),
    (("chicken salad",), "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Flickr_sa_ku_ra_10556400--Chicken_Salad_Sandwich.jpg/800px-Flickr_sa_ku_ra_10556400--Chicken_Salad_Sandwich.jpg"),
    (("turkey",), "https://images.unsplash.com/photo-1574672280600-4accfa5b6f98?auto=format&fit=crop&w=800&q=80"),
    (("chicken",), "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?auto=format&fit=crop&w=800&q=80"),
    (("egg", "eggs"), "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=800&q=80"),
    (("avocado",), "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80"),
    (("apple",), "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=800&q=80"),
    (("banana",), "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Bananavarieties.jpg/800px-Bananavarieties.jpg"),
    (("berries", "berry"), "https://images.unsplash.com/photo-1498557850523-fd3d118b962e?auto=format&fit=crop&w=800&q=80"),
    (("almond",), "https://images.unsplash.com/photo-1508061253366-f7da158b90aa?auto=format&fit=crop&w=800&q=80"),
    (("peanut",), "https://images.unsplash.com/photo-1606923829579-0cb981a83e2e?auto=format&fit=crop&w=800&q=80"),
    (("nuts", "nut mix", "fruit and nut", "fruit and nuts"), "https://images.unsplash.com/photo-1599599810769-bec8f414d53a?auto=format&fit=crop&w=800&q=80"),
    (("smoothie", "shake"), "https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=800&q=80"),
    (("burrito",), "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=800&q=80"),
    (("burger",), "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80"),
    (("sandwich",), "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80"),
    (("toast",), "https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?auto=format&fit=crop&w=800&q=80"),
    (("chili",), "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=800&q=80"),
    (("curry",), "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/TibetanFood.JPG/800px-TibetanFood.JPG"),
    (("soup", "stew"), "https://images.unsplash.com/photo-1547592166-23acba133eaa?auto=format&fit=crop&w=800&q=80"),
    (("pasta",), "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&q=80"),
    (("rice",), "https://images.unsplash.com/photo-1516684669134-de6f7c473a2a?auto=format&fit=crop&w=800&q=80"),
    (("potato", "sweet potato"), "https://images.unsplash.com/photo-1518977676601-b53f2455541f?auto=format&fit=crop&w=800&q=80"),
    (("salad", "greens"), "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80"),
    (("bean",), "https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=800&q=80"),
    (("fruit",), "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=800&q=80"),
    (("vegetable", "vegetables", "veggie"), "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80"),
]

DESSERT_WORDS = (
    "cookie",
    "muffin",
    "pie",
    "cake",
    "pudding",
    "crisp",
    "doughnut",
    "donut",
    "candy",
    "brownie",
    "ice cream",
    "cheesecake",
    "cobbler",
)

PRIMARY_FOOD_TOKENS = (
    "oatmeal",
    "granola",
    "yogurt",
    "salmon",
    "tuna",
    "tofu",
    "lentil",
    "quinoa",
    "avocado",
    "chicken",
    "turkey",
    "beef",
    "egg",
    "eggs",
    "apple",
    "banana",
    "berries",
    "almond",
    "peanut",
    "hummus",
    "chickpea",
    "sandwich",
    "burger",
    "burrito",
    "salad",
    "soup",
    "stew",
    "chili",
    "curry",
    "smoothie",
    "shake",
    "rice",
    "pasta",
    "toast",
    "potato",
    "nuts",
)


def calc_bmi(weight_kg: float, height_cm: float) -> float | None:
    if not weight_kg or not height_cm:
        return None
    h = height_cm / 100.0
    if h <= 0:
        return None
    return round(weight_kg / (h * h), 1)


def bmi_category(bmi: float | None) -> str:
    if bmi is None:
        return ""
    if bmi < 18.5:
        return "Underweight"
    if bmi < 25:
        return "Normal"
    if bmi < 30:
        return "Overweight"
    return "Obese"


def tokenize(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    return {w for w in words if len(w) > 2 and w not in STOPWORDS}


def similarity(a: str, b: str) -> float:
    a_l, b_l = a.lower().strip(), b.lower().strip()
    if not a_l or not b_l:
        return 0.0
    seq = SequenceMatcher(None, a_l, b_l).ratio()
    ta, tb = tokenize(a_l), tokenize(b_l)
    if not ta or not tb:
        return seq
    jaccard = len(ta & tb) / len(ta | tb)
    return 0.45 * seq + 0.55 * jaccard


def load_local_recipes() -> list[dict]:
    if not LOCAL_RECIPES.exists():
        return []
    return json.loads(LOCAL_RECIPES.read_text(encoding="utf-8"))


def contains_food_token(text: str, token: str) -> bool:
    return re.search(rf"(?<![a-z]){re.escape(token)}(?![a-z])", text.lower()) is not None


def primary_foods_in_name(meal_name: str) -> list[str]:
    lower = meal_name.lower()
    found = [token for token in PRIMARY_FOOD_TOKENS if contains_food_token(lower, token)]
    # longest / most specific first
    return sorted(found, key=len, reverse=True)


def curated_image_for_meal(meal_name: str) -> tuple[str, str]:
    lower = meal_name.lower()
    for keys, url in CURATED_AND_IMAGES:
        if all(k in lower for k in keys):
            return url, "+".join(keys)
    for keys, url in CURATED_FOOD_IMAGES:
        matched = next((k for k in keys if k in lower), None)
        if matched:
            return url, matched
    return (
        "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
        "healthy-meal",
    )


def best_local_match(meal_name: str, recipes: list[dict]) -> tuple[dict | None, float]:
    best = None
    best_score = 0.0
    meal_foods = set(primary_foods_in_name(meal_name))
    meal_is_dessert = any(word in meal_name.lower() for word in DESSERT_WORDS)

    for recipe in recipes:
        recipe_name = recipe.get("name", "")
        score = similarity(meal_name, recipe_name)
        if meal_foods:
            recipe_foods = set(primary_foods_in_name(recipe_name))
            if not (meal_foods & recipe_foods):
                continue
            score += 0.12 * len(meal_foods & recipe_foods)
        if not meal_is_dessert and any(word in recipe_name.lower() for word in DESSERT_WORDS):
            continue
        if score > best_score:
            best_score = score
            best = recipe
    return best, best_score


WEAK_IMAGE_TOKENS = {
    "nuts",
    "fruit",
    "rice",
    "bread",
    "toast",
    "greens",
    "salad",
    "vegetable",
    "vegetables",
    "potato",
    "bean",
    "pasta",
}


def main_food_token(meal_name: str) -> str | None:
    foods = primary_foods_in_name(meal_name)
    strong = [f for f in foods if f not in WEAK_IMAGE_TOKENS]
    if strong:
        return strong[0]
    return foods[0] if foods else None


def best_local_image(meal_name: str, recipes: list[dict]) -> tuple[str, str, float]:
    """Return (imageUrl, matchedRecipeName, score) only for strong food-aligned matches."""
    main_food = main_food_token(meal_name)
    if not main_food:
        return "", "", 0.0

    meal_lower = meal_name.lower()
    meal_is_dessert = any(word in meal_lower for word in DESSERT_WORDS)
    best_url = ""
    best_name = ""
    best_score = 0.0

    for recipe in recipes:
        recipe_name = recipe.get("name") or ""
        image = recipe.get("imageUrl") or ""
        if not image or not contains_food_token(recipe_name, main_food):
            continue
        recipe_lower = recipe_name.lower()
        if not meal_is_dessert and any(word in recipe_lower for word in DESSERT_WORDS):
            continue
        # Avoid apple-butter / dessert-spread mismatches for nut-butter snacks
        if "butter" in meal_lower:
            if "apple butter" in recipe_lower and "almond" not in recipe_lower and "peanut" not in recipe_lower:
                continue
            if "almond" in meal_lower and "almond" not in recipe_lower:
                continue
            if "peanut" in meal_lower and "peanut" not in recipe_lower:
                continue
        score = similarity(meal_name, recipe_name)
        # Boost when recipe is clearly about the same main food
        if recipe_lower.startswith(main_food) or f" {main_food}" in recipe_lower:
            score += 0.15
        if score > best_score:
            best_score = score
            best_url = image
            best_name = recipe_name

    # Require a strong match so we don't attach unrelated recipe photos
    if best_score >= 0.72 and best_url:
        return best_url, best_name, best_score
    return "", "", 0.0


def resolve_food_image(
    meal_name: str,
    recipes: list[dict],
    image_searcher: "FoodImageSearcher | None" = None,
) -> tuple[str, str, float]:
    # Prefer live image-search first result when enabled (Google CSE or DuckDuckGo).
    if image_searcher is not None:
        searched = image_searcher.first_image_url(meal_name)
        if searched:
            return searched, f"search:{image_searcher.provider}", 1.0

    lower = meal_name.lower()
    for keys, url in CURATED_AND_IMAGES:
        if all(k in lower for k in keys):
            return url, f"curated:{'+'.join(keys)}", 1.0

    local_url, local_name, local_score = best_local_image(meal_name, recipes)
    if local_url:
        return local_url, f"local:{local_name}", local_score
    curated_url, curated_key = curated_image_for_meal(meal_name)
    return curated_url, f"curated:{curated_key}", 1.0


class FoodImageSearcher:
    """
    Resolve a meal name to the first image URL from web image search.

    Providers:
      - google: Google Custom Search JSON API (needs GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX)
      - duckduckgo: free image search, first result (same idea as Google Images #1)
    """

    def __init__(
        self,
        provider: str = "auto",
        cache_path: Path = IMAGE_CACHE,
        ctx: ssl.SSLContext | None = None,
    ) -> None:
        self.ctx = ctx or ssl._create_unverified_context()
        self.cache_path = cache_path
        self.cache: dict[str, str] = {}
        if cache_path.exists():
            try:
                self.cache = json.loads(cache_path.read_text(encoding="utf-8"))
            except Exception:
                self.cache = {}

        google_key = (
            __import__("os").environ.get("GOOGLE_CSE_API_KEY", "").strip()
            or __import__("os").environ.get("GOOGLE_API_KEY", "").strip()
        )
        google_cx = __import__("os").environ.get("GOOGLE_CSE_CX", "").strip()

        if provider == "google" or (provider == "auto" and google_key and google_cx):
            if not google_key or not google_cx:
                raise SystemExit(
                    "Google image search needs env vars GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX.\n"
                    "Create them at https://developers.google.com/custom-search/v1/overview"
                )
            self.provider = "google"
            self.google_key = google_key
            self.google_cx = google_cx
        else:
            self.provider = "duckduckgo"
            self.google_key = ""
            self.google_cx = ""

        self._vqd_cache: dict[str, str] = {}
        print(f"Image search provider: {self.provider}")

    def save_cache(self) -> None:
        self.cache_path.write_text(json.dumps(self.cache, indent=2, ensure_ascii=False), encoding="utf-8")

    def first_image_url(self, meal_name: str) -> str | None:
        key = meal_name.strip().lower()
        if not key:
            return None
        if key in self.cache and self.cache[key]:
            return self.cache[key]

        query = f"{meal_name.strip()} food"
        url = None
        last_err: Exception | None = None
        for attempt in range(2):
            try:
                if self.provider == "google":
                    url = self._google_first_image(query)
                else:
                    url = self._duckduckgo_first_image(query)
                break
            except Exception as exc:
                last_err = exc
                time.sleep(0.8)
        if url is None and last_err is not None:
            print(f"  image search failed for '{meal_name}': {last_err}")

        if url:
            self.cache[key] = url
            # Persist often so interrupted runs keep progress
            if len(self.cache) % 10 == 0:
                self.save_cache()
            time.sleep(0.35 if self.provider == "duckduckgo" else 0.2)
        return url

    def _google_first_image(self, query: str) -> str | None:
        params = urllib.parse.urlencode(
            {
                "key": self.google_key,
                "cx": self.google_cx,
                "q": query,
                "searchType": "image",
                "num": 1,
                "safe": "active",
            }
        )
        api = f"https://www.googleapis.com/customsearch/v1?{params}"
        req = urllib.request.Request(api, headers={"User-Agent": "nutrition-enrich/1.0"})
        with urllib.request.urlopen(req, timeout=12, context=self.ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        items = data.get("items") or []
        if not items:
            return None
        # Prefer full image link; fall back to thumbnail
        link = items[0].get("link") or ""
        thumb = ((items[0].get("image") or {}).get("thumbnailLink")) or ""
        return link or thumb or None

    def _duckduckgo_first_image(self, query: str) -> str | None:
        vqd = self._duckduckgo_vqd(query)
        if not vqd:
            return None
        api = "https://duckduckgo.com/i.js?" + urllib.parse.urlencode(
            {
                "l": "us-en",
                "o": "json",
                "q": query,
                "vqd": vqd,
                "f": ",,,",
                "p": "1",
            }
        )
        req = urllib.request.Request(
            api,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://duckduckgo.com/",
            },
        )
        with urllib.request.urlopen(req, timeout=12, context=self.ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        results = data.get("results") or []
        if not results:
            return None
        return results[0].get("image") or results[0].get("thumbnail") or None

    def _duckduckgo_vqd(self, query: str) -> str | None:
        if query in self._vqd_cache:
            return self._vqd_cache[query]
        page = "https://duckduckgo.com/?" + urllib.parse.urlencode({"q": query})
        req = urllib.request.Request(page, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=12, context=self.ctx) as resp:
            html = resp.read().decode("utf-8", "ignore")
        match = re.search(r"vqd=([\d-]+)&", html) or re.search(r'vqd="([^"]+)"', html)
        if not match:
            return None
        vqd = match.group(1)
        self._vqd_cache[query] = vqd
        return vqd


def load_dotenv() -> None:
    import os

    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


class GoogleRecipeSearcher:
    """
    Look up ingredients, directions, and calories via Gemini + Google Search grounding.
    Results are cached by meal name so interrupted runs can resume.
    """

    def __init__(self, ctx: ssl.SSLContext | None = None, model: str = "gemini-2.5-flash") -> None:
        import os

        load_dotenv()
        self.api_key = (os.environ.get("EXPO_PUBLIC_GEMINI_API_KEY") or "").strip()
        if not self.api_key or "your_" in self.api_key.lower():
            raise SystemExit(
                "Google recipe lookup needs EXPO_PUBLIC_GEMINI_API_KEY in .env "
                "(https://aistudio.google.com/apikey)"
            )
        self.model = model
        self.ctx = ctx or ssl._create_unverified_context()
        self.cache_path = RECIPE_CACHE
        self.cache: dict[str, dict] = {}
        if self.cache_path.exists():
            try:
                self.cache = json.loads(self.cache_path.read_text(encoding="utf-8"))
            except Exception:
                self.cache = {}
        print(f"Google recipe search via Gemini ({self.model}), cache={len(self.cache)}")

    def save_cache(self) -> None:
        self.cache_path.write_text(
            json.dumps(self.cache, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    def lookup(self, meal_name: str) -> dict | None:
        key = meal_name.strip().lower()
        if not key:
            return None
        cached = self.cache.get(key)
        if cached and cached.get("ingredients") and cached.get("directions"):
            return cached

        prompt = f"""Search Google for a real recipe for this meal: "{meal_name}".

Return ONLY valid JSON (no markdown fences) with these keys:
{{
  "ingredients": ["ingredient 1", "ingredient 2"],
  "directions": ["step 1", "step 2"],
  "calories": 123,
  "servingSize": "1 serving",
  "sourceTitle": "recipe or page title",
  "sourceUrl": "https://..."
}}

Rules:
- Use Google Search results for a real recipe that matches the meal.
- Calories must be for one serving (integer).
- Directions must be cooking steps.
- If exact match is unavailable, use the closest real recipe and keep the meal intent.
"""
        body = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {"temperature": 0.2},
        }
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        raw_text = ""
        for attempt in range(2):
            try:
                with urllib.request.urlopen(req, timeout=75, context=self.ctx) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                parts = (
                    ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
                )
                raw_text = "\n".join(
                    str(p.get("text") or "") for p in parts if not p.get("thought")
                ).strip()
                if raw_text:
                    break
            except Exception as exc:
                print(f"  google recipe failed for '{meal_name}' (try {attempt + 1}): {exc}")
                time.sleep(1.5)

        parsed = self._parse_recipe_json(raw_text)
        if not parsed:
            return None

        result = {
            "ingredients": parsed.get("ingredients") or [],
            "directions": parsed.get("directions") or [],
            "calories": int(parsed.get("calories") or 0),
            "servingSize": parsed.get("servingSize") or "1 serving",
            "sourceTitle": parsed.get("sourceTitle") or "",
            "sourceUrl": parsed.get("sourceUrl") or "",
            "source": "google_search",
        }
        if not result["ingredients"] or not result["directions"]:
            return None
        if result["calories"] <= 0:
            result["calories"] = estimate_calories(meal_name, "lunch")

        self.cache[key] = result
        if len(self.cache) % 5 == 0:
            self.save_cache()
        time.sleep(0.4)
        return result

    @staticmethod
    def _parse_recipe_json(text: str) -> dict | None:
        if not text:
            return None
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            data = json.loads(cleaned)
            if isinstance(data, dict):
                return data
        except Exception:
            pass
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else None
        except Exception:
            return None


class WebRecipeSearcher:
    """
    Look up ingredients, directions, and calories WITHOUT Gemini.
    Sources:
      1) Local recipe library (recipeFoodDataset.json) with food-token matching
      2) TheMealDB free API (themealdb.com)
    """

    def __init__(self, recipes: list[dict], ctx: ssl.SSLContext | None = None) -> None:
        self.recipes = recipes
        self.ctx = ctx or ssl._create_unverified_context()
        self.cache_path = OUT_DIR / "nutrition_web_recipe_cache.json"
        self.cache: dict[str, dict] = {}
        if self.cache_path.exists():
            try:
                self.cache = json.loads(self.cache_path.read_text(encoding="utf-8"))
            except Exception:
                self.cache = {}
        self._mealdb_cache: dict[str, dict | None] = {}
        print(f"Web recipe search (TheMealDB + local), cache={len(self.cache)}")

    def save_cache(self) -> None:
        self.cache_path.write_text(
            json.dumps(self.cache, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    def lookup(self, meal_name: str) -> dict | None:
        key = meal_name.strip().lower()
        if not key:
            return None
        cached = self.cache.get(key)
        if cached and cached.get("ingredients") and cached.get("directions"):
            return cached

        local = self._from_local(meal_name)
        if local:
            self.cache[key] = local
            if len(self.cache) % 20 == 0:
                self.save_cache()
            return local

        remote = self._from_themealdb(meal_name)
        if remote:
            self.cache[key] = remote
            if len(self.cache) % 20 == 0:
                self.save_cache()
            time.sleep(0.15)
            return remote
        return None

    def _from_local(self, meal_name: str) -> dict | None:
        main_food = main_food_token(meal_name)
        best = None
        best_score = 0.0
        meal_is_dessert = any(w in meal_name.lower() for w in DESSERT_WORDS)

        for recipe in self.recipes:
            recipe_name = recipe.get("name") or ""
            if main_food and not contains_food_token(recipe_name, main_food):
                continue
            if not meal_is_dessert and any(w in recipe_name.lower() for w in DESSERT_WORDS):
                continue
            score = similarity(meal_name, recipe_name)
            if main_food and contains_food_token(recipe_name, main_food):
                score += 0.12
            if score > best_score:
                best_score = score
                best = recipe

        # Accept moderate matches when the main food aligns
        threshold = 0.42 if main_food else 0.58
        if not best or best_score < threshold:
            return None
        if not (best.get("ingredients") and best.get("directions")):
            return None

        nutrition = best.get("nutrition") or {}
        return {
            "ingredients": best.get("ingredients") or [],
            "directions": best.get("directions") or [],
            "calories": int(nutrition.get("calories") or estimate_calories(meal_name, "lunch")),
            "servingSize": best.get("servingSize") or "1 serving",
            "sourceTitle": best.get("name") or "",
            "sourceUrl": best.get("imageUrl") or "",
            "source": "local_recipe",
            "matchScore": round(best_score, 3),
        }

    def _from_themealdb(self, meal_name: str) -> dict | None:
        main_food = main_food_token(meal_name)
        tokens = [
            t
            for t in re.findall(r"[a-zA-Z]+", meal_name)
            if t.lower() not in STOPWORDS and len(t) > 2
        ]
        search_terms: list[str] = []
        if main_food:
            search_terms.append(main_food)
        if tokens:
            search_terms.append(" ".join(tokens[:2]))
            if tokens[0].lower() != (main_food or ""):
                search_terms.append(tokens[0])

        # de-dupe preserve order
        seen: set[str] = set()
        ordered_terms: list[str] = []
        for term in search_terms:
            low = term.lower()
            if low not in seen:
                seen.add(low)
                ordered_terms.append(term)

        best_meal = None
        best_score = 0.0
        for term in ordered_terms:
            cache_key = term.lower()
            if cache_key in self._mealdb_cache:
                meals = self._mealdb_cache[cache_key]
            else:
                meals = self._mealdb_query(term)
                self._mealdb_cache[cache_key] = meals
            if not meals:
                continue
            for meal in meals:
                title = meal.get("strMeal") or ""
                # Must share the main food token when we have one
                if main_food and not contains_food_token(title, main_food):
                    continue
                score = similarity(meal_name, title)
                if score > best_score:
                    best_score = score
                    best_meal = meal

        if not best_meal or best_score < 0.42:
            return None

        ingredients = []
        for i in range(1, 21):
            ing = (best_meal.get(f"strIngredient{i}") or "").strip()
            measure = (best_meal.get(f"strMeasure{i}") or "").strip()
            if not ing:
                continue
            ingredients.append(f"{measure} {ing}".strip() if measure else ing)

        directions = [
            step.strip()
            for step in re.split(r"\r?\n+", best_meal.get("strInstructions") or "")
            if step.strip()
        ]
        if len(directions) == 1 and ". " in directions[0]:
            directions = [s.strip() + "." for s in directions[0].split(". ") if s.strip()]

        if not ingredients or not directions:
            return None

        return {
            "ingredients": ingredients,
            "directions": directions,
            "calories": estimate_calories(meal_name, "lunch"),
            "servingSize": "1 serving",
            "sourceTitle": best_meal.get("strMeal") or "",
            "sourceUrl": best_meal.get("strSource") or best_meal.get("strMealThumb") or "",
            "source": "themealdb",
            "matchScore": round(best_score, 3),
        }

    def _mealdb_query(self, term: str) -> list[dict]:
        url = "https://www.themealdb.com/api/json/v1/1/search.php?s=" + urllib.parse.quote(term)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "nutrition-enrich/1.0"})
            with urllib.request.urlopen(req, timeout=12, context=self.ctx) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return data.get("meals") or []
        except Exception:
            return []


def mealdb_search(query: str, ctx: ssl.SSLContext, cache: dict) -> dict | None:
    key = query.strip().lower()
    if key in cache:
        return cache[key]
    # Prefer shorter food-focused queries
    tokens = [t for t in re.findall(r"[a-zA-Z]+", query) if t.lower() not in STOPWORDS]
    search_terms = []
    if tokens:
        search_terms.append(" ".join(tokens[:3]))
        search_terms.append(tokens[0])
    search_terms.append(query)

    for term in search_terms:
        url = "https://www.themealdb.com/api/json/v1/1/search.php?s=" + urllib.parse.quote(term)
        try:
            with urllib.request.urlopen(url, timeout=12, context=ctx) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            meals = data.get("meals") or []
            if not meals:
                continue
            # pick closest meal name
            ranked = sorted(
                meals,
                key=lambda m: similarity(query, m.get("strMeal") or ""),
                reverse=True,
            )
            meal = ranked[0]
            if similarity(query, meal.get("strMeal") or "") < 0.28:
                continue
            ingredients = []
            for i in range(1, 21):
                ing = (meal.get(f"strIngredient{i}") or "").strip()
                measure = (meal.get(f"strMeasure{i}") or "").strip()
                if not ing:
                    continue
                ingredients.append(f"{measure} {ing}".strip() if measure else ing)
            directions = [
                step.strip()
                for step in re.split(r"\r?\n+", meal.get("strInstructions") or "")
                if step.strip()
            ]
            if len(directions) == 1 and ". " in directions[0]:
                directions = [s.strip() + "." for s in directions[0].split(". ") if s.strip()]
            result = {
                "name": meal.get("strMeal") or query,
                "ingredients": ingredients,
                "directions": directions,
                "imageUrl": meal.get("strMealThumb") or "",
                "calories": None,
                "source": "themealdb",
            }
            cache[key] = result
            time.sleep(0.12)
            return result
        except Exception:
            continue
    cache[key] = None
    return None


def estimate_calories(meal_name: str, meal_type: str) -> int:
    name = meal_name.lower()
    base = {"breakfast": 350, "lunch": 450, "dinner": 500, "snack": 180}.get(meal_type, 350)

    bumps = [
        (("salmon", "tuna", "chicken", "turkey", "beef", "steak"), 80),
        (("rice", "pasta", "bread", "bun", "toast", "burrito", "sandwich"), 70),
        (("oatmeal", "granola", "yogurt"), 40),
        (("nuts", "peanut", "almond", "butter", "trail mix"), 90),
        (("chili", "curry", "stew", "soup"), 40),
        (("shake", "smoothie", "protein bar", "protein shake"), 50),
        (("salad",), -40),
        (("fruit", "apple", "banana", "berries"), -20),
        (("tofu", "lentil", "bean", "veggie", "vegetable"), 10),
    ]
    calories = base
    for keys, delta in bumps:
        if any(k in name for k in keys):
            calories += delta
    return max(120, min(900, calories))


def template_recipe(meal_name: str, meal_type: str) -> dict:
    name = meal_name.strip()
    lower = name.lower()
    calories = estimate_calories(name, meal_type)

    if "oatmeal" in lower:
        ingredients = [
            "1/2 cup rolled oats",
            "1 cup water or milk",
            "1/2 cup berries or chopped fruit",
            "1 tbsp nuts or nut butter",
            "Pinch of cinnamon (optional)",
        ]
        directions = [
            "Bring water or milk to a simmer in a small pot.",
            "Stir in oats and cook 3-5 minutes until creamy.",
            "Top with fruit and nuts. Serve warm.",
        ]
    elif "yogurt" in lower:
        ingredients = [
            "1 cup Greek yogurt",
            "1/2 cup fruit or berries",
            "2 tbsp granola (optional)",
            "1 tsp honey (optional)",
        ]
        directions = [
            "Spoon yogurt into a bowl.",
            "Add fruit and granola on top.",
            "Drizzle honey if desired and serve chilled.",
        ]
    elif "tofu scramble" in lower:
        ingredients = [
            "150 g firm tofu, crumbled",
            "1 cup mixed vegetables (pepper, spinach, onion)",
            "1 tsp olive oil",
            "1/4 tsp turmeric, salt, and pepper",
            "1 slice whole-wheat toast (optional)",
        ]
        directions = [
            "Heat oil in a nonstick pan over medium heat.",
            "Saute vegetables 2-3 minutes.",
            "Add crumbled tofu and spices; cook 4-5 minutes.",
            "Serve with toast if desired.",
        ]
    elif "stir-fry" in lower or "stir fry" in lower:
        protein = "chicken" if "chicken" in lower else "tofu" if "tofu" in lower else "mixed protein"
        ingredients = [
            f"120 g {protein}",
            "2 cups mixed vegetables",
            "1 tsp oil",
            "1 tbsp soy sauce",
            "1 cup cooked brown rice (optional)",
        ]
        directions = [
            "Heat oil in a wok or skillet over medium-high heat.",
            f"Cook {protein} until nearly done, then add vegetables.",
            "Add soy sauce and stir-fry 3-5 minutes.",
            "Serve over brown rice if included.",
        ]
    elif "salad" in lower:
        ingredients = [
            "2 cups mixed greens",
            "120 g protein (chicken, tuna, tofu, or beans)",
            "1/2 cup chopped vegetables",
            "1 tbsp olive oil + lemon or vinegar",
            "Salt and pepper",
        ]
        directions = [
            "Add greens and chopped vegetables to a bowl.",
            "Top with protein.",
            "Dress with oil and lemon/vinegar. Toss and serve.",
        ]
    elif "soup" in lower or "stew" in lower or "chili" in lower or "curry" in lower:
        ingredients = [
            "1 cup cooked lentils, beans, or protein",
            "1.5 cups vegetables",
            "1.5 cups broth or sauce base",
            "Spices to taste",
            "1/2-1 cup cooked brown rice or bread (optional)",
        ]
        directions = [
            "Saute aromatics and vegetables in a pot.",
            "Add lentils/beans/protein, broth, and spices.",
            "Simmer 15-25 minutes until thickened and tender.",
            "Serve with rice or bread if listed.",
        ]
    elif "salmon" in lower:
        ingredients = [
            "150 g salmon fillet",
            "2 cups roasted vegetables",
            "1 tsp olive oil",
            "Lemon, salt, and pepper",
        ]
        directions = [
            "Preheat oven to 200 C / 400 F.",
            "Season salmon and vegetables with oil, salt, and pepper.",
            "Roast 12-15 minutes until salmon flakes easily.",
            "Finish with lemon and serve.",
        ]
    elif any(x in lower for x in ("trail mix", "fruit and nut", "fruit and nuts")):
        ingredients = [
            "2 tbsp unsalted nuts",
            "1 tbsp seeds (optional)",
            "2 tbsp dried fruit",
            "Optional dark chocolate chips (small handful)",
        ]
        directions = [
            "Combine nuts, seeds, and dried fruit in a small container.",
            "Portion about 1/4 cup and enjoy as a snack.",
        ]
    elif "apple" in lower and ("butter" in lower or "peanut" in lower or "almond" in lower):
        ingredients = [
            "1 medium apple, sliced",
            "1-2 tbsp peanut or almond butter",
        ]
        directions = [
            "Wash and slice the apple.",
            "Serve with nut butter for dipping.",
        ]
    elif "banana" in lower and ("butter" in lower or "peanut" in lower or "almond" in lower):
        ingredients = [
            "1 banana",
            "1-2 tbsp peanut or almond butter",
        ]
        directions = [
            "Peel and slice the banana.",
            "Spread or dip with nut butter and serve.",
        ]
    elif "protein shake" in lower or "smoothie" in lower:
        ingredients = [
            "1 scoop protein powder",
            "1 cup milk or plant milk",
            "1/2 banana or berries (optional)",
            "Ice cubes",
        ]
        directions = [
            "Add all ingredients to a blender.",
            "Blend until smooth and serve immediately.",
        ]
    elif "protein bar" in lower:
        ingredients = [
            "1 protein bar (check label for allergens)",
        ]
        directions = [
            "Open and enjoy as a convenient snack.",
            "Pair with water or fruit if desired.",
        ]
    elif "sandwich" in lower or "burger" in lower or "burrito" in lower:
        ingredients = [
            "2 slices whole-wheat bread, bun, or 1 tortilla",
            "120 g filling (beans, chicken, tuna, tofu, veggies)",
            "Lettuce/tomato and light sauce as desired",
        ]
        directions = [
            "Prepare filling and warm if needed.",
            "Assemble on bread/bun/tortilla with vegetables.",
            "Serve immediately.",
        ]
    else:
        main = name
        ingredients = [
            f"1 serving {main}",
            "Include a protein, fiber-rich carb, and vegetables when possible",
            "Use minimal added oil/sugar",
        ]
        directions = [
            f"Prepare {main} using fresh ingredients.",
            "Cook protein thoroughly and keep vegetables lightly cooked or raw.",
            "Plate a balanced portion and serve.",
        ]

    image_url, image_key = curated_image_for_meal(name)
    return {
        "name": name,
        "ingredients": ingredients,
        "directions": directions,
        "imageUrl": image_url,
        "calories": calories,
        "source": "template",
        "imageSource": f"curated:{image_key}",
    }


def enrich_meal(
    meal_name: str,
    meal_type: str,
    recipes: list[dict],
    mealdb_cache: dict,
    ctx: ssl.SSLContext,
    use_network: bool,
    image_searcher: FoodImageSearcher | None = None,
    recipe_searcher: GoogleRecipeSearcher | WebRecipeSearcher | None = None,
) -> dict:
    name = (meal_name or "").strip()
    if not name:
        return {
            "name": "",
            "ingredients": [],
            "directions": [],
            "imageUrl": "",
            "calories": 0,
            "source": "empty",
            "matchName": "",
            "matchScore": 0,
            "imageSource": "",
        }

    image_url, image_source, _image_score = resolve_food_image(name, recipes, image_searcher)

    # Prefer external/web recipe lookup (Gemini Google Search OR TheMealDB/local web searcher)
    if recipe_searcher is not None:
        found = recipe_searcher.lookup(name)
        if found:
            return {
                "name": name,
                "ingredients": found.get("ingredients") or [],
                "directions": found.get("directions") or [],
                "imageUrl": image_url,
                "calories": int(found.get("calories") or 0),
                "source": found.get("source") or "web_recipe",
                "matchName": found.get("sourceTitle") or "",
                "matchScore": found.get("matchScore") or 1.0,
                "imageSource": image_source,
                "recipeSourceUrl": found.get("sourceUrl") or "",
                "servingSize": found.get("servingSize") or "1 serving",
            }

    local, score = best_local_match(name, recipes)
    if local and score >= 0.72:
        nutrition = local.get("nutrition") or {}
        return {
            "name": name,
            "ingredients": local.get("ingredients") or [],
            "directions": local.get("directions") or [],
            "imageUrl": image_url,
            "calories": int(nutrition.get("calories") or estimate_calories(name, meal_type)),
            "source": "local_recipe",
            "matchName": local.get("name") or "",
            "matchScore": round(score, 3),
            "imageSource": image_source,
        }

    if use_network and recipe_searcher is None:
        remote = mealdb_search(name, ctx, mealdb_cache)
        if remote:
            remote_image = remote.get("imageUrl") or image_url
            if primary_foods_in_name(name) and not (
                set(primary_foods_in_name(name)) & set(primary_foods_in_name(remote.get("name") or ""))
            ):
                remote_image = image_url
            else:
                image_source = f"themealdb:{remote.get('name') or ''}"
            return {
                "name": name,
                "ingredients": remote["ingredients"],
                "directions": remote["directions"],
                "imageUrl": remote_image if image_searcher is None else image_url,
                "calories": estimate_calories(name, meal_type),
                "source": "themealdb",
                "matchName": remote.get("name") or "",
                "matchScore": round(similarity(name, remote.get("name") or ""), 3),
                "imageSource": image_source,
            }

    templ = template_recipe(name, meal_type)
    templ["imageUrl"] = image_url
    templ["imageSource"] = image_source
    templ["matchName"] = local.get("name") if local else ""
    templ["matchScore"] = round(score, 3) if local else 0
    if image_source.startswith("local:"):
        templ["source"] = "template+local_image"
    elif image_source.startswith("search:"):
        templ["source"] = "template+search_image"
    return templ


def ascii_clean_text(text: str) -> str:
    """Replace fancy Unicode with ASCII so Excel (esp. Chinese Windows) won't misread as Chinese."""
    if not text:
        return ""
    replacements = {
        "\u00bd": "1/2",  # ½
        "\u00bc": "1/4",  # ¼
        "\u00be": "3/4",  # ¾
        "\u2153": "1/3",
        "\u2154": "2/3",
        "\u00b0": " degrees ",  # °
        "\u2013": "-",  # en dash
        "\u2014": "-",  # em dash
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u00ba": " degrees ",  # masculine ordinal sometimes used as degree
        "\u00a0": " ",
        "\ufffd": "",
    }
    out = str(text)
    for src, dst in replacements.items():
        out = out.replace(src, dst)
    # Collapse spaces created by degree replacement
    out = re.sub(r"\s+", " ", out).strip()
    # Drop any remaining non-ASCII that could confuse Excel encodings
    out = out.encode("ascii", errors="ignore").decode("ascii")
    return out


def ascii_clean_list(items: list[str]) -> list[str]:
    return [ascii_clean_text(x) for x in items if ascii_clean_text(x)]


def join_list(items: list[str]) -> str:
    return " | ".join(ascii_clean_text(str(x)).replace("\n", " ").strip() for x in items if str(x).strip())


def sanitize_recipe_fields(detail: dict) -> dict:
    cleaned = dict(detail)
    cleaned["name"] = ascii_clean_text(str(detail.get("name") or ""))
    cleaned["matchName"] = ascii_clean_text(str(detail.get("matchName") or ""))
    cleaned["ingredients"] = ascii_clean_list(detail.get("ingredients") or [])
    cleaned["directions"] = ascii_clean_list(detail.get("directions") or [])
    cleaned["servingSize"] = ascii_clean_text(str(detail.get("servingSize") or ""))
    cleaned["recipeSourceUrl"] = str(detail.get("recipeSourceUrl") or detail.get("sourceUrl") or "")
    return cleaned


def main() -> None:
    import argparse
    import os

    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--no-network", action="store_true", help="Skip TheMealDB lookups")
    parser.add_argument(
        "--images-from-search",
        action="store_true",
        help="Set each meal image to the first result from web image search",
    )
    parser.add_argument(
        "--image-provider",
        choices=["auto", "google", "duckduckgo"],
        default="auto",
        help="Image search provider (google needs GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX)",
    )
    parser.add_argument(
        "--recipes-from-google",
        action="store_true",
        help="(Optional) Fetch recipes via Gemini + Google Search grounding (uses Gemini key)",
    )
    parser.add_argument(
        "--recipes-from-web",
        action="store_true",
        help="Fetch ingredients/directions/calories from TheMealDB + local recipes (NO Gemini key)",
    )
    args = parser.parse_args()

    input_path: Path = args.input
    if not input_path.exists():
        raise SystemExit(f"Input not found: {input_path}")

    load_dotenv()

    recipes = load_local_recipes()
    print(f"Loaded {len(recipes)} local recipes")

    with input_path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    rows = [
        row
        for row in rows
        if (row.get("Height") or "").strip().lower() not in {"", "height"}
        and (row.get("Weight") or "").strip().lower() not in {"", "weight"}
    ]
    print(f"Loaded {len(rows)} nutrition rows")

    unique_meals: dict[tuple[str, str], str] = {}
    for row in rows:
        for meal_type, col in MEAL_COLS.items():
            name = (row.get(col) or "").strip()
            if name:
                unique_meals[(meal_type, name.lower())] = name
    print(f"Unique meal suggestions: {len(unique_meals)}")

    ctx = ssl._create_unverified_context()
    mealdb_cache: dict = {}
    use_network = not args.no_network
    image_searcher = None
    recipe_searcher = None
    if args.images_from_search:
        image_searcher = FoodImageSearcher(provider=args.image_provider, ctx=ctx)
    if args.recipes_from_web:
        recipe_searcher = WebRecipeSearcher(recipes=recipes, ctx=ctx)
    elif args.recipes_from_google:
        recipe_searcher = GoogleRecipeSearcher(ctx=ctx)

    catalog: dict[str, dict] = {}

    for i, ((meal_type, _key), name) in enumerate(sorted(unique_meals.items(), key=lambda x: x[1]), 1):
        detail = enrich_meal(
            name,
            meal_type,
            recipes,
            mealdb_cache,
            ctx,
            use_network,
            image_searcher,
            recipe_searcher,
        )
        catalog_key = f"{meal_type}::{name}"
        catalog[catalog_key] = {"mealType": meal_type, **sanitize_recipe_fields(detail)}
        if i % 10 == 0 or i == len(unique_meals):
            print(f"  enriched meals {i}/{len(unique_meals)}")
            if image_searcher is not None:
                image_searcher.save_cache()
            if recipe_searcher is not None:
                recipe_searcher.save_cache()

    if image_searcher is not None:
        image_searcher.save_cache()
        print(f"Cached {len(image_searcher.cache)} searched image URLs -> {IMAGE_CACHE}")
    if recipe_searcher is not None:
        recipe_searcher.save_cache()
        cache_path = getattr(recipe_searcher, "cache_path", RECIPE_CACHE)
        print(f"Cached {len(recipe_searcher.cache)} recipes -> {cache_path}")

    enriched_rows = []
    for idx, row in enumerate(rows, 1):
        try:
            height = float(row.get("Height") or 0)
            weight = float(row.get("Weight") or 0)
        except ValueError:
            height, weight = 0.0, 0.0
        bmi = calc_bmi(weight, height)

        out = dict(row)
        out["BMI"] = bmi if bmi is not None else ""
        out["BMI Category"] = bmi_category(bmi)

        meals_obj = {}
        for meal_type, col in MEAL_COLS.items():
            name = (row.get(col) or "").strip()
            detail = catalog.get(f"{meal_type}::{name}") or sanitize_recipe_fields(template_recipe(name, meal_type))
            prefix = meal_type.capitalize()
            out[f"{prefix} Ingredients"] = join_list(detail.get("ingredients") or [])
            out[f"{prefix} Directions"] = join_list(detail.get("directions") or [])
            out[f"{prefix} Calories"] = detail.get("calories") or 0
            out[f"{prefix} Image URL"] = detail.get("imageUrl") or ""
            out[f"{prefix} Recipe Source"] = detail.get("source") or ""
            meals_obj[meal_type] = {
                "suggestion": ascii_clean_text(name),
                "ingredients": detail.get("ingredients") or [],
                "directions": detail.get("directions") or [],
                "calories": detail.get("calories") or 0,
                "imageUrl": detail.get("imageUrl") or "",
                "source": detail.get("source") or "",
                "matchName": detail.get("matchName") or "",
                "matchScore": detail.get("matchScore") or 0,
            }

        total_meal_cal = sum(int(meals_obj[m]["calories"] or 0) for m in meals_obj)
        out["Meals Total Calories"] = total_meal_cal
        enriched_rows.append(
            {
                "id": idx,
                "profile": {
                    "age": row.get("Age"),
                    "gender": row.get("Gender"),
                    "heightCm": height,
                    "weightKg": weight,
                    "bmi": bmi,
                    "bmiCategory": bmi_category(bmi),
                    "activityLevel": row.get("Activity Level"),
                    "fitnessGoal": row.get("Fitness Goal"),
                    "dietaryPreference": row.get("Dietary Preference"),
                    "dailyCalorieTarget": row.get("Daily Calorie Target"),
                    "protein": row.get("Protein"),
                    "carbohydrates": row.get("Carbohydrates"),
                    "fat": row.get("Fat"),
                },
                "meals": meals_obj,
                "mealsTotalCalories": total_meal_cal,
            }
        )

    # CSV
    fieldnames = list(rows[0].keys()) + [
        "BMI",
        "BMI Category",
        "Breakfast Ingredients",
        "Breakfast Directions",
        "Breakfast Calories",
        "Breakfast Image URL",
        "Breakfast Recipe Source",
        "Lunch Ingredients",
        "Lunch Directions",
        "Lunch Calories",
        "Lunch Image URL",
        "Lunch Recipe Source",
        "Dinner Ingredients",
        "Dinner Directions",
        "Dinner Calories",
        "Dinner Image URL",
        "Dinner Recipe Source",
        "Snack Ingredients",
        "Snack Directions",
        "Snack Calories",
        "Snack Image URL",
        "Snack Recipe Source",
        "Meals Total Calories",
    ]
    # Rebuild flat CSV rows from out dicts created above
    flat_rows = []
    for idx, row in enumerate(rows):
        try:
            height = float(row.get("Height") or 0)
            weight = float(row.get("Weight") or 0)
        except ValueError:
            height, weight = 0.0, 0.0
        bmi = calc_bmi(weight, height)
        flat = dict(row)
        flat["BMI"] = bmi if bmi is not None else ""
        flat["BMI Category"] = bmi_category(bmi)
        for meal_type, col in MEAL_COLS.items():
            name = (row.get(col) or "").strip()
            detail = catalog.get(f"{meal_type}::{name}") or template_recipe(name, meal_type)
            prefix = meal_type.capitalize()
            flat[f"{prefix} Ingredients"] = join_list(detail.get("ingredients") or [])
            flat[f"{prefix} Directions"] = join_list(detail.get("directions") or [])
            flat[f"{prefix} Calories"] = detail.get("calories") or 0
            flat[f"{prefix} Image URL"] = detail.get("imageUrl") or ""
            flat[f"{prefix} Recipe Source"] = detail.get("source") or ""
        flat["Meals Total Calories"] = sum(
            int(
                (catalog.get(f"{mt}::{(row.get(col) or '').strip()}") or {}).get("calories")
                or estimate_calories((row.get(col) or "").strip(), mt)
            )
            for mt, col in MEAL_COLS.items()
        )
        flat_rows.append(flat)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(flat_rows)

    OUT_JSON.write_text(json.dumps(enriched_rows, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_MEALS.write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")

    sources = {}
    for item in catalog.values():
        sources[item.get("source", "?")] = sources.get(item.get("source", "?"), 0) + 1

    print("Done.")
    print(f"  CSV:   {OUT_CSV}")
    print(f"  JSON:  {OUT_JSON}")
    print(f"  Meals: {OUT_MEALS}")
    print(f"  Source mix: {sources}")


if __name__ == "__main__":
    main()
