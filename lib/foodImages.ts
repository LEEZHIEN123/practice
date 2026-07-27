/**
 * Food images for personalized nutrition guidance and All Nutrition library.
 *
 * Personalized nutrition resolution order:
 * 1. All Nutrition recipe dataset — only when the recipe name confidently matches
 * 2. Curated Unsplash License URL — only when the meal name matches a dish keyword
 * 3. No image (UI shows a blank placeholder + message)
 */

import { FOOD_INDEX } from "./foodDataset";

/** Unsplash License fallback used by All Nutrition when a dataset URL is missing. */
export const FOOD_IMAGE_FALLBACK =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80";

type CuratedEntry = {
  keys: string[];
  /** Must be an `images.unsplash.com` Unsplash License URL. */
  url: string;
};

/** When the meal name contains these, keys that also contain them outrank ingredients. */
const DISH_TYPES = [
  "overnight oats",
  "oatmeal",
  "pancake",
  "waffle",
  "french toast",
  "omelette",
  "omelet",
  "scramble",
  "yogurt",
  "yoghurt",
  "parfait",
  "smoothie",
  "shake",
  "soup",
  "stew",
  "chowder",
  "chili",
  "curry",
  "stir-fry",
  "stir fry",
  "fajita",
  "pasta",
  "spaghetti",
  "lasagna",
  "noodle",
  "burger",
  "wrap",
  "burrito",
  "taco",
  "pizza",
  "sushi",
  "bowl",
  "trail mix",
  "sandwich",
  "hummus",
  "popcorn",
  "muffin",
  "brownie",
  "cookie",
  "cake",
  "pie",
  "crisp",
] as const;

/** Sandwich is weaker than primary dishes (e.g. salad sandwich → salad). */
const SECONDARY_DISH_TYPES = ["sandwich", "toast", "bread"] as const;

/** Named proteins beat generic sides like vegetables / rice / potato. */
const PROTEIN_MAINS = [
  "salmon",
  "tuna",
  "shrimp",
  "prawn",
  "seafood",
  "cod",
  "tilapia",
  "fish",
  "chicken",
  "turkey",
  "steak",
  "beef",
  "pork",
  "bacon",
  "tofu",
  "tempeh",
  "eggs",
  "egg",
] as const;

/**
 * Longer / more specific keys win; dish-type keywords beat bare ingredients
 * (e.g. "chicken salad" before "chicken", "chili" before "brown rice").
 */
