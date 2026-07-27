import { WORKOUTS_BY_TYPE, type WorkoutType } from "./workoutCatalog";

export type GoalKey = "gain" | "maintain" | "lose";
export type PlanDuration = "week" | "biweekly" | "monthly";
/** Matches `suggestWorkoutTypes` BMI breakpoints — each band keeps its own cached plan in Firestore. */
export type BmiBandKey = "under" | "normal" | "over";
export type { WorkoutType };

export type ActiveWorkoutPlan = {
  duration: PlanDuration;
  createdAt: string;
  bmi: number | null;
  goal: GoalKey | null;
  suggestedTypes: WorkoutType[];
  schedule: { day: number; type: WorkoutType; workout: string }[];
};

export function calcBmi(weightKg: number, heightCm: number) {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  if (!h) return null;
  const v = weightKg / (h * h);
  return Number.isFinite(v) ? v : null;
}

export function bmiBandKey(bmi: number): BmiBandKey {
  if (bmi < 18.5) return "under";
  if (bmi <= 24.9) return "normal";
  return "over";
}

/** Firestore field: `workoutPlansByBmiGoal.{band}.{goal}.{duration}` */
export function workoutPlansByBmiGoalField(band: BmiBandKey, goal: GoalKey, duration: PlanDuration): string {
  return `workoutPlansByBmiGoal.${band}.${goal}.${duration}`;
}

/** Saved plan for a duration, with optional progress (keeps data when switching schedules). */
export type WorkoutPlanArchiveEntry = {
  plan: ActiveWorkoutPlan;
  lastCompletedDay: number | null;
  lastCompletedAt: string | null;
};

export type WorkoutPlanPickResult = {
  plan: ActiveWorkoutPlan;
  lastCompletedDay: number | null;
  lastCompletedAt: Date | null;
  fromArchive: boolean;
};

function parseWorkoutArchiveLastCompletedAt(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    const parsed = (value as { toDate: () => Date }).toDate();
    return parsed instanceof Date ? parsed : null;
  }
  return null;
}

/** Accept legacy (plan object) or new `{ plan, lastCompletedDay, lastCompletedAt }` shapes. */
export function normalizeWorkoutPlanArchiveEntry(raw: unknown): WorkoutPlanArchiveEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const nested = obj.plan;
  if (nested && typeof nested === "object" && Array.isArray((nested as ActiveWorkoutPlan).schedule)) {
    const lcd = Number(obj.lastCompletedDay);
    return {
      plan: nested as ActiveWorkoutPlan,
      lastCompletedDay: Number.isFinite(lcd) && lcd > 0 ? Math.floor(lcd) : null,
      lastCompletedAt: typeof obj.lastCompletedAt === "string" ? obj.lastCompletedAt : null,
    };
  }
  if (Array.isArray((obj as ActiveWorkoutPlan).schedule)) {
    return {
      plan: obj as ActiveWorkoutPlan,
      lastCompletedDay: null,
      lastCompletedAt: null,
    };
  }
  return null;
}

export function buildWorkoutPlanArchiveEntry(
  plan: ActiveWorkoutPlan,
  lastCompletedDay: number | null,
  lastCompletedAt: Date | null
): WorkoutPlanArchiveEntry {
  return {
    plan,
    lastCompletedDay: lastCompletedDay ?? null,
    lastCompletedAt: lastCompletedAt ? lastCompletedAt.toISOString() : null,
  };
}

/** Banded cache first, then legacy `workoutPlansByGoal` (pre–per-band storage). */
export function getWorkoutPlanArchiveEntry(
  data: Record<string, unknown> | undefined,
  bmi: number,
  goal: GoalKey,
  duration: PlanDuration
): WorkoutPlanArchiveEntry | null {
  const band = bmiBandKey(bmi);
  const bandRoot = data?.workoutPlansByBmiGoal as Record<string, unknown> | undefined;
  const bandGoal = bandRoot?.[band] as Record<string, unknown> | undefined;
  const bandGoalDur = bandGoal?.[goal] as Record<string, unknown> | undefined;
  const banded = normalizeWorkoutPlanArchiveEntry(bandGoalDur?.[duration]);
  if (banded) return banded;

  const legacyRoot = data?.workoutPlansByGoal as Record<string, unknown> | undefined;
  const legacyGoal = legacyRoot?.[goal] as Record<string, unknown> | undefined;
  return normalizeWorkoutPlanArchiveEntry(legacyGoal?.[duration]);
}

