import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

export type AchievementCategory = "workout" | "meal" | "community" | "streaks";
export type AchievementFilter = "all" | AchievementCategory;

export type AchievementStatePersisted = {
  lastOpenDate?: string;
  loginStreak?: number;
  lastWorkoutPlanDate?: string;
  workoutPlanDays?: number;
};

export type AchievementRowModel = {
  id: string;
  title?: string;
  label: string;
  variant: "done" | "progress";
  rightLabel: string;
  isComplete: boolean;
};

export type AchievementSectionModel = {
  category: AchievementCategory;
  completedCount: number;
  totalCount: number;
  rows: AchievementRowModel[];
  /** Meal & community tracks are not live yet */
  comingSoon?: boolean;
};

export function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdAddDays(ymd: string, delta: number): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localYmd(dt);
}

function isProfileComplete(data: Record<string, unknown>): boolean {
  return Boolean(
    data.name &&
    typeof data.height === "number" &&
    data.height > 0 &&
    typeof data.weight === "number" &&
    data.weight > 0 &&
    data.activityLevel
  );
}

function mergeAchievementState(
  data: Record<string, unknown>
): AchievementStatePersisted {
  const raw = data.achievementState;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as AchievementStatePersisted) };
  }
  return {};
}

function computeLoginStreakUpdate(
  prev: AchievementStatePersisted,
  today: string
): { next: AchievementStatePersisted; shouldPersist: boolean } {
  const last = prev.lastOpenDate;
  if (last === today) {
    return { next: prev, shouldPersist: false };
  }
  const yesterday = ymdAddDays(today, -1);
  let loginStreak = prev.loginStreak ?? 0;
  if (last === yesterday) loginStreak = (prev.loginStreak ?? 0) + 1;
  else loginStreak = 1;
  return {
    next: { ...prev, lastOpenDate: today, loginStreak },
    shouldPersist: true,
  };
}

type AchievementMetrics = {
  weightLogCount: number;
  workoutLogCount: number;
  discoverWorkoutLogCount: number;
  completedSessionCount: number;
  waterLogCount: number;
  stepDays3000Count: number;
  stepDays5000Count: number;
  stepDays8000Count: number;
};

function titleFromId(id: string): string {
  const titles: Record<string, string> = {
    wo_profile: "Profile Complete",
    wo_goal: "Goal Set",
    wo_plan_generated: "Plan Generated",
    wo_plan_days: "Plan Explorer",
    wo_first_complete: "First Workout",
    wo_complete_10: "Workout Regular",
    wo_complete_25: "Workout Champion",
    ml_water_first: "First Hydration Log",
    ml_water_5: "Hydration Habit",
    ml_water_20: "Hydration Pro",
    ml_meal_reminder: "Meal Reminder Set",
    ml_water_reminder: "Water Reminder Set",
    ml_repeat_days: "Repeat Days Enabled",
    ml_water_50: "Hydration Master",
    cm_discover_first: "Discover Starter",
    cm_discover_5: "Discover Active",
    cm_discover_15: "Discover Expert",
    cm_mix_first: "Balanced Starter",
    cm_mix_10_3: "Balanced Builder",
    cm_mix_25_7: "Balanced Advanced",
    cm_mix_50_15: "Balanced Master",
    st_steps_first: "First Step Day",
    st_steps_3: "Step Starter",
    st_steps_7: "Daily Walker",
    st_steps_14: "Step Explorer",
    st_water_first: "First Water Check-In",
    st_water_10: "Water Habit",
    st_water_30: "Hydration Champion",
  };
  return titles[id] ?? "Achievement";
}

