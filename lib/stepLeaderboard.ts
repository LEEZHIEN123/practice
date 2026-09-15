import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

export const DAILY_STEP_TARGET = 7_000;

export type DailyStepRankingEntry = {
  uid: string;
  name: string;
  profileImage: string | null;
  steps: number;
};

const userExistsCache = new Map<string, { exists: boolean; checkedAt: number }>();
const EXISTS_CACHE_MS = 60_000;
const MISSING_CACHE_MS = 10 * 60_000;

async function userAccountStillExists(uid: string): Promise<boolean> {
  if (!uid) return false;
  const cached = userExistsCache.get(uid);
  const now = Date.now();
  if (cached) {
    const maxAge = cached.exists ? EXISTS_CACHE_MS : MISSING_CACHE_MS;
    if (now - cached.checkedAt < maxAge) return cached.exists;
  }
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const exists = snap.exists();
    userExistsCache.set(uid, { exists, checkedAt: now });
    return exists;
  } catch {
    return cached?.exists ?? false;
  }
}

async function existingRankingUserIds(uids: string[]): Promise<Set<string>> {
  const unique = [...new Set(uids.filter(Boolean))];
  const existing = new Set<string>();
  await Promise.all(
    unique.map(async (uid) => {
      if (await userAccountStillExists(uid)) existing.add(uid);
    })
  );
  return existing;
}

export async function publishDailyStepRanking(dayKey: string, steps: number): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const rankingRef = doc(db, "dailyStepRankings", dayKey, "entries", user.uid);
  const safeSteps = Math.max(0, Math.min(200_000, Math.round(steps)));
  if (safeSteps === 0) {
    await deleteDoc(rankingRef);
    return;
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) {
    userExistsCache.set(user.uid, { exists: false, checkedAt: Date.now() });
    await deleteDoc(rankingRef).catch(() => {});
    return;
  }
  userExistsCache.set(user.uid, { exists: true, checkedAt: Date.now() });
  const profile = userSnap.data() as
    | { name?: unknown; profileImage?: unknown }
    | undefined;

  await setDoc(
    rankingRef,
    {
      uid: user.uid,
      name:
        typeof profile?.name === "string" && profile.name.trim()
          ? profile.name.trim()
          : user.displayName || "User",
      profileImage:
        typeof profile?.profileImage === "string" && profile.profileImage
          ? profile.profileImage
          : null,
      steps: safeSteps,
      dayKey,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function subscribeDailyStepRanking(
  dayKey: string,
  onData: (entries: DailyStepRankingEntry[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const rankingQuery = query(
    collection(db, "dailyStepRankings", dayKey, "entries"),
    orderBy("steps", "desc"),
    limit(100)
  );

  let requestId = 0;
  return onSnapshot(
    rankingQuery,
    (snapshot) => {
      const mapped = snapshot.docs
        .map((rankingDoc) => {
          const data = rankingDoc.data() as Record<string, unknown>;
          return {
            uid: rankingDoc.id,
            name:
              typeof data.name === "string" && data.name.trim()
                ? data.name
                : "User",
            profileImage:
              typeof data.profileImage === "string" && data.profileImage
                ? data.profileImage
                : null,
            steps:
              typeof data.steps === "number" && Number.isFinite(data.steps)
                ? Math.max(0, Math.round(data.steps))
                : 0,
          };
        })
        .filter((entry) => entry.steps > 0);

      const currentRequest = ++requestId;
      void existingRankingUserIds(mapped.map((entry) => entry.uid))
        .then((existingIds) => {
          if (currentRequest !== requestId) return;
          onData(mapped.filter((entry) => existingIds.has(entry.uid)));
        })
        .catch(() => {
          if (currentRequest !== requestId) return;
          const uid = auth.currentUser?.uid;
          onData(uid ? mapped.filter((entry) => entry.uid === uid) : []);
        });
    },
    (error) => onError?.(error)
  );
}
