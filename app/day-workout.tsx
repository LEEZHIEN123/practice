import { formatCalendarDayKey } from "@/lib/calendarDay";
import {
  calcExerciseKcal,
  getWorkoutDetail,
  getWorkoutMet,
  plansEqual,
  sanitizeActiveWorkoutPlan,
} from "@/lib/workoutCatalog";
import { bmiBandKey, calcBmi, durationDays, generateActiveWorkoutPlan, workoutPlansByBmiGoalField } from "@/lib/workoutPlan";
import { getWorkoutInstructionImage } from "@/lib/workoutInstructionImages";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { WorkoutRecordPanel } from "@/components/day-workout-unstyled";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

type ActiveWorkoutPlan = {
  duration: "week" | "biweekly" | "monthly";
  createdAt: string;
  bmi: number | null;
  goal: "gain" | "maintain" | "lose" | null;
  suggestedTypes: string[];
  schedule: { day: number; type: string; workout: string }[];
};

function fmtHms(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function typeIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("yoga")) return "leaf-outline";
  if (t.includes("hiit")) return "flash-outline";
  if (t.includes("cardio")) return "walk-outline";
  return "barbell-outline";
}

function typeColor(type: string) {
  const t = type.toLowerCase();
  if (t.includes("yoga")) return "#059669";
  if (t.includes("hiit")) return "#f97316";
  if (t.includes("cardio")) return "#ef4444";
  return "#1e3a8a";
}

/** Main timer + countdown digits (user-requested red, not workout-type accent). */
const TIMER_RED = "#dc2626";

/** App green — matches suggested workout / MET accents in the app. */
const ACCENT_GREEN = "#52B69A";

const MIN_RECORD_SECONDS = 5;

function normalizeWorkoutName(s: string): string {
  return s.trim().toLowerCase();
}

function planDurationCompletionLabel(d: "week" | "biweekly" | "monthly"): string {
  if (d === "week") return "7-day";
  if (d === "biweekly") return "14-day";
  return "30-day";
}

type DayRecordRow = {
  id: string;
  title: string;
  /** Plan slot 1..N from Firestore; used to hide other days’ rows if any leak in */
  planDay: number | null;
  startedAt: Date;
  endedAt: Date;
  elapsedSeconds: number;
  burnedKcal: number;
  met: number;
};

/** Prefer workoutLogs; add workoutSessions rows that are not duplicates (legacy / missing log). */
function mergeWorkoutRecords(logs: DayRecordRow[], sessions: DayRecordRow[]): DayRecordRow[] {
  const out: DayRecordRow[] = [...logs];
  for (const s of sessions) {
    const dup = logs.some(
      (l) =>
        Math.abs(l.endedAt.getTime() - s.endedAt.getTime()) < 8000 &&
        Math.round(l.burnedKcal) === Math.round(s.burnedKcal) &&
        l.title === s.title
    );
    if (!dup) out.push(s);
  }
  out.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
  return out;
}

/** Keep only rows for this plan day + this schedule workout (not other exercises). */
function filterRecordsForThisScreen(
  rows: DayRecordRow[],
  planDayNum: number,
  scheduleWorkout: string | null
): DayRecordRow[] {
  const w = scheduleWorkout?.trim() || null;
  if (!w) return [];
  const wn = normalizeWorkoutName(w);
  return rows.filter((r) => {
    if (normalizeWorkoutName(r.title) !== wn) return false;
    if (typeof r.planDay === "number" && r.planDay !== planDayNum) return false;
    return true;
  });
}

function mapWorkoutLogDoc(
  d: QueryDocumentSnapshot,
  planDayNum: number,
  expectedPlanCreatedAt: string | null
): DayRecordRow | null {
  const data = d.data() as Record<string, unknown>;
  if ((data as any)?.origin === "discover") return null;
  const docPc = (data as any)?.planCreatedAt;
  if (expectedPlanCreatedAt) {
    if (docPc !== expectedPlanCreatedAt) return null;
  }
  const docDay = (data as any)?.day;
  if (typeof docDay === "number" && docDay !== planDayNum) return null;
  const createdAt = (data as any)?.createdAt?.toDate?.();
  const endedAt = createdAt instanceof Date ? createdAt : null;
  if (!endedAt) return null;
  const durationMin =
    typeof (data as any)?.durationMin === "number" && Number.isFinite((data as any).durationMin)
      ? (data as any).durationMin
      : 0;
  const elapsedSeconds = Math.max(0, Math.round(durationMin * 60));
  if (elapsedSeconds < MIN_RECORD_SECONDS) return null;
  const burnedKcal =
    typeof (data as any)?.burnedKcal === "number" && Number.isFinite((data as any).burnedKcal)
      ? Math.round((data as any).burnedKcal)
      : 0;
  if (burnedKcal <= 0) return null;
  const met =
    typeof (data as any)?.met === "number" && Number.isFinite((data as any).met)
      ? (data as any).met
      : getWorkoutMet(String((data as any)?.workoutType ?? ""), String((data as any)?.title ?? "")) ?? 0;
  const title =
    typeof (data as any)?.title === "string" && (data as any).title.length > 0 ? (data as any).title : "Workout";
  const startedAt = new Date(endedAt.getTime() - elapsedSeconds * 1000);
  const planDay = typeof docDay === "number" && Number.isFinite(docDay) ? docDay : null;
  return { id: `log-${d.id}`, title, planDay, startedAt, endedAt, elapsedSeconds, burnedKcal, met };
}

