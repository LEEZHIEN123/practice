/** Curated food images — custom local assets when available, else Unsplash. */

import { Image } from "react-native";
import { FOOD_IMAGE_ASSETS, type FoodImageAssetKey } from "./foodImageAssets";

export const FOOD_IMAGE_FALLBACK =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80";

type CuratedEntry = {
  keys: string[];
  url: string;
  /** Prefer a custom generated asset that matches the dish type. */
  assetKey?: FoodImageAssetKey;
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
    assetKey: "oatmeal",
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
    assetKey: "tofu",
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
    assetKey: "eggs",
  },

  // Yogurt / dairy snacks
  {
    keys: ["greek yogurt", "yogurt", "yoghurt", "parfait", "cottage cheese"],
    url: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80",
    assetKey: "yogurt",
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
    assetKey: "wrap",
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
    assetKey: "soup",
  },
  {
    keys: ["turkey chili", "vegetarian chili", "vegan chili", "chili"],
    url: "https://images.unsplash.com/photo-1638324912294-8efe1c2c8786?auto=format&fit=crop&w=800&q=80",
    assetKey: "chili",
  },

  // Curry (distinct from chili)
  {
    keys: ["chickpea curry", "lentil curry", "vegetable curry", "curry"],
    url: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80",
    assetKey: "curry",
  },

  // Stir-fry / fajitas / skewers
  {
    keys: ["stir-fry", "stir fry", "stirfry", "fajita", "skewer"],
    url: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
    assetKey: "stirfry",
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
    assetKey: "veggieBurger",
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
    assetKey: "hummus",
  },

  // Wraps / burritos / toast
  {
    keys: ["wrap", "burrito", "taco", "quesadilla", "bagel"],
    url: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80",
    assetKey: "wrap",
  },
  {
    keys: ["avocado toast", "toast with avocado", "toast"],
    url: "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80",
    assetKey: "avocadoToast",
  },

  // Proteins before generic rice/quinoa sides
  {
    keys: ["salmon", "tuna", "shrimp", "prawn", "seafood", "cod", "tilapia", "fish"],
    url: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80",
    assetKey: "salmon",
  },
  {
    keys: ["chicken breast", "grilled chicken", "baked chicken", "chicken"],
    url: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80",
    assetKey: "chicken",
  },
  {
    keys: ["turkey meatball", "turkey sandwich", "turkey breast", "turkey"],
    url: "https://images.unsplash.com/photo-1574672280600-4accfa113ce9?auto=format&fit=crop&w=800&q=80",
    assetKey: "turkey",
  },
  {
    keys: ["steak", "roast beef", "beef stew", "beef stir", "beef"],
    url: "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=800&q=80",
    assetKey: "steak",
  },
  {
    keys: ["pork", "bacon", "ham"],
    url: "https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["tempeh", "tofu"],
    url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
    assetKey: "tofu",
  },

  // Rice / grain bowls (after protein mains)
  {
    keys: ["quinoa breakfast", "quinoa porridge", "quinoa bowl", "rice bowl", "grain bowl", "burrito bowl", "bowl", "risotto", "pilaf"],
    url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
    assetKey: "bowl",
  },
  {
    keys: ["brown rice", "quinoa", "rice"],
    url: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
    assetKey: "bowl",
  },

  // Avocado (standalone)
  {
    keys: ["avocado"],
    url: "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80",
    assetKey: "avocadoToast",
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
    assetKey: "applePeanutButter",
  },
  {
    keys: [
      "banana with peanut butter",
      "banana with almond butter",
      "banana with peanut",
      "banana with almond",
    ],
    url: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80",
    assetKey: "bananaPeanutButter",
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
    assetKey: "applePeanutButter",
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
    assetKey: "trailMix",
  },

  // Bars
  {
    keys: ["protein bar", "energy bar"],
    url: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80",
    assetKey: "proteinBar",
  },

  // Popcorn
  {
    keys: ["popcorn"],
    url: "https://images.unsplash.com/photo-1578849278619-e73505e9610f?auto=format&fit=crop&w=800&q=80",
    assetKey: "popcorn",
  },

  // Plain nuts
  {
    keys: ["mixed nuts", "granola", "almonds", "peanuts", "dark chocolate with almond", "nuts", "nut"],
    url: "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&q=80",
    assetKey: "almonds",
  },
  {
    keys: ["almond", "peanut"],
    url: "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&q=80",
    assetKey: "almonds",
  },

  // Fruit snacks
  {
    keys: ["fruit and nut", "fruit & nut", "berries", "berry", "strawberry", "mango", "orange", "fruit"],
    url: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=800&q=80",
  },
  {
    keys: ["banana"],
    url: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80",
    assetKey: "bananaPeanutButter",
  },
  {
    keys: ["apple"],
    url: "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=800&q=80",
    assetKey: "apple",
  },

  // Potatoes / fries
  {
    keys: ["sweet potato", "potato", "fries", "hash brown", "hash"],
    url: "https://images.unsplash.com/photo-1518013431117-eb1465fa9792?auto=format&fit=crop&w=800&q=80",
  },

  // Beans / lentils / chickpeas (after soups/burgers/curries)
  {
    keys: ["chickpea", "lentil", "black bean", "bean"],
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

  // Generic breakfast last
  {
    keys: ["breakfast"],
    url: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=800&q=80",
  },
];

