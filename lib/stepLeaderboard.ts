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

  return onSnapshot(
    rankingQuery,
    (snapshot) => {
      onData(
        snapshot.docs
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
          .filter((entry) => entry.steps > 0)
      );
    },
    (error) => onError?.(error)
  );
}
