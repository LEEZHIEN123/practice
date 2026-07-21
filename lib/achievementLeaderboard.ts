import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { checkIsAdmin } from "./communityService";

export const TOTAL_ACHIEVEMENTS = 60;

export type AchievementRankingEntry = {
  uid: string;
  name: string;
  profileImage: string | null;
  unlockedCount: number;
};

const ADMIN_EMAIL = "leezhien12345@gmail.com";

function isAdminUserData(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const email =
    typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  return (
    data.isAdmin === true ||
    data.role === "admin" ||
    email === ADMIN_EMAIL
  );
}

function clampUnlockedCount(unlockedCount: number): number {
  return Math.max(0, Math.min(TOTAL_ACHIEVEMENTS, Math.round(unlockedCount)));
}

function countFromUnlockedList(data: Record<string, unknown>): number {
  const achievementState =
    data.achievementState &&
    typeof data.achievementState === "object" &&
    !Array.isArray(data.achievementState)
      ? (data.achievementState as Record<string, unknown>)
      : null;
  const unlocked = Array.isArray(achievementState?.unlockedAchievements)
    ? achievementState.unlockedAchievements
    : [];
  return new Set(
    unlocked.filter(
      (achievement): achievement is string =>
        typeof achievement === "string" && achievement.length > 0
    )
  ).size;
}

/** Best-effort count from public user fields when a full sync has not run yet. */
function estimateUnlockedFromPublicProfile(data: Record<string, unknown>): number {
  const stored = countFromUnlockedList(data);
  if (stored > 0) return stored;

  let count = 0;
  const profileOk = Boolean(
    data.name &&
      typeof data.height === "number" &&
      data.height > 0 &&
      typeof data.weight === "number" &&
      data.weight > 0 &&
      data.activityLevel
  );
  if (profileOk) count += 1;

  const hasGoalAndBmi =
    typeof data.bmi === "number" &&
    Number.isFinite(data.bmi) &&
    (data.recommendedPlan === "gain" ||
      data.recommendedPlan === "maintain" ||
      data.recommendedPlan === "lose");
  if (hasGoalAndBmi) count += 1;

  const planGenerated = Boolean(
    data.activeWorkoutPlan ||
      data.planDuration ||
      (data.workoutPlansByGoal &&
        typeof data.workoutPlansByGoal === "object" &&
        Object.keys(data.workoutPlansByGoal as object).length > 0) ||
      (data.workoutPlansByBmiGoal &&
        typeof data.workoutPlansByBmiGoal === "object" &&
        Object.keys(data.workoutPlansByBmiGoal as object).length > 0)
  );
  if (planGenerated) count += 1;

  if (data.activeNutritionPlan) count += 1;

  if (
    typeof data.dietaryPreference === "string" &&
    data.dietaryPreference.trim().length > 0
  ) {
    count += 1;
  }

  const achievementState =
    data.achievementState &&
    typeof data.achievementState === "object" &&
    !Array.isArray(data.achievementState)
      ? (data.achievementState as Record<string, unknown>)
      : null;
  const loginStreak =
    typeof achievementState?.loginStreak === "number" &&
    Number.isFinite(achievementState.loginStreak)
      ? achievementState.loginStreak
      : 0;
  if (loginStreak >= 7) count += 1;
  if (loginStreak >= 14) count += 1;
  if (loginStreak >= 30) count += 1;

  return count;
}

