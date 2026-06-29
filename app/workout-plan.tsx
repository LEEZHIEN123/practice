import { Pressable } from "@/components/Pressable";
import {
    ThemedBackButton,
    ThemedCard,
    ThemedRow,
    ThemedScreen,
    ThemedText,
    useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { plansEqual, sanitizeActiveWorkoutPlan, type WorkoutType } from "@/lib/workoutCatalog";
import {
    bmiBandKey,
    calcBmi,
    durationDays,
    generateActiveWorkoutPlan,
    pickOrGenerateWorkoutPlanForBand,
    workoutPlansByBmiGoalField,
    type ActiveWorkoutPlan,
    type PlanDuration,
} from "@/lib/workoutPlan";
import { useRouter } from "expo-router";
import {
    collection,
    doc,
    getDoc,
    limit,
    onSnapshot,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

function normalizeWorkoutName(s: string): string {
  return s.trim().toLowerCase();
}

function isDiscoverWorkoutRecord(data: Record<string, unknown>): boolean {
  return (data as any)?.origin === "discover";
}

function toDateLike(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const maybe = (value as any)?.toDate?.();
  if (maybe instanceof Date && !Number.isNaN(maybe.getTime())) return maybe;
  return null;
}

function startOfCalendarDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function durationLabel(d: ActiveWorkoutPlan["duration"]) {
  if (d === "week") return "One Week Plan";
  if (d === "biweekly") return "Biweekly Plan";
  return "Monthly Plan";
}

/** Suggested-type chips: spell out acronyms in brackets where helpful. */
function suggestedWorkoutTypeLabel(t: WorkoutType): string {
  if (t === "HIIT") return "HIIT (High-Intensity Interval Training)";
  return t;
}

export default function WorkoutPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cardStyle, textPrimary, textSecondary, textMuted, theme } = useThemedScreen();
  const { modalCardStyle } = useProfileCardStyles();
  const [plan, setPlan] = useState<ActiveWorkoutPlan | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [userBmi, setUserBmi] = useState<number | null>(null);
  const [goal, setGoal] = useState<"gain" | "maintain" | "lose" | null>(null);
  const [pendingDuration, setPendingDuration] = useState<PlanDuration>("week");
  const [plansByDuration, setPlansByDuration] = useState<Record<string, any> | null>(null);
  const [lastCompletedDay, setLastCompletedDay] = useState<number | null>(null);
  const [lastCompletedAt, setLastCompletedAt] = useState<Date | null>(null);
  /** Bumps on an interval so “today’s plan day” recomputes after midnight without relying only on Firestore updates. */
  const [calendarTick, setCalendarTick] = useState(0);
  /** Plan day 1 + same exercise name as current schedule (any plan version — survives goal/BMI plan swap). */
  const [day1HitFromLogs, setDay1HitFromLogs] = useState(false);
  const [day1HitFromSessions, setDay1HitFromSessions] = useState(false);
  /** Earliest completion day for Day 1 (used as stable anchor for "Today"). */
  const [day1EarliestAtFromLogs, setDay1EarliestAtFromLogs] = useState<Date | null>(null);
  const [day1EarliestAtFromSessions, setDay1EarliestAtFromSessions] = useState<Date | null>(null);
  const rolloverInFlightRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setCalendarTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !plan?.schedule?.length) {
      setDay1HitFromLogs(false);
      setDay1HitFromSessions(false);
      setDay1EarliestAtFromLogs(null);
      setDay1EarliestAtFromSessions(null);
      return;
    }
    const day1Row = plan.schedule.find((r) => r.day === 1);
    if (!day1Row?.workout?.trim()) {
      setDay1HitFromLogs(false);
      setDay1HitFromSessions(false);
      setDay1EarliestAtFromLogs(null);
      setDay1EarliestAtFromSessions(null);
      return;
    }
    const wn = normalizeWorkoutName(day1Row.workout);
    const expectedPlanCreatedAt = typeof plan.createdAt === "string" && plan.createdAt.trim().length > 0
      ? plan.createdAt
      : null;

    const qLogs = query(collection(db, "users", user.uid, "workoutLogs"), where("day", "==", 1), limit(80));
    const qSess = query(collection(db, "users", user.uid, "workoutSessions"), where("day", "==", 1), limit(80));

    const unsubLogs = onSnapshot(qLogs, (snap) => {
      let hit = false;
      let earliest: Date | null = null;
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        if (isDiscoverWorkoutRecord(data)) continue;
        if (expectedPlanCreatedAt) {
          const docPlanCreatedAt = typeof (data as any).planCreatedAt === "string" ? (data as any).planCreatedAt : null;
          if (docPlanCreatedAt !== expectedPlanCreatedAt) continue;
        }
        const title = typeof data.title === "string" ? data.title : "";
        if (normalizeWorkoutName(title) === wn) {
          hit = true;
          const when =
            toDateLike((data as any).createdAt) ??
            toDateLike((data as any).endedAt) ??
            toDateLike((data as any).startedAt) ??
            toDateLike((data as any).updatedAt);
          if (when && (!earliest || when.getTime() < earliest.getTime())) earliest = when;
        }
      }
      setDay1HitFromLogs(hit);
      setDay1EarliestAtFromLogs(earliest);
    });
    const unsubSess = onSnapshot(qSess, (snap) => {
      let hit = false;
      let earliest: Date | null = null;
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        if (isDiscoverWorkoutRecord(data)) continue;
        if (expectedPlanCreatedAt) {
          const docPlanCreatedAt = typeof (data as any).planCreatedAt === "string" ? (data as any).planCreatedAt : null;
          if (docPlanCreatedAt !== expectedPlanCreatedAt) continue;
        }
        if ((data as any).status !== "completed") continue;
        const w = typeof (data as any).workout === "string" ? (data as any).workout : "";
        if (normalizeWorkoutName(w) === wn) {
          hit = true;
          const when =
            toDateLike((data as any).completedAt) ??
            toDateLike((data as any).endedAt) ??
            toDateLike((data as any).startedAt) ??
            toDateLike((data as any).updatedAt);
          if (when && (!earliest || when.getTime() < earliest.getTime())) earliest = when;
        }
      }
      setDay1HitFromSessions(hit);
      setDay1EarliestAtFromSessions(earliest);
    });

    return () => {
      unsubLogs();
      unsubSess();
    };
  }, [plan]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        const rawPlan = (data?.activeWorkoutPlan as ActiveWorkoutPlan) ?? null;
        const fixedPlan = sanitizeActiveWorkoutPlan(rawPlan as any) as ActiveWorkoutPlan | null;
        if (rawPlan && fixedPlan && !plansEqual(rawPlan as any, fixedPlan)) {
          void updateDoc(doc(db, "users", user.uid), { activeWorkoutPlan: fixedPlan } as any);
        }
        setPlan(fixedPlan ?? rawPlan);
        const bmi = calcBmi(Number(data?.weight ?? 0), Number(data?.height ?? 0));
        setUserBmi(bmi);
        if (data?.recommendedPlan === "gain" || data?.recommendedPlan === "maintain" || data?.recommendedPlan === "lose")
          setGoal(data.recommendedPlan);
        const rp = data?.recommendedPlan;
        const bmiSnap = calcBmi(Number(data?.weight ?? 0), Number(data?.height ?? 0));
        let byDur: Record<string, unknown> | null = null;
        if (rp === "gain" || rp === "maintain" || rp === "lose") {
          if (bmiSnap != null) {
            byDur = (data?.workoutPlansByBmiGoal?.[bmiBandKey(bmiSnap)]?.[rp] as Record<string, unknown>) ?? null;
          }
          if (!byDur) byDur = (data?.workoutPlansByGoal?.[rp] as Record<string, unknown>) ?? null;
        }
        setPlansByDuration(byDur);
        const cur = data?.planDuration;
        if (cur === "week" || cur === "biweekly" || cur === "monthly") setPendingDuration(cur);
        const lcd = Number(data?.activePlanLastCompletedDay);
        setLastCompletedDay(Number.isFinite(lcd) && lcd > 0 ? Math.floor(lcd) : null);
        const lca =
          data?.activePlanLastCompletedAt?.toDate?.() instanceof Date ? data.activePlanLastCompletedAt.toDate() : null;
        setLastCompletedAt(lca);
      },
      () => setPlan(null)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !plan || !lastCompletedAt || lastCompletedDay == null) return;
    if (rolloverInFlightRef.current) return;

    const totalPlanDays = durationDays(plan.duration);
    const completedLastDay = Math.floor(lastCompletedDay) >= totalPlanDays;
    if (!completedLastDay) return;

    const todayStart = startOfCalendarDay(new Date());
    const completedDayStart = startOfCalendarDay(lastCompletedAt);
    const isNextCalendarDay = todayStart.getTime() > completedDayStart.getTime();
    if (!isNextCalendarDay) return;

    const resolvedGoal =
      plan.goal === "gain" || plan.goal === "maintain" || plan.goal === "lose"
        ? plan.goal
        : goal;
    if (userBmi == null || !resolvedGoal) return;

    rolloverInFlightRef.current = true;
    (async () => {
      try {
        const next = generateActiveWorkoutPlan({ duration: plan.duration, bmi: userBmi, goal: resolvedGoal });
        const band = bmiBandKey(userBmi);
        await updateDoc(doc(db, "users", user.uid), {
          activeWorkoutPlan: next,
          [workoutPlansByBmiGoalField(band, resolvedGoal, plan.duration)]: next,
          activePlanLastCompletedDay: null,
          activePlanLastCompletedAt: null,
        } as any);
        Alert.alert("Plan complete", "Great job finishing your plan. A new plan is now ready for this cycle.");
      } catch (e) {
        console.log("Failed to roll over completed plan:", e);
      } finally {
        rolloverInFlightRef.current = false;
      }
    })();
  }, [plan, lastCompletedAt, lastCompletedDay, userBmi, goal, calendarTick]);

  const metaLine = useMemo(() => {
    const bmiLine = userBmi != null ? `BMI: ${Math.round(userBmi * 10) / 10}` : "";
    const goalLine = goal
      ? `Goal: ${goal === "gain" ? "Gain Weight" : goal === "lose" ? "Lose Weight" : "Maintain Weight"}`
      : "";
    return { bmiLine, goalLine };
  }, [goal, userBmi]);

  const hasWorkoutForPlanDay1 = day1HitFromLogs || day1HitFromSessions;
  const earliestDay1CompletionAt = useMemo(() => {
    const candidates = [day1EarliestAtFromLogs, day1EarliestAtFromSessions].filter(
      (d): d is Date => d instanceof Date
    );
    if (!candidates.length) return null;
    return candidates.reduce((min, cur) => (cur.getTime() < min.getTime() ? cur : min));
  }, [day1EarliestAtFromLogs, day1EarliestAtFromSessions]);

  const todayPlanDay = useMemo(() => {
    if (!plan) return null;
    const clampDay = (d: number) => Math.max(1, Math.min(plan.schedule.length, d));

    const hasStoredProgress =
      lastCompletedDay != null &&
      lastCompletedAt != null &&
      Number.isFinite(lastCompletedDay) &&
      lastCompletedDay >= 1;

    /**
     * Prefer day-1 logs for *this* plan `createdAt`. If the user changed goal (or anything swapped the plan id),
     * those logs may not match yet, but `activePlanLastCompletedDay` still reflects real progress — use it so
     * "Today" does not reset to Day 1 when they change goal and change back.
     */
    const canUseScheduleProgress = hasWorkoutForPlanDay1 || hasStoredProgress;

    if (!canUseScheduleProgress) {
      return 1;
    }

    if (earliestDay1CompletionAt) {
      const todayStart = startOfCalendarDay(new Date());
      const day1Start = startOfCalendarDay(earliestDay1CompletionAt);
      const elapsedDays = Math.floor((todayStart.getTime() - day1Start.getTime()) / (24 * 60 * 60 * 1000));
      return clampDay(Math.max(1, elapsedDays + 1));
    }

    if (lastCompletedDay != null && lastCompletedAt != null) {
      const now = new Date();
      const sameCalendarDay =
        now.getFullYear() === lastCompletedAt.getFullYear() &&
        now.getMonth() === lastCompletedAt.getMonth() &&
        now.getDate() === lastCompletedAt.getDate();

      // Same calendar day as last completion → still on that plan day. Next calendar day → advance (e.g. Day 1 done Mon → Tue shows Day 2).
      if (sameCalendarDay) return clampDay(lastCompletedDay);
      return clampDay(lastCompletedDay + 1);
    }

    // Firestore has a day-1 workout log for this exercise but activePlanLastCompleted* missing (e.g. after goal/BMI churn).
    if (hasWorkoutForPlanDay1) return Math.min(2, plan.schedule.length);

    return 1;
  }, [plan, lastCompletedAt, lastCompletedDay, calendarTick, hasWorkoutForPlanDay1, earliestDay1CompletionAt]);

  const unlockedMaxDay = todayPlanDay ?? 1;

  const saveDuration = async (duration: PlanDuration) => {
    const user = auth.currentUser;
    if (!user) return;
    if (!userBmi || !goal) {
      Alert.alert("Missing info", "Please complete your profile (height/weight/goal) first.");
      return;
    }
    try {
      setBusy(true);
      const snap = await getDoc(doc(db, "users", user.uid));
      const udata = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
      const next = pickOrGenerateWorkoutPlanForBand(udata, userBmi, goal, duration);
      const band = bmiBandKey(userBmi);
      await updateDoc(doc(db, "users", user.uid), {
        planDuration: duration,
        planDurationChosenAt: serverTimestamp(),
        activeWorkoutPlan: next,
        activePlanLastCompletedDay: null,
        activePlanLastCompletedAt: null,
        [workoutPlansByBmiGoalField(band, goal, duration)]: next,
      } as any);
      setPickerVisible(false);
    } catch (e) {
      console.log("Failed to switch plan:", e);
      Alert.alert("Error", "Could not switch your plan. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedScreen>
      <View style={{ paddingTop: insets.top + 8 }} className="px-3 pb-4 flex-row items-center">
        <ThemedBackButton onPress={() => router.back()} className="w-11 h-11 mr-3" />
        <View className="flex-1">
          <ThemedText className="text-3xl font-extrabold">Workout Plan</ThemedText>
        </View>
        <Pressable
          onPress={() => setPickerVisible(true)}
          className="px-4 py-2 rounded-full active:opacity-90"
          style={cardStyle}
        >
          <ThemedText className="text-base font-extrabold">Change</ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} className="px-3">
        {!plan ? (
          <ThemedCard className="p-5">
            <ThemedText className="text-lg font-extrabold">No plan yet</ThemedText>
            <ThemedText variant="muted" className="mt-2 leading-6">
              Go back to Home and tap “View Full Plan” to generate your first plan.
            </ThemedText>
          </ThemedCard>
        ) : (
          <>
            <ThemedCard className="p-5">
              <ThemedText className="text-xl font-extrabold">{durationLabel(plan.duration)}</ThemedText>
              {metaLine.bmiLine || metaLine.goalLine ? (
                <ThemedRow className="mt-3 px-4 py-3 rounded-2xl">
                  {metaLine.bmiLine ? (
                    <Text className="text-base font-extrabold mt-0" style={textPrimary}>
                      <Text style={textPrimary}>BMI:</Text>{" "}
                      <Text style={{ color: theme.danger }}>
                        {metaLine.bmiLine.replace(/^BMI:\s*/, "")}
                      </Text>
                    </Text>
                  ) : null}
                  {metaLine.goalLine ? (
                    <Text className="text-base font-extrabold mt-1" style={textPrimary}>
                      <Text style={textPrimary}>Goal:</Text>{" "}
                      <Text style={{ color: theme.danger }}>
                        {metaLine.goalLine.replace(/^Goal:\s*/, "")}
                      </Text>
                    </Text>
                  ) : null}
                </ThemedRow>
              ) : null}

              <ThemedText variant="muted" className="text-sm tracking-widest font-extrabold mt-5">
                SUGGESTED WORKOUT TYPES
              </ThemedText>
              <View className="flex-row flex-wrap gap-2 mt-4">
                {plan.suggestedTypes.map((t) => (
                  <View
                    key={t}
                    className="px-4 py-2.5 rounded-full border"
                    style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                  >
                    <ThemedText variant="accent" className="text-base font-extrabold">
                      {suggestedWorkoutTypeLabel(t)}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </ThemedCard>

            <ThemedText className="text-2xl font-extrabold mt-6 mb-3">Schedule</ThemedText>
            <View className="gap-3">
              {plan.schedule.map((row) => {
                const isLocked = row.day > unlockedMaxDay;
                const isToday = todayPlanDay === row.day;
                const dayCardStyle = isToday ? { borderColor: theme.danger } : undefined;
                const navToDay = () =>
                  router.push(
                    `/day-workout?day=${row.day}&unlockedMaxDay=${unlockedMaxDay}` as any
                  );

                const dayHeader = (
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <ThemedText
                        className="text-lg font-extrabold"
                        style={isToday ? { color: theme.danger } : undefined}
                      >
                        Day {row.day}
                      </ThemedText>
                      {isToday ? (
                        <View
                          className="ml-2 px-2 py-1 rounded-full border"
                          style={{ backgroundColor: theme.dangerSoft, borderColor: theme.danger }}
                        >
                          <Text className="text-[10px] font-extrabold" style={{ color: theme.danger }}>
                            TODAY
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <ThemedText variant="accent" className="text-sm font-extrabold">
                      {row.type}
                    </ThemedText>
                  </View>
                );

                if (isLocked) {
                  return (
                    <Pressable key={row.day} onPress={navToDay}>
                      <ThemedCard className="p-5" style={dayCardStyle}>
                        {dayHeader}
                        <View className="flex-row items-center justify-between mt-3">
                          <ThemedText variant="secondary" className="flex-1 pr-3">
                            {row.workout}
                          </ThemedText>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                            }}
                            className="px-4 py-2 rounded-full bg-gray-300 active:opacity-100"
                          >
                            <Text className="text-white font-extrabold">Start</Text>
                          </Pressable>
                        </View>
                      </ThemedCard>
                    </Pressable>
                  );
                }

                return (
                  <ThemedCard key={row.day} className="p-5" style={dayCardStyle}>
                    {dayHeader}
                    <View className="flex-row items-center justify-between mt-3">
                      <ThemedText variant="secondary" className="flex-1 pr-3">
                        {row.workout}
                      </ThemedText>
                      <Pressable onPress={navToDay} className="px-4 py-2 rounded-full bg-[#1e3a8a] active:opacity-90">
                        <Text className="text-white font-extrabold">Start</Text>
                      </Pressable>
                    </View>
                  </ThemedCard>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: theme.modalOverlay }}>
          <View className="w-full rounded-3xl p-6" style={modalCardStyle}>
            <ThemedText className="text-2xl font-extrabold">Switch plan</ThemedText>
            <ThemedText variant="muted" className="mt-2 leading-6">
              Choose a different duration and confirm to switch.
            </ThemedText>

            <View className="mt-5 gap-3">
              {(["week", "biweekly", "monthly"] as const).map((duration) => {
                const selected = pendingDuration === duration;
                const label =
                  duration === "week"
                    ? "One Week Plan"
                    : duration === "biweekly"
                      ? "Biweekly Plan"
                      : "Monthly Plan";
                return (
                  <Pressable
                    key={duration}
                    disabled={busy}
                    onPress={() => setPendingDuration(duration)}
                    className="rounded-3xl p-5 border active:opacity-90"
                    style={
                      selected
                        ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
                        : { backgroundColor: theme.rowBg, borderColor: theme.cardBorder }
                    }
                  >
                    <View className="flex-row items-center justify-between">
                      {selected ? (
                        <ThemedText variant="accent" className="text-xl font-extrabold">
                          {label}
                        </ThemedText>
                      ) : (
                        <ThemedText className="text-xl font-extrabold">{label}</ThemedText>
                      )}
                      {selected ? (
                        <View
                          className="px-2 py-1 rounded-full border"
                          style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                        >
                          <ThemedText variant="accent" className="text-[10px] font-extrabold">
                            CURRENT
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              disabled={busy}
              onPress={() => {
                Alert.alert(
                  "Switch plan?",
                  "Your personalised workout plan will change. Continue?",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Confirm", onPress: () => void saveDuration(pendingDuration) },
                  ]
                );
              }}
              className="mt-5 bg-[#76C893] rounded-full py-4 items-center active:opacity-90"
            >
              <Text className="text-white text-lg font-extrabold">Confirm</Text>
            </Pressable>

            <Pressable
              disabled={busy}
              onPress={() => setPickerVisible(false)}
              className="mt-3 py-3 rounded-full items-center border active:opacity-90"
              style={cardStyle}
            >
              <ThemedText className="font-extrabold">Cancel</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ThemedScreen>
  );
}

