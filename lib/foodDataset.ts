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

export const FOOD_INDEX: FoodListItem[] = (recipeFoodIndex as FoodListItem[]).filter((item) =>
  Boolean(item.servingSize?.trim())
);

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
      fullDataset = (mod.default as FoodItem[]).filter((item) => Boolean(item.servingSize?.trim()));
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
