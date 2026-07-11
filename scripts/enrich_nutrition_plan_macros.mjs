import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const planPath = path.join(__dirname, "../lib/nutritionPlanDataset.json");
const recipePath = path.join(__dirname, "../lib/recipeFoodDataset.json");

const STOP = new Set([
  "with", "and", "a", "an", "the", "of", "on", "in", "to", "for", "whole",
  "wheat", "brown", "mixed", "fresh", "or", "side", "bowl", "plate", "set",
]);

const CURATED = [
  [["oatmeal", "oat"], "https://images.unsplash.com/photo-1650294411710-c43f289dd5dc?auto=format&fit=crop&w=800&q=80"],
  [["salad"], "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80"],
  [["salmon", "fish"], "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80"],
  [["chicken"], "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80"],
  [["tofu"], "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80"],
  [["yogurt"], "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80"],
  [["smoothie", "shake"], "https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=800&q=80"],
  [["egg"], "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80"],
  [["toast", "bread", "sandwich"], "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80"],
  [["pasta", "noodle"], "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&q=80"],
  [["rice", "quinoa", "bowl"], "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80"],
  [["soup", "stew"], "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80"],
  [["avocado"], "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80"],
  [["berry", "fruit"], "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=800&q=80"],
  [["nut", "trail"], "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&q=80"],
  [["beef", "steak"], "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=800&q=80"],
  [["turkey"], "https://images.unsplash.com/photo-1574672280600-4accfa113ce9?auto=format&fit=crop&w=800&q=80"],
  [["veggie", "vegetable", "vegan", "vegetarian"], "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80"],
];

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80";

const RELIABLE = ["images.unsplash.com"];

function tokenize(text) {
  return new Set(
    (text || "")
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((w) => w.length > 2 && !STOP.has(w)) || []
  );
}

function similarity(a, b) {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (!al || !bl) return 0;
  if (al === bl) return 1;
  if (al.includes(bl) || bl.includes(al)) return 0.85;
  const ta = tokenize(al);
  const tb = tokenize(bl);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  if (!inter) return 0;
  const coverage = inter / ta.size;
  const jaccard = inter / (ta.size + tb.size - inter);
  return 0.55 * coverage + 0.45 * jaccard;
}

function curatedImage(name) {
  const lower = name.toLowerCase();
  for (const [keys, url] of CURATED) {
    if (keys.some((k) => lower.includes(k))) return url;
  }
  return FALLBACK_IMG;
}

function isReliableImage(url) {
  if (!url || typeof url !== "string") return false;
  if (!/^https:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return RELIABLE.includes(host);
  } catch {
    return false;
  }
}

function estimateMacros(name, calories) {
  const cal = Math.max(80, Number(calories) || 300);
  const lower = String(name || "").toLowerCase();
  let pRatio = 0.25;
  let cRatio = 0.45;
  let fRatio = 0.3;
  if (/(chicken|turkey|fish|salmon|tuna|egg|tofu|protein shake|protein)/.test(lower)) {
    pRatio = 0.35; cRatio = 0.35; fRatio = 0.3;
  } else if (/(oatmeal|oat|rice|pasta|bread|toast|pancake|cereal|quinoa)/.test(lower)) {
    pRatio = 0.15; cRatio = 0.6; fRatio = 0.25;
  } else if (/(nut|avocado|trail mix|peanut|almond|cheese)/.test(lower)) {
    pRatio = 0.15; cRatio = 0.25; fRatio = 0.6;
  } else if (/(salad|vegetable|veggie|broccoli|soup)/.test(lower)) {
    pRatio = 0.25; cRatio = 0.4; fRatio = 0.35;
  }
  return {
    proteinG: Math.round((cal * pRatio) / 4),
    carbsG: Math.round((cal * cRatio) / 4),
    fatG: Math.round((cal * fRatio) / 9),
  };
}

function scaleMacros(nutrition, targetCal) {
  const srcCal = Math.max(1, Number(nutrition.calories) || 1);
  const target = Math.max(80, Number(targetCal) || srcCal);
  const scale = target / srcCal;
  return {
    proteinG: Math.max(0, Math.round((Number(nutrition.proteinG) || 0) * scale)),
    carbsG: Math.max(0, Math.round((Number(nutrition.carbsG) || 0) * scale)),
    fatG: Math.max(0, Math.round((Number(nutrition.fatG) || 0) * scale)),
  };
}

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const recipes = JSON.parse(fs.readFileSync(recipePath, "utf8"));

let matched = 0;
let estimated = 0;
let imageFixed = 0;

for (const meal of plan.meals) {
  let best = null;
  let bestScore = 0;
  for (const recipe of recipes) {
    const score = similarity(meal.n, recipe.name || "");
    if (score > bestScore) {
      bestScore = score;
      best = recipe;
    }
  }

  let macros;
  if (best && bestScore >= 0.35 && best.nutrition) {
    macros = scaleMacros(best.nutrition, meal.cal);
    matched++;
  } else {
    macros = estimateMacros(meal.n, meal.cal);
    estimated++;
  }

  meal.p = macros.proteinG;
  meal.c = macros.carbsG;
  meal.f = macros.fatG;

  const oldImg = meal.img;
  if (best && bestScore >= 0.35 && isReliableImage(best.imageUrl)) {
    meal.img = best.imageUrl;
  } else if (!isReliableImage(meal.img)) {
    meal.img = curatedImage(meal.n);
  }
  if (meal.img !== oldImg) imageFixed++;
}

fs.writeFileSync(planPath, JSON.stringify(plan));
console.log(
  JSON.stringify({
    meals: plan.meals.length,
    matched,
    estimated,
    imageFixed,
    sample: {
      n: plan.meals[0].n,
      cal: plan.meals[0].cal,
      p: plan.meals[0].p,
      c: plan.meals[0].c,
      f: plan.meals[0].f,
      img: plan.meals[0].img,
    },
  })
);
