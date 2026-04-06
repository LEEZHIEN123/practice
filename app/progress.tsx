import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { auth, db } from "../firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import Slider from "@react-native-community/slider";
import DateTimePicker from "@react-native-community/datetimepicker";

type TabKey = "weight" | "workout" | "meal";
type PeriodKey = "week" | "month" | "year";

export default function ProgressScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("weight");
  const [period, setPeriod] = useState<PeriodKey>("week");

  const [heightCm, setHeightCm] = useState<number>(0);
  const [weightKg, setWeightKg] = useState<number>(0);

  const [logVisible, setLogVisible] = useState(false);
  const [logWeightText, setLogWeightText] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [logDate, setLogDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [weightRefreshKey, setWeightRefreshKey] = useState(0);

  const [weightSeries, setWeightSeries] = useState<number[]>([]);
  const [hasWeightLogs, setHasWeightLogs] = useState(false);
  const [latestLoggedWeight, setLatestLoggedWeight] = useState<number>(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? snap.data() : {};

        const h = typeof data.height === "number" ? data.height : 0;
        const w = typeof data.weight === "number" ? data.weight : 0;

        setHeightCm(h);
        setWeightKg(w);
      } catch (e) {
        console.log("Failed to load progress:", e);
      }
    };

    load();
  }, []);

  useEffect(() => {
    const loadWeightSeries = async () => {
      if (tab !== "weight") return;
      const user = auth.currentUser;
      if (!user) return;

      try {
        // Pull a reasonable window; we'll bucket client-side per period.
        const q = query(
          collection(db, "users", user.uid, "weightLogs"),
          orderBy("createdAt", "desc"),
          limit(400)
        );
        const snap = await getDocs(q);
        const rows = snap.docs
          .map((d) => d.data() as any)
          .map((row) => ({
            weight: typeof row.weight === "number" ? row.weight : null,
            // Prefer explicit logDate (selected by user); fallback to createdAt for older docs.
            createdAt: getCreatedAtDate(row.logDate ?? row.createdAt),
          }))
          .filter((r) => typeof r.weight === "number" && r.createdAt instanceof Date) as {
          weight: number;
          createdAt: Date;
        }[];

        const any = rows.length > 0;
        setHasWeightLogs(any);

        if (!any) {
          const zeros = period === "week" ? 7 : period === "month" ? 4 : 12;
          setLatestLoggedWeight(0);
          setWeightSeries(Array.from({ length: zeros }, () => 0));
          return;
        }

        // rows are newest-first due to query
        setLatestLoggedWeight(rows[0].weight);

        const now = new Date();

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
        setWeightSeries(sums.map((sum, i) => (counts[i] ? sum / counts[i] : 0)));
      } catch (e) {
        console.log("Failed to load weight series:", e);
        const zeros = period === "week" ? 7 : period === "month" ? 4 : 12;
        setHasWeightLogs(false);
        setLatestLoggedWeight(0);
        setWeightSeries(Array.from({ length: zeros }, () => 0));
      }
    };

    loadWeightSeries();
  }, [period, tab, weightRefreshKey]);

  const bmi = useMemo(() => {
    if (!heightCm || !weightKg) return 0;
    const m = heightCm / 100;
    const value = weightKg / (m * m);
    return Number.isFinite(value) ? value : 0;
  }, [heightCm, weightKg]);

  const bmiStatus = useMemo(() => {
    if (!bmi) return "—";
    if (bmi < 18.5) return "Under";
    if (bmi < 25) return "Normal";
    if (bmi < 30) return "Over";
    return "Obese";
  }, [bmi]);

  const metricLabel = useMemo(() => {
    if (tab === "weight") return "CURRENT METRIC";
    if (tab === "workout") return period === "week" ? "THIS WEEK" : period === "month" ? "THIS MONTH" : "THIS YEAR";
    return period === "week" ? "THIS WEEK" : period === "month" ? "THIS MONTH" : "THIS YEAR";
  }, [tab]);

  const metricValue = useMemo(() => {
    const percentDelta = (series: number[]) => {
      if (!series.length) return 0;
      const firstIdx = series.findIndex((v) => v > 0);
      let lastIdx = -1;
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i] > 0) {
          lastIdx = i;
          break;
        }
      }
      if (firstIdx === -1 || lastIdx === -1 || lastIdx === firstIdx) return 0;
      const first = series[firstIdx];
      const last = series[lastIdx];
      if (!first) return 0;
      return ((last - first) / first) * 100;
    };
    const pct = tab === "weight" ? percentDelta(weightSeries) : 0;

    if (tab === "weight")
      return {
        main: hasWeightLogs ? `${latestLoggedWeight.toFixed(1)} kg` : "0.0 kg",
        delta: hasWeightLogs
          ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`
          : "0.0%",
      };
    if (tab === "workout") return { main: "3 sessions", delta: "+1" };
    return { main: "1,720 kcal", delta: "+120" };
  }, [tab, hasWeightLogs, latestLoggedWeight, weightSeries]);

  const chartLabels = useMemo(() => {
    if (period === "week") return ["M", "T", "W", "T", "F", "S", "S"];
    if (period === "month") return ["W1", "W2", "W3", "W4"];
    return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  }, [period]);

  const hoverLabel = useMemo(() => {
    if (tab !== "weight") return "";
    if (hoverIdx == null) return "";
    const label = chartLabels[hoverIdx] ?? "";
    const v = weightSeries[hoverIdx] ?? 0;
    return `${label}: ${v.toFixed(1)} kg`;
  }, [chartLabels, hoverIdx, tab, weightSeries]);

  const openLogWeight = () => {
    const base = hasWeightLogs ? latestLoggedWeight : weightKg;
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
      setWeightRefreshKey((k) => k + 1);
      setLogVisible(false);
    } catch (e) {
      console.log("Failed to log weight:", e);
      Alert.alert("Error", "Failed to log your weight.");
    } finally {
      setSavingLog(false);
    }
  };

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} className="px-6 pt-14">
        {/* Header */}
        <View className="items-center mb-6">
          <Text className="text-2xl font-extrabold text-gray-900">Progress</Text>
        </View>

        {/* BMI Card */}
        <View className="bg-white rounded-3xl p-5 border border-gray-100">
          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] tracking-widest text-gray-400 font-bold">
              BODY MASS INDEX
            </Text>
            <View className="px-3 py-1 rounded-full bg-[#eaf7f0] border border-[#b7ead1]">
              <Text className="text-xs font-semibold text-[#52B69A]">{bmiStatus}</Text>
            </View>
          </View>

          <View className="flex-row items-end mt-4">
            <Text className="text-4xl font-extrabold text-gray-900">
              {bmi ? bmi.toFixed(1) : "--"}
            </Text>
            <Text className="text-gray-500 ml-2 mb-1">kg/m²</Text>
          </View>

          {/* BMI scale */}
          <View className="mt-4">
            <View className="flex-row h-2 rounded-full overflow-hidden">
              <View className="flex-1 bg-blue-300" />
              <View className="flex-1 bg-green-300" />
              <View className="flex-1 bg-yellow-300" />
              <View className="flex-1 bg-red-300" />
            </View>

            <View className="flex-row justify-between mt-2">
              <Text className="text-[10px] text-gray-400">18.5</Text>
              <Text className="text-[10px] text-gray-400">25.0</Text>
              <Text className="text-[10px] text-gray-400">30.0</Text>
            </View>

            <View className="flex-row justify-between mt-2">
              <Text className="text-[10px] text-gray-400 font-bold">UNDER</Text>
              <Text className="text-[10px] text-gray-400 font-bold">NORMAL</Text>
              <Text className="text-[10px] text-gray-400 font-bold">OVER</Text>
              <Text className="text-[10px] text-gray-400 font-bold">OBESE</Text>
            </View>
          </View>
        </View>

        {/* Segmented Control */}
        <View className="mt-5 bg-white rounded-full p-1 flex-row border border-gray-100">
          <Pressable
            onPress={() => setTab("weight")}
            className={`flex-1 py-3 rounded-full items-center ${
              tab === "weight" ? "bg-[#eaf7f0]" : "bg-transparent"
            }`}
          >
            <Text className={`${tab === "weight" ? "text-[#52B69A]" : "text-gray-500"} font-bold`}>
              Weight
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("workout")}
            className={`flex-1 py-3 rounded-full items-center ${
              tab === "workout" ? "bg-[#eaf7f0]" : "bg-transparent"
            }`}
          >
            <Text className={`${tab === "workout" ? "text-[#52B69A]" : "text-gray-500"} font-bold`}>
              Workout
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("meal")}
            className={`flex-1 py-3 rounded-full items-center ${
              tab === "meal" ? "bg-[#eaf7f0]" : "bg-transparent"
            }`}
          >
            <Text className={`${tab === "meal" ? "text-[#52B69A]" : "text-gray-500"} font-bold`}>
              Meal
            </Text>
          </Pressable>
        </View>

        {/* Period selector (different style from tabs) */}
        <View className="mt-4 flex-row justify-between">
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
                className={`flex-1 mx-1 rounded-2xl border px-3 py-3 items-center ${
                  active ? "border-[#76C893] bg-[#eaf7f0]" : "border-gray-200 bg-white"
                }`}
              >
                <Text className={`${active ? "text-[#52B69A]" : "text-gray-500"} font-extrabold`}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Metric + chart card */}
        <View className="mt-5 bg-white rounded-3xl p-5 border border-gray-100">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[10px] tracking-widest text-gray-400 font-bold">
                {metricLabel}
              </Text>
              <View className="flex-row items-end mt-2 flex-wrap">
                <Text className="text-3xl font-extrabold text-gray-900 shrink">
                  {metricValue.main}
                </Text>
                <View className="ml-3 px-2 py-1 rounded-full bg-[#eaf7f0] mb-1">
                  <Text className="text-xs font-bold text-[#52B69A]">
                    {metricValue.delta}
                  </Text>
                </View>
              </View>
            </View>

            {tab === "weight" ? (
              <Pressable
                onPress={openLogWeight}
                className="px-4 py-2 rounded-full bg-[#76C893]"
              >
                <Text className="text-white font-extrabold">Log weight +</Text>
              </Pressable>
            ) : (
              <Pressable className="w-10 h-10 rounded-full bg-[#76C893] items-center justify-center">
                <Ionicons name="add" size={22} color="white" />
              </Pressable>
            )}
          </View>

          {/* Weight history */}
          <Pressable
            className="mt-6"
            disabled={tab !== "weight"}
            onPress={() => tab === "weight" && router.push("/weight-history")}
          >
            <View className="h-32 rounded-2xl bg-[#f3f4f3] overflow-hidden">
              <View className="absolute left-0 right-0 bottom-0 h-14 bg-[#76C893] opacity-10" />
              {tab === "weight" && hoverIdx != null && (
                <View className="absolute top-2 left-0 right-0 items-center">
                  <View className="px-3 py-1 rounded-full bg-white border border-gray-200">
                    <Text className="text-xs font-bold text-gray-800">{hoverLabel}</Text>
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
                            onPressIn={() => setHoverIdx(idx)}
                            onPressOut={() => setHoverIdx(null)}
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
                          <Text className="text-[10px] text-gray-400 font-bold mt-2">
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
          </Pressable>
        </View>

        {/* Recent Workouts */}
        <View className="mt-8">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-gray-900">Recent Workouts</Text>
            <Text className="text-xs font-bold text-[#52B69A]">SEE ALL</Text>
          </View>

          <View className="mt-4 gap-3">
            <View className="bg-white rounded-3xl p-4 flex-row items-center justify-between border border-gray-100">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-[#eaf7f0] items-center justify-center">
                  <Ionicons name="flash-outline" size={18} color="#52B69A" />
                </View>
                <View className="ml-3">
                  <Text className="font-extrabold text-gray-900">Morning Yoga</Text>
                  <Text className="text-xs text-gray-500 mt-1">30 mins • 120 kcal</Text>
                </View>
              </View>
              <Text className="text-[10px] font-bold text-gray-400">TODAY</Text>
            </View>

            <View className="bg-white rounded-3xl p-4 flex-row items-center justify-between border border-gray-100">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-[#eef7f1] items-center justify-center">
                  <Ionicons name="walk-outline" size={18} color="#52B69A" />
                </View>
                <View className="ml-3">
                  <Text className="font-extrabold text-gray-900">Evening Run</Text>
                  <Text className="text-xs text-gray-500 mt-1">45 mins • 450 kcal</Text>
                </View>
              </View>
              <Text className="text-[10px] font-bold text-gray-400">YESTERDAY</Text>
            </View>
          </View>
        </View>

        {/* Recent Meals */}
        <View className="mt-8 mb-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-gray-900">Recent Meals</Text>
            <Text className="text-xs font-bold text-[#52B69A]">SEE ALL</Text>
          </View>

          <View className="mt-4 gap-3">
            <View className="bg-white rounded-3xl p-4 flex-row items-center justify-between border border-gray-100">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-[#eaf7f0] items-center justify-center">
                  <Ionicons name="restaurant-outline" size={18} color="#52B69A" />
                </View>
                <View className="ml-3">
                  <Text className="font-extrabold text-gray-900">Grilled Salmon Salad</Text>
                  <Text className="text-xs text-gray-500 mt-1">High Protein • 420 kcal</Text>
                </View>
              </View>
              <Text className="text-[10px] font-bold text-gray-400">TODAY</Text>
            </View>

            <View className="bg-white rounded-3xl p-4 flex-row items-center justify-between border border-gray-100">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-[#eef7f1] items-center justify-center">
                  <Ionicons name="leaf-outline" size={18} color="#52B69A" />
                </View>
                <View className="ml-3">
                  <Text className="font-extrabold text-gray-900">Avocado Toast</Text>
                  <Text className="text-xs text-gray-500 mt-1">Breakfast • 310 kcal</Text>
                </View>
              </View>
              <Text className="text-[10px] font-bold text-gray-400">TODAY</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation (match existing app style) */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex-row justify-around py-3">
        <Pressable onPress={() => router.replace("/home")} className="items-center">
          <Ionicons name="home-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">HOME</Text>
        </Pressable>

        <Pressable onPress={() => router.replace("/discover")} className="items-center">
          <Ionicons name="compass-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">EXPLORE</Text>
        </Pressable>

        <Pressable className="items-center">
          <Ionicons name="stats-chart" size={20} color="#76C893" />
          <Text className="text-[10px] text-[#76C893] font-bold mt-1">PROGRESS</Text>
        </Pressable>

        <Pressable onPress={() => router.replace("/profile")} className="items-center">
          <Ionicons name="person-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">PROFILE</Text>
        </Pressable>
      </View>

      {/* Log weight modal */}
      <Modal visible={logVisible} transparent animationType="fade" onRequestClose={() => setLogVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-5">
            <Text className="text-xl font-extrabold text-gray-900">Log weight</Text>
            <Text className="text-gray-500 mt-1">Pick a date and log your weight.</Text>

            <View className="mt-5">
              <Text className="text-gray-600 font-semibold ml-1 mb-2">DATE</Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                className="bg-[#f3f4f3] rounded-2xl px-4 py-3 text-gray-900 flex-row items-center justify-between"
              >
                <Text className="text-gray-900 font-bold">{formatDateShort(logDate)}</Text>
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

              <Text className="text-gray-600 font-semibold ml-1 mb-2">WEIGHT (kg)</Text>
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
                value={Number(logWeightText || 0) || latestLoggedWeight || weightKg || 68}
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

