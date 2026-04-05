import { auth, db } from "../firebaseConfig";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  updateDoc,
} from "firebase/firestore";

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

function buildSections(
  data: Record<string, unknown>,
  state: AchievementStatePersisted,
  weightLogCount: number
): AchievementSectionModel[] {
  const profileOk = isProfileComplete(data);
  const loginStreak = state.loginStreak ?? 0;
  const workoutDays = state.workoutPlanDays ?? 0;

  const workoutRows: AchievementRowModel[] = [
    {
      id: "wo_profile",
      label: "Complete your fitness profile",
      variant: "done",
      rightLabel: profileOk ? "DONE" : "—",
      isComplete: profileOk,
    },
    {
      id: "wo_plan_days",
      label: 'Open "View Full Plan" on 5 different days',
      variant: "progress",
      rightLabel: `${Math.min(workoutDays, 5)} / 5`,
      isComplete: workoutDays >= 5,
    },
    {
      id: "wo_weigh_ins",
      label: "Log 3 weigh-ins on Progress",
      variant: "progress",
      rightLabel: `${Math.min(weightLogCount, 3)} / 3`,
      isComplete: weightLogCount >= 3,
    },
  ];

  const streakRows: AchievementRowModel[] = [
    {
      id: "st_login",
      label: "Build a 7-day login streak",
      variant: "progress",
      rightLabel: `${Math.min(loginStreak, 7)} / 7`,
      isComplete: loginStreak >= 7,
    },
    {
      id: "st_first_weight",
      label: "Log your first weight entry",
      variant: "done",
      rightLabel: weightLogCount >= 1 ? "DONE" : "—",
      isComplete: weightLogCount >= 1,
    },
    {
      id: "st_weight_5",
      label: "Collect 5 weight entries",
      variant: "progress",
      rightLabel: `${Math.min(weightLogCount, 5)} / 5`,
      isComplete: weightLogCount >= 5,
    },
  ];

  const pack = (category: AchievementCategory, rows: AchievementRowModel[]): AchievementSectionModel => ({
    category,
    rows,
    completedCount: rows.filter((r) => r.isComplete).length,
    totalCount: rows.length,
  });

  const comingSoon = (category: AchievementCategory): AchievementSectionModel => ({
    category,
    rows: [],
    completedCount: 0,
    totalCount: 0,
    comingSoon: true,
  });

  return [
    pack("workout", workoutRows),
    comingSoon("meal"),
    comingSoon("community"),
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

  const countSnap = await getCountFromServer(collection(db, "users", user.uid, "weightLogs"));
  const weightLogCount = countSnap.data().count;

  return buildSections(data, state, weightLogCount);
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