function mapSessionDoc(
  d: QueryDocumentSnapshot,
  planDayNum: number,
  expectedPlanCreatedAt: string | null
): DayRecordRow | null {
  const data = d.data() as Record<string, unknown>;
  if ((data as any)?.origin === "discover") return null;
  const docPc = (data as any)?.planCreatedAt;
  if (expectedPlanCreatedAt) {
    if (docPc !== expectedPlanCreatedAt) return null;
  }
  const docDay = (data as any)?.day;
  if (typeof docDay === "number" && docDay !== planDayNum) return null;
  const st = (data as any)?.status;
  if (st !== "completed") return null;
  const endedAt = (data as any)?.endedAt?.toDate?.() instanceof Date ? (data as any).endedAt.toDate() : null;
  const startedAt =
    (data as any)?.startedAt?.toDate?.() instanceof Date ? (data as any).startedAt.toDate() : null;
  if (!endedAt || !startedAt) return null;
  const elapsedSeconds =
    typeof (data as any)?.elapsedSeconds === "number" && Number.isFinite((data as any).elapsedSeconds)
      ? Math.max(0, Math.floor((data as any).elapsedSeconds))
      : Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  if (elapsedSeconds < MIN_RECORD_SECONDS) return null;
  const metFromDoc = typeof (data as any)?.met === "number" && Number.isFinite((data as any).met) ? (data as any).met : null;
  const met =
    metFromDoc ?? getWorkoutMet(String((data as any)?.type ?? ""), String((data as any)?.workout ?? "")) ?? 0;
  let burnedKcal = 0;
  if (typeof (data as any)?.burnedKcal === "number" && Number.isFinite((data as any).burnedKcal)) {
    burnedKcal = Math.round((data as any).burnedKcal);
  } else {
    const w =
      typeof (data as any)?.weightKgUsed === "number" && Number.isFinite((data as any).weightKgUsed)
        ? (data as any).weightKgUsed
        : 0;
    burnedKcal = Math.max(0, Math.round(calcExerciseKcal(met, elapsedSeconds / 60, w)));
  }
  if (burnedKcal <= 0) return null;
  const title =
    typeof (data as any)?.workout === "string" && (data as any).workout.length > 0 ? (data as any).workout : "Workout";
  const planDay = typeof docDay === "number" && Number.isFinite(docDay) ? docDay : null;
  return {
    id: `sess-${d.id}`,
    title,
    planDay,
    startedAt,
    endedAt,
    elapsedSeconds,
    burnedKcal,
    met,
  };
}

/**
 * Heavy UI + tab state lives here so tab presses do not re-run expo-router hooks
 * (which can throw “Couldn't find a navigation context” when nested with React 19).
 */
