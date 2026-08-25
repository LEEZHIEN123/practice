import { BottomTabBar, useBottomTabBarScrollPadding } from "@/components/navigation/BottomTabBar";
import { ProgressFeatureCard } from "@/components/progress/ProgressFeatureCard";
import {
  ProgressMetricCard,
  ProgressMetricDetail,
  ProgressMetricLabel,
  ProgressMetricLink,
  ProgressMetricValue,
} from "@/components/progress/ProgressMetricCard";
import { ProfileScreenHeader } from "@/components/themed/ThemedUi";
import { useStepTracking } from "@/context/StepTrackingContext";
import { rememberBottomTabRoute } from "@/lib/bottomTabHistory";
import {
  BMI_CATEGORY_PLAN_CHANGE_MESSAGE,
  BMI_CATEGORY_PLAN_CHANGE_TITLE,
  didBmiCategoryChange,
} from "@/lib/bmiRecommendation";
import { addDaysToYmd, formatCalendarDayKey } from "@/lib/calendarDay";
import { saveHomeUserCache } from "@/lib/homeUserCache";
import { runRemoveZeroKcalWorkoutLogsOnce } from "@/lib/migrations/removeZeroKcalWorkoutLogs";
import { publishDailyStepRanking } from "@/lib/stepLeaderboard";
import { useAdminRedirect } from "@/lib/useAdminRedirect";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { useWaterIntakeSuggestion } from "@/lib/useWaterIntakeSuggestion";
import {
  buildLatestWeightByDay,
  buildWeightBucketSeries,
  buildWeightSeriesForDays,
  resyncAutoFilledWeightsAfterDay,
  syncWeightAutoFillAtMidnight,
  weightBarHeight,
  weightLogDayKey,
  type WeightLogRow,
} from "@/lib/weightAutoFill";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import Slider from "@react-native-community/slider";
import { useRouter } from "expo-router";
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
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { auth, db } from "../firebaseConfig";

type TabKey = "weight" | "workout" | "meal";
type PeriodKey = "week" | "month" | "year";

