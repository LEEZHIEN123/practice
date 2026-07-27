/**
 * Audit personalized nutrition meal name → image matching.
 * Run: node scripts/audit_nutrition_guidance_images.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = JSON.parse(fs.readFileSync(path.join(root, "lib/nutritionPlanDataset.json"), "utf8"));
const idx = JSON.parse(fs.readFileSync(path.join(root, "lib/recipeFoodIndex.json"), "utf8"));
const src = fs.readFileSync(path.join(root, "lib/foodImages.ts"), "utf8");

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
  if (trimmed === "almond" && /\balmond\s+milk\b/.test(name)) return false;
  if (trimmed === "peanut" && /\bpeanut\s+(butter|sauce|oil)\b/.test(name)) return false;
  if (trimmed === "almond" && /\balmond\s+butter\b/.test(name)) return false;
  const words = trimmed.split(/\s+/).map(escapeRe);
  const last = words[words.length - 1];
  if (!last.endsWith("s")) words[words.length - 1] = `${last}s?`;
  return new RegExp(`(^|[^a-z0-9])${words.join("\\s+")}([^a-z0-9]|$)`, "i").test(name);
}
function findCurated(name) {
  const lower = name.toLowerCase();
  let best = null;
  let bestScore = -1;
  curated.forEach((entry, i) => {
    for (const key of entry.keys) {
      if (!keyMatches(lower, key)) continue;
      const score = key.trim().length * 100 - i;
      if (score > bestScore) {
        bestScore = score;
        best = { key, url: entry.url, score };
      }
    }
  });
  return best;
}

const STOP = new Set([
  "with", "and", "or", "a", "an", "the", "of", "in", "to", "for", "on", "fresh",
  "homemade", "easy", "best", "recipe", "recipes", "served", "mixed", "whole",
  "wheat", "grain", "grains",
]);
const DISH = [
  "overnight oats", "protein shake", "trail mix", "french toast", "stir-fry", "stir fry",
  "salad", "soup", "chili", "curry", "oatmeal", "yogurt", "smoothie", "shake", "sandwich",
  "wrap", "burger", "pasta", "bowl", "toast", "scramble", "omelet", "omelette", "pancake",
  "pizza", "taco", "burrito", "hummus", "popcorn", "muffin", "oats",
];
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function toks(s) {
  return norm(s)
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}
function dishes(s) {
  const l = norm(s);
  return DISH.filter((d) => l.includes(d));
}
function allScore(planName, recipe) {
  const pn = norm(planName);
  const rn = norm(recipe);
  if (!pn || !rn) return 0;
  if (pn === rn) return 1;
  const pt = toks(planName);
  const rt = toks(recipe);
  if (rn.includes(pn) && pt.length >= 3) return 0.98;
  if (pn.includes(rn) && rt.length >= 3) return 0.95;
  if (pt.length < 2 || !rt.length) return 0;
  const rs = new Set(rt);
  const shared = pt.filter((t) => rs.has(t));
  if (shared.length !== pt.length) return 0;
  const pd = dishes(pn);
  const rd = dishes(rn);
  if (pd.length && !pd.every((d) => rn.includes(d))) return 0;
  if (rd.length && !pd.length) return 0;
  for (const d of rd) {
    if (!pd.some((p) => p.includes(d) || d.includes(p))) return 0;
  }
  return 0.85 + shared.length * 0.02;
}
function matchAll(name) {
  let best = null;
  let bestS = 0;
  for (const f of idx) {
    if (!f.imageUrl) continue;
    const s = allScore(name, f.name);
    if (s >= 0.85 && s > bestS) {
      bestS = s;
      best = { recipe: f.name, s };
    }
  }
  return best;
}

const unique = [...new Set(plan.meals.map((m) => m.n))];
let allN = 0;
let unsplash = 0;
let none = 0;
const noneSamples = [];
const weak = [];
for (const n of unique) {
  const a = matchAll(n);
  if (a) {
    allN++;
    continue;
  }
  const u = findCurated(n);
  if (u) {
    unsplash++;
    if (u.key.length <= 4) weak.push({ n, key: u.key });
    continue;
  }
  none++;
  noneSamples.push(n);
}
console.log({ unique: unique.length, allN, unsplash, none, weakKeyMatches: weak.length });
console.log("\n--- no match ---");
noneSamples.slice(0, 40).forEach((n) => console.log(n));
console.log("\n--- weak unsplash keys ---");
weak.slice(0, 40).forEach((x) => console.log(`${x.key} | ${x.n}`));