const CURATED: CuratedEntry[] = [
  // Breakfast bowls / oats
  {
    keys: ["overnight oats", "oatmeal", "porridge", "rolled oats", "oat"],
    url: "https://images.unsplash.com/photo-1650294411710-c43f289dd5dc?auto=format&fit=crop&w=800&q=80",
  },

  // Pancakes / waffles before generic fruit
  {
    keys: ["protein pancake", "pancake", "waffle", "french toast"],
    url: "https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=800&q=80",
  },

  // Tofu scramble before egg scramble (same word "scramble")
  {
    keys: [
      "tofu scramble",
      "scrambled tofu",
      "tofu and vegetable scramble",
      "tofu and chickpea scramble",
      "tofu and veggie",
      "tofu omelet",
      "tofu breakfast",
    ],
    url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
  },

  // Eggs
  {
    keys: [
      "scrambled egg",
      "omelette",
      "omelet",
      "egg scramble",
      "vegetable frittata",
      "frittata",
      "scramble",
      "scrambled",
      "eggs",
      "egg",
    ],
    url: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
  },

  // Yogurt / dairy snacks
  {
    keys: ["greek yogurt", "yogurt", "yoghurt", "parfait", "cottage cheese"],
    url: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80",
  },

  // Smoothies / shakes
  {
    keys: ["protein shake", "protein smoothie", "smoothie", "shake", "milkshake", "almond milk"],
    url: "https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=800&q=80",
  },

  // Sandwiches before generic salad
  {
    keys: [
      "tuna salad sandwich",
      "chicken salad sandwich",
      "chickpea salad sandwich",
      "turkey sandwich",
      "turkey breast sandwich",
      "grilled chicken sandwich",
      "salad sandwich",
      "peanut butter and banana sandwich",
      "sandwich",
    ],
    url: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80",
  },

  // Salads
  {
    keys: [
      "chicken salad",
      "tuna salad",
      "quinoa salad",
      "lentil salad",
      "chickpea salad",
      "black bean salad",
      "salmon salad",
      "greek salad",
      "fruit salad",
      "pasta salad",
      "side salad",
      "salad",
    ],
    url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
  },

  // Soups / chili / stew
  {
    keys: ["lentil soup", "vegetable soup", "chicken soup", "black bean soup", "soup", "stew", "chowder", "broth"],
    url: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["turkey chili", "vegetarian chili", "vegan chili", "chili"],
    url: "https://images.unsplash.com/photo-1638324912294-8efe1c2c8786?auto=format&fit=crop&w=800&q=80",
  },

  // Curry (distinct from chili)
  {
    keys: ["chickpea curry", "lentil curry", "vegetable curry", "curry"],
    url: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80",
  },

  // Stir-fry / fajitas / skewers
  {
    keys: ["stir-fry", "stir fry", "stirfry", "fajita", "skewer"],
    url: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
  },

  // Pasta / noodles / lasagna / meatballs with pasta
  {
    keys: ["lentil pasta", "chickpea pasta", "vegan pasta", "spaghetti", "lasagna", "macaroni", "meatball", "noodle", "pasta"],
    url: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&q=80",
  },

  // Pizza
  {
    keys: ["pizza"],
    url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
  },

  // Burgers — plant vs meat
  {
    keys: ["black bean burger", "lentil burger", "veggie burger", "bean burger", "vegan burger", "vegan black bean"],
    url: "https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["burger", "cheeseburger"],
    url: "https://images.unsplash.com/photo-1568901346375-23e57734a2ca?auto=format&fit=crop&w=800&q=80",
  },

  // Hummus dips before wraps
  {
    keys: [
      "hummus and vegetable",
      "hummus and veggie",
      "hummus with carrot",
      "hummus with vegetable",
      "vegetable sticks with hummus",
      "veggie sticks with hummus",
      "carrot sticks with hummus",
      "raw vegetables and hummus",
      "whole-grain crackers with hummus",
      "hummus with",
      "hummus",
    ],
    url: "https://images.unsplash.com/photo-1571066811602-fff401a37f4b?auto=format&fit=crop&w=800&q=80",
  },

  // Wraps / burritos / toast
  {
    keys: ["wrap", "burrito", "taco", "quesadilla", "bagel"],
    url: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["avocado toast", "toast with avocado", "toast"],
    url: "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80",
  },

  // Proteins before generic rice/quinoa sides
  {
    keys: ["salmon", "tuna", "shrimp", "prawn", "seafood", "cod", "tilapia", "fish"],
    url: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["chicken breast", "grilled chicken", "baked chicken", "chicken"],
    url: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["turkey meatball", "turkey sandwich", "turkey breast", "turkey"],
    url: "https://images.unsplash.com/photo-1574672280600-4accfa113ce9?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["steak", "roast beef", "beef stew", "beef stir", "beef"],
    url: "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["pork", "bacon", "ham"],
    url: "https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["tempeh", "tofu"],
    url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
  },

  // Rice / grain bowls (after protein mains)
  {
    keys: ["quinoa breakfast", "quinoa porridge", "quinoa bowl", "rice bowl", "grain bowl", "burrito bowl", "bowl", "risotto", "pilaf"],
    url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["brown rice", "quinoa", "rice"],
    url: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
  },

  // Avocado (standalone)
  {
    keys: ["avocado"],
    url: "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80",
  },

  // Fruit + nut butter (must stay above bare peanut/almond → nuts/trail mix)
  {
    keys: [
      "apple with peanut butter",
      "apple with almond butter",
      "apple slices with peanut butter",
      "apple slices with almond butter",
      "apple with peanut",
      "apple with almond",
    ],
    url: "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: [
      "banana with peanut butter",
      "banana with almond butter",
      "banana with peanut",
      "banana with almond",
    ],
    url: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: [
      "celery with peanut butter",
      "celery sticks with peanut butter",
      "fruit with peanut butter",
      "fruit with almond butter",
      "fruit with nut butter",
      "with peanut butter",
      "with almond butter",
      "peanut butter",
      "almond butter",
      "nut butter",
    ],
    url: "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=800&q=80",
  },

  // Trail mix
  {
    keys: [
      "trail mix with nuts and seeds",
      "trail mix with nuts and dried fruit",
      "trail mix with dried fruit and nuts",
      "trail mix with dried fruit",
      "trail mix with almonds",
      "trail mix",
      "fruit and nut mix",
      "fruit & nut mix",
      "mixed nuts and seeds",
      "mixed nuts and dried",
      "nuts and seeds",
      "nut mix",
    ],
    url: "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&q=80",
  },

  // Bars
  {
    keys: ["protein bar", "energy bar"],
    url: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80",
  },

  // Popcorn
  {
    keys: ["popcorn"],
    url: "https://images.unsplash.com/photo-1578849278619-e73505e9610f?auto=format&fit=crop&w=800&q=80",
  },

  // Plain nuts
  {
    keys: ["mixed nuts", "granola", "almonds", "peanuts", "dark chocolate with almond", "nuts", "nut"],
    url: "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["almond", "peanut"],
    url: "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&q=80",
  },

  // Fruit snacks
  {
    keys: ["fruit and nut", "fruit & nut", "berries", "berry", "strawberry", "mango", "orange", "fruit"],
    url: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["banana"],
    url: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["apple"],
    url: "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=800&q=80",
  },

  // Potatoes / fries
  {
    keys: ["sweet potato", "potato", "fries", "hash brown", "hash"],
    url: "https://images.unsplash.com/photo-1518013431117-eb1465fa9792?auto=format&fit=crop&w=800&q=80",
  },

  // Lentil mains before generic bean / vegetable
  {
    keys: ["lentil loaf", "lentil soup", "lentil stew", "lentil curry", "lentil"],
    url: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80",
  },

  // Beans / lentils / chickpeas (after soups/burgers/curries)
  {
    keys: ["chickpea", "black bean", "bean"],
    url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80",
  },

  // Vegetables
  {
    keys: ["veggie sticks", "vegetable", "veggie", "vegan", "vegetarian", "broccoli", "spinach", "kale"],
    url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80",
  },

  // Cheese / crackers
  {
    keys: ["string cheese", "cheese", "cracker"],
    url: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=800&q=80",
  },

  // Chocolate / desserts
  {
    keys: ["dark chocolate", "chocolate", "muffin", "cupcake", "brownie", "cookie", "cake", "pie", "dessert"],
    url: "https://images.unsplash.com/photo-1486427944299-d1955d23b34d?auto=format&fit=crop&w=800&q=80",
  },

  // Drinks
  {
    keys: ["coffee", "latte", "tea", "juice"],
    url: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
  },
];

