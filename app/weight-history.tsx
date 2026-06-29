import {
  ThemedBackButton,
  ThemedCard,
  ThemedScreen,
  ThemedText,
} from "@/components/themed/ThemedUi";
import { getCurrentPeriodSlotIndex } from "@/lib/progressPeriodCurrent";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { auth, db } from "../firebaseConfig";

type PeriodKey = "week" | "month" | "year";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

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

function pctDelta(series: number[]) {
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
}

export default function WeightHistoryScreen() {
  const router = useRouter();
  const {
    segmentTrackStyle,
    segmentActiveStyle,
    theme,
  } = useThemedScreen();
  const [period, setPeriod] = useState<PeriodKey>("week");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [series, setSeries] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [hasAny, setHasAny] = useState(false);

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      if (!user) {
        setHasAny(false);
        setSeries(period === "week" ? Array(7).fill(0) : period === "month" ? Array(4).fill(0) : Array(12).fill(0));
        return;
      }

      try {
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
            // Prefer explicit logDate (selected by user); fallback to createdAt for older docs.
            createdAt: getCreatedAtDate(row.logDate ?? row.createdAt),
          }))
          .filter((r) => typeof r.weight === "number" && r.createdAt instanceof Date) as {
          weight: number;
          createdAt: Date;
        }[];

        setHasAny(rows.length > 0);

        if (period === "week") {
          const ws = startOfWeekMon(anchor);
          const keys = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(ws);
            d.setDate(d.getDate() + i);
            return sameDayKey(d);
          });
          const latestByDay = new Map<string, number>();
          for (const r of rows) {
            const key = sameDayKey(r.createdAt);
            if (!latestByDay.has(key)) latestByDay.set(key, r.weight);
          }
          setSeries(keys.map((k) => latestByDay.get(k) ?? 0));
          return;
        }

        if (period === "month") {
          const ms = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
          const buckets = [0, 0, 0, 0];
          const counts = [0, 0, 0, 0];
          for (const r of rows) {
            if (r.createdAt < ms) continue;
            if (r.createdAt.getMonth() !== anchor.getMonth() || r.createdAt.getFullYear() !== anchor.getFullYear())
              continue;
            const dom = r.createdAt.getDate();
            const idx = Math.min(3, Math.floor((dom - 1) / 7));
            buckets[idx] += r.weight;
            counts[idx] += 1;
          }
          setSeries(buckets.map((sum, i) => (counts[i] ? sum / counts[i] : 0)));
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
        setSeries(sums.map((sum, i) => (counts[i] ? sum / counts[i] : 0)));
      } catch (e) {
        console.log("Weight history load failed:", e);
        setHasAny(false);
        setSeries(period === "week" ? Array(7).fill(0) : period === "month" ? Array(4).fill(0) : Array(12).fill(0));
      }
    };

    load();
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

  const labels = useMemo(() => {
    if (period === "week") return DAY_NAMES;
    if (period === "month") return ["W1", "W2", "W3", "W4"];
    return MONTH_LABELS;
  }, [period]);

  const delta = useMemo(() => {
    if (!hasAny) return "0.0%";
    const p = pctDelta(series);
    return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
  }, [hasAny, series]);

  const currentPeriodSlotIndex = useMemo(() => getCurrentPeriodSlotIndex(period, anchor), [period, anchor]);

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

  return (
    <ThemedScreen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="px-3 pt-14">
        <View className="flex-row items-center justify-between mb-6">
          <ThemedBackButton onPress={() => router.back()} />
          <ThemedText className="text-xl font-extrabold">Weight History</ThemedText>
          <View className="w-11 h-11" />
        </View>

        <ThemedCard className="p-5">
          <View className="flex-row items-center justify-between">
            <View>
              <ThemedText variant="muted" className="text-[10px] tracking-widest font-bold">PERIOD</ThemedText>
              <ThemedText className="text-lg font-extrabold mt-2">{title}</ThemedText>
              <ThemedText variant="accent" className="text-sm font-bold mt-1">{delta}</ThemedText>
            </View>
            <View className="flex-row items-center">
              <Pressable
                onPress={goPrev}
                className="w-11 h-11 rounded-full items-center justify-center mr-2"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Ionicons name="chevron-back" size={20} color={theme.accent} />
              </Pressable>
              <Pressable
                onPress={goNext}
                className="w-11 h-11 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Ionicons name="chevron-forward" size={20} color={theme.accent} />
              </Pressable>
            </View>
          </View>

          <View className="mt-5">
            <View className="h-40 rounded-2xl overflow-hidden" style={{ backgroundColor: theme.rowBg }}>
              <View className="absolute left-0 right-0 bottom-0 h-20 opacity-10" style={{ backgroundColor: theme.accent }} />
              <View className="flex-1 flex-row items-end px-4 pb-4">
                {(() => {
                  const min = Math.min(...series);
                  const max = Math.max(...series);
                  const span = max - min || 1;
                  return series.map((v, idx) => {
                    const h = 12 + Math.round(((v - min) / span) * 90);
                    return (
                      <View key={`hb-${idx}`} className="flex-1 items-center">
                        <View
                          style={{
                            height: h,
                            width: 10,
                            borderRadius: 999,
                            backgroundColor: v === 0 ? theme.iconMuted : theme.accent,
                          }}
                        />
                      </View>
                    );
                  });
                })()}
              </View>
            </View>
            <View className="flex-row justify-between mt-3 px-1">
              {labels.map((d, idx) => {
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

          {!hasAny && (
            <ThemedText variant="muted" className="text-center text-sm mt-5">
              No weight logs yet. Your chart will appear after you log a weight.
            </ThemedText>
          )}
        </ThemedCard>

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
      </ScrollView>
    </ThemedScreen>
  );
}

