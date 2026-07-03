import { achievementDescriptionFromId, achievementTitleFromId } from "@/lib/achievements";
import { formatCalendarDayKey } from "@/lib/calendarDay";
import {
  formatReportDayLabel,
  formatWeekRangeLabel,
  getWeekDayKeys,
  startOfWeekMonday,
} from "@/lib/reportCalendar";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

export type ReportPeriod = "daily" | "weekly";

export type ReportWorkoutItem = {
  title: string;
  burnedKcal: number;
  durationMin: number;
};

export type ReportMealItem = {
  title: string;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  sodiumMg?: number;
};

export type ReportWaterItem = {
  amountMl: number;
};

export type ReportWeightItem = {
  weightKg: number;
  dayKey: string;
};

export type ReportStepsDay = {
  dayKey: string;
  steps: number;
};

export type ReportAchievementItem = {
  id: string;
  title: string;
  description: string;
};

export type UserReport = {
  period: ReportPeriod;
  title: string;
  subtitle: string;
  userName: string;
  dayKeys: string[];
  workouts: ReportWorkoutItem[];
  totalBurnedKcal: number;
  meals: ReportMealItem[];
  totalConsumedKcal: number;
  waterMl: number;
  waterLogs: ReportWaterItem[];
  steps: number;
  stepsByDay: ReportStepsDay[];
  weightKg: number | null;
  weightEntries: ReportWeightItem[];
  achievements: ReportAchievementItem[];
};

function positiveMacro(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value);
}

export function formatMealMacroSummary(meal: ReportMealItem): string | null {
  const parts: string[] = [];
  if (meal.proteinG != null) parts.push(`Protein ${meal.proteinG}g`);
  if (meal.carbsG != null) parts.push(`Carbs ${meal.carbsG}g`);
  if (meal.fatG != null) parts.push(`Fat ${meal.fatG}g`);
  if (meal.fiberG != null) parts.push(`Fiber ${meal.fiberG}g`);
  if (meal.sodiumMg != null) parts.push(`Sodium ${meal.sodiumMg}mg`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatMealReportLine(meal: ReportMealItem): string {
  const macro = formatMealMacroSummary(meal);
  const base = `${meal.title} — ${meal.calories.toLocaleString()} kcal`;
  return macro ? `${base} · ${macro}` : base;
}

function getCreatedAtDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate?: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v);
  return null;
}

function effectiveSteps(data: Record<string, unknown>): number {
  const manual =
    typeof data.stepsManual === "number" && Number.isFinite(data.stepsManual)
      ? Math.max(0, Math.round(data.stepsManual))
      : null;
  const auto =
    typeof data.stepsAuto === "number" && Number.isFinite(data.stepsAuto)
      ? Math.max(0, Math.round(data.stepsAuto))
      : 0;
  return manual ?? auto;
}

function dayKeyFromLog(data: Record<string, unknown>, calendarTz: string): string | null {
  const date = getCreatedAtDate(data.logDate ?? data.createdAt);
  if (!date) return null;
  return formatCalendarDayKey(date, calendarTz);
}

