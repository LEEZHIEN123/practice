import AsyncStorage from "@react-native-async-storage/async-storage";
import { isManualMealType, type ManualMealType } from "@/lib/manualMealTypes";

export type MealHistoryEntry = {
  id: string;
  title: string;
  calories: number;
  mealType?: ManualMealType;
  description?: string;
  photoUri?: string;
  lastLoggedAt: number;
};

function storageKey(uid: string) {
  return `meal_log_history_v1:${uid}`;
}

function historyId(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function loadMealHistory(uid: string | null): Promise<MealHistoryEntry[]> {
  if (!uid) return [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is MealHistoryEntry =>
          row != null &&
          typeof row === "object" &&
          typeof (row as MealHistoryEntry).title === "string" &&
          typeof (row as MealHistoryEntry).calories === "number"
      )
      .sort((a, b) => b.lastLoggedAt - a.lastLoggedAt);
  } catch {
    return [];
  }
}

export async function upsertMealHistory(
  uid: string,
  entry: {
    title: string;
    calories: number;
    mealType?: ManualMealType;
    description?: string;
    photoUri?: string;
  }
): Promise<MealHistoryEntry[]> {
  const title = entry.title.trim();
  if (!title) return loadMealHistory(uid);

  const id = historyId(title);
  const existing = await loadMealHistory(uid);
  const previous = existing.find((row) => row.id === id);
  const next: MealHistoryEntry = {
    id,
    title,
    calories: Math.round(entry.calories),
    mealType: entry.mealType ?? previous?.mealType,
    description: entry.description?.trim() || undefined,
    photoUri: entry.photoUri || undefined,
    lastLoggedAt: Date.now(),
  };

  const merged = [next, ...existing.filter((row) => row.id !== id)].slice(0, 30);
  await AsyncStorage.setItem(storageKey(uid), JSON.stringify(merged));
  return merged;
}

export async function getMealHistoryEntry(
  uid: string | null,
  id: string
): Promise<MealHistoryEntry | null> {
  if (!uid) return null;
  const rows = await loadMealHistory(uid);
  return rows.find((row) => row.id === id) ?? null;
}

export async function updateMealHistoryEntry(
  uid: string,
  oldId: string,
  entry: {
    title: string;
    calories: number;
    mealType?: ManualMealType;
    description?: string;
    photoUri?: string;
  }
): Promise<MealHistoryEntry[]> {
  const title = entry.title.trim();
  if (!title) return loadMealHistory(uid);

  const existing = await loadMealHistory(uid);
  const previous = existing.find((row) => row.id === oldId);
  const id = historyId(title);
  const next: MealHistoryEntry = {
    id,
    title,
    calories: Math.round(entry.calories),
    mealType: entry.mealType ?? previous?.mealType,
    description: entry.description?.trim() || undefined,
    photoUri: entry.photoUri || undefined,
    lastLoggedAt: previous?.lastLoggedAt ?? Date.now(),
  };

  const merged = [
    next,
    ...existing.filter((row) => row.id !== oldId && row.id !== id),
  ].slice(0, 30);
  await AsyncStorage.setItem(storageKey(uid), JSON.stringify(merged));
  return merged;
}

export async function removeMealHistoryEntry(
  uid: string,
  id: string
): Promise<MealHistoryEntry[]> {
  const existing = await loadMealHistory(uid);
  const merged = existing.filter((row) => row.id !== id);
  await AsyncStorage.setItem(storageKey(uid), JSON.stringify(merged));
  return merged;
}