/** Hosts allowed for personalized nutrition food photos (Unsplash License). */
const UNSPLASH_HOSTS = new Set(["images.unsplash.com"]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-phrase match with optional trailing "s" on the last word
 * so "pancake" matches "pancakes", "egg" matches "eggs".
 */
function keyMatches(name: string, key: string): boolean {
  const trimmed = key.trim().toLowerCase();
  if (!trimmed) return false;
  // Don't treat "almond milk" / "peanut sauce" style phrases as nut snacks.
  if (trimmed === "almond" && /\balmond\s+milk\b/.test(name)) return false;
  if (trimmed === "peanut" && /\bpeanut\s+(butter|sauce|oil)\b/.test(name)) return false;
  if (trimmed === "almond" && /\balmond\s+butter\b/.test(name)) return false;
  const words = trimmed.split(/\s+/).map((w) => escapeRegExp(w));
  if (words.length === 0) return false;
  const last = words[words.length - 1]!;
  // Avoid double-s on keys that already end in s (eggs, oats, berries handled as full keys).
  if (!last.endsWith("s")) {
    words[words.length - 1] = `${last}s?`;
  }
  const pattern = words.join("\\s+");
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i").test(name);
}

/** True when salad is the dish, not a side ("chicken salad", not "steak with salad"). */
function isPrimarySalad(name: string): boolean {
  if (/\bsalad\s+sandwich\b/.test(name)) return true;
  if (/\b(chicken|tuna|quinoa|greek|fruit|chickpea|bean|pasta|black bean)\s+salads?\b/.test(name)) {
    return true;
  }
  const saladIdx = name.search(/\bsalads?\b/);
  if (saladIdx < 0) return false;
  const withIdx = name.search(/\bwith\b/);
  if (withIdx < 0) return true;
  return saladIdx < withIdx;
}

function dishTypeBoost(name: string, key: string): number {
  let boost = 0;

  if (key.includes("salad") && name.includes("salad")) {
    boost = Math.max(boost, isPrimarySalad(name) ? 5500 : 400);
  }

  for (const dish of DISH_TYPES) {
    if (name.includes(dish) && key.includes(dish)) {
      boost = Math.max(boost, 5000 + dish.length);
    }
  }
  for (const dish of SECONDARY_DISH_TYPES) {
    if (name.includes(dish) && key.includes(dish)) {
      boost = Math.max(boost, 3500 + dish.length);
    }
  }
  for (const protein of PROTEIN_MAINS) {
    if (name.includes(protein) && key.includes(protein)) {
      // Eggs are often listed with toast/avocado — keep eggs as the main signal.
      const base = protein === "egg" || protein === "eggs" ? 4000 : 3000;
      boost = Math.max(boost, base + protein.length);
    }
  }
  return boost;
}

/** Side / garnish keywords — must not outrank a main food in the meal name. */
const SIDE_OR_GARNISH_KEYS = new Set([
  "vegetable",
  "veggie",
  "fruit",
  "berries",
  "berry",
  "rice",
  "potato",
  "cheese",
  "cracker",
  "bread",
]);

function nameHasDishType(name: string): boolean {
  return DISH_TYPES.some((d) => name.includes(d)) || SECONDARY_DISH_TYPES.some((d) => name.includes(d));
}

function keyCoversNameDishType(name: string, key: string): boolean {
  for (const dish of DISH_TYPES) {
    if (name.includes(dish) && key.includes(dish)) return true;
  }
  for (const dish of SECONDARY_DISH_TYPES) {
    if (name.includes(dish) && key.includes(dish)) return true;
  }
  if (key.includes("salad") && name.includes("salad") && isPrimarySalad(name)) return true;
  return false;
}

function guidanceCuratedScore(name: string, key: string, entryIndex: number): number {
  const trimmed = key.trim().toLowerCase();
  let score = trimmed.length * 100 + dishTypeBoost(name, trimmed) - entryIndex;

  // Never let a side garnish beat the actual dish / protein.
  if (SIDE_OR_GARNISH_KEYS.has(trimmed)) {
    score -= 2500;
  }

  // If the meal names a dish form, require the key to reflect that dish.
  if (nameHasDishType(name) && !keyCoversNameDishType(name, trimmed)) {
    // Allow compound keys like "chicken salad" / "apple with peanut".
    const compoundOk =
      trimmed.split(/\s+/).length >= 2 && keyMatches(name, trimmed) && dishTypeBoost(name, trimmed) >= 3000;
    if (!compoundOk) {
      return -1;
    }
  }

  // Bare protein keys are fine only when the name has no dish type.
  for (const protein of PROTEIN_MAINS) {
    if (trimmed === protein || trimmed === `${protein}s`) {
      if (nameHasDishType(name) && !keyCoversNameDishType(name, trimmed)) {
        return -1;
      }
    }
  }

  return score;
}

/**
 * Curated Unsplash match for personalized nutrition — keyed to the meal name.
 * Rejects weak side-ingredient matches that do not represent the dish.
 */
function findBestGuidanceCuratedEntry(name: string): CuratedEntry | null {
  const lower = String(name || "").toLowerCase();
  if (!lower.trim()) return null;

  let best: CuratedEntry | null = null;
  let bestScore = -1;
  let bestKey = "";

  for (let i = 0; i < CURATED.length; i++) {
    const entry = CURATED[i]!;
    for (const key of entry.keys) {
      if (!keyMatches(lower, key)) continue;
      const score = guidanceCuratedScore(lower, key, i);
      if (score < 0) continue;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
        bestKey = key;
      }
    }
  }

  // Require a minimum confidence so tiny accidental keys do not win.
  if (bestScore < 400) return null;
  void bestKey;
  return best;
}

