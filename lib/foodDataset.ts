import recipeFoodIndex from "./recipeFoodIndex.json";

export type MealCategory = "breakfast" | "lunch" | "dinner" | "snack";

export type FoodNutrition = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  sodiumMg?: number;
};

export type FoodListItem = {
  id: string;
  name: string;
  category: MealCategory;
  servingSize: string;
  imageUrl?: string;
  tags: string[];
  nutrition: FoodNutrition;
};

export type FoodItem = FoodListItem & {
  ingredients: string[];
  directions: string[];
};

export const MEAL_CATEGORY_LABELS: Record<MealCategory, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function foodDedupeKey(item: Pick<FoodListItem, "name" | "servingSize">): string {
  return `${item.name.trim().toLowerCase()}|${(item.servingSize ?? "").trim().toLowerCase()}`;
}

/** Keep first occurrence of each name + serving (CSV source has repeated recipes). */
function dedupeFoodsByNameServing<T extends Pick<FoodListItem, "name" | "servingSize">>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item.servingSize?.trim()) continue;
    const key = foodDedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export const FOOD_INDEX: FoodListItem[] = dedupeFoodsByNameServing(recipeFoodIndex as FoodListItem[]);

let fullDataset: FoodItem[] | null = null;
let foodById: Map<string, FoodItem> | null = null;
let loadPromise: Promise<FoodItem[]> | null = null;

function buildFoodById(items: FoodItem[]) {
  foodById = new Map(items.map((item) => [item.id, item]));
}

export function isFoodDatasetReady(): boolean {
  return fullDataset != null;
}

export function prefetchFoodDataset(): Promise<FoodItem[]> {
  if (fullDataset) return Promise.resolve(fullDataset);
  if (!loadPromise) {
    loadPromise = import("./recipeFoodDataset.json").then((mod) => {
      fullDataset = dedupeFoodsByNameServing(mod.default as FoodItem[]);
      buildFoodById(fullDataset);
      return fullDataset;
    });
  }
  return loadPromise;
}

export function getFoodById(id: string): FoodItem | undefined {
  const fromFull = foodById?.get(id);
  if (fromFull) return fromFull;

  const fromIndex = FOOD_INDEX.find((item) => item.id === id);
  if (!fromIndex) return undefined;

  return {
    ...fromIndex,
    tags: fromIndex.tags ?? [],
    ingredients: [],
    directions: [],
  };
}

export function foodsByCategory(category: MealCategory): FoodListItem[] {
  return FOOD_INDEX.filter((item) => item.category === category);
}

export function foodsByTag(tag: string): FoodListItem[] {
  const normalized = tag.trim();
  if (!normalized) return [];
  return FOOD_INDEX.filter((item) => item.tags?.includes(normalized));
}

export function getFoodDatasetForSearch(): FoodItem[] {
  return fullDataset ?? FOOD_INDEX.map((item) => ({ ...item, ingredients: [], directions: [] }));
}
