import { formatCalendarDayKey } from "@/lib/calendarDay";
import { getPedometerOrNull } from "@/lib/pedometerSafe";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { deleteField, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { auth, db } from "../firebaseConfig";

type PeriodKey = "week" | "month" | "year";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const startOfWeekMon = (d: Date) => {
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const out = startOfDay(d);
  out.setDate(out.getDate() - diff);
  return out;
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

function effectiveSteps(data: { stepsAuto?: unknown; stepsManual?: unknown } | undefined) {
  const manual = data?.stepsManual;
  if (typeof manual === "number" && Number.isFinite(manual) && manual >= 0) return Math.round(manual);
  const auto = data?.stepsAuto;
  if (typeof auto === "number" && Number.isFinite(auto) && auto >= 0) return Math.round(auto);
  return 0;
}

export default function StepProgressScreen() {
  const router = useRouter();
  const calendarTz = useUserCalendarTimezone();
  const params = useLocalSearchParams<{ period?: string }>();
  const initialPeriod = (params.period === "month" || params.period === "year" || params.period === "week"
    ? params.period
    : "week") as PeriodKey;

  const [period, setPeriod] = useState<PeriodKey>(initialPeriod);
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [stepSeries, setStepSeries] = useState<number[]>(Array(7).fill(0));
  const [windowRows, setWindowRows] = useState<{ label: string; date: Date; steps: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [seriesRefresh, setSeriesRefresh] = useState(0);
  const [liveTodayAuto, setLiveTodayAuto] = useState<number | null>(null);
  const [todayManualOverride, setTodayManualOverride] = useState<number | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [stepText, setStepText] = useState("");
  const [saving, setSaving] = useState(false);
  const [editModalDate, setEditModalDate] = useState(() => new Date());
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [editDayAuto, setEditDayAuto] = useState(0);
  const [editDayManual, setEditDayManual] = useState<number | null>(null);

  const chartLabels = useMemo(() => {
    if (period === "week") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    if (period === "month") return ["W1", "W2", "W3", "W4"];
    return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  }, [period]);

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

  useEffect(() => {
    if (!editOpen) return;
    const user = auth.currentUser;
    if (!user) return;
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
  }, [calendarTz, editModalDate, editOpen]);

  useEffect(() => {
    if (!editOpen) return;
    const eff = editDayManual != null ? editDayManual : editDayAuto;
    setStepText(String(eff));
  }, [editOpen, editModalDate, editDayAuto, editDayManual]);

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      if (!user) return;
      setLoading(true);
      try {
        if (period === "week") {
          const weekStart = startOfWeekMon(anchor);
          const days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            return d;
          });
          const keys = days.map((d) => formatCalendarDayKey(d, calendarTz));
          const snaps = await Promise.all(keys.map((k) => getDoc(doc(db, "users", user.uid, "dailyStats", k))));
          const series = snaps.map((s) => effectiveSteps(s.exists() ? (s.data() as any) : undefined));
          setStepSeries(series);
          setWindowRows(
            days.map((d, idx) => ({
              label: chartLabels[idx],
              date: d,
              steps: series[idx] ?? 0,
            }))
          );
          return;
        }

        if (period === "month") {
          const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
          const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
          const buckets = [0, 0, 0, 0];
          const d = new Date(monthStart);
          while (d <= monthEnd) {
            const k = formatCalendarDayKey(d, calendarTz);
            const snap = await getDoc(doc(db, "users", user.uid, "dailyStats", k));
            const v = effectiveSteps(snap.exists() ? (snap.data() as any) : undefined);
            const dom = d.getDate();
            const idx = Math.min(3, Math.floor((dom - 1) / 7));
            buckets[idx] += v;
            d.setDate(d.getDate() + 1);
          }
          setStepSeries(buckets);
          setWindowRows(
            buckets.map((steps, idx) => ({
              label: `W${idx + 1}`,
              date: monthStart,
              steps,
            }))
          );
          return;
        }

        const year = anchor.getFullYear();
        const sums = Array.from({ length: 12 }, () => 0);
        for (let m = 0; m < 12; m++) {
          const last = new Date(year, m + 1, 0).getDate();
          for (let day = 1; day <= last; day++) {
            const d = new Date(year, m, day);
            const k = formatCalendarDayKey(d, calendarTz);
            const snap = await getDoc(doc(db, "users", user.uid, "dailyStats", k));
            const v = effectiveSteps(snap.exists() ? (snap.data() as any) : undefined);
            sums[m] += v;
          }
        }
        setStepSeries(sums);
        setWindowRows(
          sums.map((steps, idx) => ({
            label: chartLabels[idx],
            date: new Date(year, idx, 1),
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
  }, [anchor, calendarTz, chartLabels, period, seriesRefresh]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
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
      },
      () => {
        setTodayManualOverride(null);
      }
    );
    return () => unsub();
  }, [calendarTz]);

  // Real-time steps for "today" (only affects the currently-visible window/bucket).
  useEffect(() => {
    let mounted = true;
    let pedSub: { remove: () => void } | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let pedDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const startLive = async () => {
      const user = auth.currentUser;
      if (!user) return;

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
  }, [period]);

  // Patch today's bar/row with live value (week view only, and only if there's no manual override).
  useEffect(() => {
    if (period !== "week") return;
    if (todayManualOverride != null) return;
    if (liveTodayAuto == null) return;

    const ws = startOfWeekMon(anchor);
    const today = startOfDay(new Date());
    const idx = Math.floor((today.getTime() - ws.getTime()) / (24 * 60 * 60 * 1000));
    if (idx < 0 || idx > 6) return;

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
  }, [anchor, liveTodayAuto, period, todayManualOverride]);

  useEffect(() => {
    if (period !== "week") return;
    if (todayManualOverride != null) return;
    if (liveTodayAuto == null) return;
    const user = auth.currentUser;
    if (!user) return;
    const dayKey = formatCalendarDayKey(new Date(), calendarTz);
    void setDoc(
      doc(db, "users", user.uid, "dailyStats", dayKey),
      {
        stepsAuto: Math.max(0, Math.round(liveTodayAuto)),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [calendarTz, liveTodayAuto, period, todayManualOverride]);

  useFocusEffect(
    useCallback(() => {
      setSeriesRefresh((n) => n + 1);
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

  const openEdit = () => {
    setEditModalDate(new Date());
    setEditOpen(true);
  };

  const saveManual = async () => {
    const user = auth.currentUser;
    if (!user) return;
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
        const ws = startOfWeekMon(anchor);
        const msPerDay = 24 * 60 * 60 * 1000;
        const idx = Math.floor((startOfDay(editModalDate).getTime() - startOfDay(ws).getTime()) / msPerDay);
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
    if (!user) return;
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
        const ws = startOfWeekMon(anchor);
        const msPerDay = 24 * 60 * 60 * 1000;
        const idx = Math.floor((startOfDay(editModalDate).getTime() - startOfDay(ws).getTime()) / msPerDay);
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
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="px-3 pt-14">
        <View className="flex-row items-center justify-between mb-6">
          <Pressable onPress={() => router.back()} className="w-12 h-12 rounded-full bg-white items-center justify-center">
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <Text className="text-xl font-extrabold text-gray-900">Step Progress</Text>
          <View className="w-12 h-12" />
        </View>

        <View className="bg-white rounded-3xl p-5 border border-gray-100">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[10px] tracking-widest text-gray-900 font-extrabold">GRAPH PERIOD</Text>
              <Text className="text-lg font-extrabold text-gray-900 mt-2">{title}</Text>
            </View>
            <Pressable onPress={openEdit} className="px-4 py-2 rounded-full bg-[#76C893]">
              <Text className="text-white font-extrabold">Edit steps</Text>
            </Pressable>
          </View>

          <View className="mt-4 bg-white rounded-full p-1 flex-row border border-gray-100">
            {(["week", "month", "year"] as const).map((k) => {
              const active = period === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setPeriod(k)}
                  className={`flex-1 py-3 rounded-full items-center ${active ? "bg-[#eaf7f0]" : "bg-transparent"}`}
                >
                  <Text className={`${active ? "text-[#52B69A]" : "text-gray-500"} font-bold`}>
                    {k === "week" ? "Week" : k === "month" ? "Month" : "Year"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-4 flex-row items-center">
            <Pressable onPress={goPrev} className="w-8 h-52 items-center justify-center" hitSlop={12}>
              <View className="w-8 h-8 rounded-full bg-white border border-gray-200 items-center justify-center">
                <Ionicons name="chevron-back" size={18} color="#76C893" />
              </View>
            </Pressable>

            <View className="flex-1 mx-2">
              <View className="h-52 rounded-2xl bg-[#f3f4f3] overflow-hidden justify-center">
                <View className="absolute left-0 right-0 bottom-0 h-24 bg-[#76C893] opacity-10" />
                {loading ? (
                  <View className="flex-1 items-center justify-center">
                    <Text className="text-gray-500 font-semibold">Loading…</Text>
                  </View>
                ) : (
                  <View className="flex-1 flex-row items-end px-3 pb-5">
                    {(() => {
                      const min = Math.min(...stepSeries);
                      const max = Math.max(...stepSeries);
                      const span = max - min || 1;
                      return stepSeries.map((v, idx) => {
                        const h = 14 + Math.round(((v - min) / span) * 130);
                        return (
                          <View key={`sb-${idx}`} className="flex-1 items-center">
                            <View
                              style={{ height: Math.max(h, 14), width: 12, borderRadius: 999 }}
                              className={v === 0 ? "bg-gray-300" : "bg-[#76C893]"}
                            />
                          </View>
                        );
                      });
                    })()}
                  </View>
                )}
              </View>

              <View className="flex-row mt-3 px-3">
                {chartLabels.map((d, idx) => (
                  <View key={`${d}-${idx}`} className="flex-1 items-center">
                    <Text className="text-[10px] text-gray-500 font-bold">{d}</Text>
                  </View>
                ))}
              </View>
            </View>

            {canGoNext ? (
              <Pressable onPress={goNext} className="w-8 h-52 items-center justify-center" hitSlop={12}>
                <View className="w-8 h-8 rounded-full bg-white border border-gray-200 items-center justify-center">
                  <Ionicons name="chevron-forward" size={18} color="#76C893" />
                </View>
              </Pressable>
            ) : (
              <View className="w-8 h-52" />
            )}
          </View>
        </View>

        <View className="mt-5 bg-white rounded-3xl p-5 pb-6 border border-gray-100">
          <Text className="text-[10px] tracking-widest text-gray-900 font-extrabold">DAILY STEPS</Text>
          <Text className="text-sm text-gray-500 mt-2">Steps reset each day. Auto tracking syncs to your account.</Text>
          <View className="mt-4 gap-3">
            {windowRows.length === 0 ? (
              <Text className="text-gray-500">No step data yet.</Text>
            ) : (
              windowRows.map((r, idx) => (
                <View
                  key={`${r.date.getTime()}-${idx}`}
                  className="flex-row items-center justify-between bg-[#f3f4f3] rounded-2xl px-4 py-4 border border-gray-200"
                >
                  <Text className="text-base font-bold text-gray-700">
                    {period === "week" ? formatLongDate(r.date) : r.label}
                  </Text>
                  <Text className="text-base font-extrabold text-gray-900">
                    {r.steps ? `${r.steps.toLocaleString()} steps` : "—"}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-5">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-2">
                <Text className="text-xl font-extrabold text-gray-900">Edit steps</Text>
                <Text className="text-gray-500 mt-1">{formatLongDate(editModalDate)}</Text>
                <Text className="text-gray-500 mt-2 text-sm">
                  Auto tracking: {editDayAuto.toLocaleString()} steps
                  {editDayManual != null ? " • Manual override active" : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowEditDatePicker(true)}
                className="w-11 h-11 rounded-full bg-[#eaf7f0] border border-[#b7ead1] items-center justify-center"
              >
                <Ionicons name="calendar-outline" size={22} color="#52B69A" />
              </Pressable>
            </View>

            {showEditDatePicker && (
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
            )}

            <View className="mt-5">
              <Text className="text-gray-900 font-extrabold ml-1 mb-2">TOTAL STEPS FOR THIS DAY</Text>
              <TextInput
                value={stepText}
                onChangeText={(t) => setStepText(t.replace(/[^\d]/g, ""))}
                keyboardType="number-pad"
                className="bg-[#f3f4f3] rounded-2xl px-4 py-3 text-gray-900"
                placeholder={String(editDayDisplay || 0)}
              />
            </View>

            <View className="flex-row justify-between mt-6">
              <Pressable onPress={resetToAuto} disabled={saving || editDayManual == null} className="px-4 py-3">
                <Text className={`font-extrabold ${editDayManual == null ? "text-gray-300" : "text-[#52B69A]"}`}>
                  Reset to auto
                </Text>
              </Pressable>
              <View className="flex-row">
                <Pressable onPress={() => setEditOpen(false)} className="px-4 py-3 mr-2">
                  <Text className="font-extrabold text-gray-500">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={saveManual}
                  disabled={saving}
                  className={`px-5 py-3 rounded-2xl bg-[#76C893] ${saving ? "opacity-60" : "opacity-100"}`}
                >
                  <Text className="font-extrabold text-white">{saving ? "Saving..." : "Save"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
