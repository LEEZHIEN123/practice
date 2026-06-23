import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { formatCalendarDayKey } from "./calendarDay";
import { calcBmi, type ActiveWorkoutPlan } from "./workoutPlan";

/** Profile and today stats from the app (optional). */
export type CoachUserContext = {
  name?: string;
  age?: number;
  gender?: string;
  heightCm?: number;
  weightKg?: number;
  bmi?: number | null;
  fitnessGoal?: "gain" | "maintain" | "lose";
  planDuration?: "week" | "biweekly" | "monthly";
  suggestedWorkoutTypes?: string[];
  planSchedulePreview?: string;
  todayConsumedKcal?: number;
  todayBurnedKcal?: number;
  todaySteps?: number;
  todayWaterMl?: number;
};

function goalLabel(goal: string | undefined): string | undefined {
  if (goal === "gain") return "Gain weight";
  if (goal === "maintain") return "Maintain weight";
  if (goal === "lose") return "Lose weight";
  return undefined;
}

function durationLabel(d: string | undefined): string | undefined {
  if (d === "week") return "One week plan";
  if (d === "biweekly") return "Biweekly plan";
  if (d === "monthly") return "Monthly plan";
  return undefined;
}

/** Load profile + today's stats so the coach can personalize answers. */
export async function fetchCoachUserContext(uid: string, calendarTz: string): Promise<CoachUserContext> {
  const ctx: CoachUserContext = {};
  if (!uid || uid === "guest") return ctx;

  try {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists()) {
      const data = userSnap.data() as Record<string, unknown>;
      if (typeof data.name === "string" && data.name.trim()) ctx.name = data.name.trim();
      if (typeof data.age === "number" && Number.isFinite(data.age)) ctx.age = Math.round(data.age);
      if (data.gender === "male" || data.gender === "female") ctx.gender = data.gender;
      if (typeof data.height === "number" && Number.isFinite(data.height)) ctx.heightCm = data.height;
      if (typeof data.weight === "number" && Number.isFinite(data.weight)) ctx.weightKg = data.weight;
      if (ctx.heightCm && ctx.weightKg) ctx.bmi = calcBmi(ctx.weightKg, ctx.heightCm);

      const goal =
        data.recommendedPlan === "gain" ||
        data.recommendedPlan === "maintain" ||
        data.recommendedPlan === "lose"
          ? data.recommendedPlan
          : undefined;
      if (goal) ctx.fitnessGoal = goal;

      if (
        data.planDuration === "week" ||
        data.planDuration === "biweekly" ||
        data.planDuration === "monthly"
      ) {
        ctx.planDuration = data.planDuration;
      }

      const plan = data.activeWorkoutPlan as ActiveWorkoutPlan | undefined;
      if (plan?.suggestedTypes?.length) {
        ctx.suggestedWorkoutTypes = plan.suggestedTypes;
      }
      if (plan?.schedule?.length) {
        const preview = plan.schedule
          .slice(0, 5)
          .map((r) => `Day ${r.day}: ${r.type} — ${r.workout}`)
          .join("; ");
        ctx.planSchedulePreview = preview + (plan.schedule.length > 5 ? " …" : "");
      }
    }

    const dayKey = formatCalendarDayKey(new Date(), calendarTz);
    const statSnap = await getDoc(doc(db, "users", uid, "dailyStats", dayKey));
    if (statSnap.exists()) {
      const s = statSnap.data() as Record<string, unknown>;
      if (typeof s.consumedKcal === "number") ctx.todayConsumedKcal = Math.round(s.consumedKcal);
      if (typeof s.burnedKcal === "number") ctx.todayBurnedKcal = Math.round(s.burnedKcal);
      if (typeof s.steps === "number") ctx.todaySteps = Math.round(s.steps);
      if (typeof s.waterMl === "number") ctx.todayWaterMl = Math.round(s.waterMl);
    }
  } catch {
    /* non-fatal — coach still works without profile */
  }

  return ctx;
}

export function formatCoachContextForDisplay(ctx: CoachUserContext): string {
  const lines: string[] = [];
  if (ctx.name) lines.push(`Name: ${ctx.name}`);
  if (ctx.age != null) lines.push(`Age: ${ctx.age}`);
  if (ctx.gender) lines.push(`Gender: ${ctx.gender}`);
  if (ctx.heightCm != null) lines.push(`Height: ${ctx.heightCm} cm`);
  if (ctx.weightKg != null) lines.push(`Weight: ${ctx.weightKg} kg`);
  if (ctx.bmi != null) lines.push(`BMI: ${ctx.bmi.toFixed(1)}`);
  const gl = goalLabel(ctx.fitnessGoal);
  if (gl) lines.push(`Fitness goal: ${gl}`);
  const dl = durationLabel(ctx.planDuration);
  if (dl) lines.push(`Workout plan: ${dl}`);
  if (ctx.suggestedWorkoutTypes?.length) {
    lines.push(`Suggested workout types: ${ctx.suggestedWorkoutTypes.join(", ")}`);
  }
  if (ctx.planSchedulePreview) lines.push(`Plan schedule (sample): ${ctx.planSchedulePreview}`);
  if (ctx.todayConsumedKcal != null) lines.push(`Today food (logged): ${ctx.todayConsumedKcal} kcal`);
  if (ctx.todayBurnedKcal != null) lines.push(`Today exercise (burned): ${ctx.todayBurnedKcal} kcal`);
  if (ctx.todaySteps != null) lines.push(`Today steps: ${ctx.todaySteps}`);
  if (ctx.todayWaterMl != null) lines.push(`Today water: ${ctx.todayWaterMl} ml`);
  return lines.join("\n");
}