function DayWorkoutBody({ dayNum }: { dayNum: number }) {
  const insets = useSafeAreaInsets();
  const calendarTz = useUserCalendarTimezone();
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  const [plan, setPlan] = useState<ActiveWorkoutPlan | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pauseMenuVisible, setPauseMenuVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"restart" | "complete" | null>(null);
  const [backConfirmVisible, setBackConfirmVisible] = useState(false);
  const [startChoiceVisible, setStartChoiceVisible] = useState(false);
  const [timerPickerVisible, setTimerPickerVisible] = useState(false);
  const [timerMinText, setTimerMinText] = useState("10");
  const [timerSecText, setTimerSecText] = useState("00");
  const [, setTargetSeconds] = useState<number | null>(null);
  const [, setMode] = useState<"countup" | "countdown">("countup");
  const modeRef = useRef<"countup" | "countdown">("countup");
  const targetSecondsRef = useRef<number | null>(null);
  const [workoutLogRows, setWorkoutLogRows] = useState<DayRecordRow[]>([]);
  const [workoutSessionRows, setWorkoutSessionRows] = useState<DayRecordRow[]>([]);
  const [contentTab, setContentTab] = useState<"instruction" | "record">("instruction");
  const [canResume, setCanResume] = useState(false);
  const [planCycleCompleteVisible, setPlanCycleCompleteVisible] = useState(false);
  const [planCycleCompleteLabel, setPlanCycleCompleteLabel] = useState("");
  const autoCompleteFiredRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const sessionStartedAtMsRef = useRef<number | null>(null);
  const baseElapsedRef = useRef(0);
  const tickIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Ignore Firestore snapshots that arrive after we switched day/workout (listener not yet torn down). */
  const recordsSubGenRef = useRef(0);
  const row = useMemo(() => {
    const r = plan?.schedule?.find((x) => x.day === dayNum) ?? null;
    return r;
  }, [dayNum, plan]);

  const workoutDetail = useMemo(() => (row ? getWorkoutDetail(row.type, row.workout) : null), [row]);

  const dayRecords = useMemo(() => {
    const merged = mergeWorkoutRecords(workoutLogRows, workoutSessionRows);
    return filterRecordsForThisScreen(merged, dayNum, row?.workout ?? null);
  }, [workoutLogRows, workoutSessionRows, dayNum, row?.workout]);

  const totalRecordKcal = useMemo(
    () => dayRecords.reduce((sum, r) => sum + (Number.isFinite(r.burnedKcal) ? r.burnedKcal : 0), 0),
    [dayRecords]
  );

  useEffect(() => {
    if (!uid) return;

    const workoutName = row?.workout?.trim() || null;
    if (!workoutName) {
      setWorkoutLogRows([]);
      setWorkoutSessionRows([]);
      return;
    }

    const gen = ++recordsSubGenRef.current;
    setWorkoutLogRows([]);
    setWorkoutSessionRows([]);

    const wn = normalizeWorkoutName(workoutName);
    const expectedPlanCreatedAt = plan?.createdAt?.trim() ? plan.createdAt : null;

    /**
     * Equality-only on `day` (single-field index — no composite). Sort newest-first in-app.
     * `where` + `orderBy(createdAt)` needs a composite index in Firebase; without deploy, listeners fail and records vanish.
     * Client-filter by planCreatedAt so week vs biweekly/monthly (same day + same exercise) stay separate.
     */
    const qLogs = query(collection(db, "users", uid, "workoutLogs"), where("day", "==", dayNum), limit(100));
    const qSessions = query(collection(db, "users", uid, "workoutSessions"), where("day", "==", dayNum), limit(100));

    const unsubLogs = onSnapshot(
      qLogs,
      (snap) => {
        if (recordsSubGenRef.current !== gen) return;
        const rows: DayRecordRow[] = [];
        for (const d of snap.docs) {
          const rec = mapWorkoutLogDoc(d, dayNum, expectedPlanCreatedAt);
          if (!rec) continue;
          if (normalizeWorkoutName(rec.title) !== wn) continue;
          rows.push(rec);
        }
        rows.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
        setWorkoutLogRows(rows.slice(0, 80));
      },
      (err) => {
        console.log("workoutLogs listener error:", err);
        if (recordsSubGenRef.current === gen) setWorkoutLogRows([]);
      }
    );

    const unsubSessions = onSnapshot(
      qSessions,
      (snap) => {
        if (recordsSubGenRef.current !== gen) return;
        const rows: DayRecordRow[] = [];
        for (const d of snap.docs) {
          const rec = mapSessionDoc(d, dayNum, expectedPlanCreatedAt);
          if (!rec) continue;
          if (normalizeWorkoutName(rec.title) !== wn) continue;
          rows.push(rec);
        }
        rows.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
        setWorkoutSessionRows(rows.slice(0, 80));
      },
      (err) => {
        console.log("workoutSessions listener error:", err);
        if (recordsSubGenRef.current === gen) setWorkoutSessionRows([]);
      }
    );

    return () => {
      unsubLogs();
      unsubSessions();
    };
  }, [dayNum, uid, row?.workout, plan?.createdAt]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        const rawPlan = (data?.activeWorkoutPlan as ActiveWorkoutPlan) ?? null;
        const fixedPlan = sanitizeActiveWorkoutPlan(rawPlan as any) as ActiveWorkoutPlan | null;
        if (rawPlan && fixedPlan && !plansEqual(rawPlan as any, fixedPlan)) {
          void updateDoc(doc(db, "users", uid), { activeWorkoutPlan: fixedPlan } as any);
        }
        setPlan(fixedPlan ?? rawPlan);
      },
      () => setPlan(null)
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth as any, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  const stopTicker = () => {
    if (tickIdRef.current) {
      clearInterval(tickIdRef.current);
      tickIdRef.current = null;
    }
  };

  const startTicker = () => {
    stopTicker();
    tickIdRef.current = setInterval(() => {
      if (!startedAtRef.current) return;
      const now = Date.now();
      const delta = Math.floor((now - startedAtRef.current) / 1000);
      const nextElapsed = baseElapsedRef.current + delta;
      const m = modeRef.current;
      const tgt = targetSecondsRef.current;
      if (m === "countdown" && tgt != null) {
        const remain = Math.max(0, tgt - nextElapsed);
        setElapsed(remain);
          if (remain <= 0) {
          if (!autoCompleteFiredRef.current) {
            autoCompleteFiredRef.current = true;
            void completeWorkout().then((cycled) => {
              if (!cycled) {
                Alert.alert("Congratulations!", "Workout completed.");
              }
              autoCompleteFiredRef.current = false;
            });
          }
        }
        return;
      }
      setElapsed(nextElapsed);
    }, 250);
  };

  useEffect(() => {
    return () => stopTicker();
  }, []);

  const clearCountdown = () => {
    if (countdownIdRef.current) {
      clearInterval(countdownIdRef.current);
      countdownIdRef.current = null;
    }
    setCountdown(null);
  };

  useEffect(() => {
    return () => clearCountdown();
  }, []);

  const startWorkoutInternal = async () => {
    const user = auth.currentUser;
    if (!user || !row) return;

    if (!sessionStartedAtMsRef.current) sessionStartedAtMsRef.current = Date.now();

    // Create a new session doc once.
    if (!sessionId) {
      const startedAtClient = new Date(sessionStartedAtMsRef.current);
      const ref = await addDoc(collection(db, "users", user.uid, "workoutSessions"), {
        day: row.day,
        type: row.type,
        workout: row.workout,
        duration: plan?.duration ?? null,
        goal: plan?.goal ?? null,
        planCreatedAt: plan?.createdAt ?? null,
        startedAt: Timestamp.fromDate(startedAtClient),
        startedAtClientMs: sessionStartedAtMsRef.current,
        elapsedSeconds: 0,
        status: "running",
        updatedAt: serverTimestamp(),
      });
      setSessionId(ref.id);
    } else {
      await updateDoc(doc(db, "users", user.uid, "workoutSessions", sessionId), {
        status: "running",
        updatedAt: serverTimestamp(),
      });
    }

    startedAtRef.current = Date.now();
    setRunning(true);
    startTicker();
  };

  const beginStart = () => {
    if (running) return;
    // if timer already started, treat as start
    setStartChoiceVisible(true);
  };

  const parseTimerSeconds = () => {
    const mm = parseInt(timerMinText.replace(/[^\d]/g, ""), 10);
    const ss = parseInt(timerSecText.replace(/[^\d]/g, ""), 10);
    const m = Number.isFinite(mm) ? Math.max(0, mm) : 0;
    // Allow > 59 seconds by carrying into minutes.
    const sRaw = Number.isFinite(ss) ? Math.max(0, ss) : 0;
    const s = sRaw % 60;
    const carryMin = Math.floor(sRaw / 60);
    return (m + carryMin) * 60 + s;
  };

  const timerTotalSeconds = useMemo(() => parseTimerSeconds(), [timerMinText, timerSecText]);

  const setTimerSecondsNormalized = (rawSecondsText: string) => {
    const only = rawSecondsText.replace(/[^\d]/g, "").slice(0, 3);
    const sec = parseInt(only || "0", 10);
    const currentMin = parseInt(timerMinText.replace(/[^\d]/g, "") || "0", 10);
    const baseMin = Number.isFinite(currentMin) ? Math.max(0, currentMin) : 0;
    const s = Number.isFinite(sec) ? Math.max(0, sec) : 0;
    const carry = Math.floor(s / 60);
    const newMin = baseMin + carry;
    const newSec = s % 60;
    setTimerMinText(String(Math.min(999, newMin)));
    setTimerSecText(String(newSec).padStart(2, "0"));
  };

  const startCountdownWithPicker = () => {
    const total = parseTimerSeconds();
    if (total <= 0) {
      Alert.alert("Invalid timer", "Please set a timer greater than 0 seconds.");
      return;
    }
    if (total < MIN_RECORD_SECONDS) {
      Alert.alert("Timer too short", `Please set at least ${MIN_RECORD_SECONDS} seconds.`);
      return;
    }
    setMode("countdown");
    setTargetSeconds(total);
    modeRef.current = "countdown";
    targetSecondsRef.current = total;
    baseElapsedRef.current = 0;
    startedAtRef.current = null;
    setElapsed(total);
    setTimerPickerVisible(false);
    setTimeout(() => void startWithCountdown(), 0);
  };

  const startWithCountdown = async () => {
    if (running || countdown != null) return;
    // 3..2..1 overlay, then start timer.
    setCountdown(3);
    if (countdownIdRef.current) clearInterval(countdownIdRef.current);
    countdownIdRef.current = setInterval(() => {
      setCountdown((cur) => {
        if (cur == null) return null;
        if (cur <= 1) {
          // finish
          if (countdownIdRef.current) {
            clearInterval(countdownIdRef.current);
            countdownIdRef.current = null;
          }
          // kick off workout start after countdown disappears
          setTimeout(() => {
            void startWorkoutInternal();
          }, 50);
          return null;
        }
        return cur - 1;
      });
    }, 900);
  };

  const pauseWorkout = async () => {
    const user = auth.currentUser;
    if (!user) return;
    stopTicker();
    if (startedAtRef.current) {
      const now = Date.now();
      const delta = Math.floor((now - startedAtRef.current) / 1000);
      baseElapsedRef.current = baseElapsedRef.current + delta;
      const m = modeRef.current;
      const tgt = targetSecondsRef.current;
      if (m === "countdown" && tgt != null) {
        const remain = Math.max(0, tgt - baseElapsedRef.current);
        setElapsed(remain);
      } else {
        setElapsed(baseElapsedRef.current);
      }
      startedAtRef.current = null;
    }
    setRunning(false);
    if (sessionId) {
      await updateDoc(doc(db, "users", user.uid, "workoutSessions", sessionId), {
        elapsedSeconds: baseElapsedRef.current,
        status: "paused",
        updatedAt: serverTimestamp(),
      });
    }
  };

  const stopWorkout = async () => {
    const user = auth.currentUser;
    if (!user) return;
    await pauseWorkout();
    if (sessionId) {
      await updateDoc(doc(db, "users", user.uid, "workoutSessions", sessionId), {
        status: "stopped",
        endedAt: serverTimestamp(),
        elapsedSeconds: baseElapsedRef.current,
        updatedAt: serverTimestamp(),
      });
    }
    setCanResume(true);
  };

  const completeWorkout = async (): Promise<boolean> => {
    const user = auth.currentUser;
    if (!user) return false;
    let didRegeneratePlanCycle = false;
    const endedAtClient = new Date();
    await pauseWorkout();

    const elapsedSec = Math.max(0, Math.floor(baseElapsedRef.current));
    if (elapsedSec < MIN_RECORD_SECONDS) {
      // Too short: don't record as a completed workout record.
      if (sessionId) {
        try {
          await updateDoc(doc(db, "users", user.uid, "workoutSessions", sessionId), {
            status: "stopped",
            endedAt: Timestamp.fromDate(endedAtClient),
            endedAtClientMs: endedAtClient.getTime(),
            elapsedSeconds: elapsedSec,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.log("Failed to stop short workout:", e);
        }
      }
      Alert.alert("Workout not saved", `Workouts under ${MIN_RECORD_SECONDS} seconds won't be saved as a record.`);
      // Reset local timer for next start
      baseElapsedRef.current = 0;
      startedAtRef.current = null;
      sessionStartedAtMsRef.current = null;
      setElapsed(0);
      setRunning(false);
      stopTicker();
      setMode("countup");
      setTargetSeconds(null);
      modeRef.current = "countup";
      targetSecondsRef.current = null;
      setCanResume(false);
      setSessionId(null);
      return false;
    }

    const startedMs =
      typeof sessionStartedAtMsRef.current === "number" && Number.isFinite(sessionStartedAtMsRef.current)
        ? sessionStartedAtMsRef.current
        : endedAtClient.getTime() - Math.max(0, Math.floor(baseElapsedRef.current)) * 1000;
    const startedAtClient = new Date(startedMs);

    const durationMin = elapsedSec / 60;
    let burnedRecorded = 0;
    let metUsed = 3;
    let weightUsed = 0;
    if (row) {
      metUsed = getWorkoutMet(row.type, row.workout) ?? 3;
      try {
        const uSnap = await getDoc(doc(db, "users", user.uid));
        weightUsed = Number((uSnap.data() as any)?.weight ?? 0);
        burnedRecorded = Math.max(0, Math.round(calcExerciseKcal(metUsed, durationMin, weightUsed)));
      } catch (e) {
        console.log("Failed to read weight for calories:", e);
      }
    }

    if (burnedRecorded <= 0) {
      if (sessionId) {
        try {
          await updateDoc(doc(db, "users", user.uid, "workoutSessions", sessionId), {
            status: "stopped",
            endedAt: Timestamp.fromDate(endedAtClient),
            endedAtClientMs: endedAtClient.getTime(),
            elapsedSeconds: elapsedSec,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.log("Failed to stop zero-kcal workout:", e);
        }
      }
      Alert.alert(
        "Workout not saved",
        "This workout finished at 0 kcal, so it won't be saved as a record."
      );
      baseElapsedRef.current = 0;
      startedAtRef.current = null;
      sessionStartedAtMsRef.current = null;
      setElapsed(0);
      setRunning(false);
      stopTicker();
      setMode("countup");
      setTargetSeconds(null);
      modeRef.current = "countup";
      targetSecondsRef.current = null;
      setCanResume(false);
      setSessionId(null);
      return false;
    }

    if (sessionId) {
      await updateDoc(doc(db, "users", user.uid, "workoutSessions", sessionId), {
        status: "completed",
        endedAt: Timestamp.fromDate(endedAtClient),
        endedAtClientMs: endedAtClient.getTime(),
        elapsedSeconds: elapsedSec,
        burnedKcal: burnedRecorded,
        met: metUsed,
        weightKgUsed: weightUsed,
        durationMin: Math.round(durationMin * 100) / 100,
        updatedAt: serverTimestamp(),
      });
    }

    let newWorkoutLogId: string | null = null;
    try {
      if (row && burnedRecorded > 0) {
        const dayKey = formatCalendarDayKey(new Date(), calendarTz);
        await setDoc(
          doc(db, "users", user.uid, "dailyStats", dayKey),
          { burnedKcal: increment(burnedRecorded), updatedAt: serverTimestamp() },
          { merge: true }
        );
      }
      if (row) {
        const ref = await addDoc(collection(db, "users", user.uid, "workoutLogs"), {
          title: row.workout,
          burnedKcal: burnedRecorded,
          durationMin: Math.round(durationMin * 100) / 100,
          met: metUsed,
          weightKgUsed: weightUsed,
          workoutType: row.type,
          createdAt: serverTimestamp(),
          day: row.day,
          planCreatedAt: plan?.createdAt ?? null,
        });
        newWorkoutLogId = ref.id;
      }
    } catch (e) {
      console.log("Failed to record workout calories / log:", e);
    }

    if (newWorkoutLogId && row) {
      const logRowId = `log-${newWorkoutLogId}`;
      setWorkoutLogRows((prev) => {
        if (prev.some((p) => p.id === logRowId)) return prev;
        return [
          {
            id: logRowId,
            title: row.workout,
            planDay: row.day,
            startedAt: startedAtClient,
            endedAt: endedAtClient,
            elapsedSeconds: elapsedSec,
            burnedKcal: burnedRecorded,
            met: metUsed,
          },
          ...prev,
        ];
      });
    }

    // Next start must create a new session document (avoids duplicate React keys + bad reuse).
    setSessionId(null);
    setContentTab("record");

    // Mark completion, or roll to a new plan after the final day of week / biweekly / monthly.
    try {
      const userRef = doc(db, "users", user.uid);
      const dur = plan?.duration;
      const totalPlanDays =
        dur === "week" || dur === "biweekly" || dur === "monthly" ? durationDays(dur) : 0;
      const finishingFullPlan = Boolean(plan && totalPlanDays > 0 && dayNum === totalPlanDays);

      if (finishingFullPlan && plan) {
        const uSnap = await getDoc(userRef);
        const uData = uSnap.data() as any;
        const stored = uData?.activeWorkoutPlan as ActiveWorkoutPlan | null;
        const samePlan =
          Boolean(stored?.createdAt && plan.createdAt && stored.createdAt === plan.createdAt);

        if (samePlan) {
          const weight = Number(uData?.weight ?? 0);
          const height = Number(uData?.height ?? 0);
          let bmi = calcBmi(weight, height);
          if (bmi == null && typeof plan.bmi === "number" && Number.isFinite(plan.bmi)) {
            bmi = plan.bmi;
          }
          const goal =
            plan.goal === "gain" || plan.goal === "maintain" || plan.goal === "lose"
              ? plan.goal
              : uData?.recommendedPlan === "gain" ||
                  uData?.recommendedPlan === "maintain" ||
                  uData?.recommendedPlan === "lose"
                ? uData.recommendedPlan
                : null;

          if (bmi != null && goal && dur) {
            const next = generateActiveWorkoutPlan({ duration: dur, bmi, goal });
            const band = bmiBandKey(bmi);
            await updateDoc(userRef, {
              activeWorkoutPlan: next,
              [workoutPlansByBmiGoalField(band, goal, dur)]: next,
              activePlanLastCompletedDay: null,
              activePlanLastCompletedAt: null,
            } as any);
            setPlanCycleCompleteLabel(planDurationCompletionLabel(dur));
            setPlanCycleCompleteVisible(true);
            didRegeneratePlanCycle = true;
          } else {
            await updateDoc(userRef, {
              activePlanLastCompletedDay: Math.max(1, Math.floor(dayNum)),
              activePlanLastCompletedAt: serverTimestamp(),
            } as any);
          }
        }
      } else {
        await updateDoc(userRef, {
          activePlanLastCompletedDay: Math.max(1, Math.floor(dayNum)),
          activePlanLastCompletedAt: serverTimestamp(),
        } as any);
      }
    } catch (e) {
      console.log("Failed to advance plan day:", e);
    }
    // reset local timer for next start
    baseElapsedRef.current = 0;
    startedAtRef.current = null;
    sessionStartedAtMsRef.current = null;
    setElapsed(0);
    setRunning(false);
    stopTicker();
    setMode("countup");
    setTargetSeconds(null);
    modeRef.current = "countup";
    targetSecondsRef.current = null;
    setCanResume(false);
    return didRegeneratePlanCycle;
  };

  const accent = row ? typeColor(row.type) : "#1e3a8a";

  const requestBack = () => {
    // If any timing has started, require confirmation and finish workout on exit.
    if (running || elapsed > 0 || baseElapsedRef.current > 0 || countdown != null) {
      setBackConfirmVisible(true);
      return;
    }
    router.back();
  };

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <View style={{ paddingTop: insets.top + 8 }} className="px-3 pb-4 flex-row items-center">
        <Pressable
          onPress={requestBack}
          hitSlop={12}
          className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-3xl font-extrabold text-gray-900">Day {dayNum} workout</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 64 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-3 pb-0">
          <View className="bg-white rounded-3xl p-5 border border-gray-100">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3 min-w-0">
                <Text className="text-base font-extrabold text-gray-900 tracking-wide">WORKOUT TYPE</Text>
                <Text className="text-xl font-extrabold mt-2" style={{ color: "#2563eb" }}>
                  {row?.type ?? "—"}
                </Text>
              </View>
              <View className="items-center shrink-0 justify-center">
                <View
                  className="w-[72px] h-[72px] rounded-2xl items-center justify-center"
                  style={{ backgroundColor: `${accent}18` }}
                >
                  <Ionicons name={typeIcon(row?.type ?? "") as any} size={32} color={accent} />
                </View>
              </View>
            </View>

            {/* WORKOUT label + example name (same rhythm as WORKOUT TYPE / type); MET aligns top-right; tighter gap from row above */}
            <View className="flex-row items-start justify-between mt-2 gap-2">
              <View className="flex-1 min-w-0 pr-2">
                <Text className="text-base font-extrabold text-gray-900 tracking-wide">WORKOUT</Text>
                <Text
                  className="text-xl font-extrabold mt-2 leading-7"
                  style={{ color: "#dc2626" }}
                  numberOfLines={6}
                >
                  {row?.workout ?? "—"}
                </Text>
              </View>
              <View className="shrink-0 items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 min-w-[96px]">
                <Text className="text-base font-extrabold tracking-wide text-emerald-800">MET VALUE</Text>
                <Text className="text-xl font-extrabold text-emerald-950 mt-2">
                  {workoutDetail != null ? String(workoutDetail.met) : "—"}
                </Text>
              </View>
            </View>

            {/* Same segmented style as Progress (Weight / Workout / Meal); slightly wider track */}
            <View className="mt-5 -mx-2">
              <View className="bg-white rounded-full p-1.5 flex-row border border-gray-100">
                <Pressable
                  onPress={() => setContentTab("instruction")}
                  className={`flex-1 py-3.5 px-3 rounded-full items-center ${
                    contentTab === "instruction" ? "bg-[#eaf7f0]" : "bg-transparent"
                  }`}
                >
                  <Text
                    className={`${contentTab === "instruction" ? "text-[#52B69A]" : "text-gray-500"} font-bold`}
                  >
                    Instructions
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setContentTab("record")}
                  className={`flex-1 py-3.5 px-3 rounded-full items-center ${
                    contentTab === "record" ? "bg-[#eaf7f0]" : "bg-transparent"
                  }`}
                >
                  <Text className={`${contentTab === "record" ? "text-[#52B69A]" : "text-gray-500"} font-bold`}>
                    Workout record
                  </Text>
                </Pressable>
              </View>

              <View className="mt-4">
                {contentTab === "instruction" ? (
                  <>
                    {(() => {
                      const instructionImage = getWorkoutInstructionImage(row?.workout ?? null);
                      if (!instructionImage) return null;
                      return (
                        <Image
                          source={instructionImage}
                          style={{ width: "100%", height: 220 }}
                          contentFit="contain"
                          transition={200}
                        />
                      );
                    })()}
                    <View className="mt-5">
                      <Text className="text-base font-extrabold text-gray-900 tracking-wide">INSTRUCTIONS</Text>
                      <Text className="text-gray-700 mt-3 leading-6 text-[15px]">
                        {workoutDetail?.instruction ??
                          "Follow a steady pace, focus on form, and stop if you feel pain. You can pause anytime and your time will be recorded."}
                      </Text>
                    </View>
                  </>
                ) : (
                  <WorkoutRecordPanel
                    embedded
                    planDayNum={dayNum}
                    dayRecords={dayRecords}
                    totalRecordKcal={totalRecordKcal}
                    accentGreen={ACCENT_GREEN}
                  />
                )}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* bottom timer display */}
      <View
        style={{ paddingBottom: insets.bottom + 6 }}
        className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-3 py-3"
      >
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => {
              if (!running) {
                if (canResume) {
                  // Resume after "Stop"
                  startedAtRef.current = Date.now();
                  setRunning(true);
                  startTicker();
                  const u = auth.currentUser;
                  if (u && sessionId) {
                    void updateDoc(doc(db, "users", u.uid, "workoutSessions", sessionId), {
                      status: "running",
                      updatedAt: serverTimestamp(),
                    });
                  }
                  setCanResume(false);
                  return;
                }
                beginStart();
                return;
              }
              void pauseWorkout().then(() => setPauseMenuVisible(true));
            }}
            className={`flex-1 py-3.5 rounded-full active:opacity-90 ${running ? "bg-red-600" : "bg-[#76C893]"}`}
          >
            <Text className="text-white font-extrabold text-lg text-center">
              {running ? "Pause" : canResume ? "Resume" : "Start Workout"}
            </Text>
          </Pressable>

          <View className="items-start ml-5">
            <Text className="text-[10px] tracking-widest font-bold" style={{ color: TIMER_RED }}>
              TIMER
            </Text>
            <Text className="text-3xl font-extrabold" style={{ color: TIMER_RED }}>
              {fmtHms(elapsed)}
            </Text>
          </View>
        </View>
      </View>

      {/* Start choice modal */}
      <Modal visible={startChoiceVisible} transparent animationType="fade" onRequestClose={() => setStartChoiceVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-6 border border-gray-100">
            <Text className="text-2xl font-extrabold text-gray-900">Start workout</Text>
            <Text className="text-gray-500 mt-2 leading-6">Choose how you want to start.</Text>

            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => {
                  setMode("countup");
                  setTargetSeconds(null);
                  modeRef.current = "countup";
                  targetSecondsRef.current = null;
                  setElapsed(0);
                  baseElapsedRef.current = 0;
                  setStartChoiceVisible(false);
                  void startWithCountdown();
                }}
                className="bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200 active:opacity-90"
              >
                <Text className="text-xl font-extrabold text-gray-900">Start from 0</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setStartChoiceVisible(false);
                  setTimerPickerVisible(true);
                }}
                className="bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200 active:opacity-90"
              >
                <Text className="text-xl font-extrabold text-gray-900">Set a timer</Text>
              </Pressable>
            </View>

            <View className="flex-row justify-end mt-6">
              <Pressable onPress={() => setStartChoiceVisible(false)} className="px-4 py-3">
                <Text className="font-extrabold text-gray-500">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Timer picker modal */}
      <Modal visible={timerPickerVisible} transparent animationType="fade" onRequestClose={() => setTimerPickerVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-6 border border-gray-100">
            <Text className="text-2xl font-extrabold text-gray-900">Set a timer</Text>
            <Text className="text-gray-500 mt-2 leading-6">Choose a duration (mm:ss).</Text>

            <View className="flex-row gap-3 mt-5">
              <View className="flex-1">
                <Text className="text-[10px] tracking-widest text-gray-400 font-bold mb-2">MINUTES</Text>
                <TextInput
                  value={timerMinText}
                  onChangeText={(t) => setTimerMinText(t.replace(/[^\d]/g, "").slice(0, 3))}
                  keyboardType="number-pad"
                  className="bg-[#f3f4f3] rounded-2xl px-4 py-3 text-gray-900 text-lg font-extrabold"
                />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] tracking-widest text-gray-400 font-bold mb-2">SECONDS</Text>
                <TextInput
                  value={timerSecText}
                  onChangeText={setTimerSecondsNormalized}
                  keyboardType="number-pad"
                  className="bg-[#f3f4f3] rounded-2xl px-4 py-3 text-gray-900 text-lg font-extrabold"
                />
              </View>
            </View>

            {timerTotalSeconds > 0 && timerTotalSeconds < MIN_RECORD_SECONDS ? (
              <Text className="text-xs font-semibold text-red-600 mt-3">
                Minimum is {MIN_RECORD_SECONDS} seconds.
              </Text>
            ) : null}

            <View className="mt-4">
              <Text className="text-[10px] tracking-widest text-gray-400 font-bold mb-2">CUSTOM DURATION</Text>
              <View className="gap-2">
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => {
                      setTimerMinText("10");
                      setTimerSecText("00");
                    }}
                    className="flex-1 py-3 rounded-2xl bg-[#eaf7f0] border border-[#b7ead1] items-center active:opacity-90"
                  >
                    <Text className="font-extrabold text-[#52B69A]">10 min</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setTimerMinText("20");
                      setTimerSecText("00");
                    }}
                    className="flex-1 py-3 rounded-2xl bg-[#eaf7f0] border border-[#b7ead1] items-center active:opacity-90"
                  >
                    <Text className="font-extrabold text-[#52B69A]">20 min</Text>
                  </Pressable>
                </View>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => {
                      setTimerMinText("30");
                      setTimerSecText("00");
                    }}
                    className="flex-1 py-3 rounded-2xl bg-[#eaf7f0] border border-[#b7ead1] items-center active:opacity-90"
                  >
                    <Text className="font-extrabold text-[#52B69A]">30 min</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setTimerMinText("60");
                      setTimerSecText("00");
                    }}
                    className="flex-1 py-3 rounded-2xl bg-[#eaf7f0] border border-[#b7ead1] items-center active:opacity-90"
                  >
                    <Text className="font-extrabold text-[#52B69A]">60 min</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View className="flex-row gap-3 mt-6">
              <Pressable
                onPress={() => setTimerPickerVisible(false)}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 items-center active:bg-gray-200"
              >
                <Text className="font-extrabold text-gray-700">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={startCountdownWithPicker}
                className="flex-1 py-3.5 rounded-2xl bg-[#76C893] items-center active:opacity-90"
              >
                <Text className="font-extrabold text-white">Start</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Countdown overlay */}
      {countdown != null ? (
        <View className="absolute inset-0 bg-black/50 items-center justify-center">
          <View className="w-full px-10 items-center">
            <Text className="text-white text-lg font-extrabold mb-6 text-center">
              Your workout will begin in
            </Text>
            <View className="w-40 h-40 rounded-full bg-white items-center justify-center border-2" style={{ borderColor: TIMER_RED }}>
              <Text className="text-6xl font-extrabold" style={{ color: TIMER_RED }}>
                {countdown}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Pause menu modal (Switch-plan style) */}
      <Modal visible={pauseMenuVisible} transparent animationType="fade" onRequestClose={() => setPauseMenuVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-6 border border-gray-100">
            <Text className="text-2xl font-extrabold text-gray-900">Workout paused</Text>
            <Text className="text-gray-500 mt-2 leading-6">
              Choose what you want to do next.
            </Text>

            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => {
                  setPauseMenuVisible(false);
                  startedAtRef.current = Date.now();
                  setRunning(true);
                  startTicker();
                  const u = auth.currentUser;
                  if (u && sessionId) {
                    void updateDoc(doc(db, "users", u.uid, "workoutSessions", sessionId), {
                      status: "running",
                      updatedAt: serverTimestamp(),
                    });
                  }
                }}
                className="bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200 active:opacity-90"
              >
                <Text className="text-xl font-extrabold text-gray-900">Resume</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setPauseMenuVisible(false);
                  void stopWorkout();
                }}
                className="bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200 active:opacity-90"
              >
                <Text className="text-xl font-extrabold text-gray-900">Stop</Text>
              </Pressable>

              <Pressable
                onPress={() => setConfirmAction("restart")}
                className="bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200 active:opacity-90"
              >
                <Text className="text-xl font-extrabold text-gray-900">Restart</Text>
              </Pressable>

              <Pressable
                onPress={() => setConfirmAction("complete")}
                className="bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200 active:opacity-90"
              >
                <Text className="text-xl font-extrabold text-gray-900">Complete</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setPauseMenuVisible(false)}
              className="mt-5 py-3 rounded-full items-center border border-gray-200 bg-white active:opacity-90"
            >
              <Text className="text-gray-800 font-extrabold">Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Confirm dialog modal for Restart/Complete */}
      <Modal visible={confirmAction != null} transparent animationType="fade" onRequestClose={() => setConfirmAction(null)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-6 border border-gray-100">
            <Text className="text-2xl font-extrabold text-gray-900">
              {confirmAction === "restart" ? "Restart workout?" : "Complete workout?"}
            </Text>
            <Text className="text-gray-500 mt-2 leading-6">
              {confirmAction === "restart"
                ? "This will reset your timer to 0."
                : "This will finish the workout and save your time."}
            </Text>

            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  setPauseMenuVisible(false);
                  if (action === "restart") {
                    baseElapsedRef.current = 0;
                    startedAtRef.current = null;
                    setElapsed(0);
                    setRunning(false);
                    clearCountdown();
                    setCanResume(false);
                    setSessionId(null);
                  } else {
                    void completeWorkout();
                  }
                }}
                className="py-4 rounded-full items-center active:opacity-90 bg-red-600"
              >
                <Text className="text-white text-lg font-extrabold">Confirm</Text>
              </Pressable>

              <Pressable
                onPress={() => setConfirmAction(null)}
                className="py-3 rounded-full items-center border border-gray-200 bg-white active:opacity-90"
              >
                <Text className="text-gray-800 font-extrabold">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Back confirmation: finishes workout on exit */}
      <Modal visible={backConfirmVisible} transparent animationType="fade" onRequestClose={() => setBackConfirmVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-6 border border-gray-100">
            <Text className="text-2xl font-extrabold text-gray-900">Finish workout?</Text>
            <Text className="text-gray-500 mt-2 leading-6">
              If you go back now, we will finish the workout and save your time.
            </Text>

            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => {
                  setBackConfirmVisible(false);
                  void completeWorkout().finally(() => router.back());
                }}
                className="py-4 rounded-full items-center active:opacity-90 bg-red-600"
              >
                <Text className="text-white text-lg font-extrabold">Confirm</Text>
              </Pressable>

              <Pressable
                onPress={() => setBackConfirmVisible(false)}
                className="py-3 rounded-full items-center border border-gray-200 bg-white active:opacity-90"
              >
                <Text className="text-gray-800 font-extrabold">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={planCycleCompleteVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPlanCycleCompleteVisible(false);
          router.replace("/workout-plan" as any);
        }}
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-6 border border-gray-100">
            <View className="items-center mb-2">
              <View className="w-16 h-16 rounded-full bg-emerald-100 items-center justify-center border border-emerald-200">
                <Ionicons name="checkmark-circle" size={40} color="#059669" />
              </View>
            </View>
            <Text className="text-2xl font-extrabold text-gray-900 text-center">Plan complete</Text>
            <Text className="text-gray-600 mt-3 leading-6 text-center">
              You finished your {planCycleCompleteLabel || "full"} workout plan. A new plan has been generated so you can
              keep going.
            </Text>

            <View className="mt-6 gap-3">
              <Pressable
                onPress={() => {
                  setPlanCycleCompleteVisible(false);
                  router.replace("/workout-plan" as any);
                }}
                className="py-4 rounded-full items-center active:opacity-90"
                style={{ backgroundColor: ACCENT_GREEN }}
              >
                <Text className="text-white text-lg font-extrabold">View new plan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function dayFromRouteParam(raw: string | string[] | undefined): number {
  if (raw == null) return 1;
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/**
 * Use route search params (not Linking.useLinkingURL) so `?day=` updates when navigating
 * between days with router.push; the linking URL often stays stale and always showed day 1.
 */
export default function DayWorkoutScreen() {
  const params = useLocalSearchParams<{ day?: string | string[] }>();
  const dayNum = useMemo(() => dayFromRouteParam(params.day), [params.day]);
  return <DayWorkoutBody dayNum={dayNum} />;
}
