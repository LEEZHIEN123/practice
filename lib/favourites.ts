import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WorkoutType } from "@/lib/workoutCatalog";

export type FavouriteKind = "workout" | "nutrition" | "workout-plan";

export type FavouriteItem = {
  id: string;
  kind: FavouriteKind;
  title: string;
  subtitle: string;
  route: string;
  createdAt: number;
};

export type FavouriteItemInput = Omit<FavouriteItem, "createdAt">;

export const WORKOUT_PLAN_FAVOURITE_ID = "workout-plan";

function storageKey(uid: string) {
  return `favourites:v1:${uid}`;
}

function isValidKind(kind: unknown): kind is FavouriteKind {
  return kind === "workout" || kind === "nutrition" || kind === "workout-plan";
}

export function buildWorkoutFavouriteId(type: WorkoutType | string, name: string): string {
  return `workout:${type}:${name.trim().toLowerCase()}`;
}

export function buildNutritionFavouriteId(foodId: string): string {
  return `nutrition:${foodId}`;
}

export function buildWorkoutFavouriteItem(
  type: WorkoutType | string,
  name: string,
  met?: number
): FavouriteItemInput {
  return {
    id: buildWorkoutFavouriteId(type, name),
    kind: "workout",
    title: name,
    subtitle: met != null ? `${type} · MET ${met}` : String(type),
    route: `/free-workout?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`,
  };
}

export function buildNutritionFavouriteItem(
  foodId: string,
  name: string,
  subtitle: string
): FavouriteItemInput {
  return {
    id: buildNutritionFavouriteId(foodId),
    kind: "nutrition",
    title: name,
    subtitle,
    route: `/food-detail?id=${encodeURIComponent(foodId)}`,
  };
}

export function buildWorkoutPlanFavouriteItem(
  subtitle = "Your personalised schedule"
): FavouriteItemInput {
  return {
    id: WORKOUT_PLAN_FAVOURITE_ID,
    kind: "workout-plan",
    title: "Personalised Workout Plan",
    subtitle,
    route: "/workout-plan",
  };
}

export async function loadFavourites(uid: string): Promise<FavouriteItem[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is FavouriteItem => {
        if (!item || typeof item !== "object") return false;
        const row = item as FavouriteItem;
        return (
          isValidKind(row.kind) &&
          typeof row.id === "string" &&
          typeof row.title === "string" &&
          typeof row.route === "string"
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

async function saveFavourites(uid: string, items: FavouriteItem[]) {
  await AsyncStorage.setItem(storageKey(uid), JSON.stringify(items));
}

export async function isFavourite(uid: string, favouriteId: string): Promise<boolean> {
  const items = await loadFavourites(uid);
  return items.some((item) => item.id === favouriteId);
}

export async function toggleFavourite(uid: string, item: FavouriteItemInput): Promise<boolean> {
  const items = await loadFavourites(uid);
  const existing = items.find((row) => row.id === item.id);
  if (existing) {
    await saveFavourites(
      uid,
      items.filter((row) => row.id !== item.id)
    );
    return false;
  }

  const next: FavouriteItem = {
    ...item,
    createdAt: Date.now(),
  };
  await saveFavourites(uid, [next, ...items]);
  return true;
}

export async function removeFavourite(uid: string, favouriteId: string): Promise<void> {
  const items = await loadFavourites(uid);
  await saveFavourites(
    uid,
    items.filter((item) => item.id !== favouriteId)
  );
}
