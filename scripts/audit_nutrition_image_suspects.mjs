/**
 * Spot suspicious curated matches where the winning key looks too weak
 * for the meal name (e.g. side ingredient beats the main dish).
 * Run: node scripts/audit_nutrition_guidance_images.mjs --suspect
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = JSON.parse(fs.readFileSync(path.join(root, "lib/nutritionPlanDataset.json"), "utf8"));
const src = fs.readFileSync(path.join(root, "lib/foodImages.ts"), "utf8");

const DISH_TYPES = [
  "overnight oats", "oatmeal", "pancake", "waffle", "french toast", "omelette", "omelet",
  "scramble", "yogurt", "yoghurt", "parfait", "smoothie", "shake", "soup", "stew", "chowder",
  "chili", "curry", "stir-fry", "stir fry", "fajita", "pasta", "spaghetti", "lasagna", "noodle",
  "burger", "wrap", "burrito", "taco", "pizza", "sushi", "bowl", "trail mix", "sandwich",
  "hummus", "popcorn", "muffin", "brownie", "cookie", "cake", "pie", "crisp", "salad", "toast",
];
const PROTEINS = [
  "salmon", "tuna", "shrimp", "prawn", "seafood", "cod", "tilapia", "fish", "chicken", "turkey",
  "steak", "beef", "pork", "bacon", "tofu", "tempeh", "eggs", "egg",
];

const curated = [];
const block = src.slice(src.indexOf("const CURATED"), src.indexOf("const UNSPLASH_HOSTS"));
for (const m of block.matchAll(/keys:\s*\[([\s\S]*?)\],\s*url:\s*"([^"]+)"/g)) {
  const keys = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  curated.push({ keys, url: m[2] });
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function keyMatches(name, key) {
  const trimmed = key.trim().toLowerCase();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/).map(escapeRe);
  const last = words[words.length - 1];
  if (!last.endsWith("s")) words[words.length - 1] = `${last}s?`;
  return new RegExp(`(^|[^a-z0-9])${words.join("\\s+")}([^a-z0-9]|$)`, "i").test(name);
}
function dishBoost(name, key) {
  let boost = 0;
  for (const dish of DISH_TYPES) {
    if (name.includes(dish) && key.includes(dish)) boost = Math.max(boost, 5000 + dish.length);
  }
  for (const protein of PROTEINS) {
    if (name.includes(protein) && key.includes(protein)) {
      const base = protein === "egg" || protein === "eggs" ? 4000 : 3000;
      boost = Math.max(boost, base + protein.length);
    }
  }
  return boost;
}
function findCurated(name) {
  const lower = name.toLowerCase();
  let best = null;
  let bestScore = -1;
  curated.forEach((entry, i) => {
    for (const key of entry.keys) {
      if (!keyMatches(lower, key)) continue;
      const score = key.trim().length * 100 + dishBoost(lower, key) - i;
      if (score > bestScore) {
        bestScore = score;
        best = { key, score, boost: dishBoost(lower, key) };
      }
    }
  });
  return best;
}

const unique = [...new Set(plan.meals.map((m) => m.n))];
const suspects = [];
for (const n of unique) {
  const lower = n.toLowerCase();
  const hit = findCurated(n);
  if (!hit) continue;
  const nameDishes = DISH_TYPES.filter((d) => lower.includes(d));
  const keyIsDish = DISH_TYPES.some((d) => hit.key.includes(d));
  const nameProteins = PROTEINS.filter((d) => lower.includes(d));
  // Dish in name but winning key is not that dish (and not a longer phrase containing it)
  if (nameDishes.length && !nameDishes.some((d) => hit.key.includes(d))) {
    suspects.push({ reason: "dish-ignored", n, key: hit.key, dishes: nameDishes.join(",") });
  }
  // Protein-only image while name has a dish type that should dominate
  if (nameDishes.length && !keyIsDish && nameProteins.some((p) => hit.key.includes(p))) {
    suspects.push({ reason: "protein-over-dish", n, key: hit.key, dishes: nameDishes.join(",") });
  }
  // Very generic side keys
  if (["rice", "bean", "fruit", "vegetable", "veggie", "potato", "cheese"].includes(hit.key)) {
    suspects.push({ reason: "generic-side", n, key: hit.key });
  }
}

console.log("suspects", suspects.length);
for (const s of suspects.slice(0, 60)) {
  console.log(`${s.reason} | key=${s.key} | ${s.n}${s.dishes ? ` | dishes=${s.dishes}` : ""}`);
}
