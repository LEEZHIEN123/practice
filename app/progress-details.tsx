import { Pressable } from "@/components/Pressable";
import {
  ProfileScreenHeader,
  ThemedCard,
  ThemedScreen,
  ThemedText,
  useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import { formatCalendarDayKey } from "@/lib/calendarDay";
import {
  BMI_CATEGORY_PLAN_CHANGE_MESSAGE,
  BMI_CATEGORY_PLAN_CHANGE_TITLE,
  didBmiCategoryChange,
} from "@/lib/bmiRecommendation";
import { saveHomeUserCache } from "@/lib/homeUserCache";
import { getCurrentPeriodSlotIndex } from "@/lib/progressPeriodCurrent";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import {
  buildLatestWeightByDay,
  buildWeightBucketSeries,
  buildWeightSeriesForDays,
  progressBarHeight,
  resyncAutoFilledWeightsAfterDay,
  syncWeightAutoFillAtMidnight,
  type WeightLogRow,
} from "@/lib/weightAutoFill";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import Slider from "@react-native-community/slider";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

type TabKey = "weight" | "workout" | "meal";
type PeriodKey = "week" | "month" | "year";

type WeightRow = WeightLogRow;
type WorkoutRow = {
  id: string;
  title: string;
  burnedKcal: number;
  durationMin: number;
  createdAt: Date;
  dayKey: string;
};
type MealRow = { id: string; title: string; calories: number; createdAt: Date; dayKey: string };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const startOfWeekMon = (d: Date) => {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // Mon->0, Sun->6
  const out = startOfDay(d);
  out.setDate(out.getDate() - diff);
  return out;
};

const getCreatedAtDate = (v: any): Date | null => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v === "number") return new Date(v);
  return null;
};

const formatLongDate = (d: Date) => {
  try {
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d.toDateString();
  }
};

/** Clock time with hours, minutes, and seconds (locale-aware). */
const formatTimeHms = (d: Date) => {
  try {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return d.toLocaleTimeString();
  }
};

