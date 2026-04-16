import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { plansEqual, sanitizeActiveWorkoutPlan, type WorkoutType } from "@/lib/workoutCatalog";
import {
  bmiBandKey,
  calcBmi,
  pickOrGenerateWorkoutPlanForBand,
  type ActiveWorkoutPlan,
  type PlanDuration,
  workoutPlansByBmiGoalField,
} from "@/lib/workoutPlan";
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
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
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

    const qLogs = query(collection(db, "users", user.uid, "workoutLogs"), where("day", "==", 1), limit(80));
    const qSess = query(collection(db, "users", user.uid, "workoutSessions"), where("day", "==", 1), limit(80));

    const unsubLogs = onSnapshot(qLogs, (snap) => {
      let hit = false;
      let earliest: Date | null = null;
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        if (isDiscoverWorkoutRecord(data)) continue;
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
    <View className="flex-1 bg-[#eef2f1]">
      <View style={{ paddingTop: insets.top + 8 }} className="px-3 pb-4 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-3xl font-extrabold text-gray-900">Workout Plan</Text>
        </View>
        <Pressable
          onPress={() => setPickerVisible(true)}
          className="px-4 py-2 rounded-full bg-white border border-gray-200 active:opacity-90"
        >
          <Text className="text-base font-extrabold text-gray-900">Change</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} className="px-3">
        {!plan ? (
          <View className="bg-white rounded-3xl p-5 border border-gray-100">
            <Text className="text-lg font-extrabold text-gray-900">No plan yet</Text>
            <Text className="text-gray-500 mt-2 leading-6">
              Go back to Home and tap “View Full Plan” to generate your first plan.
            </Text>
          </View>
        ) : (
          <>
            <View className="bg-white rounded-3xl p-5 border border-gray-100">
              <Text className="text-xl font-extrabold text-gray-900">{durationLabel(plan.duration)}</Text>
              {metaLine.bmiLine || metaLine.goalLine ? (
                <View className="mt-3 rounded-2xl bg-[#f3f4f3] border border-gray-200 px-4 py-3">
                  {metaLine.bmiLine ? (
                    <Text className="text-base font-extrabold mt-0">
                      <Text className="text-gray-900">BMI:</Text>{" "}
                      <Text className="text-red-600">
                        {metaLine.bmiLine.replace(/^BMI:\s*/, "")}
                      </Text>
                    </Text>
                  ) : null}
                  {metaLine.goalLine ? (
                    <Text className="text-base font-extrabold mt-1">
                      <Text className="text-gray-900">Goal:</Text>{" "}
                      <Text className="text-red-600">
                        {metaLine.goalLine.replace(/^Goal:\s*/, "")}
                      </Text>
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <Text className="text-sm tracking-widest text-gray-500 font-extrabold mt-5">
                SUGGESTED WORKOUT TYPES
              </Text>
              <View className="flex-row flex-wrap gap-2 mt-4">
                {plan.suggestedTypes.map((t) => (
                  <View
                    key={t}
                    className="px-4 py-2.5 rounded-full bg-[#eaf7f0] border border-[#b7ead1]"
                  >
                    <Text className="text-base font-extrabold text-[#52B69A]">
                      {suggestedWorkoutTypeLabel(t)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <Text className="text-2xl font-extrabold text-gray-900 mt-6 mb-3">Schedule</Text>
            <View className="gap-3">
              {plan.schedule.map((row) => {
                const isLocked = row.day > unlockedMaxDay;
                const cardClass = `bg-white rounded-3xl p-5 border ${
                  todayPlanDay === row.day ? "border-red-300" : "border-gray-100"
                }`;
                const navToDay = () =>
                  router.push(
                    `/day-workout?day=${row.day}&unlockedMaxDay=${unlockedMaxDay}` as any
                  );

                if (isLocked) {
                  return (
                    <Pressable key={row.day} onPress={navToDay} className={cardClass}>
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center">
                          <Text
                            className={`text-lg font-extrabold ${
                              todayPlanDay === row.day ? "text-red-600" : "text-gray-900"
                            }`}
                          >
                            Day {row.day}
                          </Text>
                          {todayPlanDay === row.day ? (
                            <View className="ml-2 px-2 py-1 rounded-full bg-red-50 border border-red-200">
                              <Text className="text-[10px] font-extrabold text-red-600">
                                TODAY
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-sm font-extrabold text-[#52B69A]">{row.type}</Text>
                      </View>

                      <View className="flex-row items-center justify-between mt-3">
                        <Text className="text-gray-700 flex-1 pr-3">{row.workout}</Text>
                        <Pressable
                        onPress={(e) => {
                          // Prevent tap from bubbling to the outer locked-card Pressable.
                          e.stopPropagation();
                        }}
                          className="px-4 py-2 rounded-full bg-gray-300 active:opacity-100"
                        >
                          <Text className="text-white font-extrabold">Start</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  );
                }

                return (
                  <View
                    key={row.day}
                    className={cardClass}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center">
                        <Text
                          className={`text-lg font-extrabold ${
                            todayPlanDay === row.day ? "text-red-600" : "text-gray-900"
                          }`}
                        >
                          Day {row.day}
                        </Text>
                        {todayPlanDay === row.day ? (
                          <View className="ml-2 px-2 py-1 rounded-full bg-red-50 border border-red-200">
                            <Text className="text-[10px] font-extrabold text-red-600">TODAY</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className="text-sm font-extrabold text-[#52B69A]">{row.type}</Text>
                    </View>

                    <View className="flex-row items-center justify-between mt-3">
                      <Text className="text-gray-700 flex-1 pr-3">{row.workout}</Text>
                      <Pressable onPress={navToDay} className="px-4 py-2 rounded-full bg-[#1e3a8a] active:opacity-90">
                        <Text className="text-white font-extrabold">Start</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Change plan duration modal */}
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full bg-white rounded-3xl p-6 border border-gray-100">
            <Text className="text-2xl font-extrabold text-gray-900">Switch plan</Text>
            <Text className="text-gray-500 mt-2 leading-6">
              Choose a different duration and confirm to switch.
            </Text>

            <View className="mt-5 gap-3">
              <Pressable
                disabled={busy}
                onPress={() => setPendingDuration("week")}
                className={`rounded-3xl p-5 border active:opacity-90 ${
                  pendingDuration === "week" ? "bg-[#eaf7f0] border-[#76C893]" : "bg-[#f3f4f3] border-gray-200"
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <Text className={`text-xl font-extrabold ${pendingDuration === "week" ? "text-[#52B69A]" : "text-gray-900"}`}>
                    One Week Plan
                  </Text>
                  {pendingDuration === "week" ? (
                    <View className="px-2 py-1 rounded-full bg-[#eaf7f0] border border-[#b7ead1]">
                      <Text className="text-[10px] font-extrabold text-[#52B69A]">CURRENT</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>

              <Pressable
                disabled={busy}
                onPress={() => setPendingDuration("biweekly")}
                className={`rounded-3xl p-5 border active:opacity-90 ${
                  pendingDuration === "biweekly" ? "bg-[#eaf7f0] border-[#76C893]" : "bg-[#f3f4f3] border-gray-200"
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <Text className={`text-xl font-extrabold ${pendingDuration === "biweekly" ? "text-[#52B69A]" : "text-gray-900"}`}>
                    Biweekly Plan
                  </Text>
                  {pendingDuration === "biweekly" ? (
                    <View className="px-2 py-1 rounded-full bg-[#eaf7f0] border border-[#b7ead1]">
                      <Text className="text-[10px] font-extrabold text-[#52B69A]">CURRENT</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>

              <Pressable
                disabled={busy}
                onPress={() => setPendingDuration("monthly")}
                className={`rounded-3xl p-5 border active:opacity-90 ${
                  pendingDuration === "monthly" ? "bg-[#eaf7f0] border-[#76C893]" : "bg-[#f3f4f3] border-gray-200"
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <Text className={`text-xl font-extrabold ${pendingDuration === "monthly" ? "text-[#52B69A]" : "text-gray-900"}`}>
                    Monthly Plan
                  </Text>
                  {pendingDuration === "monthly" ? (
                    <View className="px-2 py-1 rounded-full bg-[#eaf7f0] border border-[#b7ead1]">
                      <Text className="text-[10px] font-extrabold text-[#52B69A]">CURRENT</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
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
              className="mt-3 py-3 rounded-full items-center border border-gray-200 bg-white active:opacity-90"
            >
              <Text className="text-gray-800 font-extrabold">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

