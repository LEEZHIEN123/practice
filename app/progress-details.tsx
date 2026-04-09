import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import Slider from "@react-native-community/slider";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { auth, db } from "../firebaseConfig";

type TabKey = "weight" | "workout" | "meal";
type PeriodKey = "week" | "month" | "year";

type WeightRow = { weight: number; createdAt: Date };
type WorkoutRow = { title: string; burnedKcal: number; durationMin: number; createdAt: Date };
type MealRow = { title: string; calories: number; createdAt: Date };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

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

export default function ProgressDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; period?: string }>();

  const tab = (params.tab === "workout" || params.tab === "meal" || params.tab === "weight"
    ? params.tab
    : "weight") as TabKey;
  const initialPeriod = (params.period === "month" || params.period === "year" || params.period === "week"
    ? params.period
    : "week") as PeriodKey;

  const [period, setPeriod] = useState<PeriodKey>(initialPeriod);
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [weightRefreshKey, setWeightRefreshKey] = useState(0);

  const [allWeightRows, setAllWeightRows] = useState<WeightRow[]>([]);
  const [weightSeries, setWeightSeries] = useState<number[]>(
    initialPeriod === "week" ? Array(7).fill(0) : initialPeriod === "month" ? Array(4).fill(0) : Array(12).fill(0)
  );
  const [windowWeights, setWindowWeights] = useState<{ label: string; date: Date; weight: number }[]>([]);
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutRow[]>([]);
  const [recentMeals, setRecentMeals] = useState<MealRow[]>([]);

  const [logVisible, setLogVisible] = useState(false);
  const [logWeightText, setLogWeightText] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [logDate, setLogDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const sanitizeDecimal = (t: string) => {
    const cleaned = t.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    const [a, b] = cleaned.split(".");
    if (b === undefined) return a ?? "";
    return `${a ?? ""}.${b.slice(0, 1)}`;
  };

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      if (!user) return;

      if (tab === "weight") {
        const q = query(
          collection(db, "users", user.uid, "weightLogs"),
          orderBy("createdAt", "desc"),
          limit(600)
        );
        const snap = await getDocs(q);
        const rows = snap.docs
          .map((d) => d.data() as any)
          .map((row) => ({
            weight: typeof row.weight === "number" ? row.weight : null,
            createdAt: getCreatedAtDate(row.logDate ?? row.createdAt),
          }))
          .filter((r) => typeof r.weight === "number" && r.createdAt instanceof Date) as WeightRow[];

        setAllWeightRows(rows);
        return;
      }

      if (tab === "workout") {
        const q = query(collection(db, "users", user.uid, "workoutLogs"), orderBy("createdAt", "desc"), limit(15));
        const snap = await getDocs(q);
        const rows = snap.docs
          .map((d) => d.data() as any)
          .map((r) => ({
            title: typeof r.title === "string" ? r.title : "Workout",
            burnedKcal: typeof r.burnedKcal === "number" ? r.burnedKcal : 0,
            durationMin: typeof r.durationMin === "number" ? r.durationMin : 0,
            createdAt: getCreatedAtDate(r.createdAt) ?? new Date(),
          })) as WorkoutRow[];
        setRecentWorkouts(rows);
        return;
      }

      const q = query(collection(db, "users", user.uid, "mealLogs"), orderBy("createdAt", "desc"), limit(15));
      const snap = await getDocs(q);
      const rows = snap.docs
        .map((d) => d.data() as any)
        .map((r) => ({
          title: typeof r.title === "string" ? r.title : "Meal",
          calories: typeof r.calories === "number" ? r.calories : 0,
          createdAt: getCreatedAtDate(r.createdAt) ?? new Date(),
        })) as MealRow[];
      setRecentMeals(rows);
    };

    load();
  }, [tab, weightRefreshKey]);

  const headerTitle = tab === "weight" ? "Weight Progress" : tab === "workout" ? "Workout Progress" : "Meal Progress";

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
    if (tab !== "weight") return;

    const rows = allWeightRows;
    const latestByDay = new Map<string, number>();
    for (const r of rows) {
      const key = sameDayKey(r.createdAt);
      if (!latestByDay.has(key)) latestByDay.set(key, r.weight);
    }

    if (period === "week") {
      const weekStart = startOfWeekMon(anchor);
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      });
      const keys = days.map((d) => sameDayKey(d));
      const series = keys.map((k) => latestByDay.get(k) ?? 0);
      setWeightSeries(series);
      setWindowWeights(
        days.map((d, idx) => ({
          label: chartLabels[idx],
          date: d,
          weight: series[idx] ?? 0,
        }))
      );
      return;
    }

    if (period === "month") {
      const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const buckets = [0, 0, 0, 0];
      const counts = [0, 0, 0, 0];
      for (const r of rows) {
        if (r.createdAt < monthStart) continue;
        if (r.createdAt.getMonth() !== anchor.getMonth() || r.createdAt.getFullYear() !== anchor.getFullYear()) continue;
        const dom = r.createdAt.getDate();
        const idx = Math.min(3, Math.floor((dom - 1) / 7));
        buckets[idx] += r.weight;
        counts[idx] += 1;
      }
      const series = buckets.map((sum, i) => (counts[i] ? sum / counts[i] : 0));
      setWeightSeries(series);
      setWindowWeights(
        series.map((w, idx) => ({
          label: `W${idx + 1}`,
          date: monthStart,
          weight: w,
        }))
      );
      return;
    }

    const year = anchor.getFullYear();
    const sums = Array.from({ length: 12 }, () => 0);
    const counts = Array.from({ length: 12 }, () => 0);
    for (const r of rows) {
      if (r.createdAt.getFullYear() !== year) continue;
      const m = r.createdAt.getMonth();
      sums[m] += r.weight;
      counts[m] += 1;
    }
    const series = sums.map((sum, i) => (counts[i] ? sum / counts[i] : 0));
    setWeightSeries(series);
    setWindowWeights(
      series.map((w, idx) => ({
        label: chartLabels[idx],
        date: new Date(year, idx, 1),
        weight: w,
      }))
    );
  }, [allWeightRows, anchor, chartLabels, period, tab]);

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

  const openLogWeight = () => {
    const base = windowWeights.find((w) => sameDayKey(w.date) === sameDayKey(new Date()))?.weight;
    setLogWeightText(base && Number.isFinite(base) ? base.toFixed(1) : "");
    setLogDate(new Date());
    setLogVisible(true);
  };

  const openEditWeightFor = (date: Date, baseWeight?: number) => {
    setLogDate(date);
    setLogWeightText(typeof baseWeight === "number" && Number.isFinite(baseWeight) && baseWeight > 0 ? baseWeight.toFixed(1) : "");
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

      await updateDoc(doc(db, "users", user.uid), { weight: nextW });
      await addDoc(collection(db, "users", user.uid, "weightLogs"), {
        weight: nextW,
        createdAt: serverTimestamp(),
        logDate: Timestamp.fromDate(startOfDay(logDate)),
      });

      setLogVisible(false);
      setWeightRefreshKey((k) => k + 1);
    } catch (e) {
      console.log("Failed to log weight:", e);
      Alert.alert("Error", "Failed to log your weight.");
    } finally {
      setSavingLog(false);
    }
  };

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="px-6 pt-14">
        <View className="flex-row items-center justify-between mb-6">
          <Pressable onPress={() => router.back()} className="w-12 h-12 rounded-full bg-white items-center justify-center">
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <Text className="text-xl font-extrabold text-gray-900">{headerTitle}</Text>
          <View className="w-12 h-12" />
        </View>

        {tab === "weight" ? (
          <>
            <View className="bg-white rounded-3xl p-5 border border-gray-100">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-[10px] tracking-widest text-gray-900 font-extrabold">GRAPH PERIOD</Text>
                  <Text className="text-lg font-extrabold text-gray-900 mt-2">{title}</Text>
                </View>
                <Pressable onPress={openLogWeight} className="px-4 py-2 rounded-full bg-[#76C893]">
                  <Text className="text-white font-extrabold">Log weight</Text>
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
                {/* Left arrow (outside chart, inside card) */}
                <Pressable onPress={goPrev} className="w-8 h-52 items-center justify-center" hitSlop={12}>
                  <View className="w-8 h-8 rounded-full bg-white border border-gray-200 items-center justify-center">
                    <Ionicons name="chevron-back" size={18} color="#76C893" />
                  </View>
                </Pressable>

                {/* Chart + aligned labels */}
                <View className="flex-1 mx-2">
                  <View className="h-52 rounded-2xl bg-[#f3f4f3] overflow-hidden justify-center">
                    <View className="absolute left-0 right-0 bottom-0 h-24 bg-[#76C893] opacity-10" />
                    <View className="flex-1 flex-row items-end px-3 pb-5">
                      {(() => {
                        const min = Math.min(...weightSeries);
                        const max = Math.max(...weightSeries);
                        const span = max - min || 1;
                        return weightSeries.map((v, idx) => {
                          const h = 14 + Math.round(((v - min) / span) * 130);
                          return (
                            <View key={`wb-${idx}`} className="flex-1 items-center">
                              <View
                                style={{ height: h, width: 12, borderRadius: 999 }}
                                className={v === 0 ? "bg-gray-300" : "bg-[#76C893]"}
                              />
                            </View>
                          );
                        });
                      })()}
                    </View>
                  </View>

                  {/* Labels must align with bars (same padding + same flex) */}
                  <View className="flex-row mt-3 px-3">
                    {chartLabels.map((d, idx) => (
                      <View key={`${d}-${idx}`} className="flex-1 items-center">
                        <Text className="text-[10px] text-gray-500 font-bold">{d}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Right arrow (outside chart, inside card) */}
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
              <Text className="text-[10px] tracking-widest text-gray-900 font-extrabold">RECENT WEIGHTS</Text>
              <View className="mt-4 gap-3">
                {windowWeights.length === 0 ? (
                  <Text className="text-gray-500">No weight logs yet.</Text>
                ) : (
                  windowWeights.map((r, idx) => (
                    <View key={`${r.date.getTime()}-${idx}`} className="flex-row items-center justify-between bg-[#f3f4f3] rounded-2xl px-4 py-4 border border-gray-200">
                      <Text className="text-base font-bold text-gray-700">
                        {period === "week" ? formatLongDate(r.date) : r.label}
                      </Text>
                      <View className="flex-row items-center">
                        <Text className="text-base font-extrabold text-gray-900">
                          {r.weight ? `${r.weight.toFixed(1)} kg` : "—"}
                        </Text>
                        <Pressable
                          onPress={() => openEditWeightFor(r.date, r.weight)}
                          hitSlop={10}
                          className="ml-3 w-9 h-9 rounded-full bg-white border border-gray-200 items-center justify-center"
                        >
                          <Ionicons name="create-outline" size={18} color="#111827" />
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          </>
        ) : tab === "workout" ? (
          <View className="bg-white rounded-3xl p-5 border border-gray-100">
            <Text className="text-[10px] tracking-widest text-gray-900 font-extrabold">RECENT WORKOUTS</Text>
            <Text className="text-sm text-gray-500 mt-2">This section will auto update every day.</Text>
            <View className="mt-4 gap-3">
              {recentWorkouts.length === 0 ? (
                <Text className="text-gray-500">No workouts yet.</Text>
              ) : (
                recentWorkouts.map((w, idx) => (
                  <View key={`${w.createdAt.getTime()}-${idx}`} className="flex-row items-center justify-between bg-[#f3f4f3] rounded-2xl px-4 py-3 border border-gray-200">
                    <View className="flex-1 pr-3">
                      <Text className="text-sm font-bold text-gray-700">{formatLongDate(w.createdAt)}</Text>
                      <Text className="text-xs text-gray-500 mt-1">{w.title} • {Math.round(w.durationMin)} mins</Text>
                    </View>
                    <Text className="text-sm font-extrabold text-gray-900">{Math.round(w.burnedKcal)} kcal</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        ) : (
          <View className="bg-white rounded-3xl p-5 border border-gray-100">
            <Text className="text-[10px] tracking-widest text-gray-900 font-extrabold">RECENT MEALS</Text>
            <Text className="text-sm text-gray-500 mt-2">This section will auto update every day.</Text>
            <View className="mt-4 gap-3">
              {recentMeals.length === 0 ? (
                <Text className="text-gray-500">No meals yet.</Text>
              ) : (
                recentMeals.map((m, idx) => (
                  <View key={`${m.createdAt.getTime()}-${idx}`} className="flex-row items-center justify-between bg-[#f3f4f3] rounded-2xl px-4 py-3 border border-gray-200">
                    <View className="flex-1 pr-3">
                      <Text className="text-sm font-bold text-gray-700">{formatLongDate(m.createdAt)}</Text>
                      <Text className="text-xs text-gray-500 mt-1">{m.title}</Text>
                    </View>
                    <Text className="text-sm font-extrabold text-gray-900">{Math.round(m.calories)} kcal</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Log weight modal */}
      <Modal visible={logVisible} transparent animationType="fade" onRequestClose={() => setLogVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-5">
            <Text className="text-xl font-extrabold text-gray-900">Log weight</Text>
            <Text className="text-gray-500 mt-1">Pick a date and log your weight.</Text>

            <View className="mt-5">
              <Text className="text-gray-900 font-extrabold ml-1 mb-2">DATE</Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                className="bg-[#f3f4f3] rounded-2xl px-4 py-3 text-gray-900 flex-row items-center justify-between"
              >
                <Text className="text-gray-900 font-bold">{formatLongDate(logDate)}</Text>
                <Ionicons name="calendar-outline" size={20} color="#6b7280" />
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

              <Text className="text-gray-900 font-extrabold ml-1 mb-2 mt-4">WEIGHT (kg)</Text>
              <TextInput
                value={logWeightText}
                onChangeText={(t) => setLogWeightText(sanitizeDecimal(t))}
                keyboardType="decimal-pad"
                className="bg-[#f3f4f3] rounded-2xl px-4 py-3 text-gray-900"
                placeholder="68.2"
              />
              <Slider
                style={{ width: "100%", marginTop: 10 }}
                minimumValue={30}
                maximumValue={200}
                step={0.1}
                value={Number(logWeightText || 0) || 68}
                onValueChange={(v) => setLogWeightText(v.toFixed(1))}
                minimumTrackTintColor="#76C893"
                maximumTrackTintColor="#d1d5db"
                thumbTintColor="#76C893"
              />
            </View>

            <View className="flex-row justify-end mt-6">
              <Pressable onPress={() => setLogVisible(false)} className="px-4 py-3 mr-2">
                <Text className="font-extrabold text-gray-500">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveWeightLog}
                disabled={savingLog}
                className={`px-5 py-3 rounded-2xl bg-[#76C893] ${savingLog ? "opacity-60" : "opacity-100"}`}
              >
                <Text className="font-extrabold text-white">{savingLog ? "Saving..." : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