type WorkoutLogRowProgress = { burnedKcal: number; createdAt: Date; dayKey: string };
type MealLogRowProgress = { calories: number; createdAt: Date; dayKey: string };

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
  const {
    displaySteps,
    stepSource,
    stepsHydrated,
  } = useStepTracking();
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

  const [logVisible, setLogVisible] = useState(false);
  const [logWeightText, setLogWeightText] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [logDate, setLogDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  /** Raw weight logs for the Progress weight chart + current metric (kept in sync via onSnapshot). */
  const [weightProgressLogRows, setWeightProgressLogRows] = useState<WeightLogRow[]>([]);
  const [dayTick, setDayTick] = useState(0);
  const [weightSeries, setWeightSeries] = useState<number[]>([]);
  const [workoutLogRows, setWorkoutLogRows] = useState<WorkoutLogRowProgress[]>([]);
  const [mealLogRows, setMealLogRows] = useState<MealLogRowProgress[]>([]);
  const [hasWeightLogs, setHasWeightLogs] = useState(false);
  const [latestLoggedWeight, setLatestLoggedWeight] = useState<number>(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
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

  const todayDayKey = useMemo(
    () => formatCalendarDayKey(new Date(), calendarTz),
    [calendarTz, dayTick]
  );

  useEffect(() => {
    if (!stepsHydrated || !authUid) return;
    void publishDailyStepRanking(todayDayKey, displaySteps).catch((error) => {
      console.log("Failed to publish daily step ranking:", error);
    });
  }, [authUid, displaySteps, stepsHydrated, todayDayKey]);

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

  const {
    suggestedMl: waterSuggestedMl,
    previousPlaceName: waterPreviousPlaceName,
    previousSuggestedMl: waterPreviousSuggestedMl,
    loading: waterSuggestionLoading,
  } = useWaterIntakeSuggestion({
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUid(user?.uid ?? null);
      if (user) void runRemoveZeroKcalWorkoutLogsOnce();
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authUid) {
      setConsumedToday(0);
      setBurnedToday(0);
      setConsumedYesterday(0);
      setBurnedYesterday(0);
      setWaterMlToday(0);
      setWaterFromLogs({ sum: 0, count: 0 });
    }
  }, [authUid]);

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
      },
      () => {
        setConsumedToday(0);
        setBurnedToday(0);
        setWaterMlToday(0);
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
          .map((d) => {
            const row = d.data() as any;
            return {
              id: d.id,
              weight: typeof row.weight === "number" ? row.weight : null,
              createdAt: getCreatedAtDate(row.logDate ?? row.createdAt),
              autoFilled: row.autoFilled === true,
            };
          })
          .filter((r) => typeof r.weight === "number" && r.createdAt instanceof Date) as WeightLogRow[];
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
    const user = auth.currentUser;
    if (!user || user.uid !== authUid || weightKg <= 0) return;
    void syncWeightAutoFillAtMidnight({
      uid: user.uid,
      weightKg,
      calendarTz,
      existingRows: weightProgressLogRows,
    }).catch((e) => console.log("weight auto-fill failed:", e));
  }, [authUid, calendarTz, dayTick, weightKg, weightProgressLogRows]);

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
          setWeightSeries(Array.from({ length: zeros }, () => 0));
          return;
        }

        // rows are newest-first by save time (Firestore createdAt). Prefer a real user log.
        const latestUserLog = rows.find((r) => !r.autoFilled);
        setLatestLoggedWeight(latestUserLog ? latestUserLog.weight : 0);
        const now = new Date();
        const todayKey = formatCalendarDayKey(now, calendarTz);
        // Prefer an explicit user log for today (not auto-fill carry-forward).
        const todayRow = rows.find(
          (r) => !r.autoFilled && weightLogDayKey(r.createdAt, calendarTz) === todayKey
        );
        setTodayLoggedWeight(todayRow ? todayRow.weight : null);

        const currentSlotIndex =
          period === "week"
            ? Math.min(6, Math.max(0, now.getDay() === 0 ? 6 : now.getDay() - 1))
            : period === "month"
              ? Math.min(3, Math.floor((now.getDate() - 1) / 7))
              : now.getMonth();

        if (period === "week") {
          const weekStart = startOfWeekMon(now);
          const keys = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            return formatCalendarDayKey(d, calendarTz);
          });
          const latestByDay = buildLatestWeightByDay(rows, calendarTz);
          setWeightSeries(buildWeightSeriesForDays(keys, latestByDay, weightKg, todayKey));
          return;
        }

        if (period === "month") {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const buckets = [0, 0, 0, 0];
          const counts = [0, 0, 0, 0];
          for (const r of rows) {
            if (r.autoFilled) continue;
            if (r.createdAt < monthStart) continue;
            if (r.createdAt.getMonth() !== now.getMonth() || r.createdAt.getFullYear() !== now.getFullYear())
              continue;
            const dayOfMonth = r.createdAt.getDate(); // 1..31
            const weekIdx = Math.min(3, Math.floor((dayOfMonth - 1) / 7));
            buckets[weekIdx] += r.weight;
            counts[weekIdx] += 1;
          }
          const bucketValues = buckets.map((sum, i) => (counts[i] ? sum / counts[i] : null));
          setWeightSeries(buildWeightBucketSeries(bucketValues, currentSlotIndex, weightKg));
          return;
        }

        // year: 12 monthly points (Jan..Dec) for current year
        const year = now.getFullYear();
        const sums = Array.from({ length: 12 }, () => 0);
        const counts = Array.from({ length: 12 }, () => 0);
        for (const r of rows) {
          if (r.autoFilled) continue;
          if (r.createdAt.getFullYear() !== year) continue;
          const m = r.createdAt.getMonth(); // 0..11
          sums[m] += r.weight;
          counts[m] += 1;
        }
        const bucketValues = sums.map((sum, i) => (counts[i] ? sum / counts[i] : null));
        setWeightSeries(buildWeightBucketSeries(bucketValues, currentSlotIndex, weightKg));
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
  }, [calendarTz, period, tab, weightKg, weightProgressLogRows]);

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

  useEffect(() => {
    if (tab !== "meal") return;
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) {
      setMealLogRows([]);
      return;
    }
    const q = query(
      collection(db, "users", user.uid, "mealLogs"),
      orderBy("createdAt", "desc"),
      limit(400)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const createdAt =
              getCreatedAtDate(data.logDate) ?? getCreatedAtDate(data.createdAt);
            const calories = typeof data.calories === "number" ? data.calories : 0;
            if (!createdAt) return null;
            return {
              calories,
              createdAt,
              dayKey: formatCalendarDayKey(createdAt, calendarTz),
            };
          })
          .filter((r): r is MealLogRowProgress => r != null && r.calories > 0);
        setMealLogRows(rows);
      },
      () => setMealLogRows([])
    );
    return () => unsub();
  }, [authUid, calendarTz, tab]);

  const mealSeries = useMemo((): number[] => {
    if (tab !== "meal") return [];
    const rows = mealLogRows;
    const now = new Date();
    const zeros = (n: number) => Array.from({ length: n }, () => 0);

    if (period === "week") {
      const weekStart = startOfWeekMon(now);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const key = formatCalendarDayKey(d, calendarTz);
        return rows.filter((r) => r.dayKey === key).reduce((s, r) => s + r.calories, 0);
      });
    }
    if (period === "month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const buckets = [0, 0, 0, 0];
      for (const r of rows) {
        if (r.createdAt < monthStart) continue;
        if (r.createdAt.getMonth() !== now.getMonth() || r.createdAt.getFullYear() !== now.getFullYear())
          continue;
        const dom = r.createdAt.getDate();
        const idx = Math.min(3, Math.floor((dom - 1) / 7));
        buckets[idx] += r.calories;
      }
      return buckets;
    }
    const year = now.getFullYear();
    const sums = zeros(12);
    for (const r of rows) {
      if (r.createdAt.getFullYear() !== year) continue;
      sums[r.createdAt.getMonth()] += r.calories;
    }
    return sums;
  }, [calendarTz, mealLogRows, period, tab]);

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

  /** Today’s burn from workout logs (falls back to dailyStats). */
  const workoutTodayBurnKcal = useMemo(() => {
    if (tab !== "workout") return null;
    const todayKey = formatCalendarDayKey(new Date(), calendarTz);
    const fromLogs = workoutLogRows
      .filter((r) => r.dayKey === todayKey)
      .reduce((s, r) => s + r.burnedKcal, 0);
    const total = fromLogs > 0 ? fromLogs : burnedToday;
    return Math.round(total).toLocaleString();
  }, [burnedToday, calendarTz, tab, workoutLogRows]);

  const mealTodayConsumeKcal = useMemo(() => {
    if (tab !== "meal") return null;
    const todayKey = formatCalendarDayKey(new Date(), calendarTz);
    const fromLogs = mealLogRows
      .filter((r) => r.dayKey === todayKey)
      .reduce((s, r) => s + r.calories, 0);
    const total = fromLogs > 0 ? fromLogs : consumedToday;
    return Math.round(total).toLocaleString();
  }, [calendarTz, consumedToday, mealLogRows, tab]);

  const mealHeadlineMetric = useMemo(() => {
    if (tab !== "meal") return { main: "", delta: "" };
    const now = new Date();
    const rows = mealLogRows;

    if (period === "week") {
      const weekStart = startOfWeekMon(now);
      const total = mealSeries.reduce((s, v) => s + (v || 0), 0);
      const prevStart = new Date(weekStart);
      prevStart.setDate(prevStart.getDate() - 7);
      const prevEnd = new Date(weekStart);
      prevEnd.setMilliseconds(-1);
      const prevTotal = rows
        .filter((r) => r.createdAt >= prevStart && r.createdAt <= prevEnd)
        .reduce((s, r) => s + r.calories, 0);
      const delta = total - prevTotal;
      return {
        main: `${Math.round(total).toLocaleString()} kcal`,
        delta: `${delta >= 0 ? "+" : ""}${Math.round(delta).toLocaleString()}`,
      };
    }
    if (period === "month") {
      const total = mealSeries.reduce((s, v) => s + (v || 0), 0);
      const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const prevTotal = rows
        .filter((r) => r.createdAt.getFullYear() === prevYear && r.createdAt.getMonth() === prevMonth)
        .reduce((s, r) => s + r.calories, 0);
      const delta = total - prevTotal;
      return {
        main: `${Math.round(total).toLocaleString()} kcal`,
        delta: `${delta >= 0 ? "+" : ""}${Math.round(delta).toLocaleString()}`,
      };
    }
    const y = now.getFullYear();
    const total = mealSeries.reduce((s, v) => s + (v || 0), 0);
    const prevTotal = rows
      .filter((r) => r.createdAt.getFullYear() === y - 1)
      .reduce((s, r) => s + r.calories, 0);
    const delta = total - prevTotal;
    return {
      main: `${Math.round(total).toLocaleString()} kcal`,
      delta: `${delta >= 0 ? "+" : ""}${Math.round(delta).toLocaleString()}`,
    };
  }, [mealLogRows, mealSeries, period, tab]);

  /** CURRENT METRIC: today's weight (profile weight stays aligned with today). */
  const effectiveWeightKg = useMemo(() => {
    if (weightKg > 0) return weightKg;
    if (todayLoggedWeight != null && todayLoggedWeight > 0) return todayLoggedWeight;
    return 0;
  }, [todayLoggedWeight, weightKg]);

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
    return mealHeadlineMetric;
  }, [
    mealHeadlineMetric,
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

  const mealBarTooltip = useMemo(() => {
    if (tab !== "meal") return "";
    if (hoverIdx == null) return "";
    const now = new Date();
    if (period === "week") {
      const ws = startOfWeekMon(now);
      const d = new Date(ws);
      d.setDate(d.getDate() + hoverIdx);
      const v = mealSeries[hoverIdx] ?? 0;
      return `${d.toLocaleDateString()}: ${Math.round(v).toLocaleString()} kcal`;
    }
    const label = chartLabels[hoverIdx] ?? "";
    const v = mealSeries[hoverIdx] ?? 0;
    return `${label}: ${Math.round(v).toLocaleString()} kcal`;
  }, [chartLabels, hoverIdx, mealSeries, period, tab]);

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
      const previousBmi = m && weightKg > 0 ? weightKg / (m * m) : null;
      const nextBmi = m ? nextW / (m * m) : 0;
      const todayKey = formatCalendarDayKey(new Date(), calendarTz);
      const editedDayKey = formatCalendarDayKey(startOfDay(logDate), calendarTz);
      const isToday = editedDayKey === todayKey;

      // Profile weight / BMI only follow today's log — past-day edits stay historical.
      if (isToday) {
        await updateDoc(doc(db, "users", user.uid), {
          weight: nextW,
          bmi: h ? Number(nextBmi.toFixed(2)) : undefined,
        });
        void saveHomeUserCache(user.uid, { weight: nextW });
      }

      await addDoc(collection(db, "users", user.uid, "weightLogs"), {
        weight: nextW,
        // createdAt is for ordering (actual time saved); logDate is the day user chose.
        createdAt: serverTimestamp(),
        logDate: Timestamp.fromDate(startOfDay(logDate)),
      });

      await resyncAutoFilledWeightsAfterDay({
        uid: user.uid,
        editedDayKey,
        newWeightKg: nextW,
        calendarTz,
        existingRows: weightProgressLogRows,
      }).catch((e) => console.log("weight auto-fill resync failed:", e));

      setHasWeightLogs(true);
      setLatestLoggedWeight(nextW);
      if (isToday) {
        setWeightKg(nextW);
        setTodayLoggedWeight(nextW);
      }
      setLogVisible(false);

      if (isToday && didBmiCategoryChange(previousBmi, nextBmi)) {
        Alert.alert(BMI_CATEGORY_PLAN_CHANGE_TITLE, BMI_CATEGORY_PLAN_CHANGE_MESSAGE);
      }
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
        <ProfileScreenHeader
          title="Progress"
          titleClassName="text-3xl"
          showBackButton={false}
          className="mb-4"
          rightSlot={
            <Pressable
              onPress={() => {
                rememberBottomTabRoute("/progress");
                router.push("/profile");
              }}
              className="w-12 h-12 rounded-full border-2 border-[#b7ead1] overflow-hidden items-center justify-center"
              style={iconButtonStyle}
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={{ width: 48, height: 48 }} resizeMode="cover" />
              ) : (
                <Ionicons name="person-outline" size={22} color="#76C893" />
              )}
            </Pressable>
          }
        />

        {/* Segmented Control */}
        <View className="rounded-full p-1 flex-row" style={segmentTrackStyle}>
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
            <Text className="text-base font-extrabold tracking-wide flex-1 pr-2" style={textPrimary}>
              {metricLabel}
            </Text>
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
          </View>

          <View className="flex-row items-end justify-between mt-2 gap-3">
            <View className="flex-row items-end flex-wrap flex-1 min-w-0 gap-x-3 gap-y-1">
              <Text className="text-3xl font-extrabold shrink" style={textPrimary}>
                {metricValue.main}
              </Text>
              <View
                className={`px-2 py-1 rounded-full mb-1 ${
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
              {tab === "workout" && workoutTodayBurnKcal ? (
                <Text className="text-sm font-semibold mb-1" style={textMuted}>
                  Today burned{" "}
                  <Text className="font-extrabold" style={{ color: theme.accentText }}>
                    {workoutTodayBurnKcal}
                  </Text>{" "}
                  kcal
                </Text>
              ) : null}
              {tab === "meal" && mealTodayConsumeKcal ? (
                <Text className="text-sm font-semibold mb-1" style={textMuted}>
                  Today consumed{" "}
                  <Text className="font-extrabold" style={{ color: theme.accentText }}>
                    {mealTodayConsumeKcal}
                  </Text>{" "}
                  kcal
                </Text>
              ) : null}
            </View>
            <Pressable onPress={openDetails} className="active:opacity-80 shrink-0 mb-1">
              <Text className="text-base font-extrabold text-[#52B69A]">SEE ALL &gt;</Text>
            </Pressable>
          </View>

          {/* Chart */}
          <View className="mt-4">
            <View className="h-32 rounded-2xl overflow-hidden" style={{ backgroundColor: theme.rowBg }}>
              <View className="absolute left-0 right-0 bottom-0 h-14 bg-[#76C893] opacity-10" />
              {((tab === "weight" && weightBarTooltip) ||
                (tab === "workout" && workoutBarTooltip) ||
                (tab === "meal" && mealBarTooltip)) &&
                hoverIdx != null && (
                  <View className="absolute top-2 left-0 right-0 items-center">
                    <View className="px-3 py-1 rounded-full" style={cardStyle}>
                      <Text className="text-xs font-bold" style={textSecondary}>
                        {tab === "weight"
                          ? weightBarTooltip
                          : tab === "workout"
                            ? workoutBarTooltip
                            : mealBarTooltip}
                      </Text>
                    </View>
                  </View>
                )}
              {tab === "weight" ? (
                <View className="flex-1 flex-row items-end px-4 pb-2">
                  {(() => {
                    const padded = weightSeries.length ? weightSeries : chartLabels.map(() => 0);

                    return padded.map((v, idx) => {
                      const h = weightBarHeight(v, padded);
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

                    return padded.map((v, idx) => {
                      const h = weightBarHeight(v, padded);
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
                <View className="flex-1 flex-row items-end px-4 pb-2">
                  {(() => {
                    const padded = mealSeries.length ? mealSeries : chartLabels.map(() => 0);

                    return padded.map((v, idx) => {
                      const h = weightBarHeight(v, padded);
                      const active = hoverIdx === idx;
                      return (
                        <View key={`mbar-${idx}`} className="flex-1 items-center justify-end">
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
              )}
            </View>
          </View>
        </View>

        {/* Daily steps + water */}
        <View className="mt-4 gap-3">
          <View className="flex-row gap-4 items-stretch">
            <ProgressMetricCard
              cardKey="dailySteps"
              title="Daily Steps"
              icon={<Ionicons name="walk-outline" size={18} color="#ffffff" />}
              onPress={() => router.push("/step-progress" as any)}
            >
              <ProgressMetricLabel>TODAY&apos;S TOTAL</ProgressMetricLabel>
              <ProgressMetricValue>{displaySteps.toLocaleString()} steps</ProgressMetricValue>
              <ProgressMetricDetail>
                {stepSource === "pending"
                  ? "Setting up auto tracking…"
                  : stepSource === "pedometer"
                    ? "Phone step counter (walking & daily movement)"
                    : stepSource === "accelerometer"
                      ? "Estimated steps while walking"
                      : "Not available on this device"}
              </ProgressMetricDetail>
              {stepSource === "pending" || stepSource === "pedometer" || stepSource === "accelerometer" ? (
                <ProgressMetricLink bright>Tap for progress</ProgressMetricLink>
              ) : (
                <View className="mt-auto" />
              )}
            </ProgressMetricCard>

            <ProgressMetricCard
              cardKey="waterIntake"
              title="Water Intake"
              icon={<Ionicons name="water-outline" size={18} color="#ffffff" />}
              onPress={() => router.push("/water-intake" as any)}
            >
              <ProgressMetricLabel>TODAY&apos;S TOTAL</ProgressMetricLabel>
              <ProgressMetricValue>{waterTotalTodayMl.toLocaleString()} ml</ProgressMetricValue>
              {waterPreviousSuggestedMl != null ? (
                <ProgressMetricDetail className="text-xs mt-1">
                  Previous · {waterPreviousPlaceName ?? "Previous location"}:{" "}
                  {waterPreviousSuggestedMl.toLocaleString()} ml suggested
                </ProgressMetricDetail>
              ) : null}
              {waterSuggestionLoading && waterSuggestedMl == null ? (
                <View className="flex-row items-center mt-1">
                  <ActivityIndicator color="#fde68a" size="small" />
                  <ProgressMetricDetail className="ml-2">
                    Calculating today&apos;s suggestion…
                  </ProgressMetricDetail>
                </View>
              ) : waterSuggestedMl != null ? (
                <ProgressMetricDetail>
                  Today&apos;s water intake suggestion:{" "}
                  <Text className="font-extrabold" style={{ color: "#fde68a" }}>
                    {waterSuggestedMl.toLocaleString()} ml
                  </Text>
                </ProgressMetricDetail>
              ) : (
                <ProgressMetricDetail>
                  Today suggestion:{" "}
                  <Text className="font-extrabold" style={{ color: "#fde68a" }}>
                    unavailable
                  </Text>
                </ProgressMetricDetail>
              )}
              <ProgressMetricLink bright>Tap to record</ProgressMetricLink>
            </ProgressMetricCard>
          </View>
        </View>

        {/* Achievements (moved from Home) */}
        <View className="mt-4">
          <ProgressFeatureCard
            cardKey="achievements"
            title="Achievements"
            subtitle={"Workout, meal, community\n& streak badges"}
            icon={<Ionicons name="trophy-outline" size={26} color="#52B69A" />}
            onPress={() => router.push("/achievements" as any)}
            large
          />
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

