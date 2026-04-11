import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, type DocumentReference, getDocs, writeBatch } from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";

/** Bump when cleanup logic changes so all clients re-run once. */
const STORAGE_KEY = "migration_remove_zero_kcal_workouts_v2";

function kcalFromDoc(data: Record<string, unknown>): number {
  const raw = data.burnedKcal;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * Deletes legacy 0 kcal workout data:
 * - `workoutLogs` where burned kcal is missing or &lt;= 0 (full collection scan — no index gaps).
 * - `workoutSessions` where status is `completed` and burned kcal is &lt;= 0.
 */
export async function runRemoveZeroKcalWorkoutLogsOnce(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const done = await AsyncStorage.getItem(STORAGE_KEY);
    if (done === "1") return;
  } catch {
    /* ignore */
  }

  try {
    const uid = user.uid;
    const toDelete: DocumentReference[] = [];

    const logsSnap = await getDocs(collection(db, "users", uid, "workoutLogs"));
    for (const d of logsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (kcalFromDoc(data) <= 0) toDelete.push(d.ref);
    }

    const sessSnap = await getDocs(collection(db, "users", uid, "workoutSessions"));
    for (const d of sessSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const st = data.status;
      if (st !== "completed") continue;
      if (kcalFromDoc(data) <= 0) toDelete.push(d.ref);
    }

    if (toDelete.length === 0) {
      await AsyncStorage.setItem(STORAGE_KEY, "1");
      return;
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const chunk = toDelete.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    await AsyncStorage.setItem(STORAGE_KEY, "1");
  } catch (e) {
    console.log("removeZeroKcalWorkoutLogs migration failed:", e);
  }
}
