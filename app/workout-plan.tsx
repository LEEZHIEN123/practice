import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { calcBmi, generateActiveWorkoutPlan, type ActiveWorkoutPlan, type PlanDuration } from "@/lib/workoutPlan";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

function durationLabel(d: ActiveWorkoutPlan["duration"]) {
  if (d === "week") return "One Week Plan";
  if (d === "biweekly") return "Biweekly Plan";
  return "Monthly Plan";
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

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        setPlan((data?.activeWorkoutPlan as ActiveWorkoutPlan) ?? null);
        const bmi = calcBmi(Number(data?.weight ?? 0), Number(data?.height ?? 0));
        setUserBmi(bmi);
        if (data?.recommendedPlan === "gain" || data?.recommendedPlan === "maintain" || data?.recommendedPlan === "lose")
          setGoal(data.recommendedPlan);
        setPlansByDuration(data?.workoutPlansByGoal?.[data?.recommendedPlan] ?? null);
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

  const todayPlanDay = useMemo(() => {
    if (!plan) return null;
    const clampDay = (d: number) => Math.max(1, Math.min(plan.schedule.length, d));

    if (!lastCompletedDay || !lastCompletedAt) return 1;

    const now = new Date();
    const sameCalendarDay =
      now.getFullYear() === lastCompletedAt.getFullYear() &&
      now.getMonth() === lastCompletedAt.getMonth() &&
      now.getDate() === lastCompletedAt.getDate();

    // If user completed today's day today, keep TODAY on that day until tomorrow.
    if (sameCalendarDay) return clampDay(lastCompletedDay);
    return clampDay(lastCompletedDay + 1);
  }, [plan, lastCompletedAt, lastCompletedDay]);

  const saveDuration = async (duration: PlanDuration) => {
    const user = auth.currentUser;
    if (!user) return;
    if (!userBmi || !goal) {
      Alert.alert("Missing info", "Please complete your profile (height/weight/goal) first.");
      return;
    }
    try {
      setBusy(true);
      const existing = (plansByDuration as any)?.[duration] ?? null;
      const next = existing ?? generateActiveWorkoutPlan({ duration, bmi: userBmi, goal });
      await updateDoc(doc(db, "users", user.uid), {
        planDuration: duration,
        planDurationChosenAt: serverTimestamp(),
        activeWorkoutPlan: next,
        activePlanLastCompletedDay: null,
        activePlanLastCompletedAt: null,
        [`workoutPlansByGoal.${goal}.${duration}`]: next,
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
      <View style={{ paddingTop: insets.top + 8 }} className="px-6 pb-4 flex-row items-center">
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

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} className="px-6">
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
                    <Text className="text-base font-extrabold text-[#52B69A]">{t}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Text className="text-2xl font-extrabold text-gray-900 mt-6 mb-3">Schedule</Text>
            <View className="gap-3">
              {plan.schedule.map((row) => (
                <View
                  key={row.day}
                  className={`bg-white rounded-3xl p-5 border ${
                    todayPlanDay === row.day ? "border-red-300" : "border-gray-100"
                  }`}
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
                    <Pressable
                      onPress={() => router.push(`/day-workout?day=${row.day}` as any)}
                      className="px-4 py-2 rounded-full bg-[#1e3a8a] active:opacity-90"
                    >
                      <Text className="text-white font-extrabold">Start</Text>
                    </Pressable>
                  </View>

                </View>
              ))}
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

