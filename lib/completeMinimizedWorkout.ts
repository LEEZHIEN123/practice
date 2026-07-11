import { formatCalendarDayKey } from "@/lib/calendarDay";
import { calcExerciseKcal, getWorkoutMet } from "@/lib/workoutCatalog";
import { durationDays } from "@/lib/workoutPlan";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

const MIN_RECORD_SECONDS = 5;

export type CompleteMinimizedResult = "recorded" | "too_short" | "zero_kcal" | "unsigned" | "error";

type CompleteMinimizedArgs = {
  kind: "day" | "free";
  workoutName: string;
  workoutType: string;
  sessionId: string | null;
  elapsedSeconds: number;
  sessionStartedAtMs: number | null;
  day?: number;
  calendarTz: string;
};

/**
 * Persist a completed workout from the floating mini player (screen may be unmounted).
 */
export async function completeMinimizedWorkout(
  args: CompleteMinimizedArgs
): Promise<CompleteMinimizedResult> {
  const user = auth.currentUser;
  if (!user) return "unsigned";

  const endedAtClient = new Date();
  const elapsedSec = Math.max(0, Math.floor(args.elapsedSeconds));

  const stopSession = async (status: "stopped" | "completed", extra: Record<string, unknown> = {}) => {
    if (!args.sessionId) return;
    await updateDoc(doc(db, "users", user.uid, "workoutSessions", args.sessionId), {
      status,
      endedAt: Timestamp.fromDate(endedAtClient),
      endedAtClientMs: endedAtClient.getTime(),
      elapsedSeconds: elapsedSec,
      updatedAt: serverTimestamp(),
      ...extra,
    });
  };

  if (elapsedSec < MIN_RECORD_SECONDS) {
    try {
      await stopSession("stopped");
    } catch {
      /* ignore */
    }
    return "too_short";
  }

  const durationMin = elapsedSec / 60;
  let burnedRecorded = 0;
  let metUsed = getWorkoutMet(args.workoutType, args.workoutName) ?? 3;
  let weightUsed = 0;
  try {
    const uSnap = await getDoc(doc(db, "users", user.uid));
    weightUsed = Number((uSnap.data() as any)?.weight ?? 0);
    burnedRecorded = Math.max(0, Math.round(calcExerciseKcal(metUsed, durationMin, weightUsed)));
  } catch {
    /* ignore */
  }

  if (burnedRecorded <= 0) {
    try {
      await stopSession("stopped");
    } catch {
      /* ignore */
    }
    return "zero_kcal";
  }

  try {
    await stopSession("completed", {
      burnedKcal: burnedRecorded,
      met: metUsed,
      weightKgUsed: weightUsed,
      durationMin: Math.round(durationMin * 100) / 100,
    });

    const dayKey = formatCalendarDayKey(new Date(), args.calendarTz);
    await setDoc(
      doc(db, "users", user.uid, "dailyStats", dayKey),
      { burnedKcal: increment(burnedRecorded), updatedAt: serverTimestamp() },
      { merge: true }
    );

    const logPayload: Record<string, unknown> = {
      title: args.workoutName,
      burnedKcal: burnedRecorded,
      durationMin: Math.round(durationMin * 100) / 100,
      met: metUsed,
      weightKgUsed: weightUsed,
      workoutType: args.workoutType,
      createdAt: serverTimestamp(),
    };
    if (args.kind === "day" && args.day != null) {
      logPayload.day = args.day;
    } else {
      logPayload.origin = "discover";
    }
    await addDoc(collection(db, "users", user.uid, "workoutLogs"), logPayload);

    if (args.kind === "day" && args.day != null) {
      try {
        const userRef = doc(db, "users", user.uid);
        const uSnap = await getDoc(userRef);
        const plan = (uSnap.data() as any)?.activeWorkoutPlan;
        const dur = plan?.duration as "week" | "biweekly" | "monthly" | undefined;
        const totalPlanDays =
          dur === "week" || dur === "biweekly" || dur === "monthly" ? durationDays(dur) : 0;
        const dayNum = Math.floor(args.day);
        const finishingKnownPlanDay = Boolean(totalPlanDays > 0 && dayNum <= totalPlanDays);
        if (finishingKnownPlanDay) {
          await updateDoc(userRef, {
            activePlanLastCompletedDay: Math.max(1, dayNum),
            activePlanLastCompletedAt: serverTimestamp(),
          } as any);
        } else {
          const prevLcd = Number((uSnap.data() as any)?.activePlanLastCompletedDay);
          const prevOk = Number.isFinite(prevLcd) && prevLcd >= 2;
          const repeatDay1AfterProgress = dayNum === 1 && prevOk;
          if (!repeatDay1AfterProgress) {
            await updateDoc(userRef, {
              activePlanLastCompletedDay: Math.max(1, dayNum),
              activePlanLastCompletedAt: serverTimestamp(),
            } as any);
          }
        }
      } catch {
        /* ignore plan progress errors */
      }
    }

    return "recorded";
  } catch (e) {
    console.log("completeMinimizedWorkout failed:", e);
    return "error";
  }
}

export { MIN_RECORD_SECONDS };
