import {
    ProfileScreenHeader,
    ThemedCard,
    ThemedScreen,
    ThemedText,
    useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import { addDaysToYmd, formatCalendarDayKey, localDateFromYmd } from "@/lib/calendarDay";
import { subscribeFriendsList } from "@/lib/communityService";
import { getPedometerOrNull } from "@/lib/pedometerSafe";
import { getCurrentPeriodSlotIndex } from "@/lib/progressPeriodCurrent";
import {
  DAILY_STEP_TARGET,
  publishDailyStepRanking,
  subscribeDailyStepRanking,
  type DailyStepRankingEntry,
} from "@/lib/stepLeaderboard";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { deleteField, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

type PeriodKey = "week" | "month" | "year";
type ScreenSection = "progress" | "ranking";
type RankingScope = "all" | "friends";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const startOfWeekMon = (d: Date) => {
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const out = startOfDay(d);
  out.setDate(out.getDate() - diff);
  return out;
};

/** Monday YYYY-MM-DD for the week containing `dayKey` (Mon=0 … Sun=6). */
const mondayKeyForDayKey = (dayKey: string) => {
  const date = localDateFromYmd(dayKey);
  const diff = (date.getDay() + 6) % 7;
  return addDaysToYmd(dayKey, -diff);
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

const formatDayKeyLong = (dayKey: string) => formatLongDate(localDateFromYmd(dayKey));

function effectiveSteps(data: { stepsAuto?: unknown; stepsManual?: unknown } | undefined) {
  const manual = data?.stepsManual;
  if (typeof manual === "number" && Number.isFinite(manual) && manual >= 0) return Math.round(manual);
  const auto = data?.stepsAuto;
  if (typeof auto === "number" && Number.isFinite(auto) && auto >= 0) return Math.round(auto);
  return 0;
}

function remainingUntilMidnight(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const value = (type: "hour" | "minute" | "second") =>
      parseInt(parts.find((part) => part.type === type)?.value ?? "0", 10);
    const elapsed = value("hour") * 3600 + value("minute") * 60 + value("second");
    const remaining = Math.max(0, 86400 - elapsed);
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  } catch {
    const remaining =
      86400 - (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds());
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  }
}

export default function StepProgressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const calendarTz = useUserCalendarTimezone();
  const {
    cardStyle,
    segmentTrackStyle,
    segmentActiveStyle,
    theme,
  } = useThemedScreen();
  const { inputStyle, modalCardStyle, placeholderColor } = useProfileCardStyles();
  const [authUid, setAuthUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const params = useLocalSearchParams<{ period?: string }>();
  const initialPeriod = (params.period === "month" || params.period === "year" || params.period === "week"
    ? params.period
    : "week") as PeriodKey;

  const [period, setPeriod] = useState<PeriodKey>(initialPeriod);
  const [screenSection, setScreenSection] = useState<ScreenSection>("progress");
  const [rankingScope, setRankingScope] = useState<RankingScope>("all");
  const [rankingEntries, setRankingEntries] = useState<DailyStepRankingEntry[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [myRankingProfile, setMyRankingProfile] = useState<{
    name: string;
    profileImage: string | null;
  }>({ name: "You", profileImage: null });
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [stepSeries, setStepSeries] = useState<number[]>(Array(7).fill(0));
  const [windowRows, setWindowRows] = useState<
    { label: string; date: Date; dayKey: string; steps: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [stepHoverIdx, setStepHoverIdx] = useState<number | null>(null);
  const [seriesRefresh, setSeriesRefresh] = useState(0);
  const [liveTodayAuto, setLiveTodayAuto] = useState<number | null>(null);
  const [todayManualOverride, setTodayManualOverride] = useState<number | null>(null);
  const [screenFocused, setScreenFocused] = useState(false);
  const liveSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLiveSyncedRef = useRef(0);

  const [editOpen, setEditOpen] = useState(false);
  const [stepText, setStepText] = useState("");
  const [saving, setSaving] = useState(false);
  const [editModalDate, setEditModalDate] = useState(() => new Date());
  const [allowEditDateSelection, setAllowEditDateSelection] = useState(false);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [editDayAuto, setEditDayAuto] = useState(0);
  const [editDayManual, setEditDayManual] = useState<number | null>(null);

  const chartLabels = useMemo(() => {
    if (period === "week") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    if (period === "month") return ["W1", "W2", "W3", "W4"];
    return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  }, [period]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const rankingDayKey = formatCalendarDayKey(clockNow, calendarTz);
  const rankingCountdown = remainingUntilMidnight(clockNow, calendarTz);

  useEffect(() => {
    if (!authUid || screenSection !== "ranking") return;
    setRankingLoading(true);
    setRankingError(null);
    void getDoc(doc(db, "users", authUid))
      .then((snap) => {
        const data = snap.data() as { name?: unknown; profileImage?: unknown } | undefined;
        setMyRankingProfile({
          name:
            typeof data?.name === "string" && data.name.trim()
              ? data.name.trim()
              : auth.currentUser?.displayName || "You",
          profileImage:
            typeof data?.profileImage === "string" && data.profileImage
              ? data.profileImage
              : null,
        });
      })
      .catch(() => {
        setMyRankingProfile({
          name: auth.currentUser?.displayName || "You",
          profileImage: null,
        });
      });
    const unsubscribeRanking = subscribeDailyStepRanking(
      rankingDayKey,
      (entries) => {
        setRankingEntries(entries);
        setRankingLoading(false);
      },
      () => {
        setRankingEntries([]);
        setRankingError("Could not load today’s ranking.");
        setRankingLoading(false);
      }
    );
    const unsubscribeFriends = subscribeFriendsList(
      (friends) => setFriendIds(new Set(friends.map((friend) => friend.id))),
      () => setFriendIds(new Set())
    );
    return () => {
      unsubscribeRanking();
      unsubscribeFriends();
    };
  }, [authUid, rankingDayKey, screenSection]);

  const myTodaySteps = useMemo(() => {
    if (todayManualOverride != null) return Math.max(0, Math.round(todayManualOverride));
    if (liveTodayAuto != null) return Math.max(0, Math.round(liveTodayAuto));
    return 0;
  }, [liveTodayAuto, todayManualOverride]);

  const visibleRankingEntries = useMemo(() => {
    const scoped =
      rankingScope === "all"
        ? rankingEntries
        : rankingEntries.filter(
            (entry) => entry.uid === authUid || friendIds.has(entry.uid)
          );

    // Always include the signed-in user locally so their fixed row can be
    // shown even before their public ranking projection finishes syncing.
    if (!authUid) return scoped;
    if (scoped.some((entry) => entry.uid === authUid)) return scoped;

    return [
      ...scoped,
      {
        uid: authUid,
        name: myRankingProfile.name,
        profileImage: myRankingProfile.profileImage,
        steps: myTodaySteps,
      },
    ].sort((a, b) => b.steps - a.steps);
  }, [
    authUid,
    friendIds,
    myRankingProfile.name,
    myRankingProfile.profileImage,
    myTodaySteps,
    rankingEntries,
    rankingScope,
  ]);
  const hasVisibleRankedEntries = visibleRankingEntries.some((entry) => entry.steps > 0);

  useEffect(() => {
    lastLiveSyncedRef.current = 0;
    if (liveSyncTimerRef.current) {
      clearTimeout(liveSyncTimerRef.current);
      liveSyncTimerRef.current = null;
    }
    if (!authUid) {
      setLiveTodayAuto(null);
      setTodayManualOverride(null);
      setStepSeries(Array.from({ length: 7 }, () => 0));
      setWindowRows([]);
      setLoading(false);
      return;
    }
    setSeriesRefresh((n) => n + 1);
  }, [authUid]);

  const title = useMemo(() => {
    if (period === "week") {
      const mondayKey = mondayKeyForDayKey(formatCalendarDayKey(anchor, calendarTz));
      const sundayKey = addDaysToYmd(mondayKey, 6);
      const ws = localDateFromYmd(mondayKey);
      const we = localDateFromYmd(sundayKey);
      return `${ws.getMonth() + 1}/${ws.getDate()} - ${we.getMonth() + 1}/${we.getDate()}`;
    }
    if (period === "month") return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;
    return String(anchor.getFullYear());
  }, [anchor, calendarTz, period]);

  useEffect(() => {
    if (!editOpen) return;
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    const k = formatCalendarDayKey(editModalDate, calendarTz);
    const ref = doc(db, "users", user.uid, "dailyStats", k);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        const auto = typeof data?.stepsAuto === "number" && Number.isFinite(data.stepsAuto) ? data.stepsAuto : 0;
        const manual =
          typeof data?.stepsManual === "number" && Number.isFinite(data.stepsManual) ? data.stepsManual : null;
        setEditDayAuto(Math.max(0, Math.round(auto)));
        setEditDayManual(manual != null ? Math.max(0, Math.round(manual)) : null);
      },
      () => {
        setEditDayAuto(0);
        setEditDayManual(null);
      }
    );
    return () => unsub();
  }, [authUid, calendarTz, editModalDate, editOpen]);

  useEffect(() => {
    if (!editOpen) return;
    const eff = editDayManual != null ? editDayManual : editDayAuto;
    setStepText(String(eff));
  }, [editOpen, editModalDate, editDayAuto, editDayManual]);

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      if (!user || user.uid !== authUid) {
        const len = period === "week" ? 7 : period === "month" ? 4 : 12;
        setStepSeries(Array.from({ length: len }, () => 0));
        setWindowRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        if (period === "week") {
          const mondayKey = mondayKeyForDayKey(formatCalendarDayKey(anchor, calendarTz));
          const keys = Array.from({ length: 7 }, (_, i) => addDaysToYmd(mondayKey, i));
          const days = keys.map((key) => localDateFromYmd(key));
          const snaps = await Promise.all(keys.map((k) => getDoc(doc(db, "users", user.uid, "dailyStats", k))));
          const series = snaps.map((s) => effectiveSteps(s.exists() ? (s.data() as any) : undefined));
          setStepSeries(series);
          setWindowRows(
            days.map((d, idx) => ({
              label: chartLabels[idx],
              date: d,
              dayKey: keys[idx],
              steps: series[idx] ?? 0,
            }))
          );
          return;
        }

        if (period === "month") {
          const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
          const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
          const buckets = [0, 0, 0, 0];
          const days = Array.from({ length: monthEnd.getDate() }, (_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), i + 1));
          const snaps = await Promise.all(
            days.map((d) => {
              const k = formatCalendarDayKey(d, calendarTz);
              return getDoc(doc(db, "users", user.uid, "dailyStats", k));
            })
          );
          for (let i = 0; i < days.length; i++) {
            const d = days[i];
            const snap = snaps[i];
            const v = effectiveSteps(snap.exists() ? (snap.data() as any) : undefined);
            const dom = d.getDate();
            const idx = Math.min(3, Math.floor((dom - 1) / 7));
            buckets[idx] += v;
          }
          setStepSeries(buckets);
          const monthLastDay = monthEnd.getDate();
          const ranges: [number, number][] = [
            [1, Math.min(7, monthLastDay)],
            [8, Math.min(14, monthLastDay)],
            [15, Math.min(21, monthLastDay)],
            [22, monthLastDay],
          ];
          const fmtDmy = (day: number) => `${day}/${anchor.getMonth() + 1}/${anchor.getFullYear()}`;
          setWindowRows(
            buckets.map((steps, idx) => ({
              label: `Week ${idx + 1} (${fmtDmy(ranges[idx][0])}-${fmtDmy(ranges[idx][1])})`,
              date: monthStart,
              dayKey: formatCalendarDayKey(monthStart, calendarTz),
              steps,
            }))
          );
          return;
        }

        const year = anchor.getFullYear();
        const monthTotals = Array.from({ length: 12 }, () => 0);
        for (let m = 0; m < 12; m++) {
          // Year view: each bar/row is the total steps across the full month.
          const lastDay = new Date(year, m + 1, 0).getDate();
          const days = Array.from({ length: lastDay }, (_, i) => new Date(year, m, i + 1));
          const snaps = await Promise.all(
            days.map((d) => {
              const k = formatCalendarDayKey(d, calendarTz);
              return getDoc(doc(db, "users", user.uid, "dailyStats", k));
            })
          );
          monthTotals[m] = snaps.reduce(
            (sum, snap) => sum + effectiveSteps(snap.exists() ? (snap.data() as any) : undefined),
            0
          );
        }
        setStepSeries(monthTotals);
        setWindowRows(
          monthTotals.map((steps, idx) => ({
            label: new Date(year, idx, 1).toLocaleDateString(undefined, { month: "long" }),
            date: new Date(year, idx, 1),
            dayKey: formatCalendarDayKey(new Date(year, idx, 1), calendarTz),
            steps,
          }))
        );
      } catch (e) {
        console.log("Failed to load step series:", e);
        const len = period === "week" ? 7 : period === "month" ? 4 : 12;
        setStepSeries(Array.from({ length: len }, () => 0));
        setWindowRows([]);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [anchor, authUid, calendarTz, chartLabels, period, seriesRefresh]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    const todayKey = formatCalendarDayKey(new Date(), calendarTz);
    const unsub = onSnapshot(
      doc(db, "users", user.uid, "dailyStats", todayKey),
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        const manual =
          typeof data?.stepsManual === "number" && Number.isFinite(data.stepsManual)
            ? Math.max(0, Math.round(data.stepsManual))
            : null;
        const auto =
          typeof data?.stepsAuto === "number" && Number.isFinite(data.stepsAuto)
            ? Math.max(0, Math.round(data.stepsAuto))
            : 0;
        setTodayManualOverride(manual);
        setLiveTodayAuto(auto);
        lastLiveSyncedRef.current = Math.max(lastLiveSyncedRef.current, auto);
        void publishDailyStepRanking(todayKey, manual ?? auto).catch((error) => {
          console.log("Failed to publish step ranking:", error);
        });
      },
      () => {
        setTodayManualOverride(null);
      }
    );
    return () => unsub();
  }, [authUid, calendarTz]);

  // Real-time steps for "today" (only affects the currently-visible window/bucket).
  useEffect(() => {
    if (!screenFocused) return;
    let mounted = true;
    let pedSub: { remove: () => void } | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let pedDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const startLive = async () => {
      const user = auth.currentUser;
      if (!user || user.uid !== authUid) return;

      // Only need live OS step polls for the weekly chart; month/year use aggregates from load().
      if (period !== "week") return;

      try {
        const Pedometer = await getPedometerOrNull();
        if (!mounted || !Pedometer) return;

        const perm = await Pedometer.requestPermissionsAsync();
        if (!perm.granted || !mounted) return;

        const syncStepsFromOs = async () => {
          if (!mounted) return;
          try {
            const res = await Pedometer.getStepCountAsync(startOfDay(new Date()), new Date());
            const total = Math.max(0, Math.round(typeof res?.steps === "number" ? res.steps : 0));
            setLiveTodayAuto(total);
          } catch {
            /* ignore */
          }
        };

        await syncStepsFromOs();
        if (!mounted) return;

        pedSub = Pedometer.watchStepCount(() => {
          if (!mounted) return;
          if (pedDebounceTimer) clearTimeout(pedDebounceTimer);
          pedDebounceTimer = setTimeout(() => {
            pedDebounceTimer = null;
            void syncStepsFromOs();
          }, 400);
        });

        timer = setInterval(() => void syncStepsFromOs(), 45_000);
      } catch {
        // ignore; falls back to Firestore-loaded series
      }
    };

    void startLive();
    return () => {
      mounted = false;
      if (pedDebounceTimer) clearTimeout(pedDebounceTimer);
      pedSub?.remove();
      if (timer) clearInterval(timer);
    };
  }, [authUid, period, screenFocused]);

  // Patch today's bar/row with live value (week view only, and only if there's no manual override).
  useEffect(() => {
    if (period !== "week") return;
    if (todayManualOverride != null) return;
    if (liveTodayAuto == null) return;

    const todayKey = formatCalendarDayKey(new Date(), calendarTz);
    const mondayKey = mondayKeyForDayKey(formatCalendarDayKey(anchor, calendarTz));
    const idx = Array.from({ length: 7 }, (_, i) => addDaysToYmd(mondayKey, i)).indexOf(todayKey);
    if (idx < 0) return;

    setStepSeries((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      next[idx] = liveTodayAuto;
      return next;
    });
    setWindowRows((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const row = next[idx];
      if (row) next[idx] = { ...row, steps: liveTodayAuto };
      return next;
    });
  }, [anchor, calendarTz, liveTodayAuto, period, todayManualOverride]);

  useEffect(() => {
    if (period !== "week") return;
    if (todayManualOverride != null) return;
    if (liveTodayAuto == null) return;
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    if (liveTodayAuto <= lastLiveSyncedRef.current) return;
    const dayKey = formatCalendarDayKey(new Date(), calendarTz);

    if (liveSyncTimerRef.current) clearTimeout(liveSyncTimerRef.current);
    liveSyncTimerRef.current = setTimeout(() => {
      const next = Math.max(0, Math.round(liveTodayAuto));
      void setDoc(
        doc(db, "users", user.uid, "dailyStats", dayKey),
        {
          stepsAuto: next,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
        .then(() => {
          lastLiveSyncedRef.current = Math.max(lastLiveSyncedRef.current, next);
        })
        .catch((e) => {
          console.log("Failed to sync step progress live steps:", e);
        })
        .finally(() => {
          liveSyncTimerRef.current = null;
        });
    }, 2000);
  }, [authUid, calendarTz, liveTodayAuto, period, todayManualOverride]);

  useEffect(() => {
    return () => {
      if (liveSyncTimerRef.current) clearTimeout(liveSyncTimerRef.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      setSeriesRefresh((n) => n + 1);
      return () => {
        setScreenFocused(false);
      };
    }, [])
  );

  const goPrev = () => {
    const d = new Date(anchor);
    if (period === "week") d.setDate(d.getDate() - 7);
    else if (period === "month") d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    setAnchor(d);
  };

  const goNext = () => {
    const d = new Date(anchor);
    const now = new Date();
    if (period === "week") d.setDate(d.getDate() + 7);
    else if (period === "month") d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    if (d > now) return;
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

  const currentPeriodSlotIndex = useMemo(() => {
    if (period === "week") {
      const todayKey = formatCalendarDayKey(new Date(), calendarTz);
      const mondayKey = mondayKeyForDayKey(formatCalendarDayKey(anchor, calendarTz));
      const idx = Array.from({ length: 7 }, (_, i) => addDaysToYmd(mondayKey, i)).indexOf(todayKey);
      return idx >= 0 ? idx : null;
    }
    return getCurrentPeriodSlotIndex(period, anchor);
  }, [anchor, calendarTz, period]);

  const weekIndexForDayKey = (dayKey: string) => {
    const mondayKey = mondayKeyForDayKey(formatCalendarDayKey(anchor, calendarTz));
    return Array.from({ length: 7 }, (_, i) => addDaysToYmd(mondayKey, i)).indexOf(dayKey);
  };

  const stepBarTooltip = useMemo(() => {
    if (stepHoverIdx == null) return "";
    const idx = stepHoverIdx;
    const steps = stepSeries[idx] ?? 0;
    if (period === "week") {
      const mondayKey = mondayKeyForDayKey(formatCalendarDayKey(anchor, calendarTz));
      const dayKey = addDaysToYmd(mondayKey, idx);
      const d = localDateFromYmd(dayKey);
      const dateStr = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
      return `${dateStr}\n${steps.toLocaleString()} steps`;
    }
    if (period === "month") {
      const label = chartLabels[idx] ?? "";
      return `${label}\n${steps.toLocaleString()} steps`;
    }
    const monthTitle = new Date(anchor.getFullYear(), idx, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    return `${monthTitle}\n${steps.toLocaleString()} steps`;
  }, [anchor, calendarTz, chartLabels, period, stepHoverIdx, stepSeries]);

  const openEditForDate = (date: Date, allowDateSelection = false) => {
    setEditModalDate(new Date(date));
    setAllowEditDateSelection(allowDateSelection);
    setShowEditDatePicker(false);
    setEditOpen(true);
  };

  const openEdit = () => openEditForDate(new Date(), true);

  const saveManual = async () => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    const parsed = parseInt(stepText.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 200000) {
      Alert.alert("Invalid steps", "Enter a step count between 0 and 200,000.");
      return;
    }
    try {
      setSaving(true);
      const dayKey = formatCalendarDayKey(editModalDate, calendarTz);
      await setDoc(
        doc(db, "users", user.uid, "dailyStats", dayKey),
        {
          stepsManual: parsed,
          stepsAuto: editDayAuto,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Make the UI update immediately after saving (without waiting for a refetch).
      const todayKey = formatCalendarDayKey(new Date(), calendarTz);
      if (dayKey === todayKey) {
        // Prevent the "today bar" patching effect from overwriting the manual value.
        setTodayManualOverride(parsed);
        setLiveTodayAuto(editDayAuto);
      }

      if (period === "week") {
        const idx = weekIndexForDayKey(dayKey);
        if (idx >= 0 && idx <= 6) {
          setStepSeries((prev) => {
            if (!prev.length) return prev;
            const next = [...prev];
            next[idx] = parsed;
            return next;
          });
          setWindowRows((prev) => {
            if (!prev.length) return prev;
            const next = [...prev];
            const row = next[idx];
            if (row) next[idx] = { ...row, steps: parsed };
            return next;
          });
        }
      } else {
        // Month/year uses bucket sums; easiest safe way is refresh.
        setSeriesRefresh((n) => n + 1);
      }

      setEditOpen(false);
    } catch (e) {
      console.log("Failed to save steps:", e);
      Alert.alert("Error", "Could not save your steps.");
    } finally {
      setSaving(false);
    }
  };

  const resetToAuto = async () => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    try {
      setSaving(true);
      const dayKey = formatCalendarDayKey(editModalDate, calendarTz);
      await setDoc(
        doc(db, "users", user.uid, "dailyStats", dayKey),
        { stepsManual: deleteField() },
        { merge: true }
      );

      // Immediate UI update (manual removed -> revert to auto).
      const todayKey = formatCalendarDayKey(new Date(), calendarTz);
      if (dayKey === todayKey) {
        setTodayManualOverride(null);
        setLiveTodayAuto(editDayAuto);
      }

      if (period === "week") {
        const idx = weekIndexForDayKey(dayKey);
        if (idx >= 0 && idx <= 6) {
          setStepSeries((prev) => {
            if (!prev.length) return prev;
            const next = [...prev];
            next[idx] = editDayAuto;
            return next;
          });
          setWindowRows((prev) => {
            if (!prev.length) return prev;
            const next = [...prev];
            const row = next[idx];
            if (row) next[idx] = { ...row, steps: editDayAuto };
            return next;
          });
        }
      } else {
        setSeriesRefresh((n) => n + 1);
      }

      setEditOpen(false);
    } catch (e) {
      console.log("Failed to reset steps:", e);
      Alert.alert("Error", "Could not reset to auto tracking.");
    } finally {
      setSaving(false);
    }
  };

  const editDayDisplay = editDayManual != null ? editDayManual : editDayAuto;

  return (
    <ThemedScreen>
      <View
        className="px-3 pb-5"
        style={{ paddingTop: insets.top + 12, backgroundColor: theme.screenBg, zIndex: 20 }}
      >
        <ProfileScreenHeader title="Daily Steps" onBack={() => router.back()} titleClassName="text-xl" />
        <View className="rounded-full p-1 flex-row" style={segmentTrackStyle}>
          {(["progress", "ranking"] as const).map((section) => {
            const active = screenSection === section;
            return (
              <Pressable
                key={section}
                onPress={() => setScreenSection(section)}
                className="flex-1 py-3 rounded-full items-center"
                style={active ? segmentActiveStyle : undefined}
              >
                <ThemedText variant={active ? "accent" : "muted"} className="font-extrabold">
                  {section === "progress" ? "Step Progress" : "Ranking"}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="flex-1 px-3">
        {screenSection === "progress" ? (
          <>
        <ThemedCard className="p-5">
          <View className="flex-row items-center justify-between">
            <View>
              <ThemedText className="text-base tracking-widest font-extrabold">GRAPH PERIOD</ThemedText>
              <ThemedText className="text-lg font-extrabold mt-2">{title}</ThemedText>
            </View>
            <Pressable onPress={openEdit} className="px-4 py-2 rounded-full" style={{ backgroundColor: theme.accent }}>
              <ThemedText className="font-extrabold" style={{ color: "#ffffff" }}>
                Edit steps
              </ThemedText>
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
                  <ThemedText
                    variant={active ? "accent" : "muted"}
                    className="font-bold"
                  >
                    {k === "week" ? "Week" : k === "month" ? "Month" : "Year"}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-4 flex-row items-center">
            <Pressable onPress={goPrev} className="w-8 h-52 items-center justify-center" hitSlop={12}>
              <View className="w-8 h-8 rounded-full border items-center justify-center" style={cardStyle}>
                <Ionicons name="chevron-back" size={18} color={theme.accent} />
              </View>
            </Pressable>

            <View className="flex-1 mx-2">
              <View className="h-52 rounded-2xl overflow-hidden justify-center" style={{ backgroundColor: theme.rowBg }}>
                <View className="absolute left-0 right-0 bottom-0 h-24 opacity-10" style={{ backgroundColor: theme.accent }} />
                {!loading && stepBarTooltip ? (
                  <View className="absolute top-2 left-2 right-2 items-center px-1">
                    <View
                      className="px-3 py-2 rounded-2xl border max-w-full"
                      style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                    >
                      <ThemedText variant="accent" className="text-[11px] font-bold text-center leading-5">
                        {stepBarTooltip}
                      </ThemedText>
                    </View>
                  </View>
                ) : null}
                {loading ? (
                  <View className="flex-1 items-center justify-center">
                    <ThemedText variant="muted" className="font-semibold">Loading…</ThemedText>
                  </View>
                ) : (
                  <View className="flex-1 flex-row items-end px-3 pb-5">
                    {(() => {
                      const min = Math.min(...stepSeries);
                      const max = Math.max(...stepSeries);
                      const span = max - min || 1;
                      return stepSeries.map((v, idx) => {
                        const h = 14 + Math.round(((v - min) / span) * 130);
                        const active = stepHoverIdx === idx;
                        return (
                          <Pressable
                            key={`sb-${idx}`}
                            onPress={() => setStepHoverIdx((prev) => (prev === idx ? null : idx))}
                            className="flex-1 items-center"
                            hitSlop={8}
                          >
                            <View
                              style={{
                                height: Math.max(h, 14),
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
                )}
              </View>

              <View className="flex-row mt-3 px-3">
                {chartLabels.map((d, idx) => {
                  const isCurrentLabel = currentPeriodSlotIndex !== null && idx === currentPeriodSlotIndex;
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
              <Pressable onPress={goNext} className="w-8 h-52 items-center justify-center" hitSlop={12}>
                <View className="w-8 h-8 rounded-full border items-center justify-center" style={cardStyle}>
                  <Ionicons name="chevron-forward" size={18} color={theme.accent} />
                </View>
              </Pressable>
            ) : (
              <View className="w-8 h-52" />
            )}
          </View>
        </ThemedCard>

        <ThemedCard className="mt-5 p-5 pb-6">
          <ThemedText className="text-base tracking-widest font-extrabold">STEP RECORD</ThemedText>
          <ThemedText className="mt-2 text-sm font-extrabold" style={{ color: "#3b82f6" }}>
            Recommended daily target: {DAILY_STEP_TARGET.toLocaleString()} steps per day
          </ThemedText>
          <View className="mt-4 gap-3">
            {windowRows.length === 0 ? (
              <ThemedText variant="muted">No step data yet.</ThemedText>
            ) : (
              windowRows.map((r, idx) => {
                const isCurrentRow = currentPeriodSlotIndex !== null && idx === currentPeriodSlotIndex;
                const todayKey = formatCalendarDayKey(new Date(), calendarTz);
                const canEditDay = period === "week" && r.dayKey <= todayKey;
                return (
                  <View
                    key={`${r.dayKey}-${idx}`}
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
                        {period === "week" ? formatDayKeyLong(r.dayKey) : r.label}
                      </ThemedText>
                      {isCurrentRow ? (
                        <ThemedText className="ml-2 text-xs font-extrabold" style={{ color: theme.danger }}>
                          Current
                        </ThemedText>
                      ) : null}
                      {period === "week" && r.steps >= DAILY_STEP_TARGET ? (
                        <View
                          className="ml-2 flex-row items-center rounded-full px-2 py-1"
                          style={{ backgroundColor: theme.accentSoft }}
                        >
                          <Ionicons name="checkmark-circle" size={14} color={theme.accentText} />
                          <ThemedText variant="accent" className="ml-1 text-[10px] font-extrabold">
                            Target achieved
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <View className="flex-row items-center">
                      <ThemedText className="text-base font-extrabold">
                        {r.steps ? `${r.steps.toLocaleString()} steps` : "—"}
                      </ThemedText>
                      {period === "week" ? (
                        <Pressable
                          onPress={() => openEditForDate(localDateFromYmd(r.dayKey))}
                          disabled={!canEditDay}
                          hitSlop={10}
                          accessibilityLabel={`Edit steps for ${formatDayKeyLong(r.dayKey)}`}
                          className="ml-3 w-9 h-9 rounded-full border items-center justify-center"
                          style={[cardStyle, { opacity: canEditDay ? 1 : 0.35 }]}
                        >
                          <Ionicons name="create-outline" size={18} color={theme.textPrimary} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ThemedCard>
          </>
        ) : (
          <ThemedCard className="p-5 pb-6">
            <View className="items-center">
              <ThemedText className="text-xl font-extrabold">Daily Step Ranking</ThemedText>
              <ThemedText variant="muted" className="mt-1 text-sm text-center">
                Refreshes every day at 12:00 AM
              </ThemedText>
              <View
                className="mt-3 flex-row items-center rounded-full px-4 py-2"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Ionicons name="time-outline" size={17} color={theme.accentText} />
                <ThemedText variant="accent" className="ml-2 font-extrabold">
                  Resets in {rankingCountdown}
                </ThemedText>
              </View>
            </View>

            <View className="mt-5 rounded-full p-1 flex-row" style={segmentTrackStyle}>
              {(["all", "friends"] as const).map((scope) => {
                const active = rankingScope === scope;
                return (
                  <Pressable
                    key={scope}
                    onPress={() => setRankingScope(scope)}
                    className="flex-1 py-3 rounded-full items-center"
                    style={active ? segmentActiveStyle : undefined}
                  >
                    <ThemedText variant={active ? "accent" : "muted"} className="font-bold">
                      {scope === "all" ? "All" : "Friends"}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            {!rankingLoading && !rankingError && !hasVisibleRankedEntries ? (
              <View
                className="mt-5 items-center rounded-2xl border px-4 py-5"
                style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
              >
                <Ionicons name="walk-outline" size={28} color={theme.accentText} />
                <ThemedText variant="accent" className="mt-2 text-center font-extrabold">
                  {rankingScope === "friends"
                    ? "None of your friends have recorded steps today."
                    : "No one has recorded steps today."}
                </ThemedText>
                <ThemedText variant="muted" className="mt-1 text-center text-sm">
                  Start moving to become the first person in today’s ranking!
                </ThemedText>
              </View>
            ) : null}

            {rankingLoading ? (
              <View className="items-center py-8">
                <ThemedText variant="muted">Loading ranking…</ThemedText>
              </View>
            ) : rankingError ? (
              <ThemedText variant="muted" className="py-8 text-center">
                {rankingError}
              </ThemedText>
            ) : visibleRankingEntries.length === 0 ? (
              <ThemedText variant="muted" className="py-8 text-center">
                {rankingScope === "friends"
                  ? "No friends have recorded steps today yet."
                  : "No step records for today yet."}
              </ThemedText>
            ) : (
              (() => {
                const podiumEntries = visibleRankingEntries
                  .slice(0, 3)
                  .filter((entry) => entry.steps > 0);
                const currentUserEntry = visibleRankingEntries.find(
                  (entry) => entry.uid === authUid
                );
                const currentUserRankIndex = visibleRankingEntries
                  .filter((entry) => entry.steps > 0)
                  .findIndex((entry) => entry.uid === authUid);
                const listEntries = visibleRankingEntries
                  .map((entry, index) => ({ entry, rank: index + 1 }))
                  .slice(podiumEntries.length)
                  .filter(({ entry }) => entry.uid !== authUid);
                const medalColors = ["#f59e0b", "#94a3b8", "#b45309"];
                const stageHeights = [76, 56, 44];
                const renderPodiumSlot = (rankIndex: number) => {
                  const entry = podiumEntries[rankIndex];
                  const isFirst = rankIndex === 0;
                  const avatarSize = isFirst ? 72 : 56;
                  if (!entry) return <View key={`podium-empty-${rankIndex}`} className="flex-1" />;
                  const isCurrentUser = entry.uid === authUid;
                  return (
                    <View key={entry.uid} className="flex-1 items-center justify-end">
                      {isFirst ? (
                        <Ionicons name="trophy" size={22} color="#f59e0b" style={{ marginBottom: 4 }} />
                      ) : null}
                      <View
                        className="overflow-hidden rounded-full items-center justify-center"
                        style={{
                          width: avatarSize,
                          height: avatarSize,
                          backgroundColor: theme.accentSoft,
                          borderWidth: 3,
                          borderColor: medalColors[rankIndex],
                        }}
                      >
                        {entry.profileImage ? (
                          <Image
                            source={{ uri: entry.profileImage }}
                            style={{ width: avatarSize, height: avatarSize }}
                            contentFit="cover"
                          />
                        ) : (
                          <Ionicons
                            name="person"
                            size={isFirst ? 30 : 24}
                            color={theme.accentText}
                          />
                        )}
                      </View>
                      <ThemedText className="mt-1.5 text-xs font-extrabold text-center" numberOfLines={1}>
                        {entry.name}
                        {isCurrentUser ? " (You)" : ""}
                      </ThemedText>
                      <ThemedText variant="accent" className="text-xs font-bold">
                        {entry.steps.toLocaleString()}
                      </ThemedText>
                      <View
                        className="mt-1.5 w-full items-center justify-start rounded-t-2xl pt-1.5"
                        style={{
                          height: stageHeights[rankIndex],
                          backgroundColor: medalColors[rankIndex],
                        }}
                      >
                        <ThemedText
                          className="text-lg font-extrabold"
                          style={{ color: "#ffffff" }}
                        >
                          {rankIndex + 1}
                        </ThemedText>
                      </View>
                    </View>
                  );
                };

                return (
                  <>
                    {podiumEntries.length > 0 ? (
                      <View className="mt-6 flex-row items-end gap-2 px-1">
                        {renderPodiumSlot(1)}
                        {renderPodiumSlot(0)}
                        {renderPodiumSlot(2)}
                      </View>
                    ) : null}

                    {listEntries.length > 0 ? (
                      <View className="mt-5 gap-3">
                        {listEntries.map(({ entry, rank }) => {
                          return (
                            <View
                              key={entry.uid}
                              className="flex-row items-center rounded-2xl border px-4 py-3"
                              style={{
                                backgroundColor: theme.rowBg,
                                borderColor: theme.cardBorder,
                              }}
                            >
                              <ThemedText
                                className="w-8 text-center text-base font-extrabold"
                                style={{ color: theme.textMuted }}
                              >
                                {rank}
                              </ThemedText>
                              <View
                                className="ml-2 h-11 w-11 overflow-hidden rounded-full items-center justify-center"
                                style={{ backgroundColor: theme.accentSoft }}
                              >
                                {entry.profileImage ? (
                                  <Image
                                    source={{ uri: entry.profileImage }}
                                    style={{ width: 44, height: 44 }}
                                    contentFit="cover"
                                  />
                                ) : (
                                  <Ionicons name="person" size={20} color={theme.accentText} />
                                )}
                              </View>
                              <View className="ml-3 flex-1">
                                <ThemedText className="font-extrabold" numberOfLines={1}>
                                  {entry.name}
                                </ThemedText>
                              </View>
                              <ThemedText className="ml-2 font-extrabold">
                                {entry.steps.toLocaleString()}
                              </ThemedText>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}

                    {currentUserEntry ? (
                      <View
                        className="mt-6 flex-row items-center rounded-2xl border-2 px-4 py-3"
                        style={{
                          backgroundColor: theme.accentSoft,
                          borderColor: theme.accent,
                        }}
                      >
                        <ThemedText
                          variant="accent"
                          className="w-8 text-center text-base font-extrabold"
                        >
                          {currentUserRankIndex >= 0 ? currentUserRankIndex + 1 : "—"}
                        </ThemedText>
                        <View
                          className="ml-2 h-11 w-11 overflow-hidden rounded-full items-center justify-center"
                          style={{ backgroundColor: theme.cardBg }}
                        >
                          {currentUserEntry.profileImage ? (
                            <Image
                              source={{ uri: currentUserEntry.profileImage }}
                              style={{ width: 44, height: 44 }}
                              contentFit="cover"
                            />
                          ) : (
                            <Ionicons name="person" size={20} color={theme.accentText} />
                          )}
                        </View>
                        <View className="ml-3 flex-1">
                          <ThemedText className="font-extrabold" numberOfLines={1}>
                            {currentUserEntry.name} (You)
                          </ThemedText>
                        </View>
                        <ThemedText className="ml-2 font-extrabold">
                          {currentUserEntry.steps.toLocaleString()}
                        </ThemedText>
                      </View>
                    ) : null}
                  </>
                );
              })()
            )}
          </ThemedCard>
        )}
      </ScrollView>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: theme.modalOverlay }}>
          <View className="w-full rounded-3xl p-5" style={modalCardStyle}>
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-2">
                <ThemedText className="text-xl font-extrabold">Edit steps</ThemedText>
                <ThemedText variant="muted" className="mt-1">{formatLongDate(editModalDate)}</ThemedText>
                <ThemedText variant="muted" className="mt-2 text-sm">
                  Auto tracking: {editDayAuto.toLocaleString()} steps
                  {editDayManual != null ? " • Manual override active" : ""}
                </ThemedText>
              </View>
              {allowEditDateSelection ? (
                <Pressable
                  onPress={() => setShowEditDatePicker(true)}
                  accessibilityLabel="Choose step record date"
                  className="w-11 h-11 rounded-full border items-center justify-center"
                  style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                >
                  <Ionicons name="calendar-outline" size={22} color={theme.accentText} />
                </Pressable>
              ) : null}
            </View>

            {allowEditDateSelection && showEditDatePicker ? (
              <DateTimePicker
                value={editModalDate}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                maximumDate={new Date()}
                onChange={(event, date) => {
                  if (Platform.OS !== "ios") setShowEditDatePicker(false);
                  if (event.type === "dismissed") return;
                  if (date) setEditModalDate(date);
                }}
              />
            ) : null}

            <View className="mt-5">
              <ThemedText className="font-extrabold ml-1 mb-2">TOTAL STEPS FOR THIS DAY</ThemedText>
              <TextInput
                value={stepText}
                onChangeText={(t) => setStepText(t.replace(/[^\d]/g, ""))}
                keyboardType="number-pad"
                className="rounded-2xl px-4 py-3"
                style={inputStyle}
                placeholder={String(editDayDisplay || 0)}
                placeholderTextColor={placeholderColor}
              />
            </View>

            <View className="flex-row justify-between mt-6">
              <Pressable onPress={resetToAuto} disabled={saving || editDayManual == null} className="px-4 py-3">
                <ThemedText
                  className="font-extrabold"
                  style={{ color: editDayManual == null ? theme.iconMuted : theme.accentText }}
                >
                  Reset to auto
                </ThemedText>
              </Pressable>
              <View className="flex-row">
                <Pressable onPress={() => setEditOpen(false)} className="px-4 py-3 mr-2">
                  <ThemedText variant="muted" className="font-extrabold">Cancel</ThemedText>
                </Pressable>
                <Pressable
                  onPress={saveManual}
                  disabled={saving}
                  className={`px-5 py-3 rounded-2xl ${saving ? "opacity-60" : "opacity-100"}`}
                  style={{ backgroundColor: theme.accent }}
                >
                  <ThemedText className="font-extrabold" style={{ color: "#ffffff" }}>
                    {saving ? "Saving..." : "Save"}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedScreen>
  );
}
