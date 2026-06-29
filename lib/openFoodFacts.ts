import type { FoodSearchResult } from "@/lib/foodSearch";

export type ScannedFoodProduct = {
  name: string;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  sodiumMg?: number;
  ingredients: string[];
  servingSize: string;
  barcode: string;
};

type OpenFoodProduct = {
  product_name?: string;
  code?: string | number;
  product_quantity?: string | number;
  serving_size?: string;
  ingredients_text?: string;
  nutriments?: Record<string, unknown>;
};

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function parseOpenFoodProduct(
  product: OpenFoodProduct,
  barcode = ""
): Omit<ScannedFoodProduct, "barcode"> & { barcode: string } | null {
  const nutriments = product.nutriments ?? {};
  const name = (product.product_name ?? "").trim();
  if (!name) return null;

  const kcalServing = parseNumber(nutriments["energy-kcal_serving"]);
  const kcal100 = parseNumber(nutriments["energy-kcal_100g"]);
  const kcal =
    kcalServing ??
    kcal100 ??
    (parseNumber(nutriments.energy) != null
      ? Math.round((parseNumber(nutriments.energy) as number) / 4.184)
      : undefined);

  if (kcal == null || kcal <= 0) return null;

  const servingSize =
    (typeof product.serving_size === "string" && product.serving_size.trim()) ||
    (product.product_quantity != null ? String(product.product_quantity) : "1 serving");

  const ingredientsText = (product.ingredients_text ?? "").trim();
  const ingredients = ingredientsText
    ? ingredientsText
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
    : ["See product packaging for ingredients."];

  const code = barcode || (product.code != null ? String(product.code) : "");

  return {
    name,
    calories: Math.round(kcal),
    proteinG: parseNumber(nutriments.proteins_serving) ?? parseNumber(nutriments.proteins_100g),
    carbsG:
      parseNumber(nutriments.carbohydrates_serving) ?? parseNumber(nutriments.carbohydrates_100g),
    fatG: parseNumber(nutriments.fat_serving) ?? parseNumber(nutriments.fat_100g),
    fiberG: parseNumber(nutriments.fiber_serving) ?? parseNumber(nutriments.fiber_100g),
    sodiumMg:
      parseNumber(nutriments.sodium_serving) != null
        ? Math.round((parseNumber(nutriments.sodium_serving) as number) * 1000)
        : parseNumber(nutriments.sodium_100g) != null
          ? Math.round((parseNumber(nutriments.sodium_100g) as number) * 1000)
          : undefined,
    ingredients,
    servingSize,
    barcode: code,
  };
}

export function scannedProductToSearchResult(product: ScannedFoodProduct): FoodSearchResult {
  return {
    id: product.barcode ? `off:${product.barcode}` : `off:${product.name}`,
    name: product.name,
    calories: product.calories,
    proteinG: product.proteinG,
    carbsG: product.carbsG,
    fatG: product.fatG,
    fiberG: product.fiberG,
    sodiumMg: product.sodiumMg,
    ingredients: product.ingredients,
    servingSize: product.servingSize,
    source: "openfoodfacts",
    barcode: product.barcode || undefined,
  };
}

export async function fetchFoodByBarcode(barcode: string): Promise<ScannedFoodProduct> {
  const code = barcode.replace(/\D/g, "").trim();
  if (code.length < 8) throw new Error("Enter a valid barcode (at least 8 digits).");

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_quantity,serving_size,nutriments,ingredients_text,code`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not look up this barcode. Try again.");

  const data = (await res.json()) as {
    status?: number;
    product?: OpenFoodProduct;
  };

  if (data.status !== 1 || !data.product) {
    throw new Error("Product not found in Open Food Facts database.");
  }

  const parsed = parseOpenFoodProduct(data.product, code);
  if (!parsed) throw new Error("Calorie data not available for this product.");
  return parsed;
}

export async function searchOpenFoodFactsByName(query: string): Promise<FoodSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?` +
    `search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=12` +
    `&fields=product_name,code,serving_size,product_quantity,nutriments,ingredients_text`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not search foods right now.");

  const data = (await res.json()) as { products?: OpenFoodProduct[] };
  const products = Array.isArray(data.products) ? data.products : [];

  const results: FoodSearchResult[] = [];
  for (const product of products) {
    const parsed = parseOpenFoodProduct(product);
    if (!parsed) continue;
    results.push(scannedProductToSearchResult(parsed));
    if (results.length >= 12) break;
  }
  return results;
}
