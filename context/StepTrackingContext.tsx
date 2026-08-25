import { getAccelerometerOrNull } from "@/lib/accelerometerSafe";
import { formatCalendarDayKey } from "@/lib/calendarDay";
import { getPedometerOrNull } from "@/lib/pedometerSafe";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { auth, db } from "../firebaseConfig";

export type StepSource = "pending" | "pedometer" | "accelerometer" | "unavailable";

type StepTrackingContextValue = {
  liveSteps: number;
  stepsAutoDb: number;
  stepsManualDb: number | null;
  displaySteps: number;
  stepSource: StepSource;
  stepsHydrated: boolean;
};

const StepTrackingContext = createContext<StepTrackingContextValue | null>(null);

const localStepDraftKey = (uid: string, dateKey: string) => `daily-steps-draft:${uid}:${dateKey}`;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * App-wide automatic step recording:
 * - Pedometer (preferred): reads OS walking steps while the app is open / returns to foreground
 * - Accelerometer fallback: estimates walking steps while the app is in the foreground
 * Persists `stepsAuto` to today's dailyStats so Progress / Step Progress stay in sync.
 */
export function StepTrackingProvider({ children }: { children: ReactNode }) {
  const calendarTz = useUserCalendarTimezone();
  const [authUid, setAuthUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [liveSteps, setLiveSteps] = useState(0);
  const [stepsAutoDb, setStepsAutoDb] = useState(0);
  const [stepsManualDb, setStepsManualDb] = useState<number | null>(null);
  const [stepsHydrated, setStepsHydrated] = useState(false);
  const [stepSource, setStepSource] = useState<StepSource>("pending");
  const [dayTick, setDayTick] = useState(0);

  const stepsSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedStepsRef = useRef(0);
  /** Latest known daily auto total (Firestore + live). Used as watch baseline. */
  const stepsFloorRef = useRef(0);
  /** Once resolved for this session, never bounce back to pending/unavailable on remount races. */
  const settledStepSourceRef = useRef<Exclude<StepSource, "pending"> | null>(null);
  const appActiveRef = useRef(AppState.currentState === "active");
  const lastHydratedDayKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      appActiveRef.current = next === "active";
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setDayTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    lastSyncedStepsRef.current = 0;
    stepsFloorRef.current = 0;
    settledStepSourceRef.current = null;
    lastHydratedDayKeyRef.current = null;
    if (stepsSyncTimerRef.current) {
      clearTimeout(stepsSyncTimerRef.current);
      stepsSyncTimerRef.current = null;
    }
    setLiveSteps(0);
    setStepsAutoDb(0);
    setStepsManualDb(null);
    setStepsHydrated(false);
    setStepSource("pending");
  }, [authUid]);

  useEffect(() => {
    stepsFloorRef.current = Math.max(
      stepsFloorRef.current,
      Math.max(0, Math.round(liveSteps)),
      Math.max(0, Math.round(stepsAutoDb))
    );
  }, [liveSteps, stepsAutoDb]);

  useEffect(() => {
    if (!stepsHydrated) return;
    lastSyncedStepsRef.current = Math.max(
      lastSyncedStepsRef.current,
      Math.max(0, Math.round(stepsAutoDb))
    );
  }, [stepsAutoDb, stepsHydrated]);

  // Subscribe to today's saved auto / manual steps.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    const todayKey = formatCalendarDayKey(new Date(), calendarTz);
    // Only show a loading gap when the calendar day (or user) actually changes.
    if (lastHydratedDayKeyRef.current !== todayKey) {
      setStepsHydrated(false);
    }
    const unsub = onSnapshot(
      doc(db, "users", user.uid, "dailyStats", todayKey),
      (snap) => {
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
        const sa = data.stepsAuto;
        const nextAuto =
          typeof sa === "number" && Number.isFinite(sa) ? Math.max(0, Math.round(sa)) : 0;
        setStepsAutoDb(nextAuto);
        setLiveSteps((prev) => Math.max(prev, nextAuto));
        const sm = data.stepsManual;
        setStepsManualDb(
          typeof sm === "number" && Number.isFinite(sm) ? Math.max(0, Math.round(sm)) : null
        );
        lastHydratedDayKeyRef.current = todayKey;
        setStepsHydrated(true);
      },
      () => {
        setStepsAutoDb(0);
        setStepsManualDb(null);
        lastHydratedDayKeyRef.current = todayKey;
        setStepsHydrated(true);
      }
    );
    return unsub;
  }, [authUid, calendarTz, dayTick]);

  // Persist live steps to Firestore (debounced, never decreases).
  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    if (!stepsHydrated) return;

    const key = formatCalendarDayKey(new Date(), calendarTz);
    const nextSteps = Math.max(0, Math.round(liveSteps), Math.round(stepsAutoDb));
    if (nextSteps <= lastSyncedStepsRef.current) return;

    if (stepsSyncTimerRef.current) clearTimeout(stepsSyncTimerRef.current);
    stepsSyncTimerRef.current = setTimeout(() => {
      void setDoc(
        doc(db, "users", user.uid, "dailyStats", key),
        {
          stepsAuto: nextSteps,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
        .then(() => {
          lastSyncedStepsRef.current = Math.max(lastSyncedStepsRef.current, nextSteps);
        })
        .catch((e) => {
          console.log("Failed to sync live steps:", e);
        })
        .finally(() => {
          stepsSyncTimerRef.current = null;
        });
    }, 2000);

    return () => {
      if (stepsSyncTimerRef.current) {
        clearTimeout(stepsSyncTimerRef.current);
        stepsSyncTimerRef.current = null;
      }
    };
  }, [authUid, calendarTz, liveSteps, stepsAutoDb, stepsHydrated]);

  // Local draft so a brief offline stretch still recovers.
  useEffect(() => {
    if (!authUid || !stepsHydrated) return;
    const key = formatCalendarDayKey(new Date(), calendarTz);
    const value = Math.max(0, Math.round(liveSteps), Math.round(stepsAutoDb));
    void AsyncStorage.setItem(localStepDraftKey(authUid, key), String(value));
  }, [authUid, calendarTz, liveSteps, stepsAutoDb, stepsHydrated]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    let cancelled = false;
    const syncDraft = async () => {
      const dayKey = formatCalendarDayKey(new Date(), calendarTz);
      try {
        const draftRaw = await AsyncStorage.getItem(localStepDraftKey(user.uid, dayKey));
        if (cancelled || draftRaw == null) return;
        const draftSteps = parseInt(draftRaw, 10);
        if (!Number.isFinite(draftSteps) || draftSteps < 0) return;
        await setDoc(
          doc(db, "users", user.uid, "dailyStats", dayKey),
          {
            stepsAuto: Math.max(0, Math.round(draftSteps)),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.log("Failed syncing local step draft:", e);
      }
    };
    void syncDraft();
    return () => {
      cancelled = true;
    };
  }, [authUid, calendarTz]);

  const applyOsSteps = useCallback((total: number) => {
    const next = Math.max(0, Math.round(total));
    setLiveSteps((prev) => Math.max(prev, next));
  }, []);

  const commitStepSource = useCallback((next: Exclude<StepSource, "pending">) => {
    settledStepSourceRef.current = next;
    setStepSource(next);
  }, []);

  // Continuous pedometer / accelerometer while signed in.
  // Do NOT tear down on AppState inactive — permission dialogs briefly inactive the app and
  // caused stepSource to flicker between pedometer and unavailable.
  useEffect(() => {
    if (!authUid) return;

    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let accelSub: { remove: () => void } | null = null;
    let pedSub: { remove: () => void } | null = null;
    let usingAccelerometer = false;
    let receivedWatchSteps = false;
    let pedometerModule: Awaited<ReturnType<typeof getPedometerOrNull>> = null;

    // Accelerometer walk detector (phone in hand / pocket while app is open).
    let lastStepAt = 0;
    let above = false;
    const peakThreshold = 1.2;
    const troughThreshold = 1.05;
    const cooldownMs = 320;

    let walkingMode = false;
    let lastCandidateAt = 0;
    let candidateTimes: number[] = [];

    const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let currentDayKey = dateKey(new Date());

    const resetForNewDayIfNeeded = () => {
      const k = dateKey(new Date());
      if (k !== currentDayKey) {
        currentDayKey = k;
        stepsFloorRef.current = 0;
        setLiveSteps(0);
        lastStepAt = 0;
        above = false;
        walkingMode = false;
        lastCandidateAt = 0;
        candidateTimes = [];
      }
    };

    const stopPedometer = () => {
      pedSub?.remove();
      pedSub = null;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const startAccelerometerSteps = async () => {
      try {
        if (usingAccelerometer) return true;
        const Accelerometer = await getAccelerometerOrNull();
        if (!Accelerometer || !mounted) return false;

        usingAccelerometer = true;
        stopPedometer();
        if (mounted) commitStepSource("accelerometer");
        Accelerometer.setUpdateInterval(50);

        accelSub = Accelerometer.addListener(({ x, y, z }) => {
          if (!appActiveRef.current) return;
          resetForNewDayIfNeeded();

          const mag = Math.sqrt((x ?? 0) ** 2 + (y ?? 0) ** 2 + (z ?? 0) ** 2);
          const now = Date.now();

          if (walkingMode && now - lastCandidateAt > 2500) {
            walkingMode = false;
            candidateTimes = [];
          }

          if (!above && mag >= peakThreshold) {
            above = true;
          } else if (above && mag <= troughThreshold) {
            above = false;
            if (now - lastStepAt > cooldownMs) {
              lastStepAt = now;
              lastCandidateAt = now;

              if (!walkingMode) {
                candidateTimes = candidateTimes.filter((t) => now - t <= 4500);
                candidateTimes.push(now);
                const n = candidateTimes.length;
                const dt1 = n >= 2 ? candidateTimes[n - 1]! - candidateTimes[n - 2]! : Infinity;
                const dt2 = n >= 3 ? candidateTimes[n - 2]! - candidateTimes[n - 3]! : Infinity;
                const cadenceOk = (dt: number) => dt >= 300 && dt <= 1400;
                if (n >= 3 && cadenceOk(dt1) && cadenceOk(dt2)) {
                  walkingMode = true;
                  setLiveSteps((s) => s + Math.min(n, 3));
                  candidateTimes = [];
                }
              } else {
                setLiveSteps((s) => s + 1);
              }
            }
          }
        });

        return true;
      } catch {
        return false;
      }
    };

    const syncStepsFromOs = async () => {
      if (!mounted || Platform.OS !== "ios" || !pedometerModule) return;
      try {
        const res = await pedometerModule.getStepCountAsync(startOfDay(new Date()), new Date());
        const total = Math.max(0, Math.round(typeof res?.steps === "number" ? res.steps : 0));
        if (total > 0) applyOsSteps(total);
      } catch {
        /* unavailable */
      }
    };

    const startLivePedometer = async () => {
      try {
        const Pedometer = await getPedometerOrNull();
        if (!Pedometer || !mounted) return false;
        pedometerModule = Pedometer;

        const existing = await Pedometer.getPermissionsAsync();
        let granted = !!existing.granted;
        if (!granted) {
          const req = await Pedometer.requestPermissionsAsync();
          granted = !!req.granted;
        }
        if (!granted || !mounted) return false;

        // Baseline for this watch session: never drop below what we already know.
        const watchBaseline = Math.max(0, Math.round(stepsFloorRef.current));

        await syncStepsFromOs();
        if (!mounted) return false;

        pedSub = Pedometer.watchStepCount((result) => {
          if (!mounted || usingAccelerometer) return;
          const sessionSteps = Math.max(
            0,
            Math.round(typeof result?.steps === "number" ? result.steps : 0)
          );
          if (sessionSteps > 0) receivedWatchSteps = true;
          applyOsSteps(watchBaseline + sessionSteps);
          if (Platform.OS === "ios") void syncStepsFromOs();
        });

        if (mounted) commitStepSource("pedometer");

        if (Platform.OS === "ios") {
          timer = setInterval(() => {
            if (appActiveRef.current) void syncStepsFromOs();
          }, 15_000);
        }

        // If the OS never delivers watch updates, fall back to accelerometer once.
        fallbackTimer = setTimeout(() => {
          if (!mounted || usingAccelerometer || receivedWatchSteps) return;
          void startAccelerometerSteps();
        }, 12_000);

        return true;
      } catch {
        return false;
      }
    };

    const run = async () => {
      if (!mounted) return;
      // Keep the last settled label while we re-probe; only show pending on first resolve.
      if (!settledStepSourceRef.current) {
        setStepSource("pending");
      }

      try {
        const ok = await startLivePedometer();
        if (!mounted) return;
        if (ok) return;

        const accelOk = await startAccelerometerSteps();
        if (!mounted) return;
        if (accelOk) return;

        // Only mark unavailable if we never successfully settled this session.
        if (!settledStepSourceRef.current) {
          commitStepSource("unavailable");
        }
      } catch {
        if (!mounted) return;
        if (!settledStepSourceRef.current) {
          const accelOk = await startAccelerometerSteps();
          if (!mounted) return;
          if (!accelOk) commitStepSource("unavailable");
        }
      }
    };

    void run();

    const onAppState = (next: AppStateStatus) => {
      if (next === "active" && Platform.OS === "ios") {
        void syncStepsFromOs();
      }
    };
    const appSub = AppState.addEventListener("change", onAppState);

    return () => {
      mounted = false;
      appSub.remove();
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (timer) clearInterval(timer);
      pedSub?.remove();
      accelSub?.remove();
    };
  }, [applyOsSteps, authUid, commitStepSource]);

  const displaySteps = useMemo(() => {
    if (stepsManualDb != null) return Math.round(stepsManualDb);
    return Math.max(Math.round(liveSteps), Math.round(stepsAutoDb));
  }, [liveSteps, stepsAutoDb, stepsManualDb]);

  const value = useMemo(
    () => ({
      liveSteps,
      stepsAutoDb,
      stepsManualDb,
      displaySteps,
      stepSource,
      stepsHydrated,
    }),
    [displaySteps, liveSteps, stepSource, stepsAutoDb, stepsHydrated, stepsManualDb]
  );

  return <StepTrackingContext.Provider value={value}>{children}</StepTrackingContext.Provider>;
}

export function useStepTracking(): StepTrackingContextValue {
  const ctx = useContext(StepTrackingContext);
  if (!ctx) {
    return {
      liveSteps: 0,
      stepsAutoDb: 0,
      stepsManualDb: null,
      displaySteps: 0,
      stepSource: "pending",
      stepsHydrated: false,
    };
  }
  return ctx;
}