const RELIABLE_HOSTS = new Set([
  "images.unsplash.com",
  "www.allrecipes.com",
  "allrecipes.com",
  "imagesvc.meredithcorp.io",
]);

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

function findBestCuratedEntry(name: string): CuratedEntry | null {
  const lower = String(name || "").toLowerCase();
  if (!lower.trim()) return null;

  let best: CuratedEntry | null = null;
  let bestScore = -1;

  for (let i = 0; i < CURATED.length; i++) {
    const entry = CURATED[i]!;
    for (const key of entry.keys) {
      if (!keyMatches(lower, key)) continue;
      const score = key.trim().length * 100 + dishTypeBoost(lower, key) - i;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
  }

  return best;
}

function assetUri(assetKey: FoodImageAssetKey): string | null {
  try {
    const resolved = Image.resolveAssetSource(FOOD_IMAGE_ASSETS[assetKey]);
    return resolved?.uri ?? null;
  } catch {
    return null;
  }
}

export function curatedFoodImageUrl(name: string): string {
  const entry = findBestCuratedEntry(name);
  if (!entry) return FOOD_IMAGE_FALLBACK;
  if (entry.assetKey) {
    const local = assetUri(entry.assetKey);
    if (local) return local;
  }
  return entry.url;
}

/** Prefer recipe-dataset / RECEPI.csv URL when provided; else curated local/Unsplash; else fallback. */
export function resolveFoodImageSource(name: string, preferred?: string | null) {
  const datasetUrl = preferred?.trim();
  if (datasetUrl && /^https?:\/\//i.test(datasetUrl)) {
    return { uri: datasetUrl };
  }
  const entry = findBestCuratedEntry(name);
  if (entry?.assetKey) {
    return FOOD_IMAGE_ASSETS[entry.assetKey];
  }
  return { uri: entry?.url ?? FOOD_IMAGE_FALLBACK };
}

export function isReliableFoodImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  // Bundled custom food photos (Metro / native asset URIs).
  if (url.startsWith("file:") || url.startsWith("asset:") || url.includes("/assets/food/")) {
    return true;
  }
  if (!/^https:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return RELIABLE_HOSTS.has(host);
  } catch {
    return false;
  }
}

/**
 * Prefer recipe-dataset `imageUrl` (from RECEPI.csv) when present.
 * Otherwise use local curated assets / Unsplash for known meal names.
 */
export function resolveFoodImageUrl(name: string, preferred?: string | null): string {
  const datasetUrl = preferred?.trim();
  if (datasetUrl && /^https?:\/\//i.test(datasetUrl)) {
    return datasetUrl;
  }
  const entry = findBestCuratedEntry(name);
  if (entry?.assetKey) {
    const local = assetUri(entry.assetKey);
    if (local) return local;
  }
  return entry?.url ?? FOOD_IMAGE_FALLBACK;
}
