import type { ActiveNutritionPlan } from "@/lib/nutritionPlan";
import type { PlanDuration } from "@/lib/workoutPlan";

type NutritionPlanCacheEntry = {
  plan: ActiveNutritionPlan;
  duration: PlanDuration | null;
  lastCompletedDay: number | null;
  lastCompletedAtMs: number | null;
  dailyCalorieTarget: number | null;
};

const cacheByUid = new Map<string, NutritionPlanCacheEntry>();

export function peekNutritionPlanCache(uid: string | null | undefined): NutritionPlanCacheEntry | null {
  if (!uid) return null;
  return cacheByUid.get(uid) ?? null;
}

export function writeNutritionPlanCache(
  uid: string | null | undefined,
  entry: Partial<NutritionPlanCacheEntry> & { plan: ActiveNutritionPlan }
): void {
  if (!uid) return;
  const prev = cacheByUid.get(uid);
  cacheByUid.set(uid, {
    plan: entry.plan,
    duration: entry.duration ?? prev?.duration ?? entry.plan.duration ?? null,
    lastCompletedDay:
      entry.lastCompletedDay !== undefined
        ? entry.lastCompletedDay
        : (prev?.lastCompletedDay ?? null),
    lastCompletedAtMs:
      entry.lastCompletedAtMs !== undefined
        ? entry.lastCompletedAtMs
        : (prev?.lastCompletedAtMs ?? null),
    dailyCalorieTarget:
      entry.dailyCalorieTarget !== undefined
        ? entry.dailyCalorieTarget
        : (prev?.dailyCalorieTarget ?? null),
  });
}