/** `durationMin` from logs is treated as minutes (may be fractional) → "M min S sec". */
const formatDurationMinSec = (durationMin: number) => {
  const totalSec = Math.max(0, Math.round(Number(durationMin) * 60));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} min ${s} sec`;
};

function isDateInSelectedPeriod(dayDate: Date, period: PeriodKey, anchor: Date): boolean {
  const day = startOfDay(dayDate);
  if (period === "week") {
    const weekStart = startOfWeekMon(anchor);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return day.getTime() >= weekStart.getTime() && day.getTime() <= weekEnd.getTime();
  }
  if (period === "month") {
    return day.getFullYear() === anchor.getFullYear() && day.getMonth() === anchor.getMonth();
  }
  return day.getFullYear() === anchor.getFullYear();
}

/** Month chart slots: days 1–7, 8–14, 15–21, 22–end. */
function monthWeekSlotIndex(day: Date): number {
  return Math.min(3, Math.floor((day.getDate() - 1) / 7));
}

function monthWeekRangeLabel(anchor: Date, slot: number): string {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const monthLastDay = new Date(y, m + 1, 0).getDate();
  const ranges: [number, number][] = [
    [1, Math.min(7, monthLastDay)],
    [8, Math.min(14, monthLastDay)],
    [15, Math.min(21, monthLastDay)],
    [22, monthLastDay],
  ];
  const [s, e] = ranges[slot] ?? [1, monthLastDay];
  return `W${slot + 1} ${s}-${e}`;
}

function yearMonthLabel(year: number, monthIndex: number): string {
  try {
    return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  } catch {
    return `${monthIndex + 1}/${year}`;
  }
}

/** Week → that day; month → week-of-month for that day; year → month of that day. */
function matchesPickedPeriodFilter(
  dayDate: Date,
  period: PeriodKey,
  picked: Date | null,
  calendarTz: string
): boolean {
  if (!picked) return true;
  if (period === "week") {
    return formatCalendarDayKey(dayDate, calendarTz) === formatCalendarDayKey(picked, calendarTz);
  }
  if (period === "month") {
    return (
      dayDate.getFullYear() === picked.getFullYear() &&
      dayDate.getMonth() === picked.getMonth() &&
      monthWeekSlotIndex(dayDate) === monthWeekSlotIndex(picked)
    );
  }
  return dayDate.getFullYear() === picked.getFullYear() && dayDate.getMonth() === picked.getMonth();
}

function periodRecordHint(period: PeriodKey): string {
  if (period === "week") return "Records by day for the selected week. Pick a day to filter.";
  if (period === "month")
    return "Records by week of the month (same as the chart). Pick a day to see that week.";
  return "Records by month for the selected year. Pick a day to see that month.";
}

function periodPickChipLabel(period: PeriodKey): string {
  if (period === "week") return "Pick a day";
  if (period === "month") return "Pick a week";
  return "Pick a month";
}

function periodAllChipLabel(period: PeriodKey): string {
  if (period === "week") return "All days";
  if (period === "month") return "All weeks";
  return "All months";
}

type DayRecordGroup<T> = {
  dateKey: string;
  dayDate: Date;
  entries: T[];
  total: number;
};

type PeriodRecordSection<T> = {
  key: string;
  eyebrow: string;
  title: string;
  isCurrent: boolean;
  dayGroups: DayRecordGroup<T>[];
  total: number;
};

function orderSlotIndexes(slots: number[], currentSlot: number | null): number[] {
  if (currentSlot == null || !slots.includes(currentSlot)) {
    return [...slots].sort((a, b) => b - a);
  }
  return [
    currentSlot,
    ...slots.filter((s) => s < currentSlot).sort((a, b) => b - a),
    ...slots.filter((s) => s > currentSlot).sort((a, b) => a - b),
  ];
}

function buildPeriodRecordSections<T>(
  dayGroups: DayRecordGroup<T>[],
  period: PeriodKey,
  anchor: Date,
  picked: Date | null,
  calendarTz: string,
  todayKey: string,
  currentSlot: number | null
): PeriodRecordSection<T>[] {
  const inPeriod = dayGroups.filter((g) => isDateInSelectedPeriod(g.dayDate, period, anchor));
  const filtered = inPeriod.filter((g) =>
    matchesPickedPeriodFilter(g.dayDate, period, picked, calendarTz)
  );

  if (period === "week") {
    return filtered.map((g) => ({
      key: g.dateKey,
      eyebrow: "DAY",
      title: formatLongDate(g.dayDate),
      isCurrent: g.dateKey === todayKey,
      dayGroups: [g],
      total: g.total,
    }));
  }

  if (period === "month") {
    const bySlot = new Map<number, DayRecordGroup<T>[]>();
    for (const g of filtered) {
      const slot = monthWeekSlotIndex(g.dayDate);
      const list = bySlot.get(slot);
      if (list) list.push(g);
      else bySlot.set(slot, [g]);
    }
    return orderSlotIndexes([...bySlot.keys()], currentSlot).map((slot) => {
      const days = (bySlot.get(slot) ?? []).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
      return {
        key: `month-w${slot}`,
        eyebrow: "WEEK",
        title: monthWeekRangeLabel(anchor, slot),
        isCurrent: currentSlot === slot,
        dayGroups: days,
        total: days.reduce((s, d) => s + d.total, 0),
      };
    });
  }

  const year = anchor.getFullYear();
  const byMonth = new Map<number, DayRecordGroup<T>[]>();
  for (const g of filtered) {
    const m = g.dayDate.getMonth();
    const list = byMonth.get(m);
    if (list) list.push(g);
    else byMonth.set(m, [g]);
  }
  return orderSlotIndexes([...byMonth.keys()], currentSlot).map((monthIdx) => {
    const days = (byMonth.get(monthIdx) ?? []).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    return {
      key: `year-m${monthIdx}`,
      eyebrow: "MONTH",
      title: yearMonthLabel(year, monthIdx),
      isCurrent: currentSlot === monthIdx,
      dayGroups: days,
      total: days.reduce((s, d) => s + d.total, 0),
    };
  });
}

function pickedPeriodFilterLabel(period: PeriodKey, picked: Date, anchor: Date): string {
  if (period === "week") return formatLongDate(picked);
  if (period === "month") return monthWeekRangeLabel(anchor, monthWeekSlotIndex(picked));
  return yearMonthLabel(picked.getFullYear(), picked.getMonth());
}

export default function ProgressDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string; period?: string }>();
  const {
    cardStyle,
    segmentTrackStyle,
    segmentActiveStyle,
    theme,
  } = useThemedScreen();
  const { inputStyle, modalCardStyle, placeholderColor } = useProfileCardStyles();

  const tab = (params.tab === "workout" || params.tab === "meal" || params.tab === "weight"
    ? params.tab
    : "weight") as TabKey;
  const initialPeriod = (params.period === "month" || params.period === "year" || params.period === "week"
    ? params.period
    : "week") as PeriodKey;

  const [period, setPeriod] = useState<PeriodKey>(initialPeriod);
  const [anchor, setAnchor] = useState<Date>(new Date());

  const [allWeightRows, setAllWeightRows] = useState<WeightRow[]>([]);
  const [currentWeightKg, setCurrentWeightKg] = useState<number>(0);
  const [heightCm, setHeightCm] = useState<number>(0);
  const [weightSeries, setWeightSeries] = useState<number[]>(
    initialPeriod === "week" ? Array(7).fill(0) : initialPeriod === "month" ? Array(4).fill(0) : Array(12).fill(0)
  );
  const [windowWeights, setWindowWeights] = useState<{ label: string; date: Date; weight: number }[]>([]);
  const [allWorkoutRows, setAllWorkoutRows] = useState<WorkoutRow[]>([]);
  const [workoutSeries, setWorkoutSeries] = useState<number[]>(() => Array(7).fill(0));
  const [workoutRecentDay, setWorkoutRecentDay] = useState<Date | null>(null);
  const [workoutDayPickerOpen, setWorkoutDayPickerOpen] = useState(false);
  const [allMealRows, setAllMealRows] = useState<MealRow[]>([]);
  const [mealSeries, setMealSeries] = useState<number[]>(() => Array(7).fill(0));
  const [mealRecentDay, setMealRecentDay] = useState<Date | null>(null);
  const [mealDayPickerOpen, setMealDayPickerOpen] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const calendarTz = useUserCalendarTimezone();

  const [logVisible, setLogVisible] = useState(false);
  const [logWeightText, setLogWeightText] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [logDate, setLogDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isEditingRecentWeight, setIsEditingRecentWeight] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [workoutHoverIdx, setWorkoutHoverIdx] = useState<number | null>(null);
  const [mealHoverIdx, setMealHoverIdx] = useState<number | null>(null);
  const [dayTick, setDayTick] = useState(0);

  const sanitizeDecimal = (t: string) => {
    const cleaned = t.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    const [a, b] = cleaned.split(".");
    if (b === undefined) return a ?? "";
    return `${a ?? ""}.${b.slice(0, 1)}`;
  };

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

  useEffect(() => {
    const id = setInterval(() => setDayTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || tab !== "weight") return;

    const unsubUser = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) {
          setCurrentWeightKg(0);
          setHeightCm(0);
          return;
        }
        const data = snap.data() as { weight?: number; height?: number };
        const w =
          typeof data?.weight === "number" && Number.isFinite(data.weight) ? data.weight : 0;
        const h =
          typeof data?.height === "number" && Number.isFinite(data.height) ? data.height : 0;
        setCurrentWeightKg(w);
        setHeightCm(h);
      },
      () => {
        setCurrentWeightKg(0);
        setHeightCm(0);
      }
    );

    const q = query(
      collection(db, "users", user.uid, "weightLogs"),
      orderBy("createdAt", "desc"),
      limit(600)
    );
    const unsubLogs = onSnapshot(
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
          .filter((r) => typeof r.weight === "number" && r.createdAt instanceof Date) as WeightRow[];
        setAllWeightRows(rows);
      },
      () => setAllWeightRows([])
    );

    return () => {
      unsubUser();
      unsubLogs();
    };
  }, [tab]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || tab !== "weight" || currentWeightKg <= 0) return;
    void syncWeightAutoFillAtMidnight({
      uid: user.uid,
      weightKg: currentWeightKg,
      calendarTz,
      existingRows: allWeightRows,
    }).catch((e) => console.log("weight auto-fill failed:", e));
  }, [allWeightRows, calendarTz, currentWeightKg, dayTick, tab]);

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      if (!user) return;

      if (tab === "workout") {
        const q = query(collection(db, "users", user.uid, "workoutLogs"), orderBy("createdAt", "desc"), limit(600));
        const snap = await getDocs(q);
        const rows = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const createdAt = getCreatedAtDate(data.createdAt) ?? new Date();
            const burnedKcal = typeof data.burnedKcal === "number" ? data.burnedKcal : 0;
            return {
              id: d.id,
              title: typeof data.title === "string" ? data.title : "Workout",
              burnedKcal,
              durationMin: typeof data.durationMin === "number" ? data.durationMin : 0,
              createdAt,
              dayKey: formatCalendarDayKey(createdAt, calendarTz),
            };
          })
          .filter((r) => Math.round(r.burnedKcal) > 0) as WorkoutRow[];
        setAllWorkoutRows(rows);
        return;
      }

      const q = query(collection(db, "users", user.uid, "mealLogs"), orderBy("createdAt", "desc"), limit(600));
      const snap = await getDocs(q);
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .map((r) => {
          const createdAt = getCreatedAtDate(r.logDate) ?? getCreatedAtDate(r.createdAt) ?? new Date();
          return {
            id: r.id,
            title: typeof r.title === "string" ? r.title : "Meal",
            calories: typeof r.calories === "number" ? r.calories : 0,
            createdAt,
            dayKey: formatCalendarDayKey(createdAt, calendarTz),
          };
        })
        .filter((r) => Math.round(r.calories) > 0) as MealRow[];
      setAllMealRows(rows);
    };

    load();
  }, [tab, calendarTz]);

  const headerTitle = tab === "weight" ? "Weight Progress" : tab === "workout" ? "Workout Progress" : "Meal Progress";

  const chartLabels = useMemo(() => {
    if (period === "week") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    if (period === "month") {
      const y = anchor.getFullYear();
      const m = anchor.getMonth();
      const monthLastDay = new Date(y, m + 1, 0).getDate();
      const ranges: [number, number][] = [
        [1, Math.min(7, monthLastDay)],
        [8, Math.min(14, monthLastDay)],
        [15, Math.min(21, monthLastDay)],
        [22, monthLastDay],
      ];
      return ranges.map(([s, e], i) => `W${i + 1} ${s}-${e}`);
    }
    return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  }, [anchor, period]);

  const title = useMemo(() => {
    if (period === "week") {
      const ws = startOfWeekMon(anchor);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      return `${ws.getMonth() + 1}/${ws.getDate()} - ${we.getMonth() + 1}/${we.getDate()}`;
    }
    if (period === "month") return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;
    return String(anchor.getFullYear());
  }, [anchor, period]);

  const periodWeightDeltaKg = useMemo(() => {
    if (tab !== "weight" || !weightSeries.length) return 0;
    const firstIdx = weightSeries.findIndex((v) => v > 0);
    if (firstIdx === -1) return 0;
    let lastIdx = -1;
    for (let i = weightSeries.length - 1; i >= 0; i--) {
      if (weightSeries[i] > 0) {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx === -1 || lastIdx === firstIdx) return 0;
    return weightSeries[lastIdx] - weightSeries[firstIdx];
  }, [tab, weightSeries]);

  useEffect(() => {
    if (tab !== "weight") return;

    const rows = allWeightRows;
    const latestByDay = buildLatestWeightByDay(rows, calendarTz);
    const todayKey = formatCalendarDayKey(new Date(), calendarTz);
    const currentSlotIndex = getCurrentPeriodSlotIndex(period, anchor);

    if (period === "week") {
      const weekStart = startOfWeekMon(anchor);
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      });
      const keys = days.map((d) => formatCalendarDayKey(d, calendarTz));
      const series = buildWeightSeriesForDays(keys, latestByDay, currentWeightKg, todayKey);
      setWeightSeries(series);
      // Weight Record: only days up to today (no future day rows / edit options).
      setWindowWeights(
        days
          .map((d, idx) => ({
            label: chartLabels[idx],
            date: d,
            weight: series[idx] ?? 0,
          }))
          .filter((row) => formatCalendarDayKey(row.date, calendarTz) <= todayKey)
      );
      return;
    }

    if (period === "month") {
      const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const latestByWeek = new Map<number, { weight: number; createdAt: Date }>();
      for (const r of rows) {
        if (r.autoFilled) continue;
        if (r.createdAt < monthStart) continue;
        if (r.createdAt.getMonth() !== anchor.getMonth() || r.createdAt.getFullYear() !== anchor.getFullYear()) continue;
        const dom = r.createdAt.getDate();
        const idx = Math.min(3, Math.floor((dom - 1) / 7));
        const prev = latestByWeek.get(idx);
        if (!prev || r.createdAt.getTime() > prev.createdAt.getTime()) {
          latestByWeek.set(idx, { weight: r.weight, createdAt: r.createdAt });
        }
      }
      const bucketValues = [0, 0, 0, 0].map((_, i) => latestByWeek.get(i)?.weight ?? null);
      const series = buildWeightBucketSeries(bucketValues, currentSlotIndex, currentWeightKg);
      setWeightSeries(series);
      const monthLastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
      const ranges: [number, number][] = [
        [1, Math.min(7, monthLastDay)],
        [8, Math.min(14, monthLastDay)],
        [15, Math.min(21, monthLastDay)],
        [22, monthLastDay],
      ];
      const fmtDmy = (day: number) => `${day}/${anchor.getMonth() + 1}/${anchor.getFullYear()}`;
      setWindowWeights(
        series
          .map((w, idx) => ({
            label: `Week ${idx + 1} (${fmtDmy(ranges[idx][0])}-${fmtDmy(ranges[idx][1])})`,
            date: monthStart,
            weight: w,
            slotIndex: idx,
          }))
          .filter((row) => currentSlotIndex == null || row.slotIndex <= currentSlotIndex)
          .map(({ label, date, weight }) => ({ label, date, weight }))
      );
      return;
    }

    const year = anchor.getFullYear();
    const sums = Array.from({ length: 12 }, () => 0);
    const counts = Array.from({ length: 12 }, () => 0);
    for (const r of rows) {
      if (r.autoFilled) continue;
      if (r.createdAt.getFullYear() !== year) continue;
      const m = r.createdAt.getMonth();
      sums[m] += r.weight;
      counts[m] += 1;
    }
    const bucketValues = sums.map((sum, i) => (counts[i] ? sum / counts[i] : null));
    const series = buildWeightBucketSeries(bucketValues, currentSlotIndex, currentWeightKg);
    setWeightSeries(series);
    setWindowWeights(
      series
        .map((w, idx) => ({
          label: new Date(year, idx, 1).toLocaleDateString(undefined, { month: "long" }),
          date: new Date(year, idx, 1),
          weight: w,
          slotIndex: idx,
        }))
        .filter((row) => currentSlotIndex == null || row.slotIndex <= currentSlotIndex)
        .map(({ label, date, weight }) => ({ label, date, weight }))
    );
  }, [allWeightRows, anchor, calendarTz, chartLabels, currentWeightKg, period, tab]);

  useEffect(() => {
    if (tab !== "workout") return;
    const rows = allWorkoutRows;
    if (period === "week") {
      const weekStart = startOfWeekMon(anchor);
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      });
      const sums = days.map((d) => {
        const key = formatCalendarDayKey(d, calendarTz);
        return rows.filter((r) => r.dayKey === key).reduce((s, r) => s + r.burnedKcal, 0);
      });
      setWorkoutSeries(sums);
      return;
    }
    if (period === "month") {
      const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const buckets = [0, 0, 0, 0];
      for (const r of rows) {
        if (r.createdAt < monthStart) continue;
        if (r.createdAt.getMonth() !== anchor.getMonth() || r.createdAt.getFullYear() !== anchor.getFullYear())
          continue;
        const dom = r.createdAt.getDate();
        const idx = Math.min(3, Math.floor((dom - 1) / 7));
        buckets[idx] += r.burnedKcal;
      }
      setWorkoutSeries(buckets);
      return;
    }
    const year = anchor.getFullYear();
    const sums = Array.from({ length: 12 }, () => 0);
    for (const r of rows) {
      if (r.createdAt.getFullYear() !== year) continue;
      sums[r.createdAt.getMonth()] += r.burnedKcal;
    }
    setWorkoutSeries(sums);
  }, [allWorkoutRows, anchor, calendarTz, period, tab]);

  const groupedWorkouts = useMemo(() => {
    const map = new Map<string, WorkoutRow[]>();
    for (const r of allWorkoutRows) {
      const list = map.get(r.dayKey);
      if (list) list.push(r);
      else map.set(r.dayKey, [r]);
    }
    const keys = [...map.keys()]
      .filter((k): k is string => typeof k === "string" && k.length > 0)
      .sort((a, b) => b.localeCompare(a));
    return keys.map((dateKey) => {
      const entries = [...(map.get(dateKey) ?? [])].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      const total = entries.reduce((s, e) => s + e.burnedKcal, 0);
      const parts = dateKey.split("-");
      const yy = parseInt(parts[0] ?? "0", 10);
      const mm = parseInt(parts[1] ?? "1", 10);
      const dd = parseInt(parts[2] ?? "1", 10);
      const dayDate = new Date(yy, mm - 1, dd);
      return { dateKey, entries, total, dayDate };
    });
  }, [allWorkoutRows]);

  const filteredGroupedWorkouts = useMemo(() => {
    return buildPeriodRecordSections(
      groupedWorkouts,
      period,
      anchor,
      workoutRecentDay,
      calendarTz,
      formatCalendarDayKey(new Date(), calendarTz),
      getCurrentPeriodSlotIndex(period, anchor)
    );
  }, [anchor, calendarTz, dayTick, groupedWorkouts, period, workoutRecentDay]);

  const workoutRecentFilterLabel = useMemo(() => {
    if (!workoutRecentDay) return null;
    return pickedPeriodFilterLabel(period, workoutRecentDay, anchor);
  }, [anchor, period, workoutRecentDay]);

  /** Align bar count with chart period (avoids length mismatch before effects run). */
  const workoutBarsForChart = useMemo(() => {
    const len = period === "week" ? 7 : period === "month" ? 4 : 12;
    return Array.from({ length: len }, (_, i) => workoutSeries[i] ?? 0);
  }, [workoutSeries, period]);

  useEffect(() => {
    setWorkoutRecentDay(null);
    setWorkoutDayPickerOpen(false);
  }, [period]);

  useEffect(() => {
    if (tab !== "meal") return;
    const rows = allMealRows;
    if (period === "week") {
      const weekStart = startOfWeekMon(anchor);
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      });
      const sums = days.map((d) => {
        const key = formatCalendarDayKey(d, calendarTz);
        return rows.filter((r) => r.dayKey === key).reduce((s, r) => s + r.calories, 0);
      });
      setMealSeries(sums);
      return;
    }
    if (period === "month") {
      const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const buckets = [0, 0, 0, 0];
      for (const r of rows) {
        if (r.createdAt < monthStart) continue;
        if (r.createdAt.getMonth() !== anchor.getMonth() || r.createdAt.getFullYear() !== anchor.getFullYear()) continue;
        const dom = r.createdAt.getDate();
        const idx = Math.min(3, Math.floor((dom - 1) / 7));
        buckets[idx] += r.calories;
      }
      setMealSeries(buckets);
      return;
    }
    const year = anchor.getFullYear();
    const sums = Array.from({ length: 12 }, () => 0);
    for (const r of rows) {
      if (r.createdAt.getFullYear() !== year) continue;
      sums[r.createdAt.getMonth()] += r.calories;
    }
    setMealSeries(sums);
  }, [allMealRows, anchor, calendarTz, period, tab]);

  const groupedMeals = useMemo(() => {
    const map = new Map<string, MealRow[]>();
    for (const r of allMealRows) {
      const list = map.get(r.dayKey);
      if (list) list.push(r);
      else map.set(r.dayKey, [r]);
    }
    const keys = [...map.keys()]
      .filter((k): k is string => typeof k === "string" && k.length > 0)
      .sort((a, b) => b.localeCompare(a));
    return keys.map((dateKey) => {
      const entries = [...(map.get(dateKey) ?? [])].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const total = entries.reduce((s, e) => s + e.calories, 0);
      const parts = dateKey.split("-");
      const yy = parseInt(parts[0] ?? "0", 10);
      const mm = parseInt(parts[1] ?? "1", 10);
      const dd = parseInt(parts[2] ?? "1", 10);
      const dayDate = new Date(yy, mm - 1, dd);
      return { dateKey, entries, total, dayDate };
    });
  }, [allMealRows]);

  const filteredGroupedMeals = useMemo(() => {
    return buildPeriodRecordSections(
      groupedMeals,
      period,
      anchor,
      mealRecentDay,
      calendarTz,
      formatCalendarDayKey(new Date(), calendarTz),
      getCurrentPeriodSlotIndex(period, anchor)
    );
  }, [anchor, calendarTz, dayTick, groupedMeals, mealRecentDay, period]);

  const mealRecentFilterLabel = useMemo(() => {
    if (!mealRecentDay) return null;
    return pickedPeriodFilterLabel(period, mealRecentDay, anchor);
  }, [anchor, mealRecentDay, period]);

  useEffect(() => {
    setMealRecentDay(null);
    setMealDayPickerOpen(false);
  }, [period]);

  const mealBarsForChart = useMemo(() => {
    const len = period === "week" ? 7 : period === "month" ? 4 : 12;
    return Array.from({ length: len }, (_, i) => mealSeries[i] ?? 0);
  }, [mealSeries, period]);

  const goPrev = () => {
    const d = new Date(anchor);
    if (period === "week") d.setDate(d.getDate() - 7);
    else if (period === "month") d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    setWorkoutRecentDay(null);
    setMealRecentDay(null);
    setWorkoutDayPickerOpen(false);
    setMealDayPickerOpen(false);
    setAnchor(d);
  };

  const goNext = () => {
    const d = new Date(anchor);
    const now = new Date();
    if (period === "week") d.setDate(d.getDate() + 7);
    else if (period === "month") d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    if (d > now) return;
    setWorkoutRecentDay(null);
    setMealRecentDay(null);
    setWorkoutDayPickerOpen(false);
    setMealDayPickerOpen(false);
    setAnchor(d);
  };

  const canGoNext = useMemo(() => {
    const now = new Date();
    if (period === "week") {
      const currentWeekStart = startOfWeekMon(now).getTime();
      const anchorWeekStart = startOfWeekMon(anchor).getTime();
      return anchorWeekStart < currentWeekStart;
    }
    if (period === "month") {
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const anchorMonthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1).getTime();
      return anchorMonthStart < currentMonthStart;
    }
    return anchor.getFullYear() < now.getFullYear();
  }, [anchor, period]);

  const currentPeriodSlotIndex = useMemo(() => getCurrentPeriodSlotIndex(period, anchor), [period, anchor]);

  const periodPickerBounds = useMemo(() => {
    const today = startOfDay(new Date());
    // Any past day through today is selectable — empty record days stay clickable too.
    return {
      minimumDate: new Date(today.getFullYear() - 10, 0, 1),
      maximumDate: today,
    };
  }, [dayTick]);

  const clampPickerDate = useCallback((date: Date) => {
    const day = startOfDay(date);
    const min = startOfDay(periodPickerBounds.minimumDate);
    const max = startOfDay(periodPickerBounds.maximumDate);
    if (day.getTime() < min.getTime()) return min;
    if (day.getTime() > max.getTime()) return max;
    return day;
  }, [periodPickerBounds.maximumDate, periodPickerBounds.minimumDate]);

  const applyPickedRecordDay = useCallback(
    (rawDate: Date, which: "workout" | "meal") => {
      const picked = clampPickerDate(rawDate);
      if (which === "workout") setWorkoutRecentDay(picked);
      else setMealRecentDay(picked);

      // Keep the chart period aligned with the picked day so empty past days still filter correctly.
      if (period === "week") setAnchor(picked);
      else if (period === "month") {
        setAnchor(new Date(picked.getFullYear(), picked.getMonth(), 1));
      } else {
        setAnchor(new Date(picked.getFullYear(), 0, 1));
      }
    },
    [clampPickerDate, period]
  );

  useEffect(() => {
    setWorkoutHoverIdx(null);
    setMealHoverIdx(null);
  }, [tab, period, anchor]);

  const workoutBarTooltip = useMemo(() => {
    if (tab !== "workout") return "";
    if (workoutHoverIdx == null) return "";
    const idx = workoutHoverIdx;
    const v = workoutBarsForChart[idx] ?? 0;
    const kcalStr = `${Math.round(v).toLocaleString()} kcal burned`;
    if (period === "week") {
      const ws = startOfWeekMon(anchor);
      const d = new Date(ws);
      d.setDate(d.getDate() + idx);
      const dateStr = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
      return `${dateStr}\n${kcalStr}`;
    }
    if (period === "month") {
      const lbl = chartLabels[idx] ?? "";
      return `${lbl}\n${kcalStr}`;
    }
    const monthTitle = new Date(anchor.getFullYear(), idx, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    return `${monthTitle}\n${kcalStr}`;
  }, [anchor, chartLabels, period, tab, workoutBarsForChart, workoutHoverIdx]);

  const mealBarTooltip = useMemo(() => {
    if (tab !== "meal") return "";
    if (mealHoverIdx == null) return "";
    const idx = mealHoverIdx;
    const v = mealBarsForChart[idx] ?? 0;
    const kcalStr = `${Math.round(v).toLocaleString()} kcal consumed`;
    if (period === "week") {
      const ws = startOfWeekMon(anchor);
      const d = new Date(ws);
      d.setDate(d.getDate() + idx);
      const dateStr = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
      return `${dateStr}\n${kcalStr}`;
    }
    if (period === "month") {
      const lbl = chartLabels[idx] ?? "";
      return `${lbl}\n${kcalStr}`;
    }
    const monthTitle = new Date(anchor.getFullYear(), idx, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    return `${monthTitle}\n${kcalStr}`;
  }, [anchor, chartLabels, mealBarsForChart, mealHoverIdx, period, tab]);

  const weightBarTooltip = useMemo(() => {
    if (tab !== "weight") return "";
    if (hoverIdx == null) return "";
    if (period === "week") {
      const ws = startOfWeekMon(anchor);
      const d = new Date(ws);
      d.setDate(d.getDate() + hoverIdx);
      const v = weightSeries[hoverIdx] ?? 0;
      const shortDate = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
      return `${shortDate}: ${v ? `${v.toFixed(1)} kg` : "—"}`;
    }
    const label = chartLabels[hoverIdx] ?? "";
    const v = weightSeries[hoverIdx] ?? 0;
    return `${label}: ${v ? `${v.toFixed(1)} kg` : "—"}`;
  }, [anchor, chartLabels, hoverIdx, period, tab, weightSeries]);

  const openLogWeight = () => {
    const base = currentWeightKg > 0 ? currentWeightKg : 0;
    setLogWeightText(base ? base.toFixed(1) : "");
    setLogDate(new Date());
    setIsEditingRecentWeight(false);
    setShowDatePicker(false);
    setLogVisible(true);
  };

  const openEditWeightFor = (date: Date, baseWeight?: number) => {
    const today = startOfDay(new Date());
    const day = startOfDay(date);
    if (day.getTime() > today.getTime()) {
      Alert.alert("Unavailable", "You can only record weight for today or past days.");
      return;
    }
    setLogDate(day);
    setLogWeightText(typeof baseWeight === "number" && Number.isFinite(baseWeight) && baseWeight > 0 ? baseWeight.toFixed(1) : "");
    setIsEditingRecentWeight(true);
    setShowDatePicker(false);
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

    const today = startOfDay(new Date());
    const day = startOfDay(logDate);
    if (day.getTime() > today.getTime()) {
      Alert.alert("Unavailable", "You can only record weight for today or past days.");
      return;
    }

    try {
      setSavingLog(true);
      const nextW = clamp(parsedW, 30, 200);
      const h = heightCm;
      const m = h ? h / 100 : 0;
      const previousBmi = m && currentWeightKg > 0 ? currentWeightKg / (m * m) : null;
      const nextBmi = m ? nextW / (m * m) : 0;
      const todayKey = formatCalendarDayKey(today, calendarTz);
      const editedDayKey = formatCalendarDayKey(day, calendarTz);
      const isToday = editedDayKey === todayKey;

      // Profile weight / BMI only follow today's log — past-day edits stay historical.
      if (isToday) {
        await updateDoc(doc(db, "users", user.uid), {
          weight: nextW,
          bmi: h ? Number(nextBmi.toFixed(2)) : undefined,
        });
        setCurrentWeightKg(nextW);
        void saveHomeUserCache(user.uid, { weight: nextW });
      }

      await addDoc(collection(db, "users", user.uid, "weightLogs"), {
        weight: nextW,
        createdAt: serverTimestamp(),
        logDate: Timestamp.fromDate(day),
      });

      await resyncAutoFilledWeightsAfterDay({
        uid: user.uid,
        editedDayKey,
        newWeightKg: nextW,
        calendarTz,
        existingRows: allWeightRows,
      }).catch((e) => console.log("weight auto-fill resync failed:", e));

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

  useEffect(() => {
    setManageMode(false);
    setDeletingId(null);
  }, [tab]);

  const confirmDeleteWorkout = (row: WorkoutRow) => {
    Alert.alert(
      "Delete this workout?",
      `Remove "${row.title}" (${Math.round(row.burnedKcal)} kcal) from your workout history?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const user = auth.currentUser;
              if (!user) return;
              try {
                setDeletingId(row.id);
                await deleteDoc(doc(db, "users", user.uid, "workoutLogs", row.id));
                const kcal = Math.round(row.burnedKcal);
                if (kcal > 0 && row.dayKey) {
                  await updateDoc(doc(db, "users", user.uid, "dailyStats", row.dayKey), {
                    burnedKcal: increment(-kcal),
                    updatedAt: serverTimestamp(),
                  }).catch(() => {});
                }
                setAllWorkoutRows((prev) => prev.filter((r) => r.id !== row.id));
              } catch (e) {
                console.log("Delete workout log failed:", e);
                Alert.alert("Error", "Could not delete this workout record.");
              } finally {
                setDeletingId(null);
              }
            })();
          },
        },
      ]
    );
  };

  const confirmDeleteMeal = (row: MealRow) => {
    Alert.alert(
      "Delete this meal?",
      `Remove "${row.title}" (${Math.round(row.calories)} kcal) from your meal history?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const user = auth.currentUser;
              if (!user) return;
              try {
                setDeletingId(row.id);
                await deleteDoc(doc(db, "users", user.uid, "mealLogs", row.id));
                const kcal = Math.round(row.calories);
                if (kcal > 0 && row.dayKey) {
                  await updateDoc(doc(db, "users", user.uid, "dailyStats", row.dayKey), {
                    consumedKcal: increment(-kcal),
                    updatedAt: serverTimestamp(),
                  }).catch(() => {});
                }
                setAllMealRows((prev) => prev.filter((r) => r.id !== row.id));
              } catch (e) {
                console.log("Delete meal log failed:", e);
                Alert.alert("Error", "Could not delete this meal record.");
              } finally {
                setDeletingId(null);
              }
            })();
          },
        },
      ]
    );
  };

  return (
    <ThemedScreen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="px-3" style={{ paddingTop: insets.top + 12 }}>
        <ProfileScreenHeader title={headerTitle} onBack={() => router.back()} titleClassName="text-xl" />

        {tab === "weight" ? (
          <>
            <ThemedCard className="p-5">
              <View className="flex-row items-center justify-between">
                <View>
                  <ThemedText className="text-base tracking-widest font-extrabold">GRAPH PERIOD</ThemedText>
                  <View className="flex-row items-center mt-2">
                    <ThemedText className="text-lg font-extrabold">{title}</ThemedText>
                    <View
                      className="ml-2 px-2 py-1 rounded-full"
                      style={{
                        backgroundColor: periodWeightDeltaKg < 0 ? theme.dangerSoft : theme.accentSoft,
                      }}
                    >
                      <ThemedText
                        className="text-xs font-bold"
                        style={{ color: periodWeightDeltaKg < 0 ? theme.danger : theme.accentText }}
                      >
                        {`${periodWeightDeltaKg >= 0 ? "+" : ""}${periodWeightDeltaKg.toFixed(1)} kg`}
                      </ThemedText>
                    </View>
                  </View>
                </View>
                <Pressable onPress={openLogWeight} className="px-4 py-2 rounded-full" style={{ backgroundColor: theme.accent }}>
                  <ThemedText className="font-extrabold" style={{ color: "#ffffff" }}>Log weight</ThemedText>
                </Pressable>
              </View>

              <View className="mt-4 rounded-full p-1 flex-row" style={segmentTrackStyle}>
                {(["week", "month", "year"] as const).map((k) => {
                  const active = period === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setPeriod(k)}
                      className="flex-1 py-3 rounded-full items-center"
                      style={active ? segmentActiveStyle : undefined}
                    >
                      <ThemedText variant={active ? "accent" : "muted"} className="font-bold">
                        {k === "week" ? "Week" : k === "month" ? "Month" : "Year"}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <View className="mt-4 flex-row items-center">
                <Pressable onPress={goPrev} className="w-8 h-40 items-center justify-center" hitSlop={12}>
                  <View className="w-8 h-8 rounded-full border items-center justify-center" style={cardStyle}>
                    <Ionicons name="chevron-back" size={18} color={theme.accent} />
                  </View>
                </Pressable>

                <View className="flex-1 mx-2">
                  <View className="h-40 rounded-2xl overflow-hidden justify-center" style={{ backgroundColor: theme.rowBg }}>
                    <View className="absolute left-0 right-0 bottom-0 h-16 opacity-10" style={{ backgroundColor: theme.accent }} />
                    {weightBarTooltip ? (
                      <View className="absolute top-2 left-2 right-2 items-center">
                        <View
                          className="px-3 py-1.5 rounded-full border"
                          style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                        >
                          <ThemedText variant="accent" className="text-[11px] font-bold">
                            {weightBarTooltip}
                          </ThemedText>
                        </View>
                      </View>
                    ) : null}
                    <View className="flex-1 flex-row items-end px-3 pb-3">
                      {weightSeries.map((v, idx) => {
                        const h = progressBarHeight(v, weightSeries, 12, 96);
                        return (
                          <Pressable
                            key={`wb-${idx}`}
                            onPress={() => setHoverIdx((prev) => (prev === idx ? null : idx))}
                            className="flex-1 items-center"
                            hitSlop={10}
                          >
                            <View
                              style={{
                                height: h,
                                width: 12,
                                borderRadius: 999,
                                backgroundColor:
                                  idx === hoverIdx
                                    ? theme.accentText
                                    : v === 0
                                      ? theme.iconMuted
                                      : theme.accent,
                              }}
                            />
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View className="flex-row mt-3 px-3">
                    {chartLabels.map((d, idx) => {
                      const isCurrentLabel =
                        currentPeriodSlotIndex !== null && idx === currentPeriodSlotIndex;
                      return (
                        <View key={`${d}-${idx}`} className="flex-1 items-center">
                          <ThemedText
                            className="text-[10px] font-bold"
                            style={{ color: isCurrentLabel ? theme.danger : theme.textMuted }}
                          >
                            {d}
                          </ThemedText>
                          {isCurrentLabel ? (
                            <ThemedText className="text-[9px] font-extrabold mt-0.5" style={{ color: theme.danger }}>
                              Current
                            </ThemedText>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </View>

                {canGoNext ? (
                  <Pressable onPress={goNext} className="w-8 h-40 items-center justify-center" hitSlop={12}>
                    <View className="w-8 h-8 rounded-full border items-center justify-center" style={cardStyle}>
                      <Ionicons name="chevron-forward" size={18} color={theme.accent} />
                    </View>
                  </Pressable>
                ) : (
                  <View className="w-8 h-40" />
                )}
              </View>
            </ThemedCard>

            <ThemedCard className="mt-5 p-5 pb-6">
              <ThemedText className="text-base tracking-widest font-extrabold">WEIGHT RECORD</ThemedText>
              <View className="mt-4 gap-3">
                {windowWeights.length === 0 ? (
                  <ThemedText variant="muted">No weight logs yet.</ThemedText>
                ) : (
                  (() => {
                    const entries = windowWeights.map((r, idx) => ({ r, idx }));
                    const ordered =
                      currentPeriodSlotIndex == null
                        ? entries.slice().reverse()
                        : [
                            ...entries.filter((e) => e.idx === currentPeriodSlotIndex),
                            ...entries.filter((e) => e.idx < currentPeriodSlotIndex).reverse(),
                            ...entries.filter((e) => e.idx > currentPeriodSlotIndex),
                          ];
                    return ordered.map(({ r, idx }) => {
                    const isCurrentRow =
                      currentPeriodSlotIndex !== null && idx === currentPeriodSlotIndex;
                    return (
                    <View
                      key={`${r.date.getTime()}-${idx}`}
                      className={`flex-row items-center justify-between rounded-2xl px-4 py-4 border ${
                        isCurrentRow ? "border-2" : ""
                      }`}
                      style={{
                        backgroundColor: theme.rowBg,
                        borderColor: isCurrentRow ? theme.danger : theme.cardBorder,
                      }}
                    >
                      <View className="flex-row items-center flex-1 flex-wrap pr-2">
                        <ThemedText variant="secondary" className="text-base font-bold">
                          {period === "week" ? formatLongDate(r.date) : r.label}
                        </ThemedText>
                        {isCurrentRow ? (
                          <ThemedText className="ml-2 text-xs font-extrabold" style={{ color: theme.danger }}>
                            Current
                          </ThemedText>
                        ) : null}
                      </View>
                      <View className="flex-row items-center">
                        <ThemedText className="text-base font-extrabold">
                          {r.weight ? `${r.weight.toFixed(1)} kg` : "—"}
                        </ThemedText>
                        <Pressable
                          onPress={() => openEditWeightFor(r.date, r.weight)}
                          hitSlop={10}
                          className="ml-3 w-9 h-9 rounded-full border items-center justify-center"
                          style={cardStyle}
                        >
                          <Ionicons name="create-outline" size={18} color={theme.textPrimary} />
                        </Pressable>
                      </View>
                    </View>
                    );
                  });
                  })()
                )}
              </View>
            </ThemedCard>
          </>
        ) : tab === "workout" ? (
          <>
            <ThemedCard className="p-5">
              <View className="flex-row items-center justify-between">
                <View>
                  <ThemedText className="text-base tracking-widest font-extrabold">GRAPH PERIOD</ThemedText>
                  <ThemedText className="text-lg font-extrabold mt-2">{title}</ThemedText>
                </View>
                <View className="px-3 py-2 rounded-2xl border" style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}>
                  <ThemedText variant="accent" className="text-[11px] font-bold">Auto-updates</ThemedText>
                </View>
              </View>

              <View className="mt-4 rounded-full p-1 flex-row" style={segmentTrackStyle}>
                {(["week", "month", "year"] as const).map((k) => {
                  const active = period === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setPeriod(k)}
                      className="flex-1 py-3 rounded-full items-center"
                      style={active ? segmentActiveStyle : undefined}
                    >
                      <ThemedText variant={active ? "accent" : "muted"} className="font-bold">
                        {k === "week" ? "Week" : k === "month" ? "Month" : "Year"}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <View className="mt-4 flex-row items-center">
                <Pressable onPress={goPrev} className="w-8 h-40 items-center justify-center" hitSlop={12}>
                  <View className="w-8 h-8 rounded-full border items-center justify-center" style={cardStyle}>
                    <Ionicons name="chevron-back" size={18} color={theme.accent} />
                  </View>
                </Pressable>

                <View className="flex-1 mx-2">
                  <View className="h-40 rounded-2xl overflow-hidden justify-center" style={{ backgroundColor: theme.rowBg }}>
                    <View className="absolute left-0 right-0 bottom-0 h-16 opacity-10" style={{ backgroundColor: theme.accent }} />
                    {workoutBarTooltip ? (
                      <View className="absolute top-2 left-2 right-2 items-center px-1">
                        <View
                          className="px-3 py-2 rounded-2xl border max-w-full"
                          style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                        >
                          <ThemedText variant="accent" className="text-[11px] font-bold text-center leading-5">
                            {workoutBarTooltip}
                          </ThemedText>
                        </View>
                      </View>
                    ) : null}
                    <View className="flex-1 flex-row items-end px-3 pb-3">
                      {(() => {
                        return workoutBarsForChart.map((v, idx) => {
                          const h = progressBarHeight(v, workoutBarsForChart, 12, 96);
                          const active = workoutHoverIdx === idx;
                          return (
                            <Pressable
                              key={`wk-${idx}`}
                              onPress={() => setWorkoutHoverIdx((prev) => (prev === idx ? null : idx))}
                              className="flex-1 items-center justify-end"
                              hitSlop={8}
                            >
                              <View
                                style={{
                                  height: h,
                                  width: active ? 14 : 12,
                                  borderRadius: 999,
                                  backgroundColor: v === 0 ? theme.iconMuted : active ? theme.accentText : theme.accent,
                                }}
                              />
                            </Pressable>
                          );
                        });
                      })()}
                    </View>
                  </View>

                  <View className="flex-row mt-3 px-3">
                    {chartLabels.map((d, idx) => {
                      const isCurrentLabel =
                        currentPeriodSlotIndex !== null && idx === currentPeriodSlotIndex;
                      return (
                        <View key={`${d}-${idx}`} className="flex-1 items-center">
                          <ThemedText
                            className="text-[10px] font-bold"
                            style={{ color: isCurrentLabel ? theme.danger : theme.textMuted }}
                          >
                            {d}
                          </ThemedText>
                          {isCurrentLabel ? (
                            <ThemedText className="text-[9px] font-extrabold mt-0.5" style={{ color: theme.danger }}>
                              Current
                            </ThemedText>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </View>

                {canGoNext ? (
                  <Pressable onPress={goNext} className="w-8 h-40 items-center justify-center" hitSlop={12}>
                    <View className="w-8 h-8 rounded-full border items-center justify-center" style={cardStyle}>
                      <Ionicons name="chevron-forward" size={18} color={theme.accent} />
                    </View>
                  </Pressable>
                ) : (
                  <View className="w-8 h-40" />
                )}
              </View>
            </ThemedCard>

            <ThemedCard className="mt-6 p-5 pt-8 pb-14">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1 pr-2">
                  <ThemedText className="text-base tracking-[0.12em] font-extrabold">WORKOUT RECORD</ThemedText>
                  <ThemedText variant="secondary" className="text-sm font-extrabold mt-1.5">
                    {title}
                  </ThemedText>
                  {manageMode ? (
                    <ThemedText variant="accent" className="text-xs font-extrabold mt-1">
                      Tap trash to delete
                    </ThemedText>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => setManageMode((v) => !v)}
                  className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                  style={cardStyle}
                >
                  <Ionicons
                    name={manageMode ? "close" : "options-outline"}
                    size={20}
                    color={theme.textPrimary}
                  />
                </Pressable>
              </View>
              <ThemedText variant="muted" className="text-xs mt-1">
                {periodRecordHint(period)}
              </ThemedText>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mt-4 -mx-1"
                contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}
              >
                <Pressable
                  onPress={() => setWorkoutRecentDay(null)}
                  className="px-4 py-2.5 rounded-full border"
                  style={
                    workoutRecentDay === null
                      ? { backgroundColor: theme.accent, borderColor: theme.accent }
                      : cardStyle
                  }
                >
                  <ThemedText
                    className="font-extrabold text-sm"
                    style={{ color: workoutRecentDay === null ? "#ffffff" : theme.textPrimary }}
                  >
                    {periodAllChipLabel(period)}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setWorkoutDayPickerOpen(true)}
                  className="flex-row items-center px-4 py-2.5 rounded-full border"
                  style={
                    workoutRecentDay !== null
                      ? { backgroundColor: theme.accentSoft, borderColor: theme.accentText }
                      : cardStyle
                  }
                >
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={workoutRecentDay !== null ? theme.accentText : theme.iconMuted}
                  />
                  <ThemedText
                    variant={workoutRecentDay !== null ? "accent" : "primary"}
                    className="font-extrabold text-sm ml-1.5"
                  >
                    {periodPickChipLabel(period)}
                  </ThemedText>
                </Pressable>
              </ScrollView>

              {workoutRecentDay ? (
                <View className="mt-3 flex-row items-center justify-between">
                  <ThemedText variant="muted" className="text-sm flex-1 pr-2">
                    Showing: <ThemedText className="font-extrabold">{workoutRecentFilterLabel}</ThemedText>
                  </ThemedText>
                  <Pressable onPress={() => setWorkoutRecentDay(null)} hitSlop={8}>
                    <ThemedText variant="accent" className="text-sm font-extrabold">Show all</ThemedText>
                  </Pressable>
                </View>
              ) : null}

              {workoutDayPickerOpen ? (
                <View className="mt-3">
                  <DateTimePicker
                    value={clampPickerDate(workoutRecentDay ?? new Date())}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    minimumDate={periodPickerBounds.minimumDate}
                    maximumDate={periodPickerBounds.maximumDate}
                    onChange={(event, date) => {
                      if (Platform.OS !== "ios") setWorkoutDayPickerOpen(false);
                      if (event.type === "dismissed") return;
                      if (date) applyPickedRecordDay(date, "workout");
                    }}
                  />
                  {Platform.OS === "ios" ? (
                    <Pressable
                      onPress={() => setWorkoutDayPickerOpen(false)}
                      className="mt-2 py-3 rounded-2xl border items-center"
                      style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                    >
                      <ThemedText variant="accent" className="font-extrabold">Done</ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <View className="mt-4 gap-4 pb-6">
                {groupedWorkouts.length === 0 ? (
                  <ThemedText variant="muted" className="text-sm">No workouts yet.</ThemedText>
                ) : filteredGroupedWorkouts.length === 0 ? (
                  <ThemedText variant="muted" className="text-sm">
                    {workoutRecentDay
                      ? period === "month"
                        ? "No workouts for this week. Try another date or all weeks."
                        : period === "year"
                          ? "No workouts for this month. Try another date or all months."
                          : "No workouts for this day. Try another date or the full period."
                      : period === "month"
                        ? "No workouts in this month."
                        : period === "year"
                          ? "No workouts in this year."
                          : "No workouts in this week."}
                  </ThemedText>
                ) : (
                  filteredGroupedWorkouts.map((section) => (
                    <View
                      key={section.key}
                      className="rounded-2xl overflow-hidden border-2"
                      style={{
                        borderColor: section.isCurrent ? theme.danger : theme.cardBorder,
                        backgroundColor: theme.cardBg,
                      }}
                    >
                      <View
                        className="border-b-2 px-4 py-3"
                        style={{
                          backgroundColor: theme.accentSoft,
                          borderBottomColor: section.isCurrent ? theme.danger : theme.accent,
                        }}
                      >
                        <View className="flex-row items-center">
                          <ThemedText variant="accent" className="text-[10px] font-extrabold tracking-[0.2em]">
                            {section.eyebrow}
                          </ThemedText>
                          {section.isCurrent ? (
                            <ThemedText className="ml-2 text-xs font-extrabold" style={{ color: theme.danger }}>
                              Current
                            </ThemedText>
                          ) : null}
                        </View>
                        <ThemedText className="text-lg font-extrabold mt-1">{section.title}</ThemedText>
                      </View>
                      <View className="px-3 py-3 gap-3" style={{ backgroundColor: theme.rowBg }}>
                        {section.dayGroups.map((day) => (
                          <View key={day.dateKey} className="gap-2">
                            {period !== "week" ? (
                              <ThemedText variant="muted" className="text-xs font-extrabold tracking-wide px-1">
                                {formatLongDate(day.dayDate)}
                              </ThemedText>
                            ) : null}
                            {day.entries.map((w) => (
                              <View
                                key={w.id}
                                className="flex-row items-start justify-between rounded-xl px-3 py-3 border"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
                              >
                                <View className="flex-1 pr-3">
                                  <ThemedText variant="secondary" className="text-sm font-semibold">
                                    {formatTimeHms(w.createdAt)}
                                  </ThemedText>
                                  <ThemedText variant="muted" className="text-xs mt-1" numberOfLines={2}>
                                    {w.title} • {formatDurationMinSec(w.durationMin)}
                                  </ThemedText>
                                </View>
                                <View className="flex-row items-center">
                                  <ThemedText className="text-base font-extrabold">
                                    {Math.round(w.burnedKcal).toLocaleString()} kcal
                                  </ThemedText>
                                  {manageMode ? (
                                    <Pressable
                                      onPress={() => confirmDeleteWorkout(w)}
                                      disabled={deletingId === w.id}
                                      hitSlop={10}
                                      className="ml-2 w-9 h-9 rounded-full border items-center justify-center"
                                      style={{
                                        backgroundColor: theme.dangerSoft,
                                        borderColor: theme.danger,
                                        opacity: deletingId === w.id ? 0.5 : 1,
                                      }}
                                    >
                                      <Ionicons name="trash-outline" size={18} color={theme.danger} />
                                    </Pressable>
                                  ) : null}
                                </View>
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                      <View
                        className="flex-row items-center justify-between px-4 py-3 border-t-2"
                        style={{ backgroundColor: theme.cardBg, borderTopColor: theme.cardBorder }}
                      >
                        <ThemedText variant="muted" className="text-xs font-extrabold tracking-widest">
                          {period === "week" ? "DAY TOTAL" : period === "month" ? "WEEK TOTAL" : "MONTH TOTAL"}
                        </ThemedText>
                        <ThemedText variant="accent" className="text-base font-extrabold">
                          {Math.round(section.total).toLocaleString()} kcal
                        </ThemedText>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </ThemedCard>
          </>
        ) : (
          <>
            <ThemedCard className="p-5">
              <View className="flex-row items-center justify-between">
                <View>
                  <ThemedText className="text-base tracking-widest font-extrabold">GRAPH PERIOD</ThemedText>
                  <ThemedText className="text-lg font-extrabold mt-2">{title}</ThemedText>
                </View>
                <View className="px-3 py-2 rounded-2xl border" style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}>
                  <ThemedText variant="accent" className="text-[11px] font-bold">Auto-updates</ThemedText>
                </View>
              </View>

              <View className="mt-4 rounded-full p-1 flex-row" style={segmentTrackStyle}>
                {(["week", "month", "year"] as const).map((k) => {
                  const active = period === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setPeriod(k)}
                      className="flex-1 py-3 rounded-full items-center"
                      style={active ? segmentActiveStyle : undefined}
                    >
                      <ThemedText variant={active ? "accent" : "muted"} className="font-bold">
                        {k === "week" ? "Week" : k === "month" ? "Month" : "Year"}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <View className="mt-4 flex-row items-center">
                <Pressable onPress={goPrev} className="w-8 h-40 items-center justify-center" hitSlop={12}>
                  <View className="w-8 h-8 rounded-full border items-center justify-center" style={cardStyle}>
                    <Ionicons name="chevron-back" size={18} color={theme.accent} />
                  </View>
                </Pressable>

                <View className="flex-1 mx-2">
                  <View className="h-40 rounded-2xl overflow-hidden justify-center" style={{ backgroundColor: theme.rowBg }}>
                    <View className="absolute left-0 right-0 bottom-0 h-16 opacity-10" style={{ backgroundColor: theme.accent }} />
                    {mealBarTooltip ? (
                      <View className="absolute top-2 left-2 right-2 items-center px-1">
                        <View
                          className="px-3 py-2 rounded-2xl border max-w-full"
                          style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                        >
                          <ThemedText variant="accent" className="text-[11px] font-bold text-center leading-5">
                            {mealBarTooltip}
                          </ThemedText>
                        </View>
                      </View>
                    ) : null}
                    <View className="flex-1 flex-row items-end px-3 pb-3">
                      {(() => {
                        return mealBarsForChart.map((v, idx) => {
                          const h = progressBarHeight(v, mealBarsForChart, 12, 96);
                          const active = mealHoverIdx === idx;
                          return (
                            <Pressable
                              key={`ml-${idx}`}
                              onPress={() => setMealHoverIdx((prev) => (prev === idx ? null : idx))}
                              className="flex-1 items-center justify-end"
                              hitSlop={8}
                            >
                              <View
                                style={{
                                  height: h,
                                  width: active ? 14 : 12,
                                  borderRadius: 999,
                                  backgroundColor:
                                    v === 0 ? theme.iconMuted : active ? theme.accentText : theme.accent,
                                }}
                              />
                            </Pressable>
                          );
                        });
                      })()}
                    </View>
                  </View>

                  <View className="flex-row mt-3 px-3">
                    {chartLabels.map((d, idx) => {
                      const isCurrentLabel =
                        currentPeriodSlotIndex !== null && idx === currentPeriodSlotIndex;
                      return (
                        <View key={`${d}-${idx}`} className="flex-1 items-center">
                          <ThemedText
                            className="text-[10px] font-bold"
                            style={{ color: isCurrentLabel ? theme.danger : theme.textMuted }}
                          >
                            {d}
                          </ThemedText>
                          {isCurrentLabel ? (
                            <ThemedText className="text-[9px] font-extrabold mt-0.5" style={{ color: theme.danger }}>
                              Current
                            </ThemedText>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </View>

                {canGoNext ? (
                  <Pressable onPress={goNext} className="w-8 h-40 items-center justify-center" hitSlop={12}>
                    <View className="w-8 h-8 rounded-full border items-center justify-center" style={cardStyle}>
                      <Ionicons name="chevron-forward" size={18} color={theme.accent} />
                    </View>
                  </Pressable>
                ) : (
                  <View className="w-8 h-40" />
                )}
              </View>
            </ThemedCard>

            <ThemedCard className="mt-6 p-5 pt-8 pb-14">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1 pr-2">
                  <ThemedText className="text-base tracking-[0.12em] font-extrabold">MEAL RECORD</ThemedText>
                  <ThemedText variant="secondary" className="text-sm font-extrabold mt-1.5">
                    {title}
                  </ThemedText>
                  {manageMode ? (
                    <ThemedText variant="accent" className="text-xs font-extrabold mt-1">
                      Tap trash to delete
                    </ThemedText>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => setManageMode((v) => !v)}
                  className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                  style={cardStyle}
                >
                  <Ionicons
                    name={manageMode ? "close" : "options-outline"}
                    size={20}
                    color={theme.textPrimary}
                  />
                </Pressable>
              </View>
              <ThemedText variant="muted" className="text-xs mt-1">
                {periodRecordHint(period)}
              </ThemedText>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mt-4 -mx-1"
                contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}
              >
                <Pressable
                  onPress={() => setMealRecentDay(null)}
                  className="px-4 py-2.5 rounded-full border"
                  style={
                    mealRecentDay === null
                      ? { backgroundColor: theme.accent, borderColor: theme.accent }
                      : cardStyle
                  }
                >
                  <ThemedText
                    className="font-extrabold text-sm"
                    style={{ color: mealRecentDay === null ? "#ffffff" : theme.textPrimary }}
                  >
                    {periodAllChipLabel(period)}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setMealDayPickerOpen(true)}
                  className="flex-row items-center px-4 py-2.5 rounded-full border"
                  style={
                    mealRecentDay !== null
                      ? { backgroundColor: theme.accentSoft, borderColor: theme.accentText }
                      : cardStyle
                  }
                >
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={mealRecentDay !== null ? theme.accentText : theme.iconMuted}
                  />
                  <ThemedText
                    variant={mealRecentDay !== null ? "accent" : "primary"}
                    className="font-extrabold text-sm ml-1.5"
                  >
                    {periodPickChipLabel(period)}
                  </ThemedText>
                </Pressable>
              </ScrollView>

              {mealRecentDay ? (
                <View className="mt-3 flex-row items-center justify-between">
                  <ThemedText variant="muted" className="text-sm flex-1 pr-2">
                    Showing: <ThemedText className="font-extrabold">{mealRecentFilterLabel}</ThemedText>
                  </ThemedText>
                  <Pressable onPress={() => setMealRecentDay(null)} hitSlop={8}>
                    <ThemedText variant="accent" className="text-sm font-extrabold">Show all</ThemedText>
                  </Pressable>
                </View>
              ) : null}

              {mealDayPickerOpen ? (
                <View className="mt-3">
                  <DateTimePicker
                    value={clampPickerDate(mealRecentDay ?? new Date())}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    minimumDate={periodPickerBounds.minimumDate}
                    maximumDate={periodPickerBounds.maximumDate}
                    onChange={(event, date) => {
                      if (Platform.OS !== "ios") setMealDayPickerOpen(false);
                      if (event.type === "dismissed") return;
                      if (date) applyPickedRecordDay(date, "meal");
                    }}
                  />
                  {Platform.OS === "ios" ? (
                    <Pressable
                      onPress={() => setMealDayPickerOpen(false)}
                      className="mt-2 py-3 rounded-2xl border items-center"
                      style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                    >
                      <ThemedText variant="accent" className="font-extrabold">Done</ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <View className="mt-4 gap-4 pb-6">
                {groupedMeals.length === 0 ? (
                  <ThemedText variant="muted" className="text-sm">No meals yet.</ThemedText>
                ) : filteredGroupedMeals.length === 0 ? (
                  <ThemedText variant="muted" className="text-sm">
                    {mealRecentDay
                      ? period === "month"
                        ? "No meals for this week. Try another date or all weeks."
                        : period === "year"
                          ? "No meals for this month. Try another date or all months."
                          : "No meals for this day. Try another date or the full period."
                      : period === "month"
                        ? "No meals in this month."
                        : period === "year"
                          ? "No meals in this year."
                          : "No meals in this week."}
                  </ThemedText>
                ) : (
                  filteredGroupedMeals.map((section) => (
                    <View
                      key={section.key}
                      className="rounded-2xl overflow-hidden border-2"
                      style={{
                        borderColor: section.isCurrent ? theme.danger : theme.cardBorder,
                        backgroundColor: theme.cardBg,
                      }}
                    >
                      <View
                        className="border-b-2 px-4 py-3"
                        style={{
                          backgroundColor: theme.accentSoft,
                          borderBottomColor: section.isCurrent ? theme.danger : theme.accent,
                        }}
                      >
                        <View className="flex-row items-center">
                          <ThemedText variant="accent" className="text-[10px] font-extrabold tracking-[0.2em]">
                            {section.eyebrow}
                          </ThemedText>
                          {section.isCurrent ? (
                            <ThemedText className="ml-2 text-xs font-extrabold" style={{ color: theme.danger }}>
                              Current
                            </ThemedText>
                          ) : null}
                        </View>
                        <ThemedText className="text-lg font-extrabold mt-1">{section.title}</ThemedText>
                      </View>
                      <View className="px-3 py-3 gap-3" style={{ backgroundColor: theme.rowBg }}>
                        {section.dayGroups.map((day) => (
                          <View key={day.dateKey} className="gap-2">
                            {period !== "week" ? (
                              <ThemedText variant="muted" className="text-xs font-extrabold tracking-wide px-1">
                                {formatLongDate(day.dayDate)}
                              </ThemedText>
                            ) : null}
                            {day.entries.map((m) => (
                              <View
                                key={m.id}
                                className="flex-row items-start justify-between rounded-xl px-3 py-3 border"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
                              >
                                <View className="flex-1 pr-3">
                                  <ThemedText variant="secondary" className="text-sm font-semibold">
                                    {formatTimeHms(m.createdAt)}
                                  </ThemedText>
                                  <ThemedText variant="muted" className="text-xs mt-1" numberOfLines={2}>
                                    {m.title}
                                  </ThemedText>
                                </View>
                                <View className="flex-row items-center">
                                  <ThemedText className="text-base font-extrabold">
                                    {Math.round(m.calories).toLocaleString()} kcal
                                  </ThemedText>
                                  {manageMode ? (
                                    <Pressable
                                      onPress={() => confirmDeleteMeal(m)}
                                      disabled={deletingId === m.id}
                                      hitSlop={10}
                                      className="ml-2 w-9 h-9 rounded-full border items-center justify-center"
                                      style={{
                                        backgroundColor: theme.dangerSoft,
                                        borderColor: theme.danger,
                                        opacity: deletingId === m.id ? 0.5 : 1,
                                      }}
                                    >
                                      <Ionicons name="trash-outline" size={18} color={theme.danger} />
                                    </Pressable>
                                  ) : null}
                                </View>
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                      <View
                        className="flex-row items-center justify-between px-4 py-3 border-t-2"
                        style={{ backgroundColor: theme.cardBg, borderTopColor: theme.cardBorder }}
                      >
                        <ThemedText variant="muted" className="text-xs font-extrabold tracking-widest">
                          {period === "week" ? "DAY TOTAL" : period === "month" ? "WEEK TOTAL" : "MONTH TOTAL"}
                        </ThemedText>
                        <ThemedText variant="accent" className="text-base font-extrabold">
                          {Math.round(section.total).toLocaleString()} kcal
                        </ThemedText>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </ThemedCard>
          </>
        )}
      </ScrollView>

      <Modal visible={logVisible} transparent animationType="fade" onRequestClose={() => setLogVisible(false)}>
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: theme.modalOverlay }}>
          <View className="w-full rounded-3xl p-5" style={modalCardStyle}>
            <ThemedText className="text-xl font-extrabold">Edit weight</ThemedText>
            <ThemedText variant="muted" className="mt-1">
              {isEditingRecentWeight ? "Edit weight for this day." : "Pick a date and log your weight."}
            </ThemedText>

            <View className="mt-5">
              {isEditingRecentWeight ? (
                <View className="flex-row items-center ml-1 mb-2">
                  <ThemedText className="font-extrabold">DATE :</ThemedText>
                  <ThemedText variant="secondary" className="font-bold ml-2">{formatLongDate(logDate)}</ThemedText>
                </View>
              ) : (
                <>
                  <ThemedText className="font-extrabold ml-1 mb-2">DATE</ThemedText>
                  <Pressable
                    onPress={() => setShowDatePicker(true)}
                    className="rounded-2xl px-4 py-3 flex-row items-center justify-between"
                    style={inputStyle}
                  >
                    <ThemedText className="font-bold">{formatLongDate(logDate)}</ThemedText>
                    <Ionicons name="calendar-outline" size={20} color={theme.iconMuted} />
                  </Pressable>

                  {showDatePicker && (
                    <DateTimePicker
                      value={logDate.getTime() > Date.now() ? new Date() : logDate}
                      mode="date"
                      display={Platform.OS === "ios" ? "inline" : "default"}
                      maximumDate={new Date()}
                      onChange={(event, date) => {
                        if (Platform.OS !== "ios") setShowDatePicker(false);
                        if (event.type === "dismissed") return;
                        if (!date) return;
                        const today = startOfDay(new Date());
                        const picked = startOfDay(date);
                        setLogDate(picked.getTime() > today.getTime() ? today : picked);
                      }}
                    />
                  )}
                </>
              )}

              <ThemedText className="font-extrabold ml-1 mb-2 mt-4">WEIGHT (kg)</ThemedText>
              <TextInput
                value={logWeightText}
                onChangeText={(t) => setLogWeightText(sanitizeDecimal(t))}
                keyboardType="decimal-pad"
                className="rounded-2xl px-4 py-3"
                style={inputStyle}
                placeholder="68.2"
                placeholderTextColor={placeholderColor}
              />
              <Slider
                style={{ width: "100%", marginTop: 10 }}
                minimumValue={30}
                maximumValue={200}
                step={0.1}
                value={Number(logWeightText || 0) || 68}
                onValueChange={(v) => setLogWeightText(v.toFixed(1))}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor={theme.cardBorder}
                thumbTintColor={theme.accent}
              />
            </View>

            <View className="flex-row justify-end mt-6">
              <Pressable
                onPress={() => {
                  setLogVisible(false);
                  setIsEditingRecentWeight(false);
                  setShowDatePicker(false);
                }}
                className="px-4 py-3 mr-2"
              >
                <ThemedText variant="muted" className="font-extrabold">Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={saveWeightLog}
                disabled={savingLog}
                className={`px-5 py-3 rounded-2xl ${savingLog ? "opacity-60" : "opacity-100"}`}
                style={{ backgroundColor: theme.accent }}
              >
                <ThemedText className="font-extrabold" style={{ color: "#ffffff" }}>
                  {savingLog ? "Saving..." : "Save"}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedScreen>
  );
}

