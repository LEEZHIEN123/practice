export type ManualMealType = "breakfast" | "lunch" | "dinner" | "snack" | "other";

export type MealHistoryFilter = "all" | ManualMealType;

export const MANUAL_MEAL_TYPES: ManualMealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "other",
];

export const MANUAL_MEAL_TYPE_LABELS: Record<ManualMealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  other: "Other",
};

export const MEAL_HISTORY_FILTERS: MealHistoryFilter[] = [
  "all",
  ...MANUAL_MEAL_TYPES,
];

export const MEAL_HISTORY_FILTER_LABELS: Record<MealHistoryFilter, string> = {
  all: "All",
  ...MANUAL_MEAL_TYPE_LABELS,
};

export function isManualMealType(value: unknown): value is ManualMealType {
  return typeof value === "string" && MANUAL_MEAL_TYPES.includes(value as ManualMealType);
}
