import { resolveNutritionGuidanceImage } from "./foodImages";
import nutritionPlanDataset from "./nutritionPlanDataset.json";
import { durationDays, type GoalKey, type PlanDuration } from "./workoutPlan";

export type NutritionActivityKey =
  | "sedentary"
  | "light"
  | "moderate"
  | "very_active"
  | "super_active";
export type NutritionDietaryKey = "omnivore" | "vegetarian" | "vegan";
export type NutritionBmiCategory = "Underweight" | "Normal" | "Overweight" | "Obese";

export type NutritionMealSuggestion = {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  ingredients: string[];
  directions: string[];
  imageUrl?: string | null;
};

export type NutritionDaySchedule = {
  day: number;
  breakfast: NutritionMealSuggestion;
  lunch: NutritionMealSuggestion;
  dinner: NutritionMealSuggestion;
  snack: NutritionMealSuggestion;
};

export type ActiveNutritionPlan = {
  duration: PlanDuration;
  createdAt: string;
  bmi: number | null;
  bmiCategory: NutritionBmiCategory | null;
  goal: GoalKey | null;
  dietaryPreference: NutritionDietaryKey | null;
  activityLevel: NutritionActivityKey | null;
  schedule: NutritionDaySchedule[];
};

type DatasetMeal = {
  id: number;
  n: string;
  cal: number;
  p?: number;
  c?: number;
  f?: number;
  i: string[];
  d: string[];
  img: string;
  /** Diet bucket this meal was indexed under. */
  diet?: NutritionDietaryKey;
};

type DatasetCombo = { b: number; l: number; di: number; s: number };

type DatasetFile = {
  meals: DatasetMeal[];
  index: Record<string, DatasetCombo[]>;
};

const DATA = nutritionPlanDataset as DatasetFile;
const MEALS_BY_ID = new Map(DATA.meals.map((m) => [m.id, m]));

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function nutritionBmiCategory(bmi: number | null | undefined): NutritionBmiCategory | null {
  if (bmi == null || !Number.isFinite(bmi)) return null;
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

export function normalizeNutritionActivity(
  level: string | null | undefined,
  activityMultiplier?: number | null
): NutritionActivityKey | null {
  const raw = String(level ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (raw === "sedentary") return "sedentary";
  if (raw === "light" || raw === "lightly_active") return "light";
  if (raw === "moderate" || raw === "moderately_active") return "moderate";
  if (raw === "very_active" || raw === "extra_active") return "very_active";
  if (raw === "super_active") return "super_active";

  const m = Number(activityMultiplier);
  if (!Number.isFinite(m) || m <= 0) return null;
  if (m <= 1.25) return "sedentary";
  if (m <= 1.4) return "light";
  if (m <= 1.6) return "moderate";
  if (m <= 1.8) return "very_active";
  return "super_active";
}

export function normalizeNutritionDietary(
  preference: string | null | undefined
): NutritionDietaryKey | null {
  const raw = String(preference ?? "")
    .trim()
    .toLowerCase();
  if (raw === "omnivore") return "omnivore";
  if (raw === "vegetarian") return "vegetarian";
  if (raw === "vegan") return "vegan";
  return null;
}

/**
 * Map dataset / profile goal labels onto app GoalKey.
 * Dataset "Muscle Gain" = app "Gain Weight" / gain
 * Dataset "Maintenance" = app "Maintain Weight" / maintain
 * Dataset "Weight Loss" = app "Lose Weight" / lose
 */
export function normalizeNutritionGoal(value: string | null | undefined): GoalKey | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!raw) return null;
  if (
    raw === "gain" ||
    raw === "muscle gain" ||
    raw === "gain muscle" ||
    raw === "gain weight" ||
    raw === "weight gain"
  ) {
    return "gain";
  }
  if (
    raw === "lose" ||
    raw === "weight loss" ||
    raw === "lose weight" ||
    raw === "fat loss"
  ) {
    return "lose";
  }
  if (
    raw === "maintain" ||
    raw === "maintenance" ||
    raw === "weight maintenance" ||
    raw === "maintain weight"
  ) {
    return "maintain";
  }
  return null;
}

