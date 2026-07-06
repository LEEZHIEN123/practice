import AsyncStorage from "@react-native-async-storage/async-storage";
import { isManualMealType, type ManualMealType } from "@/lib/manualMealTypes";

export type MealHistoryEntry = {
  id: string;
  title: string;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  mealType?: ManualMealType;
  description?: string;
  descriptionSections?: string[];
  photoUri?: string;
  lastLoggedAt: number;
};

export function cleanDescriptionSections(sections: string[]): string[] {
  return sections.map((section) => section.trim()).filter(Boolean);
}

export function normalizeMealDescriptions(entry: {
  description?: string;
  descriptionSections?: string[];
}): string[] {
  const fromSections = cleanDescriptionSections(entry.descriptionSections ?? []);
  if (fromSections.length > 0) return fromSections;
  const legacy = entry.description?.trim();
  return legacy ? [legacy] : [];
}

export function descriptionsToLegacyString(sections: string[]): string | undefined {
  const cleaned = cleanDescriptionSections(sections);
  return cleaned.length > 0 ? cleaned.join("\n\n") : undefined;
}

export function formatDescriptionPreview(
  entry: Pick<MealHistoryEntry, "description" | "descriptionSections">
): string | null {
  const sections = normalizeMealDescriptions(entry);
  if (sections.length === 0) return null;
  if (sections.length === 1) return sections[0];
  return `${sections[0]} (+${sections.length - 1} more)`;
}

export function mealDescriptionsMatchSearch(
  entry: Pick<MealHistoryEntry, "description" | "descriptionSections">,
  query: string
): boolean {
  const q = query.toLowerCase();
  return normalizeMealDescriptions(entry).some((section) => section.toLowerCase().includes(q));
}

function resolveDescriptions(entry: {
  description?: string;
  descriptionSections?: string[];
}): { descriptionSections?: string[]; description?: string } {
  const descriptionSections = normalizeMealDescriptions(entry);
  if (descriptionSections.length === 0) {
    return { descriptionSections: undefined, description: undefined };
  }
  return {
    descriptionSections,
    description: descriptionsToLegacyString(descriptionSections),
  };
}

export function parseOptionalGrams(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

export function formatHistoryMacros(
  entry: Pick<MealHistoryEntry, "proteinG" | "carbsG" | "fatG">
): string | null {
  const parts: string[] = [];
  if (entry.proteinG != null) parts.push(`Protein ${entry.proteinG}g`);
  if (entry.carbsG != null) parts.push(`Carbs ${entry.carbsG}g`);
  if (entry.fatG != null) parts.push(`Fat ${entry.fatG}g`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function roundMacro(value: number | undefined): number | undefined {
  return value != null ? Math.round(value) : undefined;
}

function storageKey(uid: string) {
  return `meal_log_history_v1:${uid}`;
}

function historyId(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function mealHistoryIdFromTitle(title: string): string {
  return historyId(title);
}

export function findMealHistoryMatch(
  history: MealHistoryEntry[],
  title: string
): MealHistoryEntry | null {
  const id = historyId(title);
  return history.find((row) => row.id === id) ?? null;
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
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    mealType?: ManualMealType;
    description?: string;
    descriptionSections?: string[];
    photoUri?: string;
  }
): Promise<MealHistoryEntry[]> {
  const title = entry.title.trim();
  if (!title) return loadMealHistory(uid);

  const id = historyId(title);
  const existing = await loadMealHistory(uid);
  const previous = existing.find((row) => row.id === id);
  const descriptions = resolveDescriptions(entry);
  const next: MealHistoryEntry = {
    id,
    title,
    calories: Math.round(entry.calories),
    proteinG: roundMacro(entry.proteinG) ?? previous?.proteinG,
    carbsG: roundMacro(entry.carbsG) ?? previous?.carbsG,
    fatG: roundMacro(entry.fatG) ?? previous?.fatG,
    mealType: entry.mealType ?? previous?.mealType,
    ...descriptions,
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
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    mealType?: ManualMealType;
    description?: string;
    descriptionSections?: string[];
    photoUri?: string;
  }
): Promise<MealHistoryEntry[]> {
  const title = entry.title.trim();
  if (!title) return loadMealHistory(uid);

  const existing = await loadMealHistory(uid);
  const previous = existing.find((row) => row.id === oldId);
  const id = historyId(title);
  const descriptions = resolveDescriptions(entry);
  const next: MealHistoryEntry = {
    id,
    title,
    calories: Math.round(entry.calories),
    proteinG: roundMacro(entry.proteinG),
    carbsG: roundMacro(entry.carbsG),
    fatG: roundMacro(entry.fatG),
    mealType: entry.mealType ?? previous?.mealType,
    ...descriptions,
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
