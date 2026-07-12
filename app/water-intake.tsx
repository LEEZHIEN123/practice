import {
  ProfileScreenHeader,
  ThemedCard,
  ThemedScreen,
  ThemedText,
  useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import { formatCalendarDayKey } from "@/lib/calendarDay";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { useWaterIntakeSuggestion } from "@/lib/useWaterIntakeSuggestion";
import type { WaterWeatherCondition } from "@/lib/waterIntakeModel";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

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

type WaterLogRow = { id: string; amountMl: number; createdAt: Date; dayKey: string };

function weatherIconName(condition: WaterWeatherCondition): keyof typeof Ionicons.glyphMap {
  if (condition === "sunny") return "sunny-outline";
  if (condition === "rainy") return "rainy-outline";
  return "cloud-outline";
}

function formatWeatherCondition(condition: WaterWeatherCondition): string {
  if (condition === "sunny") return "Sunny";
  if (condition === "rainy") return "Rainy";
  return "Cloudy";
}

export default function WaterIntakeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const calendarTz = useUserCalendarTimezone();
  const {
    cardStyle,
    theme,
  } = useThemedScreen();
  const { inputStyle, modalCardStyle, placeholderColor } = useProfileCardStyles();
  const [mlText, setMlText] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dayTotalMl, setDayTotalMl] = useState(0);
  const [recordedAt, setRecordedAt] = useState<Date | null>(null);
  const [recentLogs, setRecentLogs] = useState<WaterLogRow[]>([]);
  const [editingLog, setEditingLog] = useState<WaterLogRow | null>(null);
  const [editMlText, setEditMlText] = useState("");
  /** When set, "Recent water intake" lists only this calendar day; `null` = all loaded days (incl. yesterday). */
  const [recentViewDay, setRecentViewDay] = useState<Date | null>(null);
  const [showRecentDayPicker, setShowRecentDayPicker] = useState(false);
  const [authUid, setAuthUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [profileAge, setProfileAge] = useState(0);
  const [profileGender, setProfileGender] = useState<"male" | "female" | null>(null);
  const [profileActivityLevel, setProfileActivityLevel] = useState<string | null>(null);
  const [heightCm, setHeightCm] = useState(0);
  const [weightKg, setWeightKg] = useState(0);
  const [burnedToday, setBurnedToday] = useState(0);
  const [stepsToday, setStepsToday] = useState(0);
  const [dayTick, setDayTick] = useState(0);

  const isSelectedToday = useMemo(
    () =>
      formatCalendarDayKey(selectedDate, calendarTz) === formatCalendarDayKey(new Date(), calendarTz),
    [calendarTz, selectedDate]
  );

  const selectedDayLogsCount = useMemo(() => {
    const k = formatCalendarDayKey(selectedDate, calendarTz);
    return recentLogs.reduce((n, r) => (r.dayKey === k ? n + 1 : n), 0);
  }, [calendarTz, recentLogs, selectedDate]);

  const selectedDayLogsTotalMl = useMemo(() => {
    const k = formatCalendarDayKey(selectedDate, calendarTz);
    return recentLogs.reduce((s, r) => (r.dayKey === k ? s + r.amountMl : s), 0);
  }, [calendarTz, recentLogs, selectedDate]);

  /** Any water for the selected day: logs and/or dailyStats (avoids false “no record” if one source lags). */
  const hasWaterIntakeForSelectedDay =
    selectedDayLogsCount > 0 || (Number.isFinite(dayTotalMl) && dayTotalMl > 0);

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

  const selectedDayTotalMl = hasWaterIntakeForSelectedDay
    ? Math.max(selectedDayLogsTotalMl, dayTotalMl)
    : 0;

  const {
    suggestedMl,
    weather,
    placeName,
    previousPlaceName,
    previousSuggestedMl,
    weatherUnavailableReason,
    loading: suggestionLoading,
    refresh: refreshSuggestion,
  } = useWaterIntakeSuggestion({
    uid: authUid,
    calendarTz,
    calendarDayKey: todayDayKey,
    profile: waterProfile,
    burnedKcalToday: burnedToday,
    stepsToday,
    enabled: Boolean(authUid) && isSelectedToday,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setDayTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as {
          age?: number;
          gender?: "male" | "female";
          height?: number;
          weight?: number;
          activityLevel?: string;
        };
        if (typeof data.age === "number" && Number.isFinite(data.age)) setProfileAge(data.age);
        else setProfileAge(0);
        if (data.gender === "male" || data.gender === "female") setProfileGender(data.gender);
        else setProfileGender(null);
        if (typeof data.height === "number") setHeightCm(data.height);
        else setHeightCm(0);
        if (typeof data.weight === "number") setWeightKg(data.weight);
        else setWeightKg(0);
        if (typeof data.activityLevel === "string" && data.activityLevel.length > 0) {
          setProfileActivityLevel(data.activityLevel);
        } else {
          setProfileActivityLevel(null);
        }
      },
      () => {}
    );
    return () => unsub();
  }, [authUid]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.uid !== authUid) return;
    const todayKey = formatCalendarDayKey(new Date(), calendarTz);
    const unsub = onSnapshot(
      doc(db, "users", user.uid, "dailyStats", todayKey),
      (snap) => {
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
        setBurnedToday(typeof data.burnedKcal === "number" ? data.burnedKcal : 0);
        const stepsAuto = typeof data.stepsAuto === "number" ? data.stepsAuto : 0;
        const stepsManual = typeof data.stepsManual === "number" ? data.stepsManual : null;
        setStepsToday(stepsManual != null ? Math.round(stepsManual) : Math.max(0, Math.round(stepsAuto)));
      },
      () => {
        setBurnedToday(0);
        setStepsToday(0);
      }
    );
    return () => unsub();
  }, [authUid, calendarTz]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const k = formatCalendarDayKey(selectedDate, calendarTz);
    const ref = doc(db, "users", user.uid, "dailyStats", k);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        const ml = typeof data?.waterMl === "number" && Number.isFinite(data.waterMl) ? data.waterMl : 0;
        setDayTotalMl(Math.round(ml));
        const ts = data?.waterRecordedAt;
        if (ts && typeof ts.toDate === "function") setRecordedAt(ts.toDate());
        else setRecordedAt(null);
      },
      () => {
        setDayTotalMl(0);
        setRecordedAt(null);
      }
    );
    return () => unsub();
  }, [calendarTz, selectedDate]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "waterLogs"),
      orderBy("createdAt", "desc"),
      limit(150)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: WaterLogRow[] = [];
        for (const d of snap.docs) {
          const data = d.data() as any;
          const amountMl =
            typeof data?.amountMl === "number" && Number.isFinite(data.amountMl) ? Math.round(data.amountMl) : 0;
          const createdAt = data?.createdAt?.toDate?.() instanceof Date ? data.createdAt.toDate() : null;
          if (!createdAt) continue;
          const logDay = data?.logDate?.toDate?.() instanceof Date ? data.logDate.toDate() : null;
          const dayKey = logDay
            ? formatCalendarDayKey(logDay, calendarTz)
            : formatCalendarDayKey(createdAt, calendarTz);
          rows.push({ id: d.id, amountMl, createdAt, dayKey });
        }
        setRecentLogs(rows);
      },
      () => setRecentLogs([])
    );
    return () => unsub();
  }, [calendarTz]);

  const save = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const parsed = parseInt(mlText.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 20000) {
      Alert.alert("Invalid amount", "Enter milliliters between 1 and 20,000.");
      return;
    }
    try {
      setSaving(true);
      const day = startOfDay(selectedDate);
      const key = formatCalendarDayKey(selectedDate, calendarTz);

      await addDoc(collection(db, "users", user.uid, "waterLogs"), {
        amountMl: parsed,
        createdAt: serverTimestamp(),
        logDate: Timestamp.fromDate(day),
      });

      await setDoc(
        doc(db, "users", user.uid, "dailyStats", key),
        {
          waterMl: increment(parsed),
          waterRecordedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMlText("");
    } catch (e) {
      console.log("Failed to save water:", e);
      Alert.alert("Error", "Could not save water intake.");
    } finally {
      setSaving(false);
    }
  };

  const add = (n: number) => {
    const cur = parseInt(mlText.replace(/[^\d]/g, ""), 10);
    const base = Number.isFinite(cur) ? cur : 0;
    setMlText(String(Math.min(20000, base + n)));
  };

  const beginEditLog = (r: WaterLogRow) => {
    setEditingLog(r);
    setEditMlText(String(r.amountMl));
  };

  const saveEditLog = async () => {
    const user = auth.currentUser;
    if (!user || !editingLog) return;
    const parsed = parseInt(editMlText.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 20000) {
      Alert.alert("Invalid amount", "Enter milliliters between 1 and 20,000.");
      return;
    }
    try {
      setSaving(true);
      const nextMl = Math.round(parsed);
      const delta = nextMl - editingLog.amountMl;
      await updateDoc(doc(db, "users", user.uid, "waterLogs", editingLog.id), {
        amountMl: nextMl,
      });
      if (delta !== 0) {
        await updateDoc(doc(db, "users", user.uid, "dailyStats", editingLog.dayKey), {
          waterMl: increment(delta),
          waterRecordedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setEditingLog(null);
      setEditMlText("");
    } catch (e) {
      console.log("Edit water log failed:", e);
      Alert.alert("Error", "Could not update this water log.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteLog = (r: WaterLogRow) => {
    Alert.alert("Delete this log?", "This will remove the entry from your water history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const user = auth.currentUser;
          if (!user) return;
          try {
            setSaving(true);
            await deleteDoc(doc(db, "users", user.uid, "waterLogs", r.id));
            await updateDoc(doc(db, "users", user.uid, "dailyStats", r.dayKey), {
              waterMl: increment(-r.amountMl),
              updatedAt: serverTimestamp(),
            });
          } catch (e) {
            console.log("Delete water log failed:", e);
            Alert.alert("Error", "Could not delete this water log.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const groupedWater = useMemo(() => {
    const map = new Map<string, WaterLogRow[]>();
    for (const r of recentLogs) {
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
      const total = entries.reduce((s, e) => s + e.amountMl, 0);
      const parts = dateKey.split("-");
      const yy = parseInt(parts[0] ?? "0", 10);
      const mm = parseInt(parts[1] ?? "1", 10);
      const dd = parseInt(parts[2] ?? "1", 10);
      const dayDate = new Date(yy, mm - 1, dd);
      return { dateKey, entries, total, dayDate };
    });
  }, [recentLogs]);

  const filteredGroupedWater = useMemo(() => {
    if (!recentViewDay) return groupedWater;
    const k = formatCalendarDayKey(recentViewDay, calendarTz);
    return groupedWater.filter((g) => g.dateKey === k);
  }, [calendarTz, groupedWater, recentViewDay]);

  const recentFilterLabel = useMemo(() => {
    if (!recentViewDay) return null;
    return formatLongDate(recentViewDay);
  }, [recentViewDay]);

  return (
    <ThemedScreen>
      <ScrollView contentContainerStyle={{ paddingBottom: 56 }} className="px-3" style={{ paddingTop: insets.top + 12 }}>
        <ProfileScreenHeader title="Water Intake" onBack={() => router.back()} titleClassName="text-xl" />

        {isSelectedToday ? (
          <ThemedCard className="p-5 mb-4">
            <View className="flex-row items-center justify-between">
              <ThemedText className="text-base tracking-[0.12em] font-extrabold">TODAY&apos;S WATER INTAKE SUGGESTION</ThemedText>
              <Pressable
                onPress={() => void refreshSuggestion()}
                disabled={suggestionLoading}
                hitSlop={8}
                className="w-9 h-9 rounded-full border items-center justify-center"
                style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
              >
                <Ionicons
                  name="refresh-outline"
                  size={18}
                  color={theme.accentText}
                  style={suggestionLoading ? { opacity: 0.5 } : undefined}
                />
              </Pressable>
            </View>

            {suggestionLoading ? (
              <ThemedText variant="muted" className="text-sm mt-3">
                Calculating based on your profile and local weather...
              </ThemedText>
            ) : suggestedMl != null ? (
              <>
                <ThemedText className="text-3xl font-extrabold mt-3" style={{ color: "#2563eb" }}>
                  {suggestedMl.toLocaleString()} ml
                </ThemedText>
                <ThemedText className="text-sm mt-2 font-extrabold" style={{ color: theme.danger }}>
                  Logged today: {selectedDayTotalMl.toLocaleString()} ml
                  {previousSuggestedMl != null ? (
                    <>
                      {" "}
                      · Previous · {previousPlaceName ?? "Previous location"}:{" "}
                      {previousSuggestedMl.toLocaleString()} ml suggested
                    </>
                  ) : null}
                </ThemedText>

                <View
                  className="mt-4 rounded-2xl border p-4"
                  style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                >
                  <View className="flex-row items-start">
                    <Ionicons
                      name={weather ? weatherIconName(weather.condition) : "cloud-outline"}
                      size={28}
                      color={theme.accentText}
                    />
                    <View className="flex-1 ml-3">
                      <ThemedText className="font-extrabold text-base">
                        {placeName ?? "Location unavailable"}
                      </ThemedText>
                      {weather ? (
                        <>
                          <ThemedText variant="muted" className="text-xs font-extrabold tracking-widest mt-1">
                            {weather.isForecast
                              ? "FORECAST FOR 6:00 AM"
                              : weather.isLive
                                ? "WEATHER AT TODAY'S 6:00 AM"
                                : "ESTIMATED 6:00 AM WEATHER"}
                          </ThemedText>
                          <ThemedText variant="secondary" className="text-sm mt-1 capitalize">
                            {weather.description}
                          </ThemedText>
                          <ThemedText variant="muted" className="text-sm mt-1">
                            {formatWeatherCondition(weather.condition)} · {Math.round(weather.temperature)}°C ·{" "}
                            {weather.humidity}% humidity
                          </ThemedText>
                        </>
                      ) : null}
                      {weatherUnavailableReason ? (
                        <ThemedText className="text-sm mt-2 font-semibold" style={{ color: theme.danger }}>
                          {weatherUnavailableReason}
                        </ThemedText>
                      ) : weather?.isForecast ? (
                        <ThemedText variant="muted" className="text-xs mt-2">
                          Forecast for 6:00 AM is used until morning. After 6:00 AM, that morning weather is kept for the day.
                        </ThemedText>
                      ) : weather?.isLive ? (
                        <ThemedText variant="muted" className="text-xs mt-2">
                          Morning weather at 6:00 AM is used for today&apos;s prediction.
                        </ThemedText>
                      ) : null}
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <ThemedText variant="muted" className="text-sm mt-3">
                Suggestion unavailable. Complete your profile and try again.
              </ThemedText>
            )}
          </ThemedCard>
        ) : null}

        <ThemedCard className="p-5">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-2">
              <View className="flex-row flex-wrap items-baseline gap-x-2">
                <ThemedText className="text-base tracking-[0.12em] font-extrabold">
                  {isSelectedToday ? "TODAY" : "SELECTED DAY"}
                </ThemedText>
                <ThemedText className="text-base font-extrabold">
                  {selectedDate.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </ThemedText>
              </View>
              <ThemedText className="text-sm mt-2 font-extrabold" style={{ color: theme.danger }}>
                Total water intake:{" "}
                {(hasWaterIntakeForSelectedDay
                  ? Math.max(selectedDayLogsTotalMl, dayTotalMl)
                  : 0
                ).toLocaleString()}{" "}
                ml
              </ThemedText>
              {recordedAt && isSelectedToday ? (
                <ThemedText variant="muted" className="text-xs mt-1">
                  Last updated: {recordedAt.toLocaleString()}
                </ThemedText>
              ) : null}
              {!hasWaterIntakeForSelectedDay ? (
                <ThemedText className="text-sm font-semibold mt-2" style={{ color: theme.danger }}>
                  {isSelectedToday ? "You haven't recorded water today." : "No water logged for this day yet."}
                </ThemedText>
              ) : null}
            </View>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="w-11 h-11 rounded-full items-center justify-center border"
              style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
            >
              <Ionicons name="calendar-outline" size={22} color={theme.accentText} />
            </Pressable>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              maximumDate={new Date()}
              onChange={(event, date) => {
                if (Platform.OS !== "ios") setShowDatePicker(false);
                if (event.type === "dismissed") return;
                if (date) setSelectedDate(date);
              }}
            />
          )}

          <ThemedText className="font-extrabold mt-6 mb-2">AMOUNT TO ADD (ml)</ThemedText>
          <TextInput
            value={mlText}
            onChangeText={(t) => setMlText(t.replace(/[^\d]/g, ""))}
            keyboardType="number-pad"
            className="rounded-2xl px-4 py-3 text-lg font-extrabold"
            style={inputStyle}
            placeholder="0"
            placeholderTextColor={placeholderColor}
          />

          <View className="flex-row gap-2 mt-4">
            <Pressable
              onPress={() => add(250)}
              className="flex-1 py-3 rounded-2xl border items-center"
              style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
            >
              <ThemedText variant="accent" className="font-extrabold">+250 ml</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => add(500)}
              className="flex-1 py-3 rounded-2xl border items-center"
              style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
            >
              <ThemedText variant="accent" className="font-extrabold">+500 ml</ThemedText>
            </Pressable>
          </View>
          <Pressable
            onPress={() => add(1000)}
            className="mt-2 py-3 rounded-2xl border items-center"
            style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
          >
            <ThemedText variant="accent" className="font-extrabold">+1000 ml</ThemedText>
          </Pressable>

          <Pressable
            onPress={save}
            disabled={saving}
            className={`mt-6 py-4 rounded-2xl items-center ${saving ? "opacity-60" : ""}`}
            style={{ backgroundColor: theme.accent }}
          >
            <ThemedText className="font-extrabold text-base" style={{ color: "#ffffff" }}>
              {saving ? "Saving..." : "Save"}
            </ThemedText>
          </Pressable>
        </ThemedCard>

        <ThemedCard className="mt-6 p-5 pt-8 pb-10">
          <ThemedText className="text-base tracking-[0.12em] font-extrabold">WATER INTAKE RECORD</ThemedText>
          <ThemedText variant="muted" className="text-xs mt-1">
            History includes today and previous days. Filter by day or pick a date.
          </ThemedText>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-4 -mx-1"
            contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}
          >
            <Pressable
              onPress={() => setRecentViewDay(null)}
              className="px-4 py-2.5 rounded-full border"
              style={
                recentViewDay === null
                  ? { backgroundColor: theme.accent, borderColor: theme.accent }
                  : cardStyle
              }
            >
              <ThemedText
                className="font-extrabold text-sm"
                style={{ color: recentViewDay === null ? "#ffffff" : theme.textPrimary }}
              >
                All days
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setShowRecentDayPicker(true)}
              className="px-4 py-2.5 rounded-full border flex-row items-center"
              style={
                recentViewDay !== null
                  ? { backgroundColor: theme.accentSoft, borderColor: theme.accentText }
                  : cardStyle
              }
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={recentViewDay !== null ? theme.accentText : theme.iconMuted}
              />
              <ThemedText
                variant={recentViewDay !== null ? "accent" : "primary"}
                className="font-extrabold text-sm ml-1.5"
              >
                Pick a day
              </ThemedText>
            </Pressable>
          </ScrollView>

          {recentViewDay ? (
            <View className="mt-3 flex-row items-center justify-between">
              <ThemedText variant="muted" className="text-sm flex-1 pr-2">
                Showing: <ThemedText className="font-extrabold">{recentFilterLabel}</ThemedText>
              </ThemedText>
              <Pressable onPress={() => setRecentViewDay(null)} hitSlop={8}>
                <ThemedText variant="accent" className="text-sm font-extrabold">Show all</ThemedText>
              </Pressable>
            </View>
          ) : null}

          {showRecentDayPicker && (
            <View className="mt-3">
              <DateTimePicker
                value={recentViewDay ?? new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                maximumDate={new Date()}
                onChange={(event, date) => {
                  if (Platform.OS !== "ios") setShowRecentDayPicker(false);
                  if (event.type === "dismissed") return;
                  if (date) setRecentViewDay(date);
                }}
              />
              {Platform.OS === "ios" ? (
                <Pressable
                  onPress={() => setShowRecentDayPicker(false)}
                  className="mt-2 py-3 rounded-2xl border items-center"
                  style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                >
                  <ThemedText variant="accent" className="font-extrabold">Done</ThemedText>
                </Pressable>
              ) : null}
            </View>
          )}

          <View className="mt-4 gap-4 pb-2">
            {groupedWater.length === 0 ? (
              <ThemedText variant="muted" className="text-sm">No water logs yet.</ThemedText>
            ) : filteredGroupedWater.length === 0 ? (
              <ThemedText variant="muted" className="text-sm">
                No water recorded for this day. Try &quot;All days&quot; or another date.
              </ThemedText>
            ) : (
              filteredGroupedWater.map((g) => {
                const isCurrentDay = g.dateKey === todayDayKey;
                return (
                <View
                  key={g.dateKey}
                  className="rounded-2xl overflow-hidden border-2"
                  style={{
                    borderColor: isCurrentDay ? theme.danger : theme.cardBorder,
                    backgroundColor: theme.cardBg,
                  }}
                >
                  <View
                    className="border-b-2 px-4 py-3"
                    style={{
                      backgroundColor: theme.accentSoft,
                      borderBottomColor: isCurrentDay ? theme.danger : theme.accent,
                    }}
                  >
                    <View className="flex-row items-center">
                      <ThemedText variant="accent" className="text-[10px] font-extrabold tracking-[0.2em]">
                        DAY
                      </ThemedText>
                      {isCurrentDay ? (
                        <ThemedText className="ml-2 text-xs font-extrabold" style={{ color: theme.danger }}>
                          Current
                        </ThemedText>
                      ) : null}
                    </View>
                    <ThemedText className="text-lg font-extrabold mt-1">{formatLongDate(g.dayDate)}</ThemedText>
                  </View>
                  <View className="px-3 py-3 gap-2" style={{ backgroundColor: theme.rowBg }}>
                    {g.entries.map((r) => (
                      <View
                        key={r.id}
                        className="flex-row items-center justify-between rounded-xl px-3 py-3 border"
                        style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
                      >
                        <ThemedText variant="secondary" className="text-sm font-semibold">
                          {r.createdAt.toLocaleTimeString()}
                        </ThemedText>
                        <View className="flex-row items-center">
                          <ThemedText className="text-base font-extrabold">
                            +{r.amountMl.toLocaleString()} ml
                          </ThemedText>
                          <Pressable
                            onPress={() => beginEditLog(r)}
                            disabled={saving}
                            hitSlop={10}
                            className="ml-3 w-9 h-9 rounded-full border items-center justify-center"
                            style={cardStyle}
                          >
                            <Ionicons name="create-outline" size={18} color={theme.textPrimary} />
                          </Pressable>
                          <Pressable
                            onPress={() => confirmDeleteLog(r)}
                            disabled={saving}
                            hitSlop={10}
                            className="ml-2 w-9 h-9 rounded-full border items-center justify-center"
                            style={{ backgroundColor: theme.dangerSoft, borderColor: theme.danger }}
                          >
                            <Ionicons name="trash-outline" size={18} color={theme.danger} />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                  <View
                    className="flex-row items-center justify-between px-4 py-3 border-t-2"
                    style={{ backgroundColor: theme.cardBg, borderTopColor: theme.cardBorder }}
                  >
                    <ThemedText variant="muted" className="text-xs font-extrabold tracking-widest">DAY TOTAL</ThemedText>
                    <ThemedText variant="accent" className="text-base font-extrabold">
                      {g.total.toLocaleString()} ml
                    </ThemedText>
                  </View>
                </View>
                );
              })
            )}
          </View>
        </ThemedCard>
      </ScrollView>

      <Modal visible={!!editingLog} transparent animationType="fade" onRequestClose={() => setEditingLog(null)}>
        <Pressable
          className="flex-1 justify-center px-6"
          style={{ backgroundColor: theme.modalOverlay }}
          onPress={() => setEditingLog(null)}
        >
          <Pressable className="rounded-3xl p-6" style={modalCardStyle} onPress={(e) => e.stopPropagation()}>
            <ThemedText className="text-xl font-extrabold">Edit water intake</ThemedText>
            <ThemedText variant="muted" className="text-sm mt-2">
              Update the amount for this entry (ml).
            </ThemedText>

            <View className="mt-5">
              <TextInput
                value={editMlText}
                onChangeText={setEditMlText}
                keyboardType="numeric"
                placeholder="e.g. 500"
                placeholderTextColor={placeholderColor}
                className="rounded-2xl px-4 py-3 text-base"
                style={inputStyle}
              />
            </View>

            <View className="flex-row gap-3 mt-6">
              <Pressable
                onPress={() => setEditingLog(null)}
                disabled={saving}
                className="flex-1 py-3.5 rounded-2xl items-center"
                style={{ backgroundColor: theme.rowBg }}
              >
                <ThemedText variant="secondary" className="font-extrabold">Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={saveEditLog}
                disabled={saving}
                className={`flex-1 py-3.5 rounded-2xl items-center ${saving ? "opacity-60" : ""}`}
                style={{ backgroundColor: theme.accent }}
              >
                <ThemedText className="font-extrabold" style={{ color: "#ffffff" }}>
                  {saving ? "Saving..." : "Save"}
                </ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedScreen>
  );
}