export function nutritionGoalLabel(goal: GoalKey | null | undefined): string {
  if (goal === "gain") return "Gain Weight";
  if (goal === "lose") return "Lose Weight";
  if (goal === "maintain") return "Maintain Weight";
  return "—";
}

/** Same Today Calorie target used on Home (TDEE adjusted by fitness goal). */
export function nutritionIntakeTargetKcal(params: {
  weightKg: number | null | undefined;
  heightCm: number | null | undefined;
  age: number | null | undefined;
  gender: "male" | "female" | null | undefined;
  activityMultiplier?: number | null;
  goal: GoalKey | null | undefined;
}): number | null {
  const weightKg = Number(params.weightKg);
  const heightCm = Number(params.heightCm);
  const age = Number(params.age);
  if (!weightKg || !heightCm || !age || !params.gender) return null;
  const bmr =
    params.gender === "male"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  const mult =
    typeof params.activityMultiplier === "number" && params.activityMultiplier > 0
      ? params.activityMultiplier
      : 1.2;
  const tdee = bmr * mult;
  if (params.goal === "lose") return Math.round(tdee - 500);
  if (params.goal === "gain") return Math.round(tdee + 300);
  return Math.round(tdee);
}

export function nutritionDietaryLabel(d: NutritionDietaryKey | null | undefined): string {
  if (d === "omnivore") return "Omnivore";
  if (d === "vegetarian") return "Vegetarian";
  if (d === "vegan") return "Vegan";
  return "—";
}

export function nutritionActivityLabel(a: NutritionActivityKey | null | undefined): string {
  if (a === "sedentary") return "Sedentary";
  if (a === "light") return "Light";
  if (a === "moderate") return "Moderate";
  if (a === "very_active") return "Very Active";
  if (a === "super_active") return "Super Active";
  return "—";
}

