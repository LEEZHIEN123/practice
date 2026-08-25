import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { completeMinimizedWorkout } from "@/lib/completeMinimizedWorkout";
import { registerWorkoutLogoutCleanup } from "@/lib/workoutLogoutCleanup";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";

export type WorkoutSessionKind = "day" | "free";

export type WorkoutSessionSnapshot = {
  kind: WorkoutSessionKind;
  /** Route to reopen the workout screen. */
  href: string;
  title: string;
  workoutName: string;
  workoutType: string;
  sessionId: string | null;
  mode: "countup" | "countdown";
  targetSeconds: number | null;
  /** Accumulated seconds before the current running segment. */
  baseElapsedSeconds: number;
  /** Wall-clock start of the current running segment; null when paused. */
  startedAtMs: number | null;
  running: boolean;
  sessionStartedAtMs: number | null;
  day?: number;
  unlockedMaxDay?: number;
};

type WorkoutSessionContextValue = {
  session: WorkoutSessionSnapshot | null;
  minimized: boolean;
  /** Display seconds (count-up elapsed or countdown remaining). */
  displayElapsed: number;
  minimizeFromSnapshot: (snapshot: WorkoutSessionSnapshot) => void;
  /** Hand control back to the workout screen; stops the floating ticker. */
  claimForScreen: () => WorkoutSessionSnapshot | null;
  setMinimized: (value: boolean) => void;
  pauseMinimized: () => void;
  resumeMinimized: () => void;
  /** Dismiss floating player and clear session (caller should persist pause if needed). */
  dismiss: () => WorkoutSessionSnapshot | null;
  /** Live snapshot for syncing (folds current running segment into base when needed). */
  getLiveSnapshot: () => WorkoutSessionSnapshot | null;
};

const WorkoutSessionContext = createContext<WorkoutSessionContextValue | null>(null);

function computeDisplay(session: WorkoutSessionSnapshot | null, nowMs: number): number {
  if (!session) return 0;
  let elapsed = session.baseElapsedSeconds;
  if (session.running && session.startedAtMs != null) {
    elapsed += Math.floor((nowMs - session.startedAtMs) / 1000);
  }
  if (session.mode === "countdown" && session.targetSeconds != null) {
    return Math.max(0, session.targetSeconds - elapsed);
  }
  return Math.max(0, elapsed);
}

function foldRunningSegment(session: WorkoutSessionSnapshot, nowMs: number): WorkoutSessionSnapshot {
  if (!session.running || session.startedAtMs == null) return session;
  const delta = Math.floor((nowMs - session.startedAtMs) / 1000);
  return {
    ...session,
    baseElapsedSeconds: session.baseElapsedSeconds + Math.max(0, delta),
    startedAtMs: null,
    running: false,
  };
}

