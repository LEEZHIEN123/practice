/**
 * Rewrite nutritionPlanDataset.json meal `img` URLs from meal names
 * so stored images match personalized nutrition guidance dishes.
 *
 * Run: node scripts/sync_nutrition_plan_images.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const datasetPath = path.join(__dirname, "../lib/nutritionPlanDataset.json");

const FALLBACK =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80";

/** Ordered rules: first matching keyword wins (more specific first). */
const RULES = [
  ["overnight oats|oatmeal|porridge", "https://images.unsplash.com/photo-1650294411710-c43f289dd5dc?auto=format&fit=crop&w=800&q=80"],
  ["pancake|waffle|french toast", "https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=800&q=80"],
  ["tofu scramble|scrambled tofu|tofu and vegetable scramble|tofu breakfast|tofu omelet", "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80"],
  ["scrambled egg|omelette|omelet|frittata|scramble|egg", "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80"],
  ["yogurt|yoghurt|parfait|cottage cheese", "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80"],
  ["protein shake|smoothie|shake", "https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=800&q=80"],
  ["sandwich", "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80"],
  ["salad", "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80"],
  ["soup|stew|chowder|broth", "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80"],
  ["chili", "https://images.unsplash.com/photo-1638324912294-8efe1c2c8786?auto=format&fit=crop&w=800&q=80"],
  ["curry", "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80"],
  ["stir-fry|stir fry|fajita|skewer", "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80"],
  ["pasta|spaghetti|lasagna|noodle|meatball", "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&q=80"],
  ["pizza", "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80"],
  ["burger", "https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=800&q=80"],
  ["hummus", "https://images.unsplash.com/photo-1571066811602-fff401a37f4b?auto=format&fit=crop&w=800&q=80"],
  ["wrap|burrito|taco", "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80"],
  ["avocado toast|toast with avocado|avocado", "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80"],
  ["toast", "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80"],
  ["salmon|tuna|fish|seafood|shrimp", "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80"],
  ["chicken", "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80"],
  ["turkey", "https://images.unsplash.com/photo-1574672280600-4accfa113ce9?auto=format&fit=crop&w=800&q=80"],
  ["steak|beef", "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=800&q=80"],
  ["tofu|tempeh", "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80"],
  ["quinoa bowl|rice bowl|bowl", "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80"],
  ["quinoa|brown rice|rice", "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80"],
  ["apple with peanut|apple with almond|apple slices with", "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=800&q=80"],
  ["banana with peanut|banana with almond", "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80"],
  ["peanut butter|almond butter|nut butter", "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=800&q=80"],
  ["trail mix|mixed nuts|nuts and seeds|nut mix|fruit and nut", "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&q=80"],
  ["protein bar|energy bar", "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80"],
  ["popcorn", "https://images.unsplash.com/photo-1578849278619-e73505e9610f?auto=format&fit=crop&w=800&q=80"],
  ["almonds|peanuts|mixed nuts|nuts", "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&q=80"],
  ["banana", "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80"],
  ["apple", "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=800&q=80"],
  ["fruit|berries|berry", "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=800&q=80"],
  ["sweet potato|potato|fries", "https://images.unsplash.com/photo-1518013431117-eb1465fa9792?auto=format&fit=crop&w=800&q=80"],
  ["chickpea|lentil|black bean|bean", "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80"],
  ["vegetable|veggie|vegan|vegetarian", "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80"],
  ["cheese|cracker", "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=800&q=80"],
  ["chocolate|dessert", "https://images.unsplash.com/photo-1486427944299-d1955d23b34d?auto=format&fit=crop&w=800&q=80"],
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function imageForName(name) {
  const lower = String(name || "").toLowerCase();
  for (const [pattern, url] of RULES) {
    const parts = pattern.split("|");
    for (const part of parts) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(part)}([^a-z0-9]|$)`, "i");
      if (re.test(lower)) return url;
    }
  }
  return FALLBACK;
}

const data = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
let updated = 0;
const byCategory = new Map();

for (const meal of data.meals) {
  const next = imageForName(meal.n);
  if (meal.img !== next) {
    meal.img = next;
    updated += 1;
  }
  const key = next.slice(-40);
  byCategory.set(key, (byCategory.get(key) || 0) + 1);
}

fs.writeFileSync(datasetPath, JSON.stringify(data));
console.log(`Updated ${updated} / ${data.meals.length} meal images in nutritionPlanDataset.json`);

// Spot-check common mismatches
const checks = [
  "Trail mix with nuts and seeds",
  "Apple with peanut butter",
  "Banana with peanut butter",
  "Popcorn",
  "Hummus with vegetables",
  "Tofu scramble with vegetables",
  "Turkey chili with brown rice",
  "Chickpea and vegetable curry",
  "Protein bar",
  "Grilled salmon with quinoa and roasted vegetables",
  "Steak with sweet potato fries",
];
for (const name of checks) {
  console.log(`${name}\n  -> ${imageForName(name).slice(0, 90)}`);
}
