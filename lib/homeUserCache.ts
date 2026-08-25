import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PlanDuration } from "@/lib/workoutPlan";

export type HomeUserCache = {
  name: string;
  profileImage: string | null;
  gender: "male" | "female" | null;
  age: number;
  height: number;
  weight: number;
  activityMultiplier: number;
  recommendedPlan: "gain" | "maintain" | "lose" | null;
  planDuration: PlanDuration | null;
  nutritionPlanDuration: PlanDuration | null;
  dailyStatsDayKey: string | null;
  consumedKcal: number;
  burnedKcal: number;
};

const EMPTY_CACHE: HomeUserCache = {
  name: "",
  profileImage: null,
  gender: null,
  age: 0,
  height: 0,
  weight: 0,
  activityMultiplier: 1.2,
  recommendedPlan: null,
  planDuration: null,
  nutritionPlanDuration: null,
  dailyStatsDayKey: null,
  consumedKcal: 0,
  burnedKcal: 0,
};

const memoryByUid = new Map<string, HomeUserCache>();

function parsePlanDuration(value: unknown): PlanDuration | null {
  return value === "week" || value === "biweekly" || value === "monthly" ? value : null;
}

function parseRecommendedPlan(value: unknown): "gain" | "maintain" | "lose" | null {
  return value === "gain" || value === "maintain" || value === "lose" ? value : null;
}

export function parseHomeUserCacheFromFirestore(
  data: Record<string, unknown> | null | undefined,
  prev: HomeUserCache = EMPTY_CACHE
): HomeUserCache {
  if (!data) return prev;

  const planDuration = parsePlanDuration(data.planDuration);
  const nutritionPlanDuration =
    parsePlanDuration(data.nutritionPlanDuration) ?? planDuration;

  return {
    name: typeof data.name === "string" ? data.name.trim() : prev.name,
    profileImage:
      typeof data.profileImage === "string" && data.profileImage.length > 0
        ? data.profileImage
        : null,
    gender: data.gender === "male" || data.gender === "female" ? data.gender : prev.gender,
    age: typeof data.age === "number" && Number.isFinite(data.age) ? data.age : prev.age,
    height:
      typeof data.height === "number" && Number.isFinite(data.height) ? data.height : prev.height,
    weight:
      typeof data.weight === "number" && Number.isFinite(data.weight) ? data.weight : prev.weight,
    activityMultiplier:
      typeof data.activityMultiplier === "number" && data.activityMultiplier > 0
        ? data.activityMultiplier
        : prev.activityMultiplier,
    recommendedPlan: parseRecommendedPlan(data.recommendedPlan) ?? prev.recommendedPlan,
    planDuration: planDuration ?? prev.planDuration,
    nutritionPlanDuration: nutritionPlanDuration ?? prev.nutritionPlanDuration,
    dailyStatsDayKey: prev.dailyStatsDayKey,
    consumedKcal: prev.consumedKcal,
    burnedKcal: prev.burnedKcal,
  };
}

export function homeUserCacheKey(uid: string): string {
  return `home_user_v2:${uid}`;
}

/** Sync read from in-memory cache (populated after first load/save this session). */
export function getHomeUserCacheSync(uid: string | null | undefined): HomeUserCache | null {
  if (!uid) return null;
  return memoryByUid.get(uid) ?? null;
}

function normalizeStoredCache(parsed: Partial<HomeUserCache>): HomeUserCache {
  return {
    name: typeof parsed.name === "string" ? parsed.name : "",
    profileImage:
      typeof parsed.profileImage === "string" && parsed.profileImage.length > 0
        ? parsed.profileImage
        : null,
    gender: parsed.gender === "male" || parsed.gender === "female" ? parsed.gender : null,
    age: typeof parsed.age === "number" && Number.isFinite(parsed.age) ? parsed.age : 0,
    height: typeof parsed.height === "number" && Number.isFinite(parsed.height) ? parsed.height : 0,
    weight: typeof parsed.weight === "number" && Number.isFinite(parsed.weight) ? parsed.weight : 0,
    activityMultiplier:
      typeof parsed.activityMultiplier === "number" && parsed.activityMultiplier > 0
        ? parsed.activityMultiplier
        : 1.2,
    recommendedPlan: parseRecommendedPlan(parsed.recommendedPlan),
    planDuration: parsePlanDuration(parsed.planDuration),
    nutritionPlanDuration: parsePlanDuration(parsed.nutritionPlanDuration),
    dailyStatsDayKey:
      typeof parsed.dailyStatsDayKey === "string" && parsed.dailyStatsDayKey.length > 0
        ? parsed.dailyStatsDayKey
        : null,
    consumedKcal:
      typeof parsed.consumedKcal === "number" && Number.isFinite(parsed.consumedKcal)
        ? parsed.consumedKcal
        : 0,
    burnedKcal:
      typeof parsed.burnedKcal === "number" && Number.isFinite(parsed.burnedKcal)
        ? parsed.burnedKcal
        : 0,
  };
}

export async function loadHomeUserCache(uid: string | null | undefined): Promise<HomeUserCache | null> {
  if (!uid) return null;
  const mem = memoryByUid.get(uid);
  if (mem) return mem;
  try {
    const raw = await AsyncStorage.getItem(homeUserCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HomeUserCache>;
    const next = normalizeStoredCache(parsed);
    memoryByUid.set(uid, next);
    return next;
  } catch {
    return null;
  }
}

export function saveHomeUserCacheSync(
  uid: string | null | undefined,
  data: HomeUserCache
): HomeUserCache | null {
  if (!uid) return null;
  const next = normalizeStoredCache(data);
  memoryByUid.set(uid, next);
  void AsyncStorage.setItem(homeUserCacheKey(uid), JSON.stringify(next)).catch(() => {});
  return next;
}

export async function saveHomeUserCache(
  uid: string | null | undefined,
  data: Partial<HomeUserCache>
): Promise<void> {
  if (!uid) return;
  const prev = memoryByUid.get(uid) ?? EMPTY_CACHE;
  const next = normalizeStoredCache({ ...prev, ...data });
  saveHomeUserCacheSync(uid, next);
}

/** Warm in-memory cache immediately; disk write is async (Home reads memory on first paint). */
export function warmHomeUserCacheFromUserDataSync(
  uid: string,
  data: Record<string, unknown> | null | undefined
): HomeUserCache | null {
  if (!data) return getHomeUserCacheSync(uid);
  const prev = memoryByUid.get(uid) ?? EMPTY_CACHE;
  const next = parseHomeUserCacheFromFirestore(data, prev);
  if (
    !next.name &&
    !next.profileImage &&
    !next.weight &&
    !next.height &&
    !prev.name &&
    !prev.profileImage
  ) {
    return prev.name || prev.profileImage ? prev : null;
  }
  return saveHomeUserCacheSync(uid, next);
}

/** Warm cache from Firestore user doc fields (call on login / profile save). */
export async function warmHomeUserCacheFromUserData(
  uid: string,
  data: Record<string, unknown> | null | undefined
): Promise<HomeUserCache | null> {
  const warmed = warmHomeUserCacheFromUserDataSync(uid, data);
  if (warmed) return warmed;
  return loadHomeUserCache(uid);
}

export function patchHomeDailyStatsCache(
  uid: string,
  dayKey: string,
  consumedKcal: number,
  burnedKcal: number
): void {
  const prev = memoryByUid.get(uid) ?? EMPTY_CACHE;
  saveHomeUserCacheSync(uid, {
    ...prev,
    dailyStatsDayKey: dayKey,
    consumedKcal,
    burnedKcal,
  });
}