/** Expand cooking abbreviations (tsp/tbsp) to full words for display. */
export function expandCookingAbbreviations(text: string): string {
  if (!text) return text;
  let s = text;
  s = s.replace(
    /\b(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(tbsp|tbsps)\b\.?/gi,
    (_m, qty: string) => {
      const isFraction = /\//.test(qty);
      const n = Number(String(qty).trim().split(/\s+/).pop());
      const word = isFraction || n === 1 ? "tablespoon" : "tablespoons";
      return `${qty} ${word}`;
    }
  );
  s = s.replace(/\b(tbsp|tbsps)\b\.?/gi, "tablespoon");
  s = s.replace(
    /\b(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(tsp|tsps)\b\.?/gi,
    (_m, qty: string) => {
      const isFraction = /\//.test(qty);
      const n = Number(String(qty).trim().split(/\s+/).pop());
      const word = isFraction || n === 1 ? "teaspoon" : "teaspoons";
      return `${qty} ${word}`;
    }
  );
  s = s.replace(/\b(tsp|tsps)\b\.?/gi, "teaspoon");
  return s;
}

function estimateMacrosFromCalories(name: string, calories: number): {
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  const cal = Math.max(80, Number(calories) || 300);
  const lower = String(name || "").toLowerCase();
  let pRatio = 0.25;
  let cRatio = 0.45;
  let fRatio = 0.3;
  if (/(chicken|turkey|fish|salmon|tuna|egg|tofu|protein)/.test(lower)) {
    pRatio = 0.35;
    cRatio = 0.35;
    fRatio = 0.3;
  } else if (/(oatmeal|oat|rice|pasta|bread|toast|pancake|cereal|quinoa)/.test(lower)) {
    pRatio = 0.15;
    cRatio = 0.6;
    fRatio = 0.25;
  } else if (/(nut|avocado|trail mix|peanut|almond|cheese)/.test(lower)) {
    pRatio = 0.15;
    cRatio = 0.25;
    fRatio = 0.6;
  }
  return {
    proteinG: Math.round((cal * pRatio) / 4),
    carbsG: Math.round((cal * cRatio) / 4),
    fatG: Math.round((cal * fRatio) / 9),
  };
}

function lookupDatasetMeal(name: string): DatasetMeal | undefined {
  const target = expandCookingAbbreviations(String(name || "")).trim().toLowerCase();
  if (!target) return undefined;
  return DATA.meals.find((m) => expandCookingAbbreviations(m.n).trim().toLowerCase() === target);
}

function expandMealSuggestion(meal: NutritionMealSuggestion): NutritionMealSuggestion {
  const fromDataset = lookupDatasetMeal(meal.name);
  const displayName = expandCookingAbbreviations(meal.name || fromDataset?.n || "");
  const estimated = estimateMacrosFromCalories(displayName, meal.calories || fromDataset?.cal || 0);
  const proteinG =
    typeof meal.proteinG === "number" && Number.isFinite(meal.proteinG)
      ? meal.proteinG
      : typeof fromDataset?.p === "number"
        ? fromDataset.p
        : estimated.proteinG;
  const carbsG =
    typeof meal.carbsG === "number" && Number.isFinite(meal.carbsG)
      ? meal.carbsG
      : typeof fromDataset?.c === "number"
        ? fromDataset.c
        : estimated.carbsG;
  const fatG =
    typeof meal.fatG === "number" && Number.isFinite(meal.fatG)
      ? meal.fatG
      : typeof fromDataset?.f === "number"
        ? fromDataset.f
        : estimated.fatG;
  // Keep an already-resolved image (archive restore) — avoids slow All Nutrition scans on switch.
  const imageUrl =
    meal.imageUrl !== undefined
      ? meal.imageUrl
      : resolveNutritionGuidanceImage(displayName).url;

  return {
    ...meal,
    name: displayName,
    calories: meal.calories || fromDataset?.cal || 0,
    proteinG,
    carbsG,
    fatG,
    ingredients: (meal.ingredients ?? []).map(expandCookingAbbreviations),
    directions: (meal.directions ?? []).map(expandCookingAbbreviations),
    imageUrl,
  };
}

export function expandNutritionPlanText(plan: ActiveNutritionPlan): ActiveNutritionPlan {
  return {
    ...plan,
    schedule: (plan.schedule ?? []).map((day) => ({
      ...day,
      breakfast: expandMealSuggestion(day.breakfast),
      lunch: expandMealSuggestion(day.lunch),
      dinner: expandMealSuggestion(day.dinner),
      snack: expandMealSuggestion(day.snack),
    })),
  };
}

function mealFromId(id: number): NutritionMealSuggestion {
  const m = MEALS_BY_ID.get(id);
  if (!m) {
    return {
      name: "Meal suggestion",
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      ingredients: [],
      directions: [],
    };
  }
  const estimated = estimateMacrosFromCalories(m.n, m.cal);
  return expandMealSuggestion({
    name: m.n,
    calories: m.cal,
    proteinG: typeof m.p === "number" ? m.p : estimated.proteinG,
    carbsG: typeof m.c === "number" ? m.c : estimated.carbsG,
    fatG: typeof m.f === "number" ? m.f : estimated.fatG,
    ingredients: Array.isArray(m.i) ? m.i : [],
    directions: Array.isArray(m.d) ? m.d : [],
    imageUrl: undefined,
  });
}

function dayFromCombo(day: number, combo: DatasetCombo): NutritionDaySchedule {
  return {
    day,
    breakfast: mealFromId(combo.b),
    lunch: mealFromId(combo.l),
    dinner: mealFromId(combo.di),
    snack: mealFromId(combo.s),
  };
}

function parseKey(key: string): {
  activity: NutritionActivityKey;
  bmi: NutritionBmiCategory;
  goal: GoalKey;
  diet: NutritionDietaryKey;
} | null {
  const parts = key.split("|");
  const [activity, bmi, goal, diet] = parts;
  if (
    (activity !== "sedentary" &&
      activity !== "light" &&
      activity !== "moderate" &&
      activity !== "very_active" &&
      activity !== "super_active") ||
    (bmi !== "Underweight" && bmi !== "Normal" && bmi !== "Overweight" && bmi !== "Obese") ||
    (goal !== "gain" && goal !== "maintain" && goal !== "lose") ||
    (diet !== "omnivore" && diet !== "vegetarian" && diet !== "vegan")
  ) {
    return null;
  }
  return { activity, bmi, goal, diet };
}

function comboCalories(combo: DatasetCombo): number {
  return (
    (MEALS_BY_ID.get(combo.b)?.cal ?? 0) +
    (MEALS_BY_ID.get(combo.l)?.cal ?? 0) +
    (MEALS_BY_ID.get(combo.di)?.cal ?? 0) +
    (MEALS_BY_ID.get(combo.s)?.cal ?? 0)
  );
}

const MEAT_FISH_RE =
  /\b(chicken|turkey|beef|pork|lamb|meat|fish|salmon|tuna|sardine|sardines|shrimp|seafood|bacon|ham|sausage|mince|steak|pate|scotch egg)\b/i;
const EGG_RE = /\b(egg|eggs|omelette|omelet)\b/i;
const DAIRY_RE =
  /\b(milk|cheese|yoghurt|yogurt|butter|cream|custard|ice cream|whey|ghee)\b/i;
const HONEY_RE = /\bhoney\b/i;

function stripStockPhrases(text: string): string {
  return String(text || "").replace(/\b(chicken|beef|bone|fish)\s+(stock|broth)\b/gi, "vegetable stock");
}

function inferMealDiet(name: string, ingredients: string[] = []): NutritionDietaryKey {
  const blob = stripStockPhrases([name, ...ingredients].join(" "));
  if (MEAT_FISH_RE.test(blob)) return "omnivore";
  if (EGG_RE.test(blob) || DAIRY_RE.test(blob) || HONEY_RE.test(blob)) return "vegetarian";
  return "vegan";
}

function mealMatchesDiet(mealId: number, diet: NutritionDietaryKey): boolean {
  const meal = MEALS_BY_ID.get(mealId);
  if (!meal) return false;
  const tagged =
    meal.diet === "omnivore" || meal.diet === "vegetarian" || meal.diet === "vegan"
      ? meal.diet
      : inferMealDiet(meal.n, Array.isArray(meal.i) ? meal.i : []);
  if (diet === "omnivore") return true;
  if (diet === "vegetarian") return tagged === "vegetarian" || tagged === "vegan";
  return tagged === "vegan";
}

function filterCombosForDiet(combos: DatasetCombo[], diet: NutritionDietaryKey): DatasetCombo[] {
  return combos.filter(
    (c) =>
      mealMatchesDiet(c.b, diet) &&
      mealMatchesDiet(c.l, diet) &&
      mealMatchesDiet(c.di, diet) &&
      mealMatchesDiet(c.s, diet)
  );
}

/**
 * Matching meal sets must share the user's fitness goal, dietary preference,
 * and BMI category. Rows missing any of these three are never recommended.
 * Meals may be mixed across matching sets; every meal must match the diet.
 * Optional daily calorie cap applies.
 */
export function findMatchingNutritionCombos(params: {
  bmiCategory: NutritionBmiCategory | null;
  goal: GoalKey | null;
  dietaryPreference: NutritionDietaryKey | null;
  dailyCalorieTarget?: number | null;
}): DatasetCombo[] {
  if (!params.bmiCategory || !params.goal || !params.dietaryPreference) {
    return [];
  }

  const entries = Object.entries(DATA.index)
    .map(([key, combos]) => {
      const parsed = parseKey(key);
      if (!parsed) return null;
      return { ...parsed, combos };
    })
    .filter(Boolean) as Array<{
    activity: NutritionActivityKey;
    bmi: NutritionBmiCategory;
    goal: GoalKey;
    diet: NutritionDietaryKey;
    combos: DatasetCombo[];
  }>;

  const pool = entries.filter(
    (e) =>
      e.bmi === params.bmiCategory &&
      e.goal === params.goal &&
      e.diet === params.dietaryPreference
  );
  let combos = filterCombosForDiet(
    pool.flatMap((e) => e.combos),
    params.dietaryPreference
  );
  if (!combos.length) return [];

  const cap =
    typeof params.dailyCalorieTarget === "number" &&
    Number.isFinite(params.dailyCalorieTarget) &&
    params.dailyCalorieTarget > 0
      ? params.dailyCalorieTarget
      : null;
  if (cap != null) {
    const within = combos.filter((c) => comboCalories(c) <= cap + 25);
    if (within.length) combos = within;
  }
  return combos;
}

/** Dietary preferences that have at least one matching set for this goal + BMI. */
export function availableNutritionDietaryOptions(params: {
  bmiCategory: NutritionBmiCategory | null;
  goal: GoalKey | null;
  dailyCalorieTarget?: number | null;
}): NutritionDietaryKey[] {
  const options: NutritionDietaryKey[] = ["omnivore", "vegetarian", "vegan"];
  return options.filter(
    (dietaryPreference) =>
      findMatchingNutritionCombos({
        bmiCategory: params.bmiCategory,
        goal: params.goal,
        dietaryPreference,
        dailyCalorieTarget: params.dailyCalorieTarget,
      }).length > 0
  );
}

function buildMixedDayCombo(
  combos: DatasetCombo[],
  diet: NutritionDietaryKey,
  dailyCalorieTarget?: number | null
): DatasetCombo | null {
  if (!combos.length) return null;

  const breakfasts = [...new Set(combos.map((c) => c.b))].filter((id) => mealMatchesDiet(id, diet));
  const lunches = [...new Set(combos.map((c) => c.l))].filter((id) => mealMatchesDiet(id, diet));
  const dinners = [...new Set(combos.map((c) => c.di))].filter((id) => mealMatchesDiet(id, diet));
  const snacks = [...new Set(combos.map((c) => c.s))].filter((id) => mealMatchesDiet(id, diet));
  if (!breakfasts.length || !lunches.length || !dinners.length || !snacks.length) return null;

  const cap =
    typeof dailyCalorieTarget === "number" &&
    Number.isFinite(dailyCalorieTarget) &&
    dailyCalorieTarget > 0
      ? dailyCalorieTarget
      : null;

  for (let attempt = 0; attempt < 40; attempt++) {
    const next: DatasetCombo = {
      b: pickRandom(breakfasts),
      l: pickRandom(lunches),
      di: pickRandom(dinners),
      s: pickRandom(snacks),
    };
    if (cap == null || comboCalories(next) <= cap + 25) return next;
  }

  const sorted = [...combos].sort((a, b) => comboCalories(a) - comboCalories(b));
  const lightest = sorted[0]!;
  if (cap == null || comboCalories(lightest) <= cap + 25) return lightest;
  return null;
}

export function generateActiveNutritionPlan(params: {
  duration: PlanDuration;
  bmi: number | null;
  goal: GoalKey | null;
  dietaryPreference: NutritionDietaryKey | null;
  activityLevel: NutritionActivityKey | null;
  dailyCalorieTarget?: number | null;
}): ActiveNutritionPlan {
  const bmiCategory = nutritionBmiCategory(params.bmi);
  const combos = findMatchingNutritionCombos({
    bmiCategory,
    goal: params.goal,
    dietaryPreference: params.dietaryPreference,
    dailyCalorieTarget: params.dailyCalorieTarget,
  });
  const days = durationDays(params.duration);
  const schedule: NutritionDaySchedule[] = [];
  for (let i = 0; i < days; i++) {
    const combo = params.dietaryPreference
      ? buildMixedDayCombo(combos, params.dietaryPreference, params.dailyCalorieTarget)
      : null;
    if (!combo) break;
    schedule.push(dayFromCombo(i + 1, combo));
  }

  return {
    duration: params.duration,
    createdAt: new Date().toISOString(),
    bmi: params.bmi,
    bmiCategory,
    goal: params.goal,
    dietaryPreference: params.dietaryPreference,
    activityLevel: params.activityLevel,
    schedule,
  };
}

export function nutritionPlanOutOfSync(
  plan: ActiveNutritionPlan | null | undefined,
  params: {
    duration: PlanDuration;
    bmi: number | null;
    goal: GoalKey | null;
    dietaryPreference: NutritionDietaryKey | null;
    activityLevel: NutritionActivityKey | null;
  }
): boolean {
  if (!plan) return true;
  if (plan.duration !== params.duration) return true;
  if (plan.goal !== params.goal) return true;
  if (plan.dietaryPreference !== params.dietaryPreference) return true;
  if (plan.activityLevel !== params.activityLevel) return true;
  if (plan.bmiCategory !== nutritionBmiCategory(params.bmi)) return true;
  if (!Array.isArray(plan.schedule)) return true;
  // Empty schedule is valid when no dataset rows match goal + diet + BMI.
  if (plan.schedule.length === 0) return false;
  if (plan.schedule.length !== durationDays(params.duration)) return true;
  const sample = plan.schedule[0]?.breakfast;
  if (
    !sample ||
    typeof sample.proteinG !== "number" ||
    typeof sample.carbsG !== "number" ||
    typeof sample.fatG !== "number"
  ) {
    return true;
  }
  return false;
}

export type NutritionPlanArchiveEntry = {
  plan: ActiveNutritionPlan;
  lastCompletedDay?: number | null;
  lastCompletedAt?: string | null;
};

function nutritionPlanArchiveBmiKey(bmiCategory: NutritionBmiCategory): string {
  return bmiCategory.toLowerCase().replace(/\s/g, "_");
}

/** Firestore field: `nutritionPlanArchive.{goal}.{duration}.{diet}.{bmiCategory}.{activityLevel}` */
export function nutritionPlanArchiveField(
  goal: GoalKey,
  duration: PlanDuration,
  diet: NutritionDietaryKey,
  bmiCategory: NutritionBmiCategory,
  activityLevel: NutritionActivityKey
): string {
  const cat = nutritionPlanArchiveBmiKey(bmiCategory);
  return `nutritionPlanArchive.${goal}.${duration}.${diet}.${cat}.${activityLevel}`;
}

export function nutritionPlanDurationFromUserData(
  data: Record<string, unknown> | undefined
): PlanDuration {
  const nutritionDuration = data?.nutritionPlanDuration;
  if (
    nutritionDuration === "week" ||
    nutritionDuration === "biweekly" ||
    nutritionDuration === "monthly"
  ) {
    return nutritionDuration;
  }
  const planDuration = data?.planDuration;
  if (planDuration === "week" || planDuration === "biweekly" || planDuration === "monthly") {
    return planDuration;
  }
  return "week";
}

export function getNutritionPlanArchiveEntry(
  data: Record<string, unknown> | undefined,
  goal: GoalKey,
  duration: PlanDuration,
  diet: NutritionDietaryKey,
  bmiCategory: NutritionBmiCategory,
  activityLevel: NutritionActivityKey
): NutritionPlanArchiveEntry | null {
  const root = data?.nutritionPlanArchive as Record<string, unknown> | undefined;
  const byGoal = root?.[goal] as Record<string, unknown> | undefined;
  const byDuration = byGoal?.[duration] as Record<string, unknown> | undefined;
  const byDiet = byDuration?.[diet] as Record<string, unknown> | undefined;
  const cat = nutritionPlanArchiveBmiKey(bmiCategory);
  const byBmi = byDiet?.[cat] as Record<string, unknown> | undefined;
  const entry = byBmi?.[activityLevel] as NutritionPlanArchiveEntry | undefined;
  if (!entry?.plan) return null;
  return entry;
}

/** Save the current active plan + progress under its profile key before switching away. */
export function nutritionPlanArchiveUpdateFields(
  plan: ActiveNutritionPlan,
  lastCompletedDay: number | null,
  lastCompletedAt: Date | null
): Record<string, unknown> {
  if (!plan.goal || !plan.dietaryPreference || !plan.bmiCategory || !plan.activityLevel) {
    return {};
  }
  const field = nutritionPlanArchiveField(
    plan.goal,
    plan.duration,
    plan.dietaryPreference,
    plan.bmiCategory,
    plan.activityLevel
  );
  return {
    [field]: {
      plan,
      lastCompletedDay: lastCompletedDay ?? null,
      lastCompletedAt: lastCompletedAt ? lastCompletedAt.toISOString() : null,
    },
  };
}

export function parseArchiveLastCompletedAt(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    const parsed = (value as { toDate: () => Date }).toDate();
    return parsed instanceof Date ? parsed : null;
  }
  return null;
}

/** True when an archived plan exists for this profile combo and is still valid. */
export function canRestoreNutritionPlan(params: {
  data: Record<string, unknown> | undefined;
  duration: PlanDuration;
  bmi: number | null;
  goal: GoalKey | null;
  dietaryPreference: NutritionDietaryKey | null;
  activityLevel: NutritionActivityKey | null;
}): boolean {
  const bmiCategory = nutritionBmiCategory(params.bmi);
  if (!params.goal || !params.dietaryPreference || !bmiCategory || !params.activityLevel) {
    return false;
  }
  const cached = getNutritionPlanArchiveEntry(
    params.data,
    params.goal,
    params.duration,
    params.dietaryPreference,
    bmiCategory,
    params.activityLevel
  );
  return !!(
    cached?.plan &&
    !nutritionPlanOutOfSync(cached.plan, {
      duration: params.duration,
      bmi: params.bmi,
      goal: params.goal,
      dietaryPreference: params.dietaryPreference,
      activityLevel: params.activityLevel,
    })
  );
}

/** Restore a saved plan for this profile combo if still valid; otherwise generate a new one. */
export function pickOrGenerateNutritionPlan(params: {
  data: Record<string, unknown> | undefined;
  duration: PlanDuration;
  bmi: number | null;
  goal: GoalKey | null;
  dietaryPreference: NutritionDietaryKey | null;
  activityLevel: NutritionActivityKey | null;
  dailyCalorieTarget?: number | null;
}): {
  plan: ActiveNutritionPlan;
  lastCompletedDay: number | null;
  lastCompletedAt: Date | null;
  fromArchive: boolean;
} {
  const bmiCategory = nutritionBmiCategory(params.bmi);
  const generateFresh = () => ({
    plan: generateActiveNutritionPlan(params),
    lastCompletedDay: null as number | null,
    lastCompletedAt: null as Date | null,
    fromArchive: false,
  });

  if (!params.goal || !params.dietaryPreference || !bmiCategory || !params.activityLevel) {
    return generateFresh();
  }

  const cached = getNutritionPlanArchiveEntry(
    params.data,
    params.goal,
    params.duration,
    params.dietaryPreference,
    bmiCategory,
    params.activityLevel
  );

  if (
    cached?.plan &&
    !nutritionPlanOutOfSync(cached.plan, {
      duration: params.duration,
      bmi: params.bmi,
      goal: params.goal,
      dietaryPreference: params.dietaryPreference,
      activityLevel: params.activityLevel,
    })
  ) {
    const lcd = Number(cached.lastCompletedDay);
    const lastCompletedDay = Number.isFinite(lcd) && lcd > 0 ? Math.floor(lcd) : null;
    return {
      plan: cached.plan,
      lastCompletedDay,
      lastCompletedAt: parseArchiveLastCompletedAt(cached.lastCompletedAt),
      fromArchive: true,
    };
  }

  return generateFresh();
}