function buildSections(
  data: Record<string, unknown>,
  state: AchievementStatePersisted,
  metrics: AchievementMetrics
): AchievementSectionModel[] {
  const profileOk = isProfileComplete(data);
  const weightLogCount = metrics.weightLogCount;
  const workoutLogCount = metrics.workoutLogCount;
  const discoverWorkoutLogCount = metrics.discoverWorkoutLogCount;
  const completedSessionCount = metrics.completedSessionCount;
  const waterLogCount = metrics.waterLogCount;
  const workoutDays = state.workoutPlanDays ?? 0;
  const stepDays3000Count = metrics.stepDays3000Count;
  const stepDays5000Count = metrics.stepDays5000Count;
  const stepDays8000Count = metrics.stepDays8000Count;
  const planGenerated = Boolean(
    (data as any)?.activeWorkoutPlan ||
      (data as any)?.planDuration ||
      ((data as any)?.workoutPlansByGoal &&
        typeof (data as any).workoutPlansByGoal === "object" &&
        Object.keys((data as any).workoutPlansByGoal).length > 0) ||
      ((data as any)?.workoutPlansByBmiGoal &&
        typeof (data as any).workoutPlansByBmiGoal === "object" &&
        Object.keys((data as any).workoutPlansByBmiGoal).length > 0)
  );
  const hasGoalAndBmi =
    typeof (data as any)?.bmi === "number" &&
    Number.isFinite((data as any)?.bmi) &&
    ((data as any)?.recommendedPlan === "gain" ||
      (data as any)?.recommendedPlan === "maintain" ||
      (data as any)?.recommendedPlan === "lose");
  const reminders = ((data as any)?.reminders ?? {}) as Record<string, any>;
  const reminderRepeatDays = Array.isArray((data as any)?.reminderRepeatDays)
    ? ((data as any).reminderRepeatDays as unknown[])
    : [];
  const reminderActiveDays = reminderRepeatDays.filter(Boolean).length;
  const mealReminderCount = Array.isArray(reminders?.meal?.times)
    ? reminders.meal.times.length
    : 0;
  const waterReminderCount = Array.isArray(reminders?.water?.times)
    ? reminders.water.times.length
    : 0;
  const plannedWorkoutLogCount = Math.max(0, workoutLogCount - discoverWorkoutLogCount);

  const workoutRows: AchievementRowModel[] = [
    {
      id: "wo_profile",
      label: "Complete your fitness profile",
      variant: "done",
      rightLabel: profileOk ? "DONE" : "—",
      isComplete: profileOk,
    },
    {
      id: "wo_goal",
      label: "Get your BMI analysis and goal",
      variant: "done",
      rightLabel: hasGoalAndBmi ? "DONE" : "—",
      isComplete: hasGoalAndBmi,
    },
    {
      id: "wo_plan_generated",
      label: "Generate your first workout plan",
      variant: "done",
      rightLabel: planGenerated ? "DONE" : "—",
      isComplete: planGenerated,
    },
    {
      id: "wo_plan_days",
      label: 'Open "View Full Plan" on 5 different days',
      variant: "progress",
      rightLabel: `${Math.min(workoutDays, 5)} / 5`,
      isComplete: workoutDays >= 5,
    },
    {
      id: "wo_first_complete",
      label: "Complete your first workout",
      variant: "progress",
      rightLabel: `${Math.min(completedSessionCount, 1)} / 1`,
      isComplete: completedSessionCount >= 1,
    },
    {
      id: "wo_complete_10",
      label: "Complete 10 workouts",
      variant: "progress",
      rightLabel: `${Math.min(completedSessionCount, 10)} / 10`,
      isComplete: completedSessionCount >= 10,
    },
    {
      id: "wo_complete_25",
      label: "Complete 25 workouts",
      variant: "progress",
      rightLabel: `${Math.min(completedSessionCount, 25)} / 25`,
      isComplete: completedSessionCount >= 25,
    },
  ];

  const mealRows: AchievementRowModel[] = [
    {
      id: "ml_water_first",
      label: "Log your first water intake",
      variant: "progress",
      rightLabel: `${Math.min(waterLogCount, 1)} / 1`,
      isComplete: waterLogCount >= 1,
    },
    {
      id: "ml_water_5",
      label: "Log water intake 5 times",
      variant: "progress",
      rightLabel: `${Math.min(waterLogCount, 5)} / 5`,
      isComplete: waterLogCount >= 5,
    },
    {
      id: "ml_water_20",
      label: "Log water intake 20 times",
      variant: "progress",
      rightLabel: `${Math.min(waterLogCount, 20)} / 20`,
      isComplete: waterLogCount >= 20,
    },
    {
      id: "ml_meal_reminder",
      label: "Set at least 1 meal reminder",
      variant: "progress",
      rightLabel: `${Math.min(mealReminderCount, 1)} / 1`,
      isComplete: mealReminderCount >= 1,
    },
    {
      id: "ml_water_reminder",
      label: "Set at least 1 water reminder",
      variant: "progress",
      rightLabel: `${Math.min(waterReminderCount, 1)} / 1`,
      isComplete: waterReminderCount >= 1,
    },
    {
      id: "ml_repeat_days",
      label: "Enable reminders on 3+ repeat days",
      variant: "progress",
      rightLabel: `${Math.min(reminderActiveDays, 3)} / 3`,
      isComplete: reminderActiveDays >= 3,
    },
    {
      id: "ml_water_50",
      label: "Log water intake 50 times",
      variant: "progress",
      rightLabel: `${Math.min(waterLogCount, 50)} / 50`,
      isComplete: waterLogCount >= 50,
    },
  ];

  const communityRows: AchievementRowModel[] = [
    {
      id: "cm_discover_first",
      label: "Complete your first Discover workout",
      variant: "progress",
      rightLabel: `${Math.min(discoverWorkoutLogCount, 1)} / 1`,
      isComplete: discoverWorkoutLogCount >= 1,
    },
    {
      id: "cm_discover_5",
      label: "Complete 5 Discover workouts",
      variant: "progress",
      rightLabel: `${Math.min(discoverWorkoutLogCount, 5)} / 5`,
      isComplete: discoverWorkoutLogCount >= 5,
    },
    {
      id: "cm_discover_15",
      label: "Complete 15 Discover workouts",
      variant: "progress",
      rightLabel: `${Math.min(discoverWorkoutLogCount, 15)} / 15`,
      isComplete: discoverWorkoutLogCount >= 15,
    },
    {
      id: "cm_mix_first",
      label: "Complete 1 planned + 1 Discover workout",
      variant: "done",
      rightLabel:
        plannedWorkoutLogCount >= 1 && discoverWorkoutLogCount >= 1 ? "DONE" : "—",
      isComplete: plannedWorkoutLogCount >= 1 && discoverWorkoutLogCount >= 1,
    },
    {
      id: "cm_mix_10_3",
      label: "Reach 10 total workouts (3 from Discover)",
      variant: "done",
      rightLabel:
        workoutLogCount >= 10 && discoverWorkoutLogCount >= 3 ? "DONE" : "—",
      isComplete: workoutLogCount >= 10 && discoverWorkoutLogCount >= 3,
    },
    {
      id: "cm_mix_25_7",
      label: "Reach 25 total workouts (7 from Discover)",
      variant: "done",
      rightLabel:
        workoutLogCount >= 25 && discoverWorkoutLogCount >= 7 ? "DONE" : "—",
      isComplete: workoutLogCount >= 25 && discoverWorkoutLogCount >= 7,
    },
    {
      id: "cm_mix_50_15",
      label: "Reach 50 total workouts (15 from Discover)",
      variant: "done",
      rightLabel:
        workoutLogCount >= 50 && discoverWorkoutLogCount >= 15 ? "DONE" : "—",
      isComplete: workoutLogCount >= 50 && discoverWorkoutLogCount >= 15,
    },
  ];

  const streakRows: AchievementRowModel[] = [
    {
      id: "st_steps_first",
      label: "Reach 3,000 steps in a day",
      variant: "progress",
      rightLabel: `${Math.min(stepDays3000Count, 1)} / 1`,
      isComplete: stepDays3000Count >= 1,
    },
    {
      id: "st_steps_3",
      label: "Reach 5,000 steps on 3 days",
      variant: "progress",
      rightLabel: `${Math.min(stepDays5000Count, 3)} / 3`,
      isComplete: stepDays5000Count >= 3,
    },
    {
      id: "st_steps_7",
      label: "Reach 5,000 steps on 7 days",
      variant: "progress",
      rightLabel: `${Math.min(stepDays5000Count, 7)} / 7`,
      isComplete: stepDays5000Count >= 7,
    },
    {
      id: "st_steps_14",
      label: "Reach 8,000 steps on 14 days",
      variant: "progress",
      rightLabel: `${Math.min(stepDays8000Count, 14)} / 14`,
      isComplete: stepDays8000Count >= 14,
    },
    {
      id: "st_water_first",
      label: "Log your first water intake",
      variant: "progress",
      rightLabel: `${Math.min(waterLogCount, 1)} / 1`,
      isComplete: waterLogCount >= 1,
    },
    {
      id: "st_water_10",
      label: "Log water intake 10 times",
      variant: "progress",
      rightLabel: `${Math.min(waterLogCount, 10)} / 10`,
      isComplete: waterLogCount >= 10,
    },
    {
      id: "st_water_30",
      label: "Log water intake 30 times",
      variant: "progress",
      rightLabel: `${Math.min(waterLogCount, 30)} / 30`,
      isComplete: waterLogCount >= 30,
    },
  ];

  const pack = (category: AchievementCategory, rows: AchievementRowModel[]): AchievementSectionModel => {
    const titledRows = rows.map((r) => ({ ...r, title: titleFromId(r.id) }));
    return {
      category,
      rows: titledRows,
      completedCount: titledRows.filter((r) => r.isComplete).length,
      totalCount: titledRows.length,
    };
  };

  const comingSoon = (
    category: AchievementCategory,
    plannedCount: number
  ): AchievementSectionModel => ({
    category,
    rows: [],
    completedCount: 0,
    totalCount: plannedCount,
    comingSoon: true,
  });

  return [
    pack("workout", workoutRows),
    comingSoon("meal", mealRows.length),
    comingSoon("community", communityRows.length),
    pack("streaks", streakRows),
  ];
}