export function getWorkoutPlanFromUserDoc(
  data: Record<string, unknown> | undefined,
  bmi: number,
  goal: GoalKey,
  duration: PlanDuration
): ActiveWorkoutPlan | null {
  return getWorkoutPlanArchiveEntry(data, bmi, goal, duration)?.plan ?? null;
}

export function canRestoreWorkoutPlan(
  data: Record<string, unknown> | undefined,
  bmi: number,
  goal: GoalKey,
  duration: PlanDuration
): boolean {
  const cached = getWorkoutPlanArchiveEntry(data, bmi, goal, duration);
  return !!(cached?.plan && !activeWorkoutPlanOutOfSync(cached.plan, bmi, goal));
}

/** True if stored plan no longer matches BMI+goal rules (e.g. reused cache from another BMI band). */
export function activeWorkoutPlanOutOfSync(
  plan: Pick<ActiveWorkoutPlan, "goal" | "suggestedTypes"> | null | undefined,
  bmi: number | null,
  goal: GoalKey | null
): boolean {
  if (!plan || bmi == null || goal == null) return false;
  if (plan.goal !== goal) return true;
  const expected = suggestWorkoutTypes(bmi, goal);
  const got = (plan.suggestedTypes ?? []) as string[];
  if (got.length !== expected.length) return true;
  // Order matters: same three types in different rotation (normal vs over "lose") → different schedules.
  for (let i = 0; i < expected.length; i++) {
    if (String(got[i]) !== String(expected[i])) return true;
  }
  return false;
}

export function suggestWorkoutTypes(bmi: number, goal: GoalKey): WorkoutType[] {
  if (bmi < 18.5) {
    if (goal === "gain") return ["Strength", "Yoga"];
    if (goal === "maintain") return ["Strength", "Cardio", "Yoga"];
    return ["Yoga"];
  }
  if (bmi <= 24.9) {
    if (goal === "gain") return ["Strength", "Yoga"];
    if (goal === "maintain") return ["Strength", "Cardio"];
    // Lose weight, BMI 18.5–24.9: rotation Cardio → HIIT → Strength (product matrix).
    return ["Cardio", "HIIT", "Strength"];
  }
  // bmi > 24.9 — lose weight: same three types, different rotation vs normal band → different generated plan.
  if (goal === "lose") return ["Cardio", "Strength", "HIIT"];
  if (goal === "maintain") return ["Cardio"];
  return ["Strength"];
}

export function durationDays(duration: PlanDuration) {
  if (duration === "week") return 7;
  if (duration === "biweekly") return 14;
  return 30;
}

export function generateActiveWorkoutPlan(params: {
  duration: PlanDuration;
  bmi: number;
  goal: GoalKey;
}): ActiveWorkoutPlan {
  const { duration, bmi, goal } = params;
  const days = durationDays(duration);
  const types = suggestWorkoutTypes(bmi, goal);
  const pick = (arr: readonly string[]) => arr[Math.floor(Math.random() * arr.length)];

  const schedule = Array.from({ length: days }).map((_, i) => {
    const type = types[i % types.length];
    const workout = pick(WORKOUTS_BY_TYPE[type]);
    return { day: i + 1, type, workout };
  });

  return {
    duration,
    createdAt: new Date().toISOString(),
    bmi: Math.round(bmi * 10) / 10,
    goal,
    suggestedTypes: types,
    schedule,
  };
}

/** Restore a saved plan for this BMI band if types still match; otherwise generate a new one. */
export function pickOrGenerateWorkoutPlanForBand(
  data: Record<string, unknown> | undefined,
  bmi: number,
  goal: GoalKey,
  duration: PlanDuration
): WorkoutPlanPickResult {
  const cached = getWorkoutPlanArchiveEntry(data, bmi, goal, duration);
  if (cached?.plan && !activeWorkoutPlanOutOfSync(cached.plan, bmi, goal)) {
    return {
      plan: cached.plan,
      lastCompletedDay: cached.lastCompletedDay,
      lastCompletedAt: parseWorkoutArchiveLastCompletedAt(cached.lastCompletedAt),
      fromArchive: true,
    };
  }
  return {
    plan: generateActiveWorkoutPlan({ duration, bmi, goal }),
    lastCompletedDay: null,
    lastCompletedAt: null,
    fromArchive: false,
  };
}

