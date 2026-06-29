import { getFoodById, getFoodDatasetForSearch, prefetchFoodDataset, MEAL_CATEGORY_LABELS, type FoodItem } from "@/lib/foodDataset";
import { parseOpenFoodProduct, searchOpenFoodFactsByName } from "@/lib/openFoodFacts";

export type FoodSearchResult = {
  id: string;
  name: string;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  sodiumMg?: number;
  ingredients: string[];
  directions?: string[];
  servingSize: string;
  source: "library" | "openfoodfacts" | "manual";
  foodId?: string;
  barcode?: string;
};

export function foodItemToSearchResult(food: FoodItem): FoodSearchResult {
  return {
    id: `library:${food.id}`,
    name: food.name,
    calories: food.nutrition.calories,
    proteinG: food.nutrition.proteinG,
    carbsG: food.nutrition.carbsG,
    fatG: food.nutrition.fatG,
    fiberG: food.nutrition.fiberG,
    sodiumMg: food.nutrition.sodiumMg,
    ingredients: food.ingredients,
    directions: food.directions,
    servingSize: food.servingSize,
    source: "library",
    foodId: food.id,
  };
}

export function searchLocalFoods(query: string): FoodSearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  return getFoodDatasetForSearch().filter(
    (food) =>
      food.name.toLowerCase().includes(q) ||
      food.ingredients.some((item) => item.toLowerCase().includes(q))
  )
    .slice(0, 20)
    .map(foodItemToSearchResult);
}

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const local = searchLocalFoods(q);
  const localNames = new Set(local.map((item) => item.name.toLowerCase()));

  let remote: FoodSearchResult[] = [];
  try {
    const products = await searchOpenFoodFactsByName(q);
    remote = products
      .filter((item) => !localNames.has(item.name.toLowerCase()))
      .slice(0, 12);
  } catch {
    /* offline or API error — local results still shown */
  }

  return [...local, ...remote];
}

export function getFoodSearchResultByLibraryId(foodId: string): FoodSearchResult | null {
  const food = getFoodById(foodId);
  return food ? foodItemToSearchResult(food) : null;
}

export function manualFoodSearchResult(name: string, calories: number): FoodSearchResult {
  return {
    id: `manual:${Date.now()}`,
    name: name.trim(),
    calories: Math.round(calories),
    ingredients: ["Entered manually"],
    servingSize: "1 serving",
    source: "manual",
  };
}
