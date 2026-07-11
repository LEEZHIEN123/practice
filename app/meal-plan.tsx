import { Pressable } from "@/components/Pressable";
import {
  ProfileScreenHeader,
  ThemedCard,
  ThemedRow,
  ThemedScreen,
  ThemedText,
  useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import {
  generateActiveNutritionPlan,
  expandNutritionPlanText,
  normalizeNutritionActivity,
  normalizeNutritionDietary,
  normalizeNutritionGoal,
  nutritionDietaryLabel,
  nutritionGoalLabel,
  nutritionPlanOutOfSync,
  type ActiveNutritionPlan,
  type NutritionDietaryKey,
  type NutritionMealSuggestion,
} from "@/lib/nutritionPlan";
import { calcBmi, durationDays, type PlanDuration } from "@/lib/workoutPlan";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
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

const DIETARY_OPTIONS: NutritionDietaryKey[] = ["omnivore", "vegetarian", "vegan"];

type MealIconName = keyof typeof Ionicons.glyphMap;
type MealType = "breakfast" | "lunch" | "dinner" | "snack";

function mealTypeIcon(title: string): MealIconName {
  const key = title.trim().toUpperCase();
  if (key === "BREAKFAST") return "sunny-outline";
  if (key === "LUNCH") return "restaurant-outline";
  if (key === "DINNER") return "moon-outline";
  return "nutrition-outline";
}

function durationLabel(d: PlanDuration) {
  if (d === "week") return "One Week Plan";
  if (d === "biweekly") return "Biweekly Plan";
  return "Monthly Plan";
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

function mealDoneKey(day: number, mealType: MealType): string {
  return `${day}:${mealType}`;
}

function dayTotalKcal(row: {
  breakfast: NutritionMealSuggestion;
  lunch: NutritionMealSuggestion;
  dinner: NutritionMealSuggestion;
  snack: NutritionMealSuggestion;
}): number {
  return (
    (row.breakfast?.calories || 0) +
    (row.lunch?.calories || 0) +
    (row.dinner?.calories || 0) +
    (row.snack?.calories || 0)
  );
}

function MealBlock({
  title,
  meal,
  done,
  onPress,
}: {
  title: string;
  meal: NutritionMealSuggestion;
  done: boolean;
  onPress: () => void;
}) {
  const { isDark, theme } = useThemedScreen();

  return (
    <Pressable onPress={onPress} className="active:opacity-90">
      <ThemedCard rounded="2xl" className="px-4 py-3.5">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <ThemedText variant="accent" className="text-[10px] font-extrabold tracking-widest">
              {title}
            </ThemedText>
            <Ionicons
              name={mealTypeIcon(title)}
              size={14}
              color={theme.accent}
              style={{ marginLeft: 6 }}
            />
          </View>
          {done ? (
            <View
              className="px-2 py-0.5 rounded-full border"
              style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
            >
              <ThemedText variant="accent" className="text-[10px] font-extrabold">
                DONE
              </ThemedText>
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center justify-between mt-1 gap-3">
          <ThemedText className="text-base font-extrabold flex-1 pr-2" numberOfLines={2}>
            {meal.name}
          </ThemedText>
          <ThemedText
            className="text-sm font-extrabold"
            style={{ color: isDark ? "#fb923c" : "#c2410c" }}
          >
            {meal.calories} kcal
          </ThemedText>
        </View>
      </ThemedCard>
    </Pressable>
  );
}

export default function MealPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cardStyle, textPrimary, theme, isDark } = useThemedScreen();
  const { modalCardStyle } = useProfileCardStyles();

  const [plan, setPlan] = useState<ActiveNutritionPlan | null>(null);
  const [pendingDuration, setPendingDuration] = useState<PlanDuration>("week");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savingDietary, setSavingDietary] = useState(false);
  const [lastCompletedDay, setLastCompletedDay] = useState<number | null>(null);
  const [lastCompletedAt, setLastCompletedAt] = useState<Date | null>(null);
  const [calendarTick, setCalendarTick] = useState(0);
  const [day1Hit, setDay1Hit] = useState(false);
  const [day1EarliestAt, setDay1EarliestAt] = useState<Date | null>(null);
  const [loggedMealKeys, setLoggedMealKeys] = useState<Set<string>>(() => new Set());
  const syncingRef = useRef(false);
  const rolloverInFlightRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setCalendarTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
      const nutritionDuration =
        data.nutritionPlanDuration === "week" ||
        data.nutritionPlanDuration === "biweekly" ||
        data.nutritionPlanDuration === "monthly"
          ? data.nutritionPlanDuration
          : data.planDuration === "week" ||
              data.planDuration === "biweekly" ||
              data.planDuration === "monthly"
            ? data.planDuration
            : ("week" as PlanDuration);

      const bmi = calcBmi(Number(data.weight ?? 0), Number(data.height ?? 0));
      const goal = normalizeNutritionGoal(
        typeof data.recommendedPlan === "string" ? data.recommendedPlan : null
      );
      const activityLevel = normalizeNutritionActivity(
        typeof data.activityLevel === "string" ? data.activityLevel : null,
        typeof data.activityMultiplier === "number" ? data.activityMultiplier : null
      );
      const dietaryPreference = normalizeNutritionDietary(
        typeof data.dietaryPreference === "string" ? data.dietaryPreference : null
      );
      const existing = (data.activeNutritionPlan as ActiveNutritionPlan | undefined) ?? null;

      const lcd = Number(data.activeNutritionPlanLastCompletedDay);
      setLastCompletedDay(Number.isFinite(lcd) && lcd > 0 ? Math.floor(lcd) : null);
      const lca =
        (data.activeNutritionPlanLastCompletedAt as any)?.toDate?.() instanceof Date
          ? (data.activeNutritionPlanLastCompletedAt as any).toDate()
          : null;
      setLastCompletedAt(lca);

      setPendingDuration(nutritionDuration);

      const needsNew = nutritionPlanOutOfSync(existing, {
        duration: nutritionDuration,
        bmi,
        goal,
        dietaryPreference: dietaryPreference ?? "omnivore",
        activityLevel: activityLevel ?? "moderate",
      });

      if (!needsNew && existing) {
        setPlan(expandNutritionPlanText(existing));
        return;
      }

      if (syncingRef.current) {
        if (existing) setPlan(expandNutritionPlanText(existing));
        return;
      }

      const next = expandNutritionPlanText(
        generateActiveNutritionPlan({
          duration: nutritionDuration,
          bmi,
          goal,
          dietaryPreference: dietaryPreference ?? "omnivore",
          activityLevel: activityLevel ?? "moderate",
        })
      );
      setPlan(next);

      syncingRef.current = true;
      void updateDoc(doc(db, "users", user.uid), {
        nutritionPlanDuration: nutritionDuration,
        activeNutritionPlan: next,
        nutritionPlanDurationChosenAt: serverTimestamp(),
        activeNutritionPlanLastCompletedDay: null,
        activeNutritionPlanLastCompletedAt: null,
      } as any)
        .catch((e) => console.log("Failed to persist nutrition plan:", e))
        .finally(() => {
          syncingRef.current = false;
        });
    });

    return unsub;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !plan?.createdAt) {
      setDay1Hit(false);
      setDay1EarliestAt(null);
      setLoggedMealKeys(new Set());
      return;
    }

    const expectedPlanCreatedAt = plan.createdAt;
    const qLogs = query(
      collection(db, "users", user.uid, "mealLogs"),
      where("origin", "==", "nutritionPlan"),
      limit(200)
    );

    const unsub = onSnapshot(qLogs, (snap) => {
      const nextKeys = new Set<string>();
      let hitDay1 = false;
      let earliest: Date | null = null;

      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const docPlanCreatedAt =
          typeof data.planCreatedAt === "string" ? data.planCreatedAt : null;
        if (docPlanCreatedAt !== expectedPlanCreatedAt) continue;

        const planDay = Number(data.planDay);
        const category = typeof data.category === "string" ? data.category : "";
        if (
          Number.isFinite(planDay) &&
          planDay >= 1 &&
          (category === "breakfast" ||
            category === "lunch" ||
            category === "dinner" ||
            category === "snack")
        ) {
          nextKeys.add(mealDoneKey(Math.floor(planDay), category));
        }

        if (Math.floor(planDay) === 1) {
          hitDay1 = true;
          const when = toDateLike(data.createdAt) ?? toDateLike(data.logDate);
          if (when && (!earliest || when.getTime() < earliest.getTime())) earliest = when;
        }
      }

      setLoggedMealKeys(nextKeys);
      setDay1Hit(hitDay1);
      setDay1EarliestAt(earliest);
    });

    return unsub;
  }, [plan?.createdAt]);

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

    rolloverInFlightRef.current = true;
    (async () => {
      try {
        const next = expandNutritionPlanText(
          generateActiveNutritionPlan({
            duration: plan.duration,
            bmi: plan.bmi,
            goal: plan.goal,
            dietaryPreference: plan.dietaryPreference ?? "omnivore",
            activityLevel: plan.activityLevel ?? "moderate",
          })
        );
        await updateDoc(doc(db, "users", user.uid), {
          activeNutritionPlan: next,
          activeNutritionPlanLastCompletedDay: null,
          activeNutritionPlanLastCompletedAt: null,
        } as any);
        Alert.alert(
          "Plan complete",
          "Great job finishing your nutrition plan. A new schedule is ready for this cycle."
        );
      } catch (e) {
        console.log("Failed to roll over nutrition plan:", e);
      } finally {
        rolloverInFlightRef.current = false;
      }
    })();
  }, [plan, lastCompletedAt, lastCompletedDay, calendarTick]);

  const todayPlanDay = useMemo(() => {
    if (!plan) return null;
    const clampDay = (d: number) => Math.max(1, Math.min(plan.schedule.length, d));

    const hasStoredProgress =
      lastCompletedDay != null &&
      lastCompletedAt != null &&
      Number.isFinite(lastCompletedDay) &&
      lastCompletedDay >= 1;

    const canUseScheduleProgress = day1Hit || hasStoredProgress;
    if (!canUseScheduleProgress) return 1;

    if (day1EarliestAt) {
      const todayStart = startOfCalendarDay(new Date());
      const day1Start = startOfCalendarDay(day1EarliestAt);
      const elapsedDays = Math.floor(
        (todayStart.getTime() - day1Start.getTime()) / (24 * 60 * 60 * 1000)
      );
      return clampDay(Math.max(1, elapsedDays + 1));
    }

    if (lastCompletedDay != null && lastCompletedAt != null) {
      const now = new Date();
      const sameCalendarDay =
        now.getFullYear() === lastCompletedAt.getFullYear() &&
        now.getMonth() === lastCompletedAt.getMonth() &&
        now.getDate() === lastCompletedAt.getDate();
      if (sameCalendarDay) return clampDay(lastCompletedDay);
      return clampDay(lastCompletedDay + 1);
    }

    if (day1Hit) return Math.min(2, plan.schedule.length);
    return 1;
  }, [plan, lastCompletedAt, lastCompletedDay, calendarTick, day1Hit, day1EarliestAt]);

  const unlockedMaxDay = todayPlanDay ?? 1;

  const metaLine = useMemo(() => {
    if (!plan) return { bmiLine: "", goalLine: "" };
    const bmiLine = plan.bmi != null ? `BMI: ${Math.round(plan.bmi * 10) / 10}` : "";
    const goalLine = plan.goal ? `Goal: ${nutritionGoalLabel(plan.goal)}` : "";
    return { bmiLine, goalLine };
  }, [plan]);

  const openMeal = (day: number, mealType: MealType) => {
    router.push({
      pathname: "/nutrition-meal-detail",
      params: {
        day: String(day),
        mealType,
        unlockedMaxDay: String(unlockedMaxDay),
      },
    } as any);
  };

  const saveDietaryPreference = async (nextDiet: NutritionDietaryKey) => {
    const user = auth.currentUser;
    if (!user || !plan || savingDietary) return;
    if (plan.dietaryPreference === nextDiet) return;

    try {
      setSavingDietary(true);
      const next = expandNutritionPlanText(
        generateActiveNutritionPlan({
          duration: plan.duration,
          bmi: plan.bmi,
          goal: plan.goal,
          dietaryPreference: nextDiet,
          activityLevel: plan.activityLevel ?? "moderate",
        })
      );
      setPlan(next);
      syncingRef.current = true;
      await updateDoc(doc(db, "users", user.uid), {
        dietaryPreference: nextDiet,
        activeNutritionPlan: next,
        activeNutritionPlanLastCompletedDay: null,
        activeNutritionPlanLastCompletedAt: null,
      } as any);
    } catch (e) {
      console.log("Failed to update dietary preference:", e);
      Alert.alert("Error", "Could not update dietary preference. Please try again.");
    } finally {
      syncingRef.current = false;
      setSavingDietary(false);
    }
  };

  const saveNutritionDuration = async (nextDuration: PlanDuration) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      setBusy(true);
      const next = expandNutritionPlanText(
        generateActiveNutritionPlan({
          duration: nextDuration,
          bmi: plan?.bmi ?? null,
          goal: plan?.goal ?? null,
          dietaryPreference: plan?.dietaryPreference ?? "omnivore",
          activityLevel: plan?.activityLevel ?? "moderate",
        })
      );
      await updateDoc(doc(db, "users", user.uid), {
        nutritionPlanDuration: nextDuration,
        nutritionPlanDurationChosenAt: serverTimestamp(),
        activeNutritionPlan: next,
        activeNutritionPlanLastCompletedDay: null,
        activeNutritionPlanLastCompletedAt: null,
      } as any);
      setPlan(next);
      setPendingDuration(nextDuration);
      setPickerVisible(false);
    } catch (e) {
      console.log("Failed to switch nutrition plan:", e);
      Alert.alert("Error", "Could not switch your nutrition schedule. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedScreen>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12 }}>
        <ProfileScreenHeader
          title="Nutrition Guidance"
          onBack={() => router.back()}
          titleClassName="text-2xl"
          rightSlot={
            <Pressable
              onPress={() => setPickerVisible(true)}
              className="px-4 py-2 rounded-full active:opacity-90"
              style={cardStyle}
            >
              <ThemedText className="text-base font-extrabold">Change</ThemedText>
            </Pressable>
          }
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} className="px-3">
        {!plan ? (
          <ThemedCard className="p-5">
            <ThemedText className="text-lg font-extrabold">No plan yet</ThemedText>
            <ThemedText variant="muted" className="mt-2 leading-6">
              Go back to Home and choose a schedule to generate your nutrition guidance.
            </ThemedText>
          </ThemedCard>
        ) : (
          <>
            <ThemedCard className="p-5">
              <ThemedText className="text-xl font-extrabold">
                {durationLabel(plan.duration)}
              </ThemedText>
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
                DIETARY PREFERENCE
              </ThemedText>
              <View className="flex-row flex-wrap gap-2 mt-4">
                {DIETARY_OPTIONS.map((option) => {
                  const selected = plan.dietaryPreference === option;
                  return (
                    <Pressable
                      key={option}
                      disabled={savingDietary}
                      onPress={() => {
                        if (selected || savingDietary) return;
                        Alert.alert(
                          "Change dietary preference?",
                          `Switch to ${nutritionDietaryLabel(option)}? Your meal suggestions will update to match.`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Confirm",
                              onPress: () => void saveDietaryPreference(option),
                            },
                          ]
                        );
                      }}
                      className="px-4 py-2.5 rounded-full border active:opacity-90"
                      style={
                        selected
                          ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
                          : { backgroundColor: theme.rowBg, borderColor: theme.cardBorder }
                      }
                    >
                      {selected ? (
                        <ThemedText variant="accent" className="text-base font-extrabold">
                          {nutritionDietaryLabel(option)}
                        </ThemedText>
                      ) : (
                        <ThemedText className="text-base font-extrabold">
                          {nutritionDietaryLabel(option)}
                        </ThemedText>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </ThemedCard>

            <ThemedText className="text-2xl font-extrabold mt-6 mb-3">Schedule</ThemedText>
            <View className="gap-4">
              {plan.schedule.map((row) => {
                const totalKcal = dayTotalKcal(row);
                const isToday = todayPlanDay === row.day;
                const dayCardStyle = isToday ? { borderColor: theme.danger } : undefined;

                return (
                  <ThemedCard key={row.day} className="p-5" style={dayCardStyle}>
                    <View className="flex-row items-center justify-between mb-3 gap-3">
                      <View className="flex-row items-center flex-1 pr-2">
                        <ThemedText
                          className="text-lg font-extrabold"
                          style={isToday ? { color: theme.danger } : undefined}
                        >
                          Day {row.day}
                        </ThemedText>
                        {isToday ? (
                          <View
                            className="ml-2 px-2 py-1 rounded-full border"
                            style={{
                              backgroundColor: theme.dangerSoft,
                              borderColor: theme.danger,
                            }}
                          >
                            <Text
                              className="text-[10px] font-extrabold"
                              style={{ color: theme.danger }}
                            >
                              TODAY
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <ThemedText
                        className="text-sm font-bold"
                        style={{ color: isDark ? "#60a5fa" : "#2563eb" }}
                      >
                        Total: {totalKcal} kcal
                      </ThemedText>
                    </View>
                    <View className="gap-3">
                      {(
                        [
                          ["BREAKFAST", "breakfast", row.breakfast],
                          ["LUNCH", "lunch", row.lunch],
                          ["DINNER", "dinner", row.dinner],
                          ["SNACK", "snack", row.snack],
                        ] as const
                      ).map(([title, mealType, meal]) => (
                        <MealBlock
                          key={mealType}
                          title={title}
                          meal={meal}
                          done={loggedMealKeys.has(mealDoneKey(row.day, mealType))}
                          onPress={() => openMeal(row.day, mealType)}
                        />
                      ))}
                    </View>
                  </ThemedCard>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: theme.modalOverlay }}
        >
          <View className="w-full rounded-3xl p-6" style={modalCardStyle}>
            <ThemedText className="text-2xl font-extrabold">Switch plan</ThemedText>
            <ThemedText variant="muted" className="mt-2 leading-6">
              Choose a different nutrition schedule. This will not change your workout plan.
            </ThemedText>

            <View className="mt-5 gap-3">
              {(["week", "biweekly", "monthly"] as const).map((option) => {
                const selected = pendingDuration === option;
                const label = durationLabel(option);
                return (
                  <Pressable
                    key={option}
                    disabled={busy}
                    onPress={() => setPendingDuration(option)}
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
                      {selected && plan?.duration === option ? (
                        <View
                          className="px-2 py-1 rounded-full border"
                          style={{
                            backgroundColor: theme.accentSoft,
                            borderColor: theme.accent,
                          }}
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
                  "Switch nutrition schedule?",
                  "Your nutrition guidance length will change. Your workout plan stays the same.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Confirm",
                      onPress: () => void saveNutritionDuration(pendingDuration),
                    },
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
