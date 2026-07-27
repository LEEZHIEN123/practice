import AsyncStorage from "@react-native-async-storage/async-storage";

export type HomeUserCache = {
  name: string;
  profileImage: string | null;
};

const memoryByUid = new Map<string, HomeUserCache>();

export function homeUserCacheKey(uid: string): string {
  return `home_user_v1:${uid}`;
}

/** Sync read from in-memory cache (populated after first load/save this session). */
export function getHomeUserCacheSync(uid: string | null | undefined): HomeUserCache | null {
  if (!uid) return null;
  return memoryByUid.get(uid) ?? null;
}

export async function loadHomeUserCache(uid: string | null | undefined): Promise<HomeUserCache | null> {
  if (!uid) return null;
  const mem = memoryByUid.get(uid);
  if (mem) return mem;
  try {
    const raw = await AsyncStorage.getItem(homeUserCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HomeUserCache>;
    const next: HomeUserCache = {
      name: typeof parsed.name === "string" ? parsed.name : "",
      profileImage: typeof parsed.profileImage === "string" && parsed.profileImage ? parsed.profileImage : null,
    };
    memoryByUid.set(uid, next);
    return next;
  } catch {
    return null;
  }
}

export async function saveHomeUserCache(
  uid: string | null | undefined,
  data: HomeUserCache
): Promise<void> {
  if (!uid) return;
  const next: HomeUserCache = {
    name: data.name.trim(),
    profileImage: data.profileImage,
  };
  memoryByUid.set(uid, next);
  try {
    await AsyncStorage.setItem(homeUserCacheKey(uid), JSON.stringify(next));
  } catch {
    // Ignore cache write failures — Firestore remains source of truth.
  }
}

/** Warm cache from Firestore user doc fields (call on login / profile save). */
export async function warmHomeUserCacheFromUserData(
  uid: string,
  data: Record<string, unknown> | null | undefined
): Promise<HomeUserCache | null> {
  if (!data) return loadHomeUserCache(uid);
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const profileImage =
    typeof data.profileImage === "string" && data.profileImage.length > 0 ? data.profileImage : null;
  if (!name && !profileImage) return loadHomeUserCache(uid);
  const next: HomeUserCache = { name, profileImage };
  await saveHomeUserCache(uid, next);
  return next;
}
