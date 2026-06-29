import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";

export type ProfileWorkoutStats = {
  totalCalories: number;
  totalWorkouts: number;
};

type WorkoutEntry = {
  title: string;
  burnedKcal: number;
  startedAt: number;
};

function mergeLifetimeStats(logDocs: WorkoutEntry[], sessionDocs: WorkoutEntry[]): ProfileWorkoutStats {
  const entries: WorkoutEntry[] = [];
  const seen = new Set<string>();

  const addEntry = (entry: WorkoutEntry) => {
    const key = `${entry.title}|${Math.round(entry.burnedKcal)}|${entry.startedAt}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  for (const entry of logDocs) {
    addEntry(entry);
  }

  for (const session of sessionDocs) {
    const dup = entries.some(
      (entry) =>
        entry.title === session.title &&
        Math.abs(entry.burnedKcal - session.burnedKcal) <= 2 &&
        Math.abs(entry.startedAt - session.startedAt) < 120_000
    );
    if (!dup) addEntry(session);
  }

  return {
    totalCalories: Math.round(entries.reduce((sum, entry) => sum + entry.burnedKcal, 0)),
    totalWorkouts: entries.length,
  };
}

function mapLogDoc(data: Record<string, unknown>): WorkoutEntry | null {
  const burnedKcal =
    typeof data.burnedKcal === "number" && Number.isFinite(data.burnedKcal) ? data.burnedKcal : 0;
  if (burnedKcal <= 0) return null;

  const createdAt =
    typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
      ? data.createdAt
      : data.createdAt && typeof (data.createdAt as { toMillis?: () => number }).toMillis === "function"
        ? (data.createdAt as { toMillis: () => number }).toMillis()
        : 0;

  return {
    title: typeof data.title === "string" ? data.title : "",
    burnedKcal,
    startedAt: createdAt,
  };
}

function mapSessionDoc(data: Record<string, unknown>): WorkoutEntry | null {
  if (data.status !== "completed") return null;

  let burnedKcal =
    typeof data.burnedKcal === "number" && Number.isFinite(data.burnedKcal) ? data.burnedKcal : 0;
  const startedAt =
    typeof data.startedAt === "number" && Number.isFinite(data.startedAt) ? data.startedAt : 0;
  const endedAt =
    typeof data.endedAt === "number" && Number.isFinite(data.endedAt) ? data.endedAt : startedAt;
  const elapsedSeconds =
    typeof data.elapsedSeconds === "number" && Number.isFinite(data.elapsedSeconds)
      ? data.elapsedSeconds
      : 0;

  if (burnedKcal <= 0 && elapsedSeconds > 0) {
    const met =
      typeof data.met === "number" && Number.isFinite(data.met) ? data.met : 5;
    const weight =
      typeof data.weightKgUsed === "number" && Number.isFinite(data.weightKgUsed)
        ? data.weightKgUsed
        : 70;
    burnedKcal = Math.max(0, Math.round((met * weight * elapsedSeconds) / 60));
  }

  if (burnedKcal <= 0) return null;

  return {
    title: typeof data.title === "string" ? data.title : "",
    burnedKcal,
    startedAt: startedAt || endedAt,
  };
}

export function subscribeProfileWorkoutStats(
  uid: string,
  onStats: (stats: ProfileWorkoutStats) => void,
  onError?: (error: unknown) => void
): () => void {
  let logEntries: WorkoutEntry[] = [];
  let sessionEntries: WorkoutEntry[] = [];

  const publish = () => {
    onStats(mergeLifetimeStats(logEntries, sessionEntries));
  };

  const unsubLogs = onSnapshot(
    collection(db, "users", uid, "workoutLogs"),
    (snap) => {
      logEntries = snap.docs
        .map((docSnap) => mapLogDoc(docSnap.data() as Record<string, unknown>))
        .filter((entry): entry is WorkoutEntry => entry != null);
      publish();
    },
    (error) => onError?.(error)
  );

  const unsubSessions = onSnapshot(
    query(collection(db, "users", uid, "workoutSessions"), where("status", "==", "completed")),
    (snap) => {
      sessionEntries = snap.docs
        .map((docSnap) => mapSessionDoc(docSnap.data() as Record<string, unknown>))
        .filter((entry): entry is WorkoutEntry => entry != null);
      publish();
    },
    (error) => onError?.(error)
  );

  return () => {
    unsubLogs();
    unsubSessions();
  };
}