function findBestCuratedEntry(name: string): CuratedEntry | null {
  return findBestGuidanceCuratedEntry(name);
}

export function curatedFoodImageUrl(name: string): string | null {
  const entry = findBestGuidanceCuratedEntry(name);
  return entry?.url ?? null;
}

export type ResolveFoodImageOptions = {
  /**
   * When true, accept any https preferred URL (e.g. All Nutrition / Allrecipes).
   * Used by the All Nutrition library only.
   */
  allowCommercialHosts?: boolean;
};

function isUnsplashLicenseUrl(url: string): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  try {
    return UNSPLASH_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

const NAME_STOP_WORDS = new Set([
  "with",
  "and",
  "or",
  "a",
  "an",
  "the",
  "of",
  "in",
  "to",
  "for",
  "on",
  "fresh",
  "homemade",
  "easy",
  "best",
  "recipe",
  "recipes",
  "served",
  "mixed",
  "whole",
  "wheat",
  "grain",
  "grains",
]);

const MATCH_DISH_TYPES = [
  "overnight oats",
  "protein shake",
  "trail mix",
  "french toast",
  "stir-fry",
  "stir fry",
  "salad",
  "soup",
  "chili",
  "curry",
  "oatmeal",
  "yogurt",
  "smoothie",
  "shake",
  "sandwich",
  "wrap",
  "burger",
  "pasta",
  "bowl",
  "toast",
  "scramble",
  "omelet",
  "omelette",
  "pancake",
  "pizza",
  "taco",
  "burrito",
  "hummus",
  "popcorn",
  "muffin",
  "oats",
] as const;

function normalizeFoodName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function foodNameTokens(name: string): string[] {
  return normalizeFoodName(name)
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !NAME_STOP_WORDS.has(t));
}