/** Load user achievement data, sync login streak when opening Achievements, return UI models. */
export async function loadAndSyncAchievements(): Promise<AchievementSectionModel[] | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as Record<string, unknown>;
  let state = mergeAchievementState(data);
  const today = localYmd(new Date());
  const { next, shouldPersist } = computeLoginStreakUpdate(state, today);

  if (shouldPersist) {
    state = next;
    await updateDoc(ref, { achievementState: state });
  } else {
    state = next;
  }

  const weightLogCountPromise = getCountFromServer(
    collection(db, "users", user.uid, "weightLogs")
  );
  const workoutLogCountPromise = getCountFromServer(
    collection(db, "users", user.uid, "workoutLogs")
  );
  const discoverWorkoutLogCountPromise = getCountFromServer(
    query(collection(db, "users", user.uid, "workoutLogs"), where("origin", "==", "discover"))
  );
  const completedSessionCountPromise = getCountFromServer(
    query(collection(db, "users", user.uid, "workoutSessions"), where("status", "==", "completed"))
  );
  const waterLogCountPromise = getCountFromServer(
    collection(db, "users", user.uid, "waterLogs")
  );
  const dailyStatsSnapPromise = getDocs(collection(db, "users", user.uid, "dailyStats"));

  const [
    weightLogCountSnap,
    workoutLogCountSnap,
    discoverWorkoutLogCountSnap,
    completedSessionCountSnap,
    waterLogCountSnap,
    dailyStatsSnap,
  ] = await Promise.all([
    weightLogCountPromise,
    workoutLogCountPromise,
    discoverWorkoutLogCountPromise,
    completedSessionCountPromise,
    waterLogCountPromise,
    dailyStatsSnapPromise,
  ]);

  let stepDays3000Count = 0;
  let stepDays5000Count = 0;
  let stepDays8000Count = 0;
  dailyStatsSnap.forEach((docSnap) => {
    const stats = docSnap.data() as { stepsAuto?: unknown; stepsManual?: unknown };
    const manual =
      typeof stats.stepsManual === "number" && Number.isFinite(stats.stepsManual)
        ? Math.max(0, Math.round(stats.stepsManual))
        : null;
    const auto =
      typeof stats.stepsAuto === "number" && Number.isFinite(stats.stepsAuto)
        ? Math.max(0, Math.round(stats.stepsAuto))
        : 0;
    const steps = manual != null ? manual : auto;
    if (steps >= 3000) stepDays3000Count += 1;
    if (steps >= 5000) stepDays5000Count += 1;
    if (steps >= 8000) stepDays8000Count += 1;
  });

  return buildSections(data, state, {
    weightLogCount: weightLogCountSnap.data().count,
    workoutLogCount: workoutLogCountSnap.data().count,
    discoverWorkoutLogCount: discoverWorkoutLogCountSnap.data().count,
    completedSessionCount: completedSessionCountSnap.data().count,
    waterLogCount: waterLogCountSnap.data().count,
    stepDays3000Count,
    stepDays5000Count,
    stepDays8000Count,
  });
}

async function readMergeWrite(
  uid: string,
  mutator: (prev: AchievementStatePersisted) => AchievementStatePersisted | null
): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;
  const prev = mergeAchievementState(data);
  const next = mutator(prev);
  if (next == null) return;
  await updateDoc(ref, { achievementState: next });
}

export async function bumpWorkoutPlanDay(uid: string): Promise<void> {
  const today = localYmd(new Date());
  await readMergeWrite(uid, (prev) => {
    if (prev.lastWorkoutPlanDate === today) return null;
    return {
      ...prev,
      lastWorkoutPlanDate: today,
      workoutPlanDays: (prev.workoutPlanDays ?? 0) + 1,
    };
  });
}

