import { BottomTabBar, useBottomTabBarScrollPadding } from "@/components/navigation/BottomTabBar";
import { getAccelerometerOrNull } from "@/lib/accelerometerSafe";
import { addDaysToYmd, formatCalendarDayKey } from "@/lib/calendarDay";
import { runRemoveZeroKcalWorkoutLogsOnce } from "@/lib/migrations/removeZeroKcalWorkoutLogs";
import { getPedometerOrNull } from "@/lib/pedometerSafe";
import { useAdminRedirect } from "@/lib/useAdminRedirect";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { useWaterIntakeSuggestion } from "@/lib/useWaterIntakeSuggestion";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import Slider from "@react-native-community/slider";
import { useFocusEffect, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { auth, db } from "../firebaseConfig";

type TabKey = "weight" | "workout" | "meal";
type PeriodKey = "week" | "month" | "year";

type WorkoutLogRowProgress = { burnedKcal: number; createdAt: Date; dayKey: string };

const localStepDraftKey = (uid: string, dateKey: string) => `daily-steps-draft:${uid}:${dateKey}`;

export default function ProgressScreen() {
  const router = useRouter();
  useAdminRedirect();
  const {
    cardStyle,
    screenStyle,
    textPrimary,
    textMuted,
    textSecondary,
    iconButtonStyle,
    segmentTrackStyle,
    segmentActiveStyle,
    theme,
  } = useThemedScreen();
  const tabBarPadding = useBottomTabBarScrollPadding();
  const calendarTz = useUserCalendarTimezone();
  /** Firestore listeners must re-subscribe when the signed-in user changes (missing this caused cross-account data bleed). */
  const [authUid, setAuthUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [tab, setTab] = useState<TabKey>("weight");
  const [period, setPeriod] = useState<PeriodKey>("week");

  const [heightCm, setHeightCm] = useState<number>(0);
  const [weightKg, setWeightKg] = useState<number>(0);
  const [profileAge, setProfileAge] = useState<number>(0);
  const [profileGender, setProfileGender] = useState<"male" | "female" | null>(null);
  const [profileActivityLevel, setProfileActivityLevel] = useState<string | null>(null);
  const [todayLoggedWeight, setTodayLoggedWeight] = useState<number | null>(null);
  const [consumedToday, setConsumedToday] = useState(0);
  const [burnedToday, setBurnedToday] = useState(0);
  const [consumedYesterday, setConsumedYesterday] = useState(0);
  const [burnedYesterday, setBurnedYesterday] = useState(0);
  const [waterMlToday, setWaterMlToday] = useState(0);
  /** Today's sum from waterLogs + whether any log exists for today (prefer over dailyStats when logs exist). */
  const [waterFromLogs, setWaterFromLogs] = useState<{ sum: number; count: number } | null>(null);
  const [stepsToday, setStepsToday] = useState<number>(0);
  const [stepsAutoDb, setStepsAutoDb] = useState(0);
  const [stepsManualDb, setStepsManualDb] = useState<number | null>(null);
  const [stepsHydrated, setStepsHydrated] = useState(false);
  const [stepSource, setStepSource] = useState<"pedometer" | "accelerometer" | "unavailable">("pedometer");

  const [logVisible, setLogVisible] = useState(false);
  const [logWeightText, setLogWeightText] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [logDate, setLogDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  /** Raw weight logs for the Progress weight chart + current metric (kept in sync via onSnapshot). */
  const [weightProgressLogRows, setWeightProgressLogRows] = useState<
    { weight: number; createdAt: Date }[]
  >([]);
  const [dayTick, setDayTick] = useState(0);
  const [weightSeries, setWeightSeries] = useState<number[]>([]);
  const [workoutLogRows, setWorkoutLogRows] = useState<WorkoutLogRowProgress[]>([]);
  const [hasWeightLogs, setHasWeightLogs] = useState(false);
  const [latestLoggedWeight, setLatestLoggedWeight] = useState<number>(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [screenFocused, setScreenFocused] = useState(false);
  const stepsSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedStepsRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, [])
  );


  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sameDayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const startOfWeekMon = (d: Date) => {
    // Monday as start of week
    const day = d.getDay(); // 0=Sun..6=Sat
    const diff = (day + 6) % 7; // Mon->0, Sun->6
    const out = startOfDay(d);
    out.setDate(out.getDate() - diff);
    return out;
  };
  const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const getCreatedAtDate = (v: any): Date | null => {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate();
    if (typeof v === "number") return new Date(v);
    return null;
  };

  const formatDateShort = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const sanitizeDecimal = (t: string) => {
    const cleaned = t.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    const [a, b] = cleaned.split(".");
    if (b === undefined) return a ?? "";
    return `${a ?? ""}.${b.slice(0, 1)}`; // one decimal
  };

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

  const displaySteps = useMemo(() => {
    if (stepsManualDb != null) return Math.round(stepsManualDb);
    return Math.max(Math.round(stepsToday), Math.round(stepsAutoDb));
  }, [stepsAutoDb, stepsManualDb, stepsToday]);

  const todayDayKey = useMemo(
    () => formatCalendarDayKey(new Date(), calendarTz),
    [calendarTz, dayTick]
  );

  const waterProfile = useMemo(
    () => ({
      age: profileAge > 0 ? profileAge : undefined,
      gender: profileGender ?? undefined,
      height: heightCm > 0 ? heightCm : undefined,
      weight: weightKg > 0 ? weightKg : undefined,
      activityLevel: profileActivityLevel,
    }),
    [heightCm, profileActivityLevel, profileAge, profileGender, weightKg]
  );

  const { suggestedMl: waterSuggestedMl, loading: waterSuggestionLoading } = useWaterIntakeSuggestion({
      uid: authUid,
      calendarTz,
      calendarDayKey: todayDayKey,
      profile: waterProfile,
      burnedKcalToday: burnedToday,
      stepsToday: displaySteps,
      enabled: Boolean(authUid),
    });

  /** Source of truth for "today's total": waterLogs. If none, show 0. */
  const waterTotalTodayMl = useMemo(() => {
    if (!waterFromLogs) return 0;
    if (waterFromLogs.count <= 0) return 0;
    return Math.max(0, waterFromLogs.sum);
  }, [waterFromLogs]);

  const hasWaterLogsToday = useMemo(() => (waterFromLogs?.count ?? 0) > 0, [waterFromLogs]);

  /** True if today has any water (logs and/or dailyStats total). Do not reset from dailyStats snapshots — that caused the reminder to flash after other fields updated. */
  const waterRecordedToday = useMemo(() => {
    if (hasWaterLogsToday) return true;
    if (waterMlToday > 0) return true;
    return false;
  }, [hasWaterLogsToday, waterMlToday]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUid(user?.uid ?? null);
      if (user) void runRemoveZeroKcalWorkoutLogsOnce();
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    lastSyncedStepsRef.current = 0;
    if (stepsSyncTimerRef.current) {
      clearTimeout(stepsSyncTimerRef.current);
      stepsSyncTimerRef.current = null;
    }
    if (!authUid) {
      setStepsToday(0);
      setStepsAutoDb(0);
      setStepsManualDb(null);
      setStepsHydrated(false);
      setConsumedToday(0);
      setBurnedToday(0);
      setConsumedYesterday(0);
      setBurnedYesterday(0);
      setWaterMlToday(0);
      setWaterFromLogs({ sum: 0, count: 0 });
      setStepSource("pedometer");
      return;
    }
    setStepsToday(0);
    setStepsAutoDb(0);
    setStepsManualDb(null);
    setStepsHydrated(false);
    setStepSource("pedometer");
  }, [authUid]);

  useEffect(() => {
    if (!stepsHydrated) return;
    lastSyncedStepsRef.current = Math.max(lastSyncedStepsRef.current, Math.max(0, Math.round(stepsAutoDb)));
  }, [stepsAutoDb, stepsHydrated]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    if (!stepsHydrated) return;

    const key = formatCalendarDayKey(new Date(), calendarTz);
    const liveSteps = Math.max(0, Math.round(stepsToday));
    const savedSteps = Math.max(0, Math.round(stepsAutoDb));
    const nextSteps = Math.max(liveSteps, savedSteps);

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
  }, [authUid, calendarTz, stepsAutoDb, stepsHydrated, stepsToday]);

  useEffect(() => {
    return () => {
      if (stepsSyncTimerRef.current) clearTimeout(stepsSyncTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!authUid) return;
    if (!stepsHydrated) return;
    const key = formatCalendarDayKey(new Date(), calendarTz);
    const value = Math.max(Math.max(0, Math.round(stepsToday)), Math.max(0, Math.round(stepsAutoDb)));
    void AsyncStorage.setItem(localStepDraftKey(authUid, key), String(value));
  }, [authUid, calendarTz, stepsAutoDb, stepsHydrated, stepsToday]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    let cancelled = false;
    const syncDraftToAccount = async () => {
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
    void syncDraftToAccount();
    return () => {
      cancelled = true;
    };
  }, [authUid, calendarTz]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as {
          profileImage?: string;
          height?: number;
          weight?: number;
          age?: number;
          gender?: "male" | "female";
          activityLevel?: string;
        };
        const h = typeof data.height === "number" ? data.height : 0;
        const w = typeof data.weight === "number" ? data.weight : 0;
        setHeightCm(h);
        setWeightKg(w);
        if (typeof data.age === "number" && Number.isFinite(data.age)) setProfileAge(data.age);
        else setProfileAge(0);
        if (data.gender === "male" || data.gender === "female") setProfileGender(data.gender);
        else setProfileGender(null);
        if (typeof data.activityLevel === "string" && data.activityLevel.length > 0) {
          setProfileActivityLevel(data.activityLevel);
        } else {
          setProfileActivityLevel(null);
        }
        if (typeof data?.profileImage === "string" && data.profileImage.length > 0) setProfileImage(data.profileImage);
        else setProfileImage(null);
      },
      () => {}
    );
    return () => unsub();
  }, [authUid]);

  useEffect(() => {
    const id = setInterval(() => setDayTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    setStepsHydrated(false);

    const now = new Date();
    const todayKey = formatCalendarDayKey(now, calendarTz);
    const yesterdayKey = addDaysToYmd(todayKey, -1);

    const unsubToday = onSnapshot(
      doc(db, "users", user.uid, "dailyStats", todayKey),
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        setConsumedToday(typeof data?.consumedKcal === "number" ? data.consumedKcal : 0);
        setBurnedToday(typeof data?.burnedKcal === "number" ? data.burnedKcal : 0);
        const wm = data?.waterMl;
        setWaterMlToday(typeof wm === "number" && Number.isFinite(wm) ? Math.round(wm) : 0);
        const sa = data?.stepsAuto;
        const nextAuto = typeof sa === "number" && Number.isFinite(sa) ? Math.max(0, sa) : 0;
        setStepsAutoDb(nextAuto);
        setStepsToday((prev) => Math.max(prev, nextAuto));
        const sm = data?.stepsManual;
        setStepsManualDb(typeof sm === "number" && Number.isFinite(sm) ? Math.max(0, Math.round(sm)) : null);
        setStepsHydrated(true);
      },
      () => {
        setConsumedToday(0);
        setBurnedToday(0);
        setWaterMlToday(0);
        setStepsAutoDb(0);
        setStepsManualDb(null);
        setStepsHydrated(true);
      }
    );

    const unsubYesterday = onSnapshot(
      doc(db, "users", user.uid, "dailyStats", yesterdayKey),
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        setConsumedYesterday(typeof data?.consumedKcal === "number" ? data.consumedKcal : 0);
        setBurnedYesterday(typeof data?.burnedKcal === "number" ? data.burnedKcal : 0);
      },
      () => {
        setConsumedYesterday(0);
        setBurnedYesterday(0);
      }
    );

    return () => {
      unsubToday();
      unsubYesterday();
    };
  }, [authUid, calendarTz, dayTick]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    const q = query(
      collection(db, "users", user.uid, "waterLogs"),
      orderBy("createdAt", "desc"),
      limit(120)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const todayKey = formatCalendarDayKey(new Date(), calendarTz);
        let sum = 0;
        let count = 0;
        for (const d of snap.docs) {
          const data = d.data() as any;
          const logDay = data?.logDate?.toDate?.() instanceof Date ? data.logDate.toDate() : null;
          const createdAt = data?.createdAt?.toDate?.() instanceof Date ? data.createdAt.toDate() : null;
          const dk = logDay
            ? formatCalendarDayKey(logDay, calendarTz)
            : createdAt
              ? formatCalendarDayKey(createdAt, calendarTz)
              : null;
          if (dk !== todayKey) continue;
          count += 1;
          const amt =
            typeof data?.amountMl === "number" && Number.isFinite(data.amountMl) ? data.amountMl : 0;
          sum += amt;
        }
        setWaterFromLogs({ sum: Math.round(sum), count });
      },
      () => setWaterFromLogs({ sum: 0, count: 0 })
    );
    return () => unsub();
  }, [authUid, calendarTz, dayTick]);

  useEffect(() => {
    if (!screenFocused) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let pedDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let accelSub: { remove: () => void } | null = null;
    let pedSub: { remove: () => void } | null = null;
    let mounted = true;

    // Peak -> trough step detector + "walking lock" (fallback when hardware step counter is unavailable).
    let lastStepAt = 0;
    let above = false;
    const peakThreshold = 1.28; // g — stricter to reduce non-walking jitter
    const troughThreshold = 1.08; // g
    const cooldownMs = 380; // ~2.6 steps/s max; typical walking ~1–2 steps/s

    let walkingMode = false;
    let lastCandidateAt = 0;
    let candidateTimes: number[] = [];

    const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let currentDayKey = dateKey(new Date());

    const resetForNewDayIfNeeded = () => {
      const k = dateKey(new Date());
      if (k !== currentDayKey) {
        currentDayKey = k;
        setStepsToday(0);
        lastStepAt = 0;
        above = false;
        walkingMode = false;
        lastCandidateAt = 0;
        candidateTimes = [];
      }
    };

    const startAccelerometerSteps = async () => {
      try {
        const Accelerometer = await getAccelerometerOrNull();
        if (!Accelerometer || !mounted) return false;

        setStepSource("accelerometer");
        Accelerometer.setUpdateInterval(50); // ~20Hz

        accelSub = Accelerometer.addListener(({ x, y, z }) => {
          resetForNewDayIfNeeded();

          // magnitude of acceleration vector (in g units)
          const mag = Math.sqrt((x ?? 0) ** 2 + (y ?? 0) ** 2 + (z ?? 0) ** 2);
          const now = Date.now();

          // Drop out of walking mode if we've been idle.
          if (walkingMode && now - lastCandidateAt > 2200) {
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
                // Require several candidates with walking-like cadence (filters pick-up/shake).
                candidateTimes = candidateTimes.filter((t) => now - t <= 4000);
                candidateTimes.push(now);
                const n = candidateTimes.length;
                const dt1 = n >= 2 ? candidateTimes[n - 1] - candidateTimes[n - 2] : Infinity;
                const dt2 = n >= 3 ? candidateTimes[n - 2] - candidateTimes[n - 3] : Infinity;
                const dt3 = n >= 4 ? candidateTimes[n - 3] - candidateTimes[n - 4] : Infinity;
                // Walking cadence ~50–160 steps/min → ~375–1200 ms between steps
                const cadenceOk = (dt: number) => dt >= 350 && dt <= 1300;
                if (n >= 5 && cadenceOk(dt1) && cadenceOk(dt2) && cadenceOk(dt3)) {
                  walkingMode = true;
                  candidateTimes = [];
                  // Don't retroactively count candidates; start counting only once walking is confirmed.
                }
              } else {
                setStepsToday((s) => s + 1);
              }
            }
          }
        });

        return true;
      } catch {
        return false;
      }
    };

    const startLivePedometer = async () => {
      try {
        const Pedometer = await getPedometerOrNull();
        if (!Pedometer || !mounted) return false;

        const perm = await Pedometer.requestPermissionsAsync();
        if (!perm.granted || !mounted) return false;

        setStepSource("pedometer");

        // Use OS step count (Core Motion / Google Fit step sensor) — tuned for walking, not raw accel peaks.
        const syncStepsFromOs = async () => {
          if (!mounted) return;
          try {
            const res = await Pedometer.getStepCountAsync(startOfDay(new Date()), new Date());
            const total = Math.max(0, Math.round(typeof res?.steps === "number" ? res.steps : 0));
            setStepsToday(total);
          } catch {
            /* ignore */
          }
        };

        await syncStepsFromOs();
        if (!mounted) return false;

        pedSub = Pedometer.watchStepCount(() => {
          if (!mounted) return;
          if (pedDebounceTimer) clearTimeout(pedDebounceTimer);
          pedDebounceTimer = setTimeout(() => {
            pedDebounceTimer = null;
            void syncStepsFromOs();
          }, 400);
        });

        timer = setInterval(() => void syncStepsFromOs(), 45_000);

        return true;
      } catch {
        return false;
      }
    };

    const run = async () => {
      try {
        if (!mounted) return;

        setStepSource("pedometer");
        const ok = await startLivePedometer();
        if (ok) {
          return;
        }

        const accelOk = await startAccelerometerSteps();
        if (!accelOk) setStepSource("unavailable");
      } catch {
        const accelOk = await startAccelerometerSteps();
        if (!accelOk) setStepSource("unavailable");
      }
    };

    void run();
    return () => {
      mounted = false;
      if (pedDebounceTimer) clearTimeout(pedDebounceTimer);
      if (timer) clearInterval(timer);
      pedSub?.remove();
      accelSub?.remove();
    };
  }, [authUid, screenFocused]);

  useEffect(() => {
    setHoverIdx(null);
  }, [tab]);

  useEffect(() => {
    if (tab !== "weight") return;
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) {
      setWeightProgressLogRows([]);
      return;
    }

    const q = query(
      collection(db, "users", user.uid, "weightLogs"),
      orderBy("createdAt", "desc"),
      limit(400)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => d.data() as any)
          .map((row) => ({
            weight: typeof row.weight === "number" ? row.weight : null,
            createdAt: getCreatedAtDate(row.logDate ?? row.createdAt),
          }))
          .filter((r) => typeof r.weight === "number" && r.createdAt instanceof Date) as {
            weight: number;
            createdAt: Date;
          }[];
        setWeightProgressLogRows(rows);
      },
      (e) => {
        console.log("weightLogs snapshot error:", e);
        setWeightProgressLogRows([]);
      }
    );
    return () => unsub();
  }, [authUid, tab]);

  useEffect(() => {
    const applyWeightProgressLogs = () => {
      if (tab !== "weight") return;

      try {
        const rows = weightProgressLogRows;

        const any = rows.length > 0;
        setHasWeightLogs(any);

        if (!any) {
          setTodayLoggedWeight(null);
          const zeros = period === "week" ? 7 : period === "month" ? 4 : 12;
          setLatestLoggedWeight(0);
          if (weightKg > 0) {
            const fallback = Array.from({ length: zeros }, () => 0);
            if (period === "week") {
              const weekStart = startOfWeekMon(new Date());
              const idx = Math.floor((startOfDay(new Date()).getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
              if (idx >= 0 && idx < fallback.length) fallback[idx] = weightKg;
            } else if (period === "month") {
              const dayOfMonth = new Date().getDate();
              const weekIdx = Math.min(3, Math.floor((dayOfMonth - 1) / 7));
              fallback[weekIdx] = weightKg;
            } else {
              const monthIdx = new Date().getMonth();
              fallback[monthIdx] = weightKg;
            }
            setWeightSeries(fallback);
          } else {
            setWeightSeries(Array.from({ length: zeros }, () => 0));
          }
          return;
        }

        // rows are newest-first due to query
        setLatestLoggedWeight(rows[0].weight);
        const now = new Date();
        const todayKey = sameDayKey(now);
        const todayRow = rows.find((r) => sameDayKey(r.createdAt) === todayKey);
        setTodayLoggedWeight(todayRow ? todayRow.weight : null);

        if (period === "week") {
          // 7 daily points (Mon..Sun) using latest weight logged per day, fallback 0
          const weekStart = startOfWeekMon(now);
          const keys = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            return sameDayKey(d);
          });
          const latestByDay = new Map<string, number>();
          for (const r of rows) {
            const key = sameDayKey(r.createdAt);
            if (!latestByDay.has(key)) latestByDay.set(key, r.weight);
          }
          if (!todayRow && weightKg > 0) {
            latestByDay.set(todayKey, weightKg);
          }
          setWeightSeries(keys.map((k) => latestByDay.get(k) ?? 0));
          return;
        }

        if (period === "month") {
          // 4 weekly points (W1..W4) for current month; use average per week, fallback 0
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const buckets = [0, 0, 0, 0];
          const counts = [0, 0, 0, 0];
          for (const r of rows) {
            if (r.createdAt < monthStart) continue;
            if (r.createdAt.getMonth() !== now.getMonth() || r.createdAt.getFullYear() !== now.getFullYear())
              continue;
            const dayOfMonth = r.createdAt.getDate(); // 1..31
            const weekIdx = Math.min(3, Math.floor((dayOfMonth - 1) / 7));
            buckets[weekIdx] += r.weight;
            counts[weekIdx] += 1;
          }
          if (!todayRow && weightKg > 0) {
            const dayOfMonth = now.getDate();
            const weekIdx = Math.min(3, Math.floor((dayOfMonth - 1) / 7));
            buckets[weekIdx] += weightKg;
            counts[weekIdx] += 1;
          }
          setWeightSeries(buckets.map((sum, i) => (counts[i] ? sum / counts[i] : 0)));
          return;
        }

        // year: 12 monthly points (Jan..Dec) for current year; use average per month, fallback 0
        const year = now.getFullYear();
        const sums = Array.from({ length: 12 }, () => 0);
        const counts = Array.from({ length: 12 }, () => 0);
        for (const r of rows) {
          if (r.createdAt.getFullYear() !== year) continue;
          const m = r.createdAt.getMonth(); // 0..11
          sums[m] += r.weight;
          counts[m] += 1;
        }
        if (!todayRow && weightKg > 0) {
          const m = now.getMonth();
          sums[m] += weightKg;
          counts[m] += 1;
        }
        setWeightSeries(sums.map((sum, i) => (counts[i] ? sum / counts[i] : 0)));
      } catch (e) {
        console.log("Failed to compute weight series:", e);
        setTodayLoggedWeight(null);
        const zeros = period === "week" ? 7 : period === "month" ? 4 : 12;
        setHasWeightLogs(false);
        setLatestLoggedWeight(0);
        setWeightSeries(Array.from({ length: zeros }, () => 0));
      }
    };

    applyWeightProgressLogs();
  }, [period, tab, weightKg, weightProgressLogRows]);

  useEffect(() => {
    if (tab !== "workout") return;
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) {
      setWorkoutLogRows([]);
      return;
    }
    const q = query(
      collection(db, "users", user.uid, "workoutLogs"),
      orderBy("createdAt", "desc"),
      limit(400)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const createdAt = getCreatedAtDate(data.createdAt);
            const burnedKcal = typeof data.burnedKcal === "number" ? data.burnedKcal : 0;
            if (!createdAt) return null;
            return {
              burnedKcal,
              createdAt,
              dayKey: formatCalendarDayKey(createdAt, calendarTz),
            };
          })
          .filter((r): r is WorkoutLogRowProgress => r != null && r.burnedKcal > 0);
        setWorkoutLogRows(rows);
      },
      () => setWorkoutLogRows([])
    );
    return () => unsub();
  }, [authUid, calendarTz, tab]);

  const workoutSeries = useMemo((): number[] => {
    if (tab !== "workout") return [];
    const rows = workoutLogRows;
    const now = new Date();
    const zeros = (n: number) => Array.from({ length: n }, () => 0);

    if (period === "week") {
      const weekStart = startOfWeekMon(now);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const key = formatCalendarDayKey(d, calendarTz);
        return rows.filter((r) => r.dayKey === key).reduce((s, r) => s + r.burnedKcal, 0);
      });
    }
    if (period === "month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const buckets = [0, 0, 0, 0];
      for (const r of rows) {
        if (r.createdAt < monthStart) continue;
        if (r.createdAt.getMonth() !== now.getMonth() || r.createdAt.getFullYear() !== now.getFullYear()) continue;
        const dom = r.createdAt.getDate();
        const idx = Math.min(3, Math.floor((dom - 1) / 7));
        buckets[idx] += r.burnedKcal;
      }
      return buckets;
    }
    const year = now.getFullYear();
    const sums = zeros(12);
    for (const r of rows) {
      if (r.createdAt.getFullYear() !== year) continue;
      sums[r.createdAt.getMonth()] += r.burnedKcal;
    }
    return sums;
  }, [calendarTz, period, tab, workoutLogRows]);

  /** Headline + delta for workout: all periods use summed burns vs previous matching period. */
  const workoutHeadlineMetric = useMemo(() => {
    if (tab !== "workout") return { main: "", delta: "" };
    const now = new Date();
    if (period === "week") {
      const total = workoutSeries.reduce((s, v) => s + (v || 0), 0);
      const weekStart = startOfWeekMon(now);
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevTotal = workoutLogRows
        .filter((r) => r.createdAt >= prevWeekStart && r.createdAt < weekStart)
        .reduce((s, r) => s + r.burnedKcal, 0);
      const delta = total - prevTotal;
      return {
        main: `${Math.round(total).toLocaleString()} kcal`,
        delta: `${delta >= 0 ? "+" : ""}${Math.round(delta).toLocaleString()}`,
      };
    }
    const total = workoutSeries.reduce((s, v) => s + (v || 0), 0);
    if (period === "month") {
      const py = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const pm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const prevTotal = workoutLogRows
        .filter((r) => r.createdAt.getFullYear() === py && r.createdAt.getMonth() === pm)
        .reduce((s, r) => s + r.burnedKcal, 0);
      const delta = total - prevTotal;
      return {
        main: `${Math.round(total).toLocaleString()} kcal`,
        delta: `${delta >= 0 ? "+" : ""}${Math.round(delta).toLocaleString()}`,
      };
    }
    const y = now.getFullYear();
    const prevTotal = workoutLogRows.filter((r) => r.createdAt.getFullYear() === y - 1).reduce((s, r) => s + r.burnedKcal, 0);
    const delta = total - prevTotal;
    return {
      main: `${Math.round(total).toLocaleString()} kcal`,
      delta: `${delta >= 0 ? "+" : ""}${Math.round(delta).toLocaleString()}`,
    };
  }, [period, tab, workoutLogRows, workoutSeries]);

  /** Under THIS WEEK: show today’s burn from logs (same bucketing as the chart). */
  const workoutWeekTodayKcal = useMemo(() => {
    if (tab !== "workout" || period !== "week") return null;
    const todayKey = formatCalendarDayKey(new Date(), calendarTz);
    const todayKcal = workoutLogRows
      .filter((r) => r.dayKey === todayKey)
      .reduce((s, r) => s + r.burnedKcal, 0);
    return Math.round(todayKcal).toLocaleString();
  }, [calendarTz, period, tab, workoutLogRows]);

  /** Profile `weight` (Edit Profile, home, etc.) is the live “current weight” and should drive the headline. */
  const effectiveWeightKg = useMemo(() => {
    if (weightKg > 0) return weightKg;
    if (todayLoggedWeight != null) return todayLoggedWeight;
    if (hasWeightLogs && latestLoggedWeight) return latestLoggedWeight;
    return weightKg;
  }, [hasWeightLogs, latestLoggedWeight, todayLoggedWeight, weightKg]);

  const bmi = useMemo(() => {
    if (!heightCm || !effectiveWeightKg) return 0;
    const m = heightCm / 100;
    const value = effectiveWeightKg / (m * m);
    return Number.isFinite(value) ? value : 0;
  }, [effectiveWeightKg, heightCm]);

  const bmiCategoryIdx = useMemo(() => {
    if (!bmi) return 1;
    if (bmi < 18.5) return 0;
    if (bmi <= 24.9) return 1;
    if (bmi <= 29.9) return 2;
    return 3;
  }, [bmi]);

  const bmiMarkerPct = useMemo(() => {
    if (!bmi) return 12.5;
    const b = Math.min(Math.max(bmi, 12), 48);
    if (b < 18.5) return ((b - 12) / (18.5 - 12)) * 25;
    if (b <= 24.9) return 25 + ((b - 18.5) / (24.9 - 18.5)) * 25;
    if (b <= 29.9) return 50 + ((b - 25) / (29.9 - 25)) * 25;
    return 75 + Math.min((b - 30) / (48 - 30), 1) * 25;
  }, [bmi]);

  const bmiCategoryLabel = useMemo(() => {
    if (!bmi) return "—";
    return (["UNDER", "NORMAL", "OVER", "OBESE"] as const)[bmiCategoryIdx];
  }, [bmi, bmiCategoryIdx]);

  const bmiCategoryPillClass = useMemo(() => {
    if (bmiCategoryIdx === 0) return "bg-sky-50 border-sky-200";
    if (bmiCategoryIdx === 1) return "bg-emerald-50 border-emerald-200";
    if (bmiCategoryIdx === 2) return "bg-amber-50 border-amber-200";
    return "bg-red-50 border-red-200";
  }, [bmiCategoryIdx]);

  const bmiCategoryPillTextClass = useMemo(() => {
    if (bmiCategoryIdx === 0) return "text-sky-700";
    if (bmiCategoryIdx === 1) return "text-emerald-800";
    if (bmiCategoryIdx === 2) return "text-amber-800";
    return "text-red-700";
  }, [bmiCategoryIdx]);

  /** Recommended plan copy follows BMI ranges (not profile goal). */
  const bmiPlanCaps = useMemo(() => {
    if (!bmi) return "MAINTAIN WEIGHT";
    if (bmi < 18.5) return "GAIN WEIGHT";
    if (bmi > 25) return "LOSE WEIGHT";
    return "MAINTAIN WEIGHT";
  }, [bmi]);

  const bmiCaretColor = useMemo(() => {
    if (!bmi) return "#52B69A";
    if (bmiCategoryIdx === 0) return "#0284c7";
    if (bmiCategoryIdx === 1) return "#059669";
    if (bmiCategoryIdx === 2) return "#fbbf24";
    return "#dc2626";
  }, [bmi, bmiCategoryIdx]);

  const metricLabel = useMemo(() => {
    if (tab === "weight") return "CURRENT METRIC";
    if (tab === "workout")
      return period === "week" ? "THIS WEEK BURNED" : period === "month" ? "THIS MONTH BURNED" : "THIS YEAR BURNED";
    return period === "week" ? "THIS WEEK CONSUMED" : period === "month" ? "THIS MONTH CONSUMED" : "THIS YEAR CONSUMED";
  }, [tab, period]);

  const metricValue = useMemo(() => {
    const currentBucketIndex = () => {
      const now = new Date();
      if (period === "week") {
        return Math.min(6, Math.max(0, now.getDay() === 0 ? 6 : now.getDay() - 1));
      }
      if (period === "month") {
        return Math.min(3, Math.floor((now.getDate() - 1) / 7));
      }
      return now.getMonth();
    };

    const kgDelta = (series: number[]) => {
      if (!series.length) return 0;
      const todayIdx = Math.min(series.length - 1, Math.max(0, currentBucketIndex()));
      const firstIdx = series.findIndex((v, i) => i <= todayIdx && v > 0);
      let compareIdx = -1;
      for (let i = todayIdx; i >= 0; i--) {
        if (series[i] > 0) {
          compareIdx = i;
          break;
        }
      }
      if (firstIdx === -1 || compareIdx === -1 || compareIdx === firstIdx) return 0;
      const first = series[firstIdx];
      const last = series[compareIdx];
      return last - first;
    };
    const kg = tab === "weight" ? kgDelta(weightSeries) : 0;

    if (tab === "weight")
      return {
        main: effectiveWeightKg ? `${effectiveWeightKg.toFixed(1)} kg` : "0.0 kg",
        delta: hasWeightLogs
          ? `${kg >= 0 ? "+" : ""}${kg.toFixed(1)} kg`
          : "0.0 kg",
      };
    if (tab === "workout") return workoutHeadlineMetric;
    return {
      main: `${Math.round(consumedToday).toLocaleString()} kcal`,
      delta: `${consumedToday - consumedYesterday >= 0 ? "+" : ""}${Math.round(consumedToday - consumedYesterday).toLocaleString()}`,
    };
  }, [
    burnedToday,
    burnedYesterday,
    consumedToday,
    consumedYesterday,
    period,
    tab,
    effectiveWeightKg,
    hasWeightLogs,
    weightSeries,
    workoutHeadlineMetric,
  ]);

  const chartLabels = useMemo(() => {
    if (period === "week") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    if (period === "month") return ["W1", "W2", "W3", "W4"];
    return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  }, [period]);

  const weightBarTooltip = useMemo(() => {
    if (tab !== "weight") return "";
    if (hoverIdx == null) return "";
    const now = new Date();
    if (period === "week") {
      const ws = startOfWeekMon(now);
      const d = new Date(ws);
      d.setDate(d.getDate() + hoverIdx);
      const v = weightSeries[hoverIdx] ?? 0;
      return `${d.toLocaleDateString()}: ${v ? `${v.toFixed(1)} kg` : "—"}`;
    }
    const label = chartLabels[hoverIdx] ?? "";
    const v = weightSeries[hoverIdx] ?? 0;
    return `${label}: ${v ? `${v.toFixed(1)} kg` : "—"}`;
  }, [chartLabels, hoverIdx, period, tab, weightSeries]);

  const hoverLabel = useMemo(() => {
    if (tab !== "weight") return "";
    if (hoverIdx == null) return "";
    const label = chartLabels[hoverIdx] ?? "";
    const v = weightSeries[hoverIdx] ?? 0;
    return `${label}: ${v.toFixed(1)} kg`;
  }, [chartLabels, hoverIdx, tab, weightSeries]);

  const workoutBarTooltip = useMemo(() => {
    if (tab !== "workout") return "";
    if (hoverIdx == null) return "";
    const now = new Date();
    if (period === "week") {
      const ws = startOfWeekMon(now);
      const d = new Date(ws);
      d.setDate(d.getDate() + hoverIdx);
      const v = workoutSeries[hoverIdx] ?? 0;
      return `${d.toLocaleDateString()}: ${Math.round(v).toLocaleString()} kcal`;
    }
    const label = chartLabels[hoverIdx] ?? "";
    const v = workoutSeries[hoverIdx] ?? 0;
    return `${label}: ${Math.round(v).toLocaleString()} kcal`;
  }, [chartLabels, hoverIdx, period, tab, workoutSeries]);

  const openLogWeight = () => {
    const base = effectiveWeightKg;
    setLogWeightText(base ? base.toFixed(1) : "");
    setLogDate(new Date());
    setLogVisible(true);
  };

  const saveWeightLog = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const parsedW = parseFloat(logWeightText || "");
    if (!Number.isFinite(parsedW) || parsedW < 30 || parsedW > 200) {
      Alert.alert("Invalid weight", "Weight must be between 30 kg and 200 kg.");
      return;
    }

    try {
      setSavingLog(true);

      const nextW = clamp(parsedW, 30, 200);
      const h = heightCm;
      const m = h ? h / 100 : 0;
      const nextBmi = m ? nextW / (m * m) : 0;

      // Update current weight & BMI on user doc
      await updateDoc(doc(db, "users", user.uid), {
        weight: nextW,
        bmi: h ? Number(nextBmi.toFixed(2)) : undefined,
      });

      // Append log entry (optional history)
      await addDoc(collection(db, "users", user.uid, "weightLogs"), {
        weight: nextW,
        // createdAt is for ordering (actual time saved); logDate is the day user chose.
        createdAt: serverTimestamp(),
        logDate: Timestamp.fromDate(startOfDay(logDate)),
      });

      setWeightKg(nextW);
      setHasWeightLogs(true);
      // Reflect the just-saved log immediately in the headline metric.
      setLatestLoggedWeight(nextW);
      setLogVisible(false);
    } catch (e) {
      console.log("Failed to log weight:", e);
      Alert.alert("Error", "Failed to log your weight.");
    } finally {
      setSavingLog(false);
    }
  };

  const openDetails = () => {
    // typed routes may not include this file yet; use string push
    router.push(`/progress-details?tab=${tab}&period=${period}` as any);
  };

  return (
    <View style={screenStyle}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarPadding }} className="px-3 pt-10">
        <View className="flex-row justify-between items-center mb-8">
          <Text className="text-4xl font-extrabold" style={textPrimary}>
            Progress
          </Text>
          <Pressable
            onPress={() => router.push("/profile")}
            className="w-12 h-12 rounded-full border-2 border-[#b7ead1] overflow-hidden items-center justify-center"
            style={iconButtonStyle}
          >
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={{ width: 48, height: 48 }} resizeMode="cover" />
            ) : (
              <Ionicons name="person-outline" size={22} color="#76C893" />
            )}
          </Pressable>
        </View>

        {/* Segmented Control */}
        <View className="mt-3 rounded-full p-1 flex-row" style={segmentTrackStyle}>
          <Pressable
            onPress={() => setTab("weight")}
            className={`flex-1 py-3 rounded-full items-center ${
              tab === "weight" ? "" : "bg-transparent"
            }`}
            style={tab === "weight" ? segmentActiveStyle : undefined}
          >
            <Text
              className="font-bold"
              style={{ color: tab === "weight" ? theme.accentText : theme.textMuted }}
            >
              Weight
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("workout")}
            className={`flex-1 py-3 rounded-full items-center ${
              tab === "workout" ? "" : "bg-transparent"
            }`}
            style={tab === "workout" ? segmentActiveStyle : undefined}
          >
            <Text
              className="font-bold"
              style={{ color: tab === "workout" ? theme.accentText : theme.textMuted }}
            >
              Workout
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("meal")}
            className={`flex-1 py-3 rounded-full items-center ${
              tab === "meal" ? "" : "bg-transparent"
            }`}
            style={tab === "meal" ? segmentActiveStyle : undefined}
          >
            <Text
              className="font-bold"
              style={{ color: tab === "meal" ? theme.accentText : theme.textMuted }}
            >
              Meal
            </Text>
          </Pressable>
        </View>

        {/* Period selector (different style from tabs) */}
        <View className="mt-2 flex-row justify-between">
          {(
            [
              { key: "week", label: "Weekly" },
              { key: "month", label: "Monthly" },
              { key: "year", label: "Yearly" },
            ] as const
          ).map((p) => {
            const active = period === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => setPeriod(p.key)}
                className="flex-1 mx-1 rounded-2xl border px-3 py-3 items-center"
                style={
                  active
                    ? { borderColor: theme.accent, backgroundColor: theme.accentSoft }
                    : cardStyle
                }
              >
                <Text
                  className="font-extrabold"
                  style={{ color: active ? theme.accentText : theme.textMuted }}
                >
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Metric + chart card */}
        <View className="mt-4 rounded-3xl p-5" style={cardStyle}>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-base font-extrabold tracking-wide" style={textPrimary}>
                {metricLabel}
              </Text>
              <View className="flex-row items-end mt-2 flex-wrap">
                <Text className="text-3xl font-extrabold shrink" style={textPrimary}>
                  {metricValue.main}
                </Text>
                <View
                  className={`ml-3 px-2 py-1 rounded-full mb-1 ${
                    metricValue.delta.trim().startsWith("-") ? "bg-red-50" : "bg-[#eaf7f0]"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      metricValue.delta.trim().startsWith("-") ? "text-red-600" : "text-[#52B69A]"
                    }`}
                  >
                    {metricValue.delta}
                  </Text>
                </View>
              </View>
              {workoutWeekTodayKcal ? (
                <Text className="text-base font-semibold mt-1.5" style={textMuted}>
                  Today burned <Text className="text-lg font-extrabold" style={{ color: theme.accentText }}>{workoutWeekTodayKcal}</Text> kcal
                </Text>
              ) : null}
            </View>

            <View className="items-end">
              {tab === "weight" ? (
                <Pressable
                  onPress={openLogWeight}
                  className="px-4 py-2 rounded-full bg-[#76C893]"
                >
                  <Text className="font-extrabold" style={{ color: "#ffffff" }}>Log weight +</Text>
                </Pressable>
              ) : (
                <View className="px-3 py-2 rounded-2xl bg-[#eef7f1] border border-[#b7ead1]">
                  <Text className="text-[11px] font-bold text-[#52B69A]">Auto-updates</Text>
                </View>
              )}
              <Pressable onPress={openDetails} className="mt-2 active:opacity-80">
                <Text className="text-base font-extrabold text-[#52B69A]">SEE ALL &gt;</Text>
              </Pressable>
            </View>
          </View>

          {/* Chart */}
          <View className="mt-4">
            <View className="h-32 rounded-2xl overflow-hidden" style={{ backgroundColor: theme.rowBg }}>
              <View className="absolute left-0 right-0 bottom-0 h-14 bg-[#76C893] opacity-10" />
              {((tab === "weight" && weightBarTooltip) || (tab === "workout" && workoutBarTooltip)) &&
                hoverIdx != null && (
                  <View className="absolute top-2 left-0 right-0 items-center">
                    <View className="px-3 py-1 rounded-full" style={cardStyle}>
                      <Text className="text-xs font-bold" style={textSecondary}>
                        {tab === "weight" ? weightBarTooltip : workoutBarTooltip}
                      </Text>
                    </View>
                  </View>
                )}
              {tab === "weight" ? (
                <View className="flex-1 flex-row items-end px-4 pb-2">
                  {(() => {
                    const min = Math.min(...weightSeries);
                    const max = Math.max(...weightSeries);
                    const span = max - min || 1;
                    const padded = weightSeries.length ? weightSeries : chartLabels.map(() => 0);

                    return padded.map((v, idx) => {
                      const h = 10 + Math.round(((v - min) / span) * 50);
                      const active = hoverIdx === idx;
                      return (
                        <View key={`bar-${idx}`} className="flex-1 items-center justify-end">
                          <Pressable
                            onPress={() => setHoverIdx((cur) => (cur === idx ? null : idx))}
                            onHoverIn={() => setHoverIdx(idx)}
                            onHoverOut={() => setHoverIdx(null)}
                            className="items-center justify-end w-full"
                          >
                            <View
                              style={{ height: h, width: active ? 12 : 10, borderRadius: 999 }}
                              className={
                                v === 0 ? "bg-gray-300" : active ? "bg-[#52B69A]" : "bg-[#76C893]"
                              }
                            />
                          </Pressable>
                          <Text className="text-[10px] font-bold mt-2" style={textMuted}>
                            {chartLabels[idx]}
                          </Text>
                        </View>
                      );
                    });
                  })()}
                </View>
              ) : tab === "workout" ? (
                <View className="flex-1 flex-row items-end px-4 pb-2">
                  {(() => {
                    const padded = workoutSeries.length ? workoutSeries : chartLabels.map(() => 0);
                    const min = Math.min(...padded);
                    const max = Math.max(...padded);
                    const span = max - min || 1;

                    return padded.map((v, idx) => {
                      const h = 10 + Math.round(((v - min) / span) * 50);
                      const active = hoverIdx === idx;
                      return (
                        <View key={`wbar-${idx}`} className="flex-1 items-center justify-end">
                          <Pressable
                            onPress={() => setHoverIdx((cur) => (cur === idx ? null : idx))}
                            onHoverIn={() => setHoverIdx(idx)}
                            onHoverOut={() => setHoverIdx(null)}
                            className="items-center justify-end w-full"
                          >
                            <View
                              style={{ height: h, width: active ? 12 : 10, borderRadius: 999 }}
                              className={
                                v === 0 ? "bg-gray-300" : active ? "bg-[#52B69A]" : "bg-[#76C893]"
                              }
                            />
                          </Pressable>
                          <Text className="text-[10px] font-bold mt-2" style={textMuted}>
                            {chartLabels[idx]}
                          </Text>
                        </View>
                      );
                    });
                  })()}
                </View>
              ) : (
                <View className="flex-1 flex-row items-end px-4 pb-4">
                  <View className="flex-1 h-10 border-b-2 border-[#76C893] opacity-70" />
                  <View className="flex-1 h-6 border-b-2 border-[#76C893] opacity-70" />
                  <View className="flex-1 h-12 border-b-2 border-[#76C893] opacity-70" />
                  <View className="flex-1 h-7 border-b-2 border-[#76C893] opacity-70" />
                  <View className="flex-1 h-14 border-b-2 border-[#76C893] opacity-70" />
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Daily steps + water */}
        <View className="mt-4 gap-3">
          <View className="flex-row justify-between gap-4">
            <Pressable
              onPress={() => router.push("/step-progress" as any)}
              className="flex-1 rounded-3xl p-4 pb-5 active:opacity-90"
              style={cardStyle}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-extrabold" style={textPrimary}>Daily Steps</Text>
                <Ionicons name="walk-outline" size={18} color={theme.accent} />
              </View>
              <Text className="text-[10px] tracking-widest font-bold mt-2" style={textMuted}>TODAY&apos;S TOTAL</Text>
              <Text className="text-3xl font-extrabold mt-1" style={textPrimary}>
                {displaySteps.toLocaleString()} steps
              </Text>
              <Text className="text-sm mt-2" style={textMuted}>
                {stepSource === "pedometer"
                  ? "Phone step counter (walking & daily movement)"
                  : stepSource === "accelerometer"
                    ? "Estimated steps while walking"
                    : "Not available on this device"}
              </Text>
              {stepSource !== "unavailable" ? (
                <Text className="text-sm font-semibold text-blue-600 mt-1.5">Tap for progress</Text>
              ) : null}
            </Pressable>

            <Pressable
              onPress={() => router.push("/water-intake" as any)}
              className="flex-1 rounded-3xl p-4 pb-5 active:opacity-90"
              style={cardStyle}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-extrabold" style={textPrimary}>Water Intake</Text>
                <Ionicons name="water-outline" size={18} color={theme.accent} />
              </View>
              <Text className="text-[10px] tracking-widest font-bold mt-2" style={textMuted}>TODAY&apos;S TOTAL</Text>
              <Text className="text-3xl font-extrabold mt-1" style={textPrimary}>
                {waterTotalTodayMl.toLocaleString()} ml
              </Text>
              {waterSuggestionLoading ? (
                <Text className="text-sm mt-2" style={textMuted}>
                  Calculating today&apos;s suggestion…
                </Text>
              ) : waterSuggestedMl != null ? (
                <Text className="text-sm mt-2" style={textMuted}>
                  Today's water intake suggestion:{" "}
                  <Text className="font-extrabold" style={{ color: theme.danger }}>
                    {waterSuggestedMl.toLocaleString()} ml
                  </Text>
                </Text>
              ) : (
                <Text className="text-sm mt-2" style={textMuted}>
                  Today suggestion:{" "}
                  <Text className="font-extrabold" style={{ color: theme.danger }}>
                    unavailable
                  </Text>
                </Text>
              )}
              {!waterRecordedToday ? (
                <Text className="text-sm text-amber-700 font-semibold mt-1">
                  You haven&apos;t recorded water today.
                </Text>
              ) : null}
              <Text className="text-sm font-semibold text-blue-600 mt-1.5">Tap to record</Text>
            </Pressable>
          </View>
        </View>

        {/* Achievements (moved from Home) */}
        <View className="mt-4">
          <Pressable
            onPress={() => router.push("/achievements" as any)}
            className="rounded-3xl px-5 py-5 active:opacity-90 shadow-sm shadow-black/5"
            style={cardStyle}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 pr-3">
                <View className="w-14 h-14 rounded-2xl items-center justify-center" style={{ backgroundColor: theme.accentSoft }}>
                  <Ionicons name="trophy-outline" size={30} color={theme.accent} />
                </View>
                <View className="ml-4 flex-1">
                  <Text className="text-xl font-extrabold" style={textPrimary}>Achievements</Text>
                  <Text className="text-sm mt-1 leading-5" style={textMuted}>
                    Workout, meal, community & streak badges
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <BottomTabBar active="progress" />

      {/* Log weight modal */}
      <Modal visible={logVisible} transparent animationType="fade" onRequestClose={() => setLogVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded-3xl p-5" style={cardStyle}>
            <Text className="text-xl font-extrabold" style={textPrimary}>Log weight</Text>
            <Text className="mt-1" style={textMuted}>Pick a date and log your weight.</Text>

            <View className="mt-5">
              <Text className="font-semibold ml-1 mb-2" style={textSecondary}>DATE</Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                className="rounded-2xl px-4 py-3 flex-row items-center justify-between"
                style={{ backgroundColor: theme.rowBg, borderColor: theme.cardBorder, borderWidth: 1 }}
              >
                <Text className="font-bold" style={textPrimary}>{formatDateShort(logDate)}</Text>
                <Ionicons name="calendar-outline" size={20} color={theme.iconMuted} />
              </Pressable>

              {showDatePicker && (
                <DateTimePicker
                  value={logDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  maximumDate={new Date()}
                  onChange={(event, date) => {
                    if (Platform.OS !== "ios") setShowDatePicker(false);
                    if (event.type === "dismissed") return;
                    if (date) setLogDate(date);
                  }}
                />
              )}

              <Text className="font-semibold ml-1 mb-2" style={textSecondary}>WEIGHT (kg)</Text>
              <TextInput
                value={logWeightText}
                onChangeText={(t) => setLogWeightText(sanitizeDecimal(t))}
                keyboardType="decimal-pad"
                className="rounded-2xl px-4 py-3"
                style={{ backgroundColor: theme.rowBg, borderColor: theme.cardBorder, borderWidth: 1, color: theme.textPrimary }}
                placeholder="68.2"
                placeholderTextColor={theme.textMuted}
              />
              <Slider
                style={{ width: "100%", marginTop: 10 }}
                minimumValue={30}
                maximumValue={200}
                step={0.1}
                value={Number(logWeightText || 0) || latestLoggedWeight || weightKg || 68}
                onValueChange={(v) => setLogWeightText(v.toFixed(1))}
                minimumTrackTintColor="#76C893"
                maximumTrackTintColor="#d1d5db"
                thumbTintColor="#76C893"
              />
            </View>

            <View className="flex-row justify-end mt-6">
              <Pressable onPress={() => setLogVisible(false)} className="px-4 py-3 mr-2">
                <Text className="font-extrabold" style={textMuted}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveWeightLog}
                disabled={savingLog}
                className={`px-5 py-3 rounded-2xl bg-[#76C893] ${savingLog ? "opacity-60" : "opacity-100"}`}
              >
                <Text className="font-extrabold" style={{ color: "#ffffff" }}>
                  {savingLog ? "Saving..." : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