function dishTypesInName(name: string): string[] {
  const lower = normalizeFoodName(name);
  return MATCH_DISH_TYPES.filter((d) => lower.includes(d));
}

function allNutritionNameScore(planName: string, recipeName: string): number {
  const pn = normalizeFoodName(planName);
  const rn = normalizeFoodName(recipeName);
  if (!pn || !rn) return 0;
  if (pn === rn) return 1;

  const planTokens = foodNameTokens(planName);
  const recipeTokens = foodNameTokens(recipeName);
  if (rn.includes(pn) && planTokens.length >= 3) return 0.98;
  if (pn.includes(rn) && recipeTokens.length >= 3) return 0.95;

  if (planTokens.length < 2 || recipeTokens.length === 0) return 0;
  const recipeSet = new Set(recipeTokens);
  const shared = planTokens.filter((t) => recipeSet.has(t));
  // Every significant plan token must appear in the recipe name.
  if (shared.length !== planTokens.length) return 0;

  const planDishes = dishTypesInName(pn);
  const recipeDishes = dishTypesInName(rn);
  if (planDishes.length && !planDishes.every((d) => rn.includes(d))) return 0;
  // Reject when the recipe is a specific dish form the plan name does not claim.
  if (recipeDishes.length && !planDishes.length) return 0;
  for (const d of recipeDishes) {
    const covered = planDishes.some((p) => p.includes(d) || d.includes(p));
    if (!covered) return 0;
  }

  return 0.85 + shared.length * 0.02;
}

type AllNutritionMatch = { url: string; recipeName: string; score: number };

export type NutritionGuidanceImage = {
  url: string | null;
  source: "all_nutrition" | "unsplash" | null;
};

let allNutritionCache: { name: string; imageUrl: string }[] | null = null;
let allNutritionExactIndex: Map<string, { name: string; imageUrl: string }> | null = null;
const guidanceImageMemo = new Map<string, NutritionGuidanceImage>();

function allNutritionEntries(): { name: string; imageUrl: string }[] {
  if (!allNutritionCache) {
    allNutritionCache = FOOD_INDEX.filter(
      (f): f is typeof f & { imageUrl: string } =>
        typeof f.imageUrl === "string" && /^https:\/\//i.test(f.imageUrl.trim())
    ).map((f) => ({ name: f.name, imageUrl: f.imageUrl.trim() }));
    allNutritionExactIndex = new Map(
      allNutritionCache.map((entry) => [normalizeFoodName(entry.name), entry])
    );
  }
  return allNutritionCache;
}