async function detectAchievementsInPeriod(
  uid: string,
  dayKeySet: Set<string>,
  calendarTz: string
): Promise<ReportAchievementItem[]> {
  const unlocked = new Set<string>();

  const workoutSnap = await getDocs(
    query(collection(db, "users", uid, "workoutLogs"), orderBy("createdAt", "asc"))
  );
  let workoutIndex = 0;
  workoutSnap.forEach((docSnap) => {
    workoutIndex++;
    const data = docSnap.data() as Record<string, unknown>;
    const createdAt = getCreatedAtDate(data.createdAt);
    if (!createdAt) return;
    const dayKey = formatCalendarDayKey(createdAt, calendarTz);
    if (!dayKeySet.has(dayKey)) return;
    if (workoutIndex === 1) unlocked.add("wo_first_complete");
    if (workoutIndex === 10) unlocked.add("wo_complete_10");
    if (workoutIndex === 25) unlocked.add("wo_complete_25");
    if (workoutIndex === 50) unlocked.add("wo_complete_50");
  });

  const waterSnap = await getDocs(
    query(collection(db, "users", uid, "waterLogs"), orderBy("createdAt", "asc"))
  );
  let waterIndex = 0;
  waterSnap.forEach((docSnap) => {
    waterIndex++;
    const data = docSnap.data() as Record<string, unknown>;
    const dayKey = dayKeyFromLog(data, calendarTz);
    if (!dayKey || !dayKeySet.has(dayKey)) return;
    if (waterIndex === 1) {
      unlocked.add("ml_water_first");
      unlocked.add("st_water_first");
    }
    if (waterIndex === 5) unlocked.add("ml_water_5");
    if (waterIndex === 10) unlocked.add("st_water_10");
    if (waterIndex === 20) unlocked.add("ml_water_20");
    if (waterIndex === 30) unlocked.add("st_water_30");
    if (waterIndex === 50) unlocked.add("ml_water_50");
  });

  const mealSnap = await getDocs(
    query(collection(db, "users", uid, "mealLogs"), orderBy("createdAt", "asc"))
  );
  let mealIndex = 0;
  mealSnap.forEach((docSnap) => {
    mealIndex++;
    const data = docSnap.data() as Record<string, unknown>;
    const dayKey = dayKeyFromLog(data, calendarTz);
    if (!dayKey || !dayKeySet.has(dayKey)) return;
    if (mealIndex === 1) unlocked.add("ml_meal_first");
    if (mealIndex === 10) unlocked.add("ml_meal_10");
    if (mealIndex === 25) unlocked.add("ml_meal_25");
  });

  const statsSnap = await getDocs(collection(db, "users", uid, "dailyStats"));
  const sortedStats = statsSnap.docs
    .map((docSnap) => ({
      dayKey: docSnap.id,
      steps: effectiveSteps(docSnap.data() as Record<string, unknown>),
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.dayKey))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  let days3000 = 0;
  let days5000 = 0;
  let days8000 = 0;
  for (const row of sortedStats) {
    if (row.steps >= 3000) {
      days3000++;
      if (dayKeySet.has(row.dayKey) && days3000 === 1) {
        unlocked.add("st_steps_first");
      }
    }
    if (row.steps >= 5000) {
      days5000++;
      if (dayKeySet.has(row.dayKey)) {
        if (days5000 === 3) unlocked.add("st_steps_3");
        if (days5000 === 7) unlocked.add("st_steps_7");
      }
    }
    if (row.steps >= 8000) {
      days8000++;
      if (dayKeySet.has(row.dayKey) && days8000 === 14) {
        unlocked.add("st_steps_14");
      }
    }
  }

  const weightSnap = await getDocs(
    query(collection(db, "users", uid, "weightLogs"), orderBy("createdAt", "asc"))
  );
  let weightIndex = 0;
  weightSnap.forEach((docSnap) => {
    weightIndex++;
    const data = docSnap.data() as Record<string, unknown>;
    const dayKey = dayKeyFromLog(data, calendarTz);
    if (!dayKey || !dayKeySet.has(dayKey)) return;
    if (weightIndex === 1) {
      unlocked.add("wo_weight_first");
      unlocked.add("st_weight_first");
    }
    if (weightIndex === 10) unlocked.add("st_weight_10");
  });

  return [...unlocked].map((id) => ({
    id,
    title: achievementTitleFromId(id),
    description: achievementDescriptionFromId(id),
  }));
}

export async function loadUserReport(options: {
  uid: string;
  period: ReportPeriod;
  calendarTz: string;
  anchorDate?: Date;
  userName?: string;
}): Promise<UserReport> {
  const { uid, period, calendarTz } = options;
  const anchor = options.anchorDate ?? new Date();
  const todayKey = formatCalendarDayKey(anchor, calendarTz);

  const dayKeys =
    period === "daily" ? [todayKey] : getWeekDayKeys(anchor, calendarTz);
  const dayKeySet = new Set(dayKeys);

  const userSnap = await getDoc(doc(db, "users", uid));
  const userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {};
  const userName =
    options.userName ??
    (typeof userData.name === "string" && userData.name.trim() ? userData.name.trim() : "User");

  const title =
    period === "daily"
      ? formatReportDayLabel(todayKey)
      : `Week of ${formatWeekRangeLabel(startOfWeekMonday(anchor))}`;
  const subtitle = period === "daily" ? "Daily Report" : "Weekly Report";

  const [workoutSnap, mealSnap, waterSnap, weightSnap, achievements] = await Promise.all([
    getDocs(
      query(collection(db, "users", uid, "workoutLogs"), orderBy("createdAt", "desc"), limit(600))
    ),
    getDocs(
      query(collection(db, "users", uid, "mealLogs"), orderBy("createdAt", "desc"), limit(600))
    ),
    getDocs(
      query(collection(db, "users", uid, "waterLogs"), orderBy("createdAt", "desc"), limit(600))
    ),
    getDocs(
      query(collection(db, "users", uid, "weightLogs"), orderBy("createdAt", "desc"), limit(600))
    ),
    detectAchievementsInPeriod(uid, dayKeySet, calendarTz),
  ]);

  const workouts: ReportWorkoutItem[] = [];
  workoutSnap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const createdAt = getCreatedAtDate(data.createdAt);
    if (!createdAt) return;
    const dayKey = formatCalendarDayKey(createdAt, calendarTz);
    if (!dayKeySet.has(dayKey)) return;
    const burnedKcal =
      typeof data.burnedKcal === "number" && Number.isFinite(data.burnedKcal)
        ? Math.round(data.burnedKcal)
        : 0;
    if (burnedKcal <= 0) return;
    workouts.push({
      title: typeof data.title === "string" ? data.title : "Workout",
      burnedKcal,
      durationMin:
        typeof data.durationMin === "number" && Number.isFinite(data.durationMin)
          ? Math.round(data.durationMin)
          : 0,
    });
  });

  const meals: ReportMealItem[] = [];
  mealSnap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const dayKey = dayKeyFromLog(data, calendarTz);
    if (!dayKey || !dayKeySet.has(dayKey)) return;
    const calories =
      typeof data.calories === "number" && Number.isFinite(data.calories)
        ? Math.round(data.calories)
        : 0;
    if (calories <= 0) return;
    meals.push({
      title: typeof data.title === "string" ? data.title : "Meal",
      calories,
      proteinG: positiveMacro(data.proteinG),
      carbsG: positiveMacro(data.carbsG),
      fatG: positiveMacro(data.fatG),
      fiberG: positiveMacro(data.fiberG),
      sodiumMg: positiveMacro(data.sodiumMg),
    });
  });

  const waterLogs: ReportWaterItem[] = [];
  waterSnap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const dayKey = dayKeyFromLog(data, calendarTz);
    if (!dayKey || !dayKeySet.has(dayKey)) return;
    const amountMl =
      typeof data.amountMl === "number" && Number.isFinite(data.amountMl)
        ? Math.round(data.amountMl)
        : 0;
    if (amountMl <= 0) return;
    waterLogs.push({ amountMl });
  });

  const weightByDay = new Map<string, { weightKg: number; dayKey: string; createdAt: Date }>();
  weightSnap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const dayKey = dayKeyFromLog(data, calendarTz);
    if (!dayKey || !dayKeySet.has(dayKey)) return;
    const createdAt = getCreatedAtDate(data.logDate ?? data.createdAt);
    if (!createdAt) return;
    const weightKg =
      typeof data.weight === "number" && Number.isFinite(data.weight) ? data.weight : null;
    if (weightKg == null || weightKg <= 0) return;
    const existing = weightByDay.get(dayKey);
    if (!existing || createdAt.getTime() > existing.createdAt.getTime()) {
      weightByDay.set(dayKey, { weightKg, dayKey, createdAt });
    }
  });
  const weightEntries: ReportWeightItem[] = [...weightByDay.values()]
    .map(({ weightKg, dayKey }) => ({ weightKg, dayKey }))
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey));

  const stepsByDay: ReportStepsDay[] = [];
  for (const dayKey of dayKeys) {
    const statSnap = await getDoc(doc(db, "users", uid, "dailyStats", dayKey));
    const steps = statSnap.exists()
      ? effectiveSteps(statSnap.data() as Record<string, unknown>)
      : 0;
    stepsByDay.push({ dayKey, steps });
  }
  const steps = stepsByDay.reduce((sum, row) => sum + row.steps, 0);

  let waterMl = waterLogs.reduce((sum, row) => sum + row.amountMl, 0);
  if (waterMl === 0 && period === "daily") {
    const statSnap = await getDoc(doc(db, "users", uid, "dailyStats", todayKey));
    if (statSnap.exists()) {
      const wm = (statSnap.data() as { waterMl?: unknown }).waterMl;
      if (typeof wm === "number" && Number.isFinite(wm)) waterMl = Math.round(wm);
    }
  } else if (waterMl === 0 && period === "weekly") {
    for (const dayKey of dayKeys) {
      const statSnap = await getDoc(doc(db, "users", uid, "dailyStats", dayKey));
      if (!statSnap.exists()) continue;
      const wm = (statSnap.data() as { waterMl?: unknown }).waterMl;
      if (typeof wm === "number" && Number.isFinite(wm)) waterMl += Math.round(wm);
    }
  }

  let weightKg: number | null = weightEntries[0]?.weightKg ?? null;
  if (weightKg == null && period === "daily") {
    const profileWeight =
      typeof userData.weight === "number" && Number.isFinite(userData.weight)
        ? userData.weight
        : null;
    if (profileWeight != null && profileWeight > 0) weightKg = profileWeight;
  }

  const totalBurnedKcal = workouts.reduce((sum, row) => sum + row.burnedKcal, 0);
  const totalConsumedKcal = meals.reduce((sum, row) => sum + row.calories, 0);

  return {
    period,
    title,
    subtitle,
    userName,
    dayKeys,
    workouts,
    totalBurnedKcal,
    meals,
    totalConsumedKcal,
    waterMl,
    waterLogs,
    steps,
    stepsByDay,
    weightKg,
    weightEntries,
    achievements,
  };
}

export function reportFileName(report: UserReport): string {
  const base = "Personalised Workout And Nutrition Guidance Report";
  const datePart =
    report.period === "daily"
      ? report.dayKeys[0]
      : `${report.dayKeys[0]} to ${report.dayKeys[report.dayKeys.length - 1]}`;
  return `${base} - ${datePart}.pdf`;
}

export function reportShareTitle(report: UserReport): string {
  return reportFileName(report).replace(/\.pdf$/i, "");
}