export async function publishAchievementRanking(
  unlockedCount: number,
  targetUid?: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const uid = targetUid ?? user.uid;
  if (uid !== user.uid) {
    const admin = await checkIsAdmin(user, { skipReload: true });
    if (!admin) return;
  }

  const profileSnap = await getDoc(doc(db, "users", uid));
  const profile = profileSnap.data() as Record<string, unknown> | undefined;
  if (isAdminUserData(profile)) {
    await deleteDoc(doc(db, "achievementRankings", uid)).catch(() => undefined);
    return;
  }

  const count = clampUnlockedCount(unlockedCount);
  if (count <= 0) {
    await deleteDoc(doc(db, "achievementRankings", uid)).catch(() => undefined);
    return;
  }

  await setDoc(
    doc(db, "achievementRankings", uid),
    {
      uid,
      name:
        typeof profile?.name === "string" && profile.name.trim()
          ? profile.name.trim()
          : uid === user.uid
            ? user.displayName || "User"
            : "User",
      profileImage:
        typeof profile?.profileImage === "string" && profile.profileImage
          ? profile.profileImage
          : null,
      unlockedCount: count,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

let backfillInFlight: Promise<number> | null = null;

/** Admin-only: compute and publish rankings for every non-admin user. */
export async function backfillAllAchievementRankings(): Promise<number> {
  if (backfillInFlight) return backfillInFlight;

  backfillInFlight = (async () => {
    const user = auth.currentUser;
    if (!user) return 0;
    const admin = await checkIsAdmin(user, { skipReload: true });
    if (!admin) return 0;

    const { computeUnlockedAchievementCountForUser } = await import("./achievements");
    const usersSnap = await getDocs(collection(db, "users"));
    let published = 0;

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data() as Record<string, unknown>;
      if (isAdminUserData(data)) {
        await deleteDoc(doc(db, "achievementRankings", userDoc.id)).catch(() => undefined);
        continue;
      }
      try {
        const unlockedCount = await computeUnlockedAchievementCountForUser(userDoc.id);
        await publishAchievementRanking(unlockedCount, userDoc.id);
        if (unlockedCount > 0) published += 1;
      } catch (error) {
        console.log("Achievement ranking backfill failed for", userDoc.id, error);
      }
    }

    return published;
  })().finally(() => {
    backfillInFlight = null;
  });

  return backfillInFlight;
}

export function subscribeAchievementRanking(
  onData: (entries: AchievementRankingEntry[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let rankingEntries = new Map<string, AchievementRankingEntry>();
  let userEntries = new Map<string, AchievementRankingEntry>();
  let adminUids = new Set<string>();
  let rankingsLoaded = false;
  let usersLoaded = false;

  const emit = () => {
    if (!rankingsLoaded || !usersLoaded) return;

    const merged = new Map<string, AchievementRankingEntry>();

    for (const [uid, entry] of userEntries) {
      if (adminUids.has(uid)) continue;
      merged.set(uid, entry);
    }

    for (const [uid, entry] of rankingEntries) {
      if (adminUids.has(uid)) continue;
      const existing = merged.get(uid);
      if (!existing) {
        merged.set(uid, entry);
        continue;
      }
      merged.set(uid, {
        uid,
        name: existing.name !== "User" ? existing.name : entry.name,
        profileImage: existing.profileImage ?? entry.profileImage,
        unlockedCount: Math.max(existing.unlockedCount, entry.unlockedCount),
      });
    }

    onData(
      [...merged.values()]
        .filter((entry) => entry.unlockedCount > 0)
        .sort(
          (a, b) =>
            b.unlockedCount - a.unlockedCount || a.name.localeCompare(b.name)
        )
    );
  };

  const unsubscribeRankings = onSnapshot(
    collection(db, "achievementRankings"),
    (snapshot) => {
      rankingEntries = new Map(
        snapshot.docs.map((rankingDoc) => {
          const data = rankingDoc.data() as Record<string, unknown>;
          const entry: AchievementRankingEntry = {
            uid: rankingDoc.id,
            name:
              typeof data.name === "string" && data.name.trim()
                ? data.name.trim()
                : "User",
            profileImage:
              typeof data.profileImage === "string" && data.profileImage
                ? data.profileImage
                : null,
            unlockedCount:
              typeof data.unlockedCount === "number" &&
              Number.isFinite(data.unlockedCount)
                ? clampUnlockedCount(data.unlockedCount)
                : 0,
          };
          return [rankingDoc.id, entry];
        })
      );
      rankingsLoaded = true;
      emit();
    },
    (error) => onError?.(error)
  );

  const unsubscribeUsers = onSnapshot(
    collection(db, "users"),
    (snapshot) => {
      const next = new Map<string, AchievementRankingEntry>();
      const nextAdmins = new Set<string>();

      snapshot.docs.forEach((userDoc) => {
        const data = userDoc.data() as Record<string, unknown>;
        if (isAdminUserData(data)) {
          nextAdmins.add(userDoc.id);
          return;
        }

        const unlockedCount = estimateUnlockedFromPublicProfile(data);

        next.set(userDoc.id, {
          uid: userDoc.id,
          name:
            typeof data.name === "string" && data.name.trim()
              ? data.name.trim()
              : "User",
          profileImage:
            typeof data.profileImage === "string" && data.profileImage
              ? data.profileImage
              : null,
          unlockedCount,
        });
      });

      userEntries = next;
      adminUids = nextAdmins;
      usersLoaded = true;
      emit();
    },
    (error) => onError?.(error)
  );

  return () => {
    unsubscribeRankings();
    unsubscribeUsers();
  };
}