/** Strict name match against All Nutrition recipe titles. */
export function matchAllNutritionImage(name: string): AllNutritionMatch | null {
  const target = String(name || "").trim();
  if (!target) return null;

  allNutritionEntries();
  const exact = allNutritionExactIndex?.get(normalizeFoodName(target));
  if (exact) {
    return { url: exact.imageUrl, recipeName: exact.name, score: 1 };
  }

  let best: AllNutritionMatch | null = null;
  for (const entry of allNutritionCache!) {
    const score = allNutritionNameScore(target, entry.name);
    if (score < 0.85) continue;
    if (!best || score > best.score) {
      best = { url: entry.imageUrl, recipeName: entry.name, score };
    }
  }
  return best;
}

/**
 * Personalized nutrition guidance image:
 * All Nutrition dataset (strict name match) → Unsplash curated (name/dish match) → none.
 * Never returns an image that does not match keywords in the meal name.
 */
export function resolveNutritionGuidanceImage(name: string): NutritionGuidanceImage {
  const cleaned = String(name || "").trim();
  if (!cleaned) return { url: null, source: null };

  const memoKey = cleaned.toLowerCase();
  const memoized = guidanceImageMemo.get(memoKey);
  if (memoized) return memoized;

  const allNutrition = matchAllNutritionImage(cleaned);
  if (allNutrition) {
    const result: NutritionGuidanceImage = { url: allNutrition.url, source: "all_nutrition" };
    guidanceImageMemo.set(memoKey, result);
    return result;
  }
  const unsplash = curatedFoodImageUrl(cleaned);
  const result: NutritionGuidanceImage = unsplash
    ? { url: unsplash, source: "unsplash" }
    : { url: null, source: null };
  guidanceImageMemo.set(memoKey, result);
  return result;
}

/**
 * Resolve an image source for a meal/food name.
 * Personalized nutrition should prefer resolveNutritionGuidanceImage.
 */
export function resolveFoodImageSource(
  name: string,
  preferred?: string | null,
  options?: ResolveFoodImageOptions
) {
  const datasetUrl = preferred?.trim();
  if (datasetUrl && /^https:\/\//i.test(datasetUrl) && options?.allowCommercialHosts) {
    return { uri: datasetUrl };
  }

  const guidance = resolveNutritionGuidanceImage(name);
  if (guidance.url) return { uri: guidance.url };
  if (datasetUrl && isUnsplashLicenseUrl(datasetUrl)) {
    return { uri: datasetUrl };
  }
  return { uri: FOOD_IMAGE_FALLBACK };
}

/** True for Unsplash License hosts only. */
export function isCopyrightFriendlyFoodImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return isUnsplashLicenseUrl(url);
}

/** @deprecated Use isCopyrightFriendlyFoodImageUrl */
export function isReliableFoodImageUrl(url: string | null | undefined): boolean {
  return isCopyrightFriendlyFoodImageUrl(url);
}

/**
 * Resolve an image URL for a meal/food name.
 * For personalized nutrition, prefer resolveNutritionGuidanceImage (may be null).
 */
export function resolveFoodImageUrl(
  name: string,
  preferred?: string | null,
  options?: ResolveFoodImageOptions
): string {
  const datasetUrl = preferred?.trim();
  if (datasetUrl && /^https:\/\//i.test(datasetUrl) && options?.allowCommercialHosts) {
    return datasetUrl;
  }
  const guidance = resolveNutritionGuidanceImage(name);
  if (guidance.url) return guidance.url;
  if (datasetUrl && isUnsplashLicenseUrl(datasetUrl)) {
    return datasetUrl;
  }
  return FOOD_IMAGE_FALLBACK;
}

/**
 * All Nutrition: always use the recipe dataset `imageUrl` when present.
 * Does not remap through curated Unsplash matching.
 */
export function resolveDatasetFoodImageSource(imageUrl?: string | null) {
  const url = imageUrl?.trim();
  if (url && /^https:\/\//i.test(url)) {
    return { uri: url };
  }
  return { uri: FOOD_IMAGE_FALLBACK };
}

export function resolveDatasetFoodImageUrl(imageUrl?: string | null): string {
  const url = imageUrl?.trim();
  if (url && /^https:\/\//i.test(url)) {
    return url;
  }
  return FOOD_IMAGE_FALLBACK;
}