export function WorkoutSessionProvider({ children }: { children: React.ReactNode }) {
  const calendarTz = useUserCalendarTimezone();
  const [session, setSession] = useState<WorkoutSessionSnapshot | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [displayElapsed, setDisplayElapsed] = useState(0);
  const sessionRef = useRef<WorkoutSessionSnapshot | null>(null);
  const minimizedRef = useRef(false);
  const tickIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    minimizedRef.current = minimized;
  }, [minimized]);

  const stopTicker = useCallback(() => {
    if (tickIdRef.current) {
      clearInterval(tickIdRef.current);
      tickIdRef.current = null;
    }
  }, []);

  const startTicker = useCallback(() => {
    stopTicker();
    tickIdRef.current = setInterval(() => {
      const cur = sessionRef.current;
      if (!cur || !minimizedRef.current) return;
      const now = Date.now();
      const nextDisplay = computeDisplay(cur, now);
      setDisplayElapsed(nextDisplay);
      if (cur.mode === "countdown" && cur.targetSeconds != null && nextDisplay <= 0 && cur.running) {
        const paused = foldRunningSegment(cur, now);
        sessionRef.current = paused;
        setSession(paused);
        stopTicker();
      }
    }, 250);
  }, [stopTicker]);

  useEffect(() => {
    return () => stopTicker();
  }, [stopTicker]);

  const minimizeFromSnapshot = useCallback(
    (snapshot: WorkoutSessionSnapshot) => {
      sessionRef.current = snapshot;
      setSession(snapshot);
      setMinimized(true);
      setDisplayElapsed(computeDisplay(snapshot, Date.now()));
      if (snapshot.running) startTicker();
      else stopTicker();
    },
    [startTicker, stopTicker]
  );

  const claimForScreen = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return null;
    stopTicker();
    setMinimized(false);
    // Keep session metadata so the screen can re-minimize; screen owns the ticker now.
    return { ...cur };
  }, [stopTicker]);

  const pauseMinimized = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    const paused = foldRunningSegment(cur, Date.now());
    sessionRef.current = paused;
    setSession(paused);
    setDisplayElapsed(computeDisplay(paused, Date.now()));
    stopTicker();
  }, [stopTicker]);

  const resumeMinimized = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur || cur.running) return;
    if (cur.mode === "countdown" && cur.targetSeconds != null) {
      const remain = Math.max(0, cur.targetSeconds - cur.baseElapsedSeconds);
      if (remain <= 0) return;
    }
    const next: WorkoutSessionSnapshot = {
      ...cur,
      running: true,
      startedAtMs: Date.now(),
    };
    sessionRef.current = next;
    setSession(next);
    setDisplayElapsed(computeDisplay(next, Date.now()));
    if (minimizedRef.current) startTicker();
  }, [startTicker]);

  const dismiss = useCallback(() => {
    const cur = sessionRef.current;
    const folded = cur ? foldRunningSegment(cur, Date.now()) : null;
    stopTicker();
    sessionRef.current = null;
    setSession(null);
    setMinimized(false);
    setDisplayElapsed(0);
    return folded;
  }, [stopTicker]);

  const getLiveSnapshot = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return null;
    if (!cur.running || cur.startedAtMs == null) return { ...cur };
    const now = Date.now();
    return {
      ...cur,
      baseElapsedSeconds: cur.baseElapsedSeconds + Math.max(0, Math.floor((now - cur.startedAtMs) / 1000)),
      startedAtMs: cur.running ? now : null,
    };
  }, []);

  useEffect(() => {
    registerWorkoutLogoutCleanup(async () => {
      const cur = sessionRef.current;
      if (!cur) return;

      const folded = foldRunningSegment(cur, Date.now());
      const elapsed = Math.max(0, Math.floor(folded.baseElapsedSeconds));

      await completeMinimizedWorkout({
        kind: folded.kind,
        workoutName: folded.workoutName,
        workoutType: folded.workoutType,
        sessionId: folded.sessionId,
        elapsedSeconds: elapsed,
        sessionStartedAtMs: folded.sessionStartedAtMs,
        day: folded.day,
        calendarTz,
      });

      stopTicker();
      sessionRef.current = null;
      setSession(null);
      setMinimized(false);
      setDisplayElapsed(0);
    });

    return () => registerWorkoutLogoutCleanup(null);
  }, [calendarTz, stopTicker]);

  const value = useMemo(
    () => ({
      session,
      minimized,
      displayElapsed,
      minimizeFromSnapshot,
      claimForScreen,
      setMinimized,
      pauseMinimized,
      resumeMinimized,
      dismiss,
      getLiveSnapshot,
    }),
    [
      session,
      minimized,
      displayElapsed,
      minimizeFromSnapshot,
      claimForScreen,
      pauseMinimized,
      resumeMinimized,
      dismiss,
      getLiveSnapshot,
    ]
  );

  return <WorkoutSessionContext.Provider value={value}>{children}</WorkoutSessionContext.Provider>;
}

export function useWorkoutSession() {
  const ctx = useContext(WorkoutSessionContext);
  if (!ctx) throw new Error("useWorkoutSession must be used within WorkoutSessionProvider");
  return ctx;
}
