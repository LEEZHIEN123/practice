import { resolveFoodImageUrl } from "./foodImages";
import nutritionPlanDataset from "./nutritionPlanDataset.json";
import { durationDays, type GoalKey, type PlanDuration } from "./workoutPlan";

export type NutritionActivityKey = "sedentary" | "light" | "moderate" | "very_active";
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
  imageUrl?: string;
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

  const m = Number(activityMultiplier);
  if (!Number.isFinite(m) || m <= 0) return null;
  if (m <= 1.25) return "sedentary";
  if (m <= 1.4) return "light";
  if (m <= 1.6) return "moderate";
  return "very_active";
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
 * Source nutrition dataset "Muscle Gain" is the same as the app fitness goal "Gain Weight".
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
  const estimated = estimateMacrosFromCalories(meal.name, meal.calories || fromDataset?.cal || 0);
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
  const imageUrl = resolveFoodImageUrl(meal.name || fromDataset?.n || "");

  return {
    ...meal,
    name: expandCookingAbbreviations(meal.name),
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
    imageUrl: resolveFoodImageUrl(m.n),
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
  const [activity, bmi, goal, diet] = key.split("|");
  if (
    (activity !== "sedentary" &&
      activity !== "light" &&
      activity !== "moderate" &&
      activity !== "very_active") ||
    (bmi !== "Underweight" && bmi !== "Normal" && bmi !== "Overweight" && bmi !== "Obese") ||
    (goal !== "gain" && goal !== "maintain" && goal !== "lose") ||
    (diet !== "omnivore" && diet !== "vegetarian" && diet !== "vegan")
  ) {
    return null;
  }
  return { activity, bmi, goal, diet };
}

/** Collect matching meal combos from v5_clean index (no calorie filter). */
export function findMatchingNutritionCombos(params: {
  activityLevel: NutritionActivityKey | null;
  bmiCategory: NutritionBmiCategory | null;
  goal: GoalKey | null;
  dietaryPreference: NutritionDietaryKey | null;
}): DatasetCombo[] {
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

  // 1) All four: BMI + goal + dietary + activity
  // 2) If none, prioritize BMI + goal + dietary (drop activity)
  // 3) Then relax further only if still empty
  const filters: Array<(e: (typeof entries)[number]) => boolean> = [
    (e) =>
      (!params.activityLevel || e.activity === params.activityLevel) &&
      (!params.bmiCategory || e.bmi === params.bmiCategory) &&
      (!params.goal || e.goal === params.goal) &&
      (!params.dietaryPreference || e.diet === params.dietaryPreference),
    (e) =>
      (!params.bmiCategory || e.bmi === params.bmiCategory) &&
      (!params.goal || e.goal === params.goal) &&
      (!params.dietaryPreference || e.diet === params.dietaryPreference),
    (e) =>
      (!params.bmiCategory || e.bmi === params.bmiCategory) &&
      (!params.goal || e.goal === params.goal),
    (e) => !params.bmiCategory || e.bmi === params.bmiCategory,
    () => true,
  ];

  for (const filter of filters) {
    const pool = entries.filter(filter);
    const combos = pool.flatMap((e) => e.combos);
    if (combos.length) return combos;
  }

  return Object.values(DATA.index).flat();
}

export function generateActiveNutritionPlan(params: {
  duration: PlanDuration;
  bmi: number | null;
  goal: GoalKey | null;
  dietaryPreference: NutritionDietaryKey | null;
  activityLevel: NutritionActivityKey | null;
}): ActiveNutritionPlan {
  const bmiCategory = nutritionBmiCategory(params.bmi);
  const combos = findMatchingNutritionCombos({
    activityLevel: params.activityLevel,
    bmiCategory,
    goal: params.goal,
    dietaryPreference: params.dietaryPreference,
  });
  const days = durationDays(params.duration);
  const schedule: NutritionDaySchedule[] = [];
  for (let i = 0; i < days; i++) {
    const combo = combos.length ? pickRandom(combos) : { b: 0, l: 0, di: 0, s: 0 };
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
  if (!Array.isArray(plan.schedule) || plan.schedule.length !== durationDays(params.duration)) return true;
  const sample = plan.schedule[0]?.breakfast;
  if (
    !sample ||
    typeof sample.proteinG !== "number" ||
    typeof sample.carbsG !== "number" ||
    typeof sample.fatG !== "number" ||
    !sample.imageUrl
  ) {
    return true;
  }
  return false;
}
