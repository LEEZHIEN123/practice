function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function keyMatches(name, key) {
  const trimmed = key.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed === "almond" && /\balmond\s+milk\b/.test(name)) return false;
  if (trimmed === "peanut" && /\bpeanut\s+(butter|sauce|oil)\b/.test(name)) return false;
  if (trimmed === "almond" && /\balmond\s+butter\b/.test(name)) return false;
  const words = trimmed.split(/\s+/).map((w) => escapeRegExp(w));
  const last = words[words.length - 1];
  if (!last.endsWith("s")) words[words.length - 1] = `${last}s?`;
  return new RegExp(`(^|[^a-z0-9])${words.join("\\s+")}([^a-z0-9]|$)`, "i").test(name);
}

const DISH_TYPES = [
  "overnight oats", "oatmeal", "pancake", "waffle", "french toast", "omelette", "omelet", "scramble",
  "yogurt", "yoghurt", "parfait", "smoothie", "shake", "soup", "stew", "chowder", "chili", "curry",
  "stir-fry", "stir fry", "pasta", "spaghetti", "lasagna", "noodle", "burger", "wrap", "burrito",
  "taco", "pizza", "sushi", "bowl", "trail mix", "crostada", "muffin", "brownie", "cookie", "cake",
  "pie", "crisp",
];
const SECONDARY = ["sandwich", "toast", "bread"];
const PROTEIN = [
  "salmon", "tuna", "shrimp", "prawn", "seafood", "cod", "tilapia", "fish", "chicken", "turkey",
  "steak", "beef", "pork", "bacon", "tofu", "tempeh", "eggs", "egg",
];

function isPrimarySalad(name) {
  if (/\bsalad\s+sandwich\b/.test(name)) return true;
  if (/\b(chicken|tuna|quinoa|greek|fruit|chickpea|bean|pasta|black bean)\s+salads?\b/.test(name)) return true;
  const saladIdx = name.search(/\bsalads?\b/);
  if (saladIdx < 0) return false;
  const withIdx = name.search(/\bwith\b/);
  if (withIdx < 0) return true;
  return saladIdx < withIdx;
}
function boost(name, key) {
  let b = 0;
  if (key.includes("salad") && name.includes("salad")) b = Math.max(b, isPrimarySalad(name) ? 5500 : 400);
  for (const d of DISH_TYPES) if (name.includes(d) && key.includes(d)) b = Math.max(b, 5000 + d.length);
  for (const d of SECONDARY) if (name.includes(d) && key.includes(d)) b = Math.max(b, 3500 + d.length);
  for (const p of PROTEIN) {
    if (name.includes(p) && key.includes(p)) {
      b = Math.max(b, (p === "egg" || p === "eggs" ? 4000 : 3000) + p.length);
    }
  }
  return b;
}

const CURATED = [
  [["overnight oats", "oatmeal", "porridge", "rolled oats", "oat"], "oatmeal"],
  [["protein pancake", "pancake", "waffle", "french toast"], "pancakes"],
  [["scrambled egg", "scrambled tofu", "omelette", "omelet", "egg scramble", "tofu scramble", "scramble", "scrambled", "eggs", "egg"], "eggs"],
  [["greek yogurt", "yogurt", "yoghurt", "parfait", "cottage cheese"], "yogurt"],
  [["protein shake", "smoothie", "shake", "milkshake", "almond milk", "oat milk"], "smoothie"],
  [["chicken salad", "tuna salad", "quinoa salad", "greek salad", "fruit salad", "pasta salad", "salad"], "salad"],
  [["lentil soup", "vegetable soup", "chicken soup", "tomato soup", "soup", "stew", "chowder", "broth"], "soup"],
  [["turkey chili", "vegetarian chili", "vegan chili", "chili"], "chili"],
  [["chickpea curry", "lentil curry", "vegetable curry", "curry"], "curry"],
  [["stir-fry", "stir fry", "stirfry"], "stirfry"],
  [["lentil pasta", "spaghetti", "lasagna", "macaroni", "noodle", "pasta"], "pasta"],
  [["brown rice", "fried rice", "rice bowl", "quinoa bowl", "grain bowl", "bowl", "risotto", "pilaf", "quinoa", "rice"], "bowl"],
  [["black bean burger", "lentil burger", "veggie burger", "bean burger", "vegan burger"], "veggieBurger"],
  [["burger", "cheeseburger"], "burger"],
  [["hummus", "wrap", "burrito", "taco", "quesadilla", "sandwich", "bagel"], "wrap"],
  [["toast", "bread", "cornbread"], "bread"],
  [["pizza"], "pizza"],
  [["sushi", "sashimi", "poke"], "sushi"],
  [["salmon", "tuna", "shrimp", "prawn", "seafood", "cod", "tilapia", "fish"], "seafood"],
  [["chicken breast", "chicken"], "chicken"],
  [["turkey"], "turkey"],
  [["steak", "beef"], "steak"],
  [["pork", "bacon", "ham"], "pork"],
  [["tofu", "tempeh"], "tofu"],
  [["avocado toast", "avocado"], "avocadoToast"],
  [["apple with peanut butter", "apple with almond butter", "apple slices with peanut butter", "apple slices with almond butter", "apple with peanut", "apple with almond"], "applePeanutButter"],
  [["banana with peanut butter", "banana with almond butter", "banana with peanut", "banana with almond"], "bananaPeanutButter"],
  [["celery with peanut butter", "celery sticks with peanut butter", "fruit with peanut butter", "fruit with almond butter", "fruit with nut butter", "with peanut butter", "with almond butter", "peanut butter", "almond butter", "nut butter"], "applePeanutButter"],
  [["trail mix", "fruit and nut mix", "fruit & nut mix", "nut mix"], "trailMix"],
  [["energy bar", "granola", "almonds", "peanuts", "nuts", "nut"], "almonds"],
  [["almond", "peanut"], "almonds"],
  [["fruit and nut", "fruit & nut", "berries", "berry", "strawberry", "mango", "orange", "fruit"], "fruit"],
  [["banana"], "fruit"],
  [["apple"], "apple"],
  [["sweet potato", "potato", "fries", "hash brown", "hash"], "potato"],
  [["chickpea", "lentil", "black bean", "bean"], "beans"],
  [["veggie sticks", "vegetable", "veggie", "vegan", "vegetarian", "broccoli", "spinach", "kale"], "veggies"],
  [["cheese"], "cheese"],
  [["muffin", "cupcake", "brownie", "cookie", "cake", "pie", "crisp", "crostada", "dessert"], "dessert"],
  [["coffee", "latte", "tea", "juice"], "drink"],
  [["breakfast"], "breakfast"],
];

function match(name) {
  const lower = name.toLowerCase();
  let best = null;
  let bestScore = -1;
  let bestKey = null;
  for (let i = 0; i < CURATED.length; i++) {
    const [keys, label] = CURATED[i];
    for (const key of keys) {
      if (!keyMatches(lower, key)) continue;
      const score = key.trim().length * 100 + boost(lower, key) - i;
      if (score > bestScore) {
        bestScore = score;
        best = label;
        bestKey = key;
      }
    }
  }
  return { label: best, key: bestKey, score: bestScore };
}

const checks = [
  "Apple with peanut butter",
  "Apple with almond butter",
  "Banana with peanut butter",
  "Trail mix",
  "Trail mix with nuts and seeds",
  "Fruit and nut mix",
  "Almonds",
  "Celery sticks with peanut butter",
  "Almond milk with banana and chia seeds",
  "Apple",
  "Banana",
];
for (const n of checks) console.log(JSON.stringify({ n, ...match(n) }));
