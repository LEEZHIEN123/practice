import { formatCalendarDayKey, getDeviceIanaTimezone } from "@/lib/calendarDay";
import {
  bmiBandKey,
  buildWorkoutPlanArchiveEntry,
  calcBmi,
  durationDays,
  generateActiveWorkoutPlan,
  workoutPlansByBmiGoalField,
  type ActiveWorkoutPlan,
  type GoalKey,
  type PlanDuration,
} from "@/lib/workoutPlan";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

const rolloverInFlight = new Set<string>();

export function parsePlanCompletedAt(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const maybe = (value as { toDate?: () => Date })?.toDate?.();
  if (maybe instanceof Date && !Number.isNaN(maybe.getTime())) return maybe;
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function parseLastCompletedPlanDay(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function planDurationOf(plan: ActiveWorkoutPlan | null | undefined): PlanDuration | null {
  if (plan?.duration === "week" || plan?.duration === "biweekly" || plan?.duration === "monthly") {
    return plan.duration;
  }
  return null;
}

function planGoalOf(plan: ActiveWorkoutPlan | null | undefined, data: Record<string, unknown>): GoalKey | null {
  if (plan?.goal === "gain" || plan?.goal === "maintain" || plan?.goal === "lose") return plan.goal;
  if (
    data.recommendedPlan === "gain" ||
    data.recommendedPlan === "maintain" ||
    data.recommendedPlan === "lose"
  ) {
    return data.recommendedPlan;
  }
  return null;
}

export function shouldRolloverCompletedWorkoutPlan(
  data: Record<string, unknown>,
  timeZone: string = getDeviceIanaTimezone(),
  now: Date = new Date()
): boolean {
  const plan = data.activeWorkoutPlan as ActiveWorkoutPlan | undefined;
  const duration = planDurationOf(plan);
  if (!plan || !duration) return false;

  const lastCompletedDay = parseLastCompletedPlanDay(data.activePlanLastCompletedDay);
  const lastCompletedAt = parsePlanCompletedAt(data.activePlanLastCompletedAt);
  if (lastCompletedDay == null || lastCompletedAt == null) return false;

  const totalPlanDays = Math.max(durationDays(duration), plan.schedule?.length ?? 0);
  if (lastCompletedDay < totalPlanDays) return false;

  const completedKey = formatCalendarDayKey(lastCompletedAt, timeZone);
  const todayKey = formatCalendarDayKey(now, timeZone);
  return todayKey > completedKey;
}

/**
 * If the user finished the last day of the current plan on a previous calendar day,
 * generate a fresh plan for the same duration and reset progress.
 */
export async function rolloverCompletedWorkoutPlanIfNeeded(
  uid: string,
  data: Record<string, unknown>,
  timeZone?: string
): Promise<ActiveWorkoutPlan | null> {
  const tz = timeZone || (typeof data.timezone === "string" && data.timezone ? data.timezone : getDeviceIanaTimezone());
  if (!shouldRolloverCompletedWorkoutPlan(data, tz)) return null;
  if (rolloverInFlight.has(uid)) return null;
  rolloverInFlight.add(uid);

  try {
    const plan = data.activeWorkoutPlan as ActiveWorkoutPlan;
    const duration = planDurationOf(plan);
    const goal = planGoalOf(plan, data);
    const bmi =
      typeof plan.bmi === "number" && Number.isFinite(plan.bmi)
        ? plan.bmi
        : calcBmi(Number(data.weight ?? 0), Number(data.height ?? 0));
    if (!duration || !goal || bmi == null) return null;

    const next = generateActiveWorkoutPlan({ duration, bmi, goal });
    const band = bmiBandKey(bmi);
    await updateDoc(doc(db, "users", uid), {
      activeWorkoutPlan: next,
      [workoutPlansByBmiGoalField(band, goal, duration)]: buildWorkoutPlanArchiveEntry(next, null, null),
      activePlanLastCompletedDay: null,
      activePlanLastCompletedAt: null,
    } as Record<string, unknown>);
    return next;
  } finally {
    rolloverInFlight.delete(uid);
  }
}
