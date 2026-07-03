import { BottomTabBar, useBottomTabBarScrollPadding } from "@/components/navigation/BottomTabBar";
import { ThemedCard, ThemedText } from "@/components/themed/ThemedUi";
import { useAdminRedirect } from "@/lib/useAdminRedirect";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { imageCardTintOverlay } from "@/lib/appearance";
import { CaloriesDonut } from "@/components/CaloriesDonut";
import { bumpWorkoutPlanDay, syncDailyLoginStreak } from "@/lib/achievements";
import { formatCalendarDayKey } from "@/lib/calendarDay";
import { runRemoveZeroKcalWorkoutLogsOnce } from "@/lib/migrations/removeZeroKcalWorkoutLogs";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { plansEqual, sanitizeActiveWorkoutPlan } from "@/lib/workoutCatalog";
import {
  activeWorkoutPlanOutOfSync,
  bmiBandKey,
  calcBmi,
  pickOrGenerateWorkoutPlanForBand,
  workoutPlansByBmiGoalField,
  type ActiveWorkoutPlan,
  type PlanDuration,
} from "@/lib/workoutPlan";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, ImageBackground, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { auth, db } from "../firebaseConfig";

type IoniconName = keyof typeof Ionicons.glyphMap;

function HomeSectionHeading({
  label,
  icon,
  tintClass,
  iconColor,
  labelTextClassName,
}: {
  label: string;
  icon: IoniconName;
  tintClass: string;
  iconColor: string;
  labelTextClassName?: string;
}) {
  const { textPrimary } = useThemedScreen();
  return (
    <View className="mt-4 flex-row items-center">
      <View
        className={`w-11 h-11 rounded-2xl items-center justify-center border border-white shadow-sm shadow-black/10 ${tintClass}`}
      >
        <Ionicons name={icon} size={21} color={iconColor} />
      </View>
      <View className="flex-1 ml-3">
        <Text
          className={`${labelTextClassName ?? "text-lg"} font-extrabold tracking-[0.06em] mt-0.5`}
          style={textPrimary}
        >
          {label}
        </Text>
      </View>
      <View className="flex-row items-end gap-0.5 h-5 pl-1">
        <View className="w-[3px] h-2 rounded-full bg-[#76C893] opacity-35" />
        <View className="w-[3px] h-3 rounded-full bg-[#76C893] opacity-55" />
        <View className="w-[3px] h-5 rounded-full bg-[#52B69A] opacity-90" />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  useAdminRedirect();
  const calendarTz = useUserCalendarTimezone();
  const { cardStyle, screenStyle, textPrimary, textMuted, textSecondary, iconButtonStyle, theme, isDark } =
    useThemedScreen();
  const tabBarPadding = useBottomTabBarScrollPadding();
  const [dayRoll, setDayRoll] = useState(0);
  const dayKey = useMemo(() => formatCalendarDayKey(new Date(), calendarTz), [calendarTz, dayRoll]);
  const [userName, setUserName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [age, setAge] = useState<number>(0);
  const [heightCm, setHeightCm] = useState<number>(0);
  const [weightKg, setWeightKg] = useState<number>(0);
  const [activityMultiplier, setActivityMultiplier] = useState<number>(1.2);
  const [recommendedPlan, setRecommendedPlan] = useState<"gain" | "maintain" | "lose" | null>(null);
  const [planDuration, setPlanDuration] = useState<PlanDuration | null>(null);
  const [pendingDuration, setPendingDuration] = useState<PlanDuration>("week");
  const [planPickerVisible, setPlanPickerVisible] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [consumedToday, setConsumedToday] = useState(0);
  const [burnedToday, setBurnedToday] = useState(0);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const bmi = useMemo(() => calcBmi(weightKg, heightCm), [heightCm, weightKg]);

  const bmiCategoryIdx = useMemo(() => {
    if (!bmi) return 1;
    if (bmi < 18.5) return 0;
    if (bmi <= 24.9) return 1;
    if (bmi <= 29.9) return 2;
    return 3;
  }, [bmi]);

  const bmiCategoryLabel = useMemo(() => {
    if (!bmi) return "—";
    return (["UNDER", "NORMAL", "OVER", "OBESE"] as const)[bmiCategoryIdx];
  }, [bmi, bmiCategoryIdx]);

  const bmiCategoryPillClass = useMemo(() => {
    if (bmiCategoryIdx === 0) return "bg-sky-50 border-sky-200";
    if (bmiCategoryIdx === 1) return "bg-emerald-50 border-emerald-200";
    if (bmiCategoryIdx === 2) return "bg-amber-50 border-amber-200";
    return "bg-red-50 border-red-200";
  }, [bmiCategoryIdx]);

  const bmiCategoryPillTextClass = useMemo(() => {
    if (bmiCategoryIdx === 0) return "text-sky-700";
    if (bmiCategoryIdx === 1) return "text-emerald-800";
    if (bmiCategoryIdx === 2) return "text-amber-800";
    return "text-red-700";
  }, [bmiCategoryIdx]);

  const bmiMarkerPct = useMemo(() => {
    if (!bmi) return 12.5;
    const b = Math.min(Math.max(bmi, 12), 48);
    if (b < 18.5) return ((b - 12) / (18.5 - 12)) * 25;
    if (b <= 24.9) return 25 + ((b - 18.5) / (24.9 - 18.5)) * 25;
    if (b <= 29.9) return 50 + ((b - 25) / (29.9 - 25)) * 25;
    return 75 + Math.min((b - 30) / (48 - 30), 1) * 25;
  }, [bmi]);

  const bmiPlanCaps = useMemo(() => {
    if (!bmi) return "MAINTAIN WEIGHT";
    if (bmi < 18.5) return "GAIN WEIGHT";
    if (bmi > 25) return "LOSE WEIGHT";
    return "MAINTAIN WEIGHT";
  }, [bmi]);

  const bmiCaretColor = useMemo(() => {
    if (!bmi) return "#52B69A";
    if (bmiCategoryIdx === 0) return "#0284c7";
    if (bmiCategoryIdx === 1) return "#059669";
    if (bmiCategoryIdx === 2) return "#fbbf24";
    return "#dc2626";
  }, [bmi, bmiCategoryIdx]);

  const chooseDurationAndSave = useCallback(
    async (duration: PlanDuration) => {
      const user = auth.currentUser;
      if (!user) return;

      if (!recommendedPlan || !bmi) {
        Alert.alert("Missing info", "Please complete your profile (height/weight/goal) first.");
        return;
      }

      try {
        setSavingPlan(true);
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
        const plan = pickOrGenerateWorkoutPlanForBand(data, bmi, recommendedPlan, duration);
        const band = bmiBandKey(bmi);
        await updateDoc(doc(db, "users", user.uid), {
          planDuration: duration,
          planDurationChosenAt: serverTimestamp(),
          activeWorkoutPlan: plan,
          [workoutPlansByBmiGoalField(band, recommendedPlan, duration)]: plan,
        } as any);
        setPlanDuration(duration);
        setPlanPickerVisible(false);
        router.push("/workout-plan" as any);
      } catch (e) {
        console.log("Failed to save plan:", e);
        Alert.alert("Error", "Failed to generate your plan. Please try again.");
      } finally {
        setSavingPlan(false);
      }
    },
    [bmi, recommendedPlan, router]
  );

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as any;

        if (typeof data?.name === "string") setUserName(data.name);
        if (data?.gender === "male" || data?.gender === "female") setGender(data.gender);
        if (typeof data?.age === "number") setAge(data.age);
        if (typeof data?.height === "number") setHeightCm(data.height);
        if (typeof data?.weight === "number") setWeightKg(data.weight);
        if (typeof data?.activityMultiplier === "number") setActivityMultiplier(data.activityMultiplier);
        if (data?.recommendedPlan === "gain" || data?.recommendedPlan === "maintain" || data?.recommendedPlan === "lose")
          setRecommendedPlan(data.recommendedPlan);
        if (data?.planDuration === "week" || data?.planDuration === "biweekly" || data?.planDuration === "monthly") {
          setPlanDuration(data.planDuration);
          setPendingDuration(data.planDuration);
        }
        if (typeof data?.profileImage === "string" && data.profileImage.length > 0) setProfileImage(data.profileImage);
        else setProfileImage(null);

        const rawPlan = data?.activeWorkoutPlan as ActiveWorkoutPlan | undefined;
        if (rawPlan) {
          const bmiLive = calcBmi(Number(data?.weight ?? 0), Number(data?.height ?? 0));
          const goalLive =
            data?.recommendedPlan === "gain" ||
            data?.recommendedPlan === "maintain" ||
            data?.recommendedPlan === "lose"
              ? data.recommendedPlan
              : null;
          const durOk =
            rawPlan.duration === "week" ||
            rawPlan.duration === "biweekly" ||
            rawPlan.duration === "monthly";

          if (bmiLive != null && goalLive && durOk && activeWorkoutPlanOutOfSync(rawPlan, bmiLive, goalLive)) {
            const next = pickOrGenerateWorkoutPlanForBand(data, bmiLive, goalLive, rawPlan.duration);
            const band = bmiBandKey(bmiLive);
            void updateDoc(doc(db, "users", user.uid), {
              activeWorkoutPlan: next,
              [workoutPlansByBmiGoalField(band, goalLive, rawPlan.duration)]: next,
            } as any);
          } else {
            const fixedPlan = sanitizeActiveWorkoutPlan(rawPlan as any) as ActiveWorkoutPlan | null;
            if (fixedPlan && !plansEqual(rawPlan as any, fixedPlan)) {
              void updateDoc(doc(db, "users", user.uid), { activeWorkoutPlan: fixedPlan } as any);
            }
          }
        }
      },
      (error) => {
        console.log("Failed to subscribe user profile:", error);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user: User | null) => {
      if (user) {
        void runRemoveZeroKcalWorkoutLogsOnce();
        void syncDailyLoginStreak(user.uid);
      }
    });
    return () => unsub();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const user = auth.currentUser;
      if (user) void syncDailyLoginStreak(user.uid);
    }, [])
  );

  useEffect(() => {
    // Recompute calendar day when timezone loads and once a minute (midnight rollover).
    const id = setInterval(() => setDayRoll((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const ref = doc(db, "users", user.uid, "dailyStats", dayKey);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        const consumed = typeof data?.consumedKcal === "number" ? data.consumedKcal : 0;
        const burned = typeof data?.burnedKcal === "number" ? data.burnedKcal : 0;
        setConsumedToday(consumed);
        setBurnedToday(burned);
      },
      (e) => {
        console.log("Failed to subscribe daily stats:", e);
        setConsumedToday(0);
        setBurnedToday(0);
      }
    );

    return () => unsub();
  }, [calendarTz, dayKey]);

  const consumed = consumedToday;
  const burned = burnedToday;

  const bmr = useMemo(() => {
    if (!weightKg || !heightCm || !age || !gender) return 0;
    if (gender === "male") return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
    return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }, [age, gender, heightCm, weightKg]);

  const tdee = useMemo(() => {
    if (!bmr) return 0;
    const mult = Number.isFinite(activityMultiplier) && activityMultiplier > 0 ? activityMultiplier : 1.2;
    return bmr * mult;
  }, [activityMultiplier, bmr]);

  const intakeTarget = useMemo(() => {
    if (!tdee) return 0;
    if (recommendedPlan === "lose") return tdee - 500;
    if (recommendedPlan === "gain") return tdee + 300;
    // maintain (or unknown): default to TDEE
    return tdee;
  }, [recommendedPlan, tdee]);

  const remainingCalories = useMemo(() => {
    if (!intakeTarget) return 0;
    return intakeTarget - consumed + burned;
  }, [burned, consumed, intakeTarget]);

  const formatKcal = (n: number) => {
    const rounded = Math.round(Number.isFinite(n) ? n : 0);
    return rounded.toLocaleString();
  };

  /** Over budget (or exactly at/over): show |remaining| in center, label "Over". */
  const caloriesOverBudget = Boolean(intakeTarget && remainingCalories <= 0);
  const caloriesCenterDisplay = !intakeTarget
    ? "—"
    : formatKcal(caloriesOverBudget ? Math.abs(remainingCalories) : remainingCalories);
  const caloriesCenterLabel = !intakeTarget ? "Remaining" : caloriesOverBudget ? "Over" : "Remaining";

  const comingSoon = (title: string) => {
    Alert.alert(title, "Coming soon.");
  };

  return (
    <View style={screenStyle}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarPadding }}>
        <View className="px-3 pt-10">
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-4xl font-extrabold" style={textPrimary}>
                Hello, {userName}
              </Text>
            </View>

            <Pressable
              onPress={() => router.push("/profile")}
              className="w-12 h-12 rounded-full border-2 border-[#b7ead1] overflow-hidden items-center justify-center"
              style={iconButtonStyle}
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={{ width: 48, height: 48 }} resizeMode="cover" />
              ) : (
                <Ionicons name="person-outline" size={22} color="#76C893" />
              )}
            </Pressable>
          </View>

          <View className="mt-4 rounded-3xl p-4" style={cardStyle}>
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-base font-extrabold tracking-wide" style={textPrimary}>
                  BMI SCORE
                </Text>
                <View className="flex-row items-end mt-1">
                  <Text className="text-4xl font-extrabold" style={textPrimary}>
                    {bmi ? bmi.toFixed(1) : "—"}
                  </Text>
                  <Text className="ml-2 mb-1 text-sm" style={{ color: theme.textMuted }}>
                    kg/m²
                  </Text>
                </View>
              </View>
              <View className={`px-3 py-1.5 rounded-full border ${bmi ? bmiCategoryPillClass : "bg-gray-50 border-gray-200"}`}>
                <Text className={`text-xs font-extrabold ${bmi ? bmiCategoryPillTextClass : "text-gray-500"}`}>
                  {bmiCategoryLabel}
                </Text>
              </View>
            </View>

            {/* BMI metric bar */}
            <View className="mt-4">
              <View className="h-6 justify-end">
                <View className="relative w-full h-5">
                  <View
                    style={{ position: "absolute", left: `${bmiMarkerPct}%`, marginLeft: -10, bottom: 0 }}
                    className="items-center w-5"
                  >
                    <Ionicons name="caret-down" size={22} color={bmiCaretColor} />
                  </View>
                </View>
              </View>

              <View className="flex-row h-3 rounded-full overflow-hidden mt-1">
                <View className="flex-1 bg-sky-300" />
                <View className="flex-1 bg-emerald-400" />
                <View className="flex-1 bg-amber-400" />
                <View className="flex-1 bg-red-400" />
              </View>

              <View className="flex-row justify-between mt-3">
                {(
                  [
                    { key: "under", label: "UNDER", range: "< 18.5", color: "text-sky-600" },
                    { key: "normal", label: "NORMAL", range: "18.5 – 24.9", color: "text-emerald-700" },
                    { key: "over", label: "OVER", range: "25.0 – 29.9", color: "text-amber-700" },
                    { key: "obese", label: "OBESE", range: "> 30.0", color: "text-red-600" },
                  ] as const
                ).map((row, idx) => {
                  const active = bmiCategoryIdx === idx;
                  return (
                    <View key={row.key} className="flex-1 items-center px-0.5">
                      <Text className={`text-[10px] font-extrabold ${active ? row.color : "text-gray-400"}`}>
                        {row.label}
                      </Text>
                      <Text className="text-[9px] text-gray-400 mt-1 text-center leading-tight">{row.range}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <Text className="text-base mt-3 leading-6" style={textPrimary}>
              To improve your health, we recommended a{" "}
              <Text className="font-extrabold text-red-600 text-lg tracking-wide">{bmiPlanCaps}</Text> plan.
            </Text>
          </View>

          <View className="relative mt-4 rounded-3xl p-4 shadow-sm shadow-black/5" style={cardStyle}>
            <ThemedText className="text-xl font-extrabold">Today Calorie</ThemedText>

            {caloriesOverBudget ? (
              <View className="absolute top-3 right-3 bg-red-50 border border-red-200 px-2 py-1 rounded-full">
                <Text className="text-[10px] font-extrabold text-red-600">Over</Text>
              </View>
            ) : null}

            <View className="flex-row items-start mt-4">
              <View className="items-center shrink-0">
                <View className="relative w-[120px] h-[120px] items-center justify-center">
                  <CaloriesDonut goal={intakeTarget} food={consumed} exercise={burned} size={120} strokeWidth={10} />
                  <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
                    <Text className="text-3xl font-extrabold" style={textPrimary}>
                      {caloriesCenterDisplay}
                    </Text>
                    <Text className="text-sm font-medium mt-0.5" style={textPrimary}>
                      {caloriesCenterLabel}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="flex-1 min-w-0">
                <View className="flex-row justify-between">
                  <View className="flex-1 items-center px-0.5">
                    <Ionicons name="flag-outline" size={20} color={theme.iconMuted} />
                    <Text className="text-[10px] mt-1 text-center" style={textMuted}>
                      Goal
                    </Text>
                    <Text className="text-sm font-bold mt-0.5 text-center" style={textPrimary} numberOfLines={1}>
                      {intakeTarget ? formatKcal(intakeTarget) : "—"}
                    </Text>
                  </View>
                  <View className="flex-1 items-center px-0.5">
                    <Ionicons name="restaurant" size={20} color="#f97316" />
                    <Text className="text-[10px] mt-1 text-center" style={textMuted}>
                      Food
                    </Text>
                    <Text className="text-sm font-bold mt-0.5 text-center" style={textPrimary} numberOfLines={1}>
                      {formatKcal(consumed)}
                    </Text>
                  </View>
                  <View className="flex-1 items-center px-0.5">
                    <Ionicons name="flame" size={20} color="#22c55e" />
                    <Text className="text-[10px] mt-1 text-center" style={textMuted}>
                      Exercise
                    </Text>
                    <Text className="text-sm font-bold mt-0.5 text-center" style={textPrimary} numberOfLines={1}>
                      {formatKcal(burned)}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 pt-3 border-t" style={{ borderTopColor: theme.cardBorder }}>
                  <Text className="text-xs ml-4 leading-5" style={textMuted}>
                    Remaining = Goal − Food + Exercise
                  </Text>
                  <Text className="text-sm ml-4 font-semibold mt-1 leading-5" style={textSecondary}>
                    {intakeTarget
                      ? `${formatKcal(intakeTarget)} − ${formatKcal(consumed)} + ${formatKcal(burned)} = ${formatKcal(remainingCalories)} kcal`
                      : "—"}
                  </Text>

                  {intakeTarget ? (
                    caloriesOverBudget ? (
                      <Text className="text-xs text-red-600 font-semibold mt-2 leading-5">
                        You exceeded your daily calorie allowance.
                      </Text>
                    ) : (
                      <Text className="text-xs text-emerald-700 font-semibold mt-2 ml-4 leading-5">
                        You have {formatKcal(remainingCalories)} kcal remaining. You need to eat enough calories to achieve your goal.
                      </Text>
                    )
                  ) : null}
                </View>
              </View>
            </View>
          </View>

          {/* Recommended Plan */}
          <HomeSectionHeading
            label="PERSONALISED WORKOUT PLAN"
            icon="flash-outline"
            tintClass="bg-[#eaf7f0]"
            iconColor="#52B69A"
            labelTextClassName="text-base"
          />
          <ImageBackground
            source={require("../assets/images/Workout Plan.png")}
            resizeMode="cover"
            imageStyle={{ borderRadius: 24 }}
            className="mt-2 rounded-3xl overflow-hidden shadow-sm shadow-black/5"
            style={{ borderWidth: 1, borderColor: theme.cardBorder }}
          >
            <View className="p-4" style={{ backgroundColor: imageCardTintOverlay(isDark) }}>
              <Pressable
                className="mt-28 rounded-full overflow-hidden"
                style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}
                onPress={() => {
                  const u = auth.currentUser;
                  if (u) void bumpWorkoutPlanDay(u.uid);

                  if (!planDuration) {
                    setPlanPickerVisible(true);
                    return;
                  }
                  router.push("/workout-plan" as any);
                }}
              >
                <LinearGradient
                  colors={["#76C893", "#69c58c"]}
                  className="py-3.5 rounded-full items-center"
                >
                  <Text className="text-white font-bold text-base">
                    View Workout Plan
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </ImageBackground>

          {/* Meal Suggestions */}
          <HomeSectionHeading
            label="PERSONALISED NUTRITION GUIDANCE"
            icon="nutrition-outline"
            tintClass="bg-[#fff4e6]"
            iconColor="#c2410c"
            labelTextClassName="text-base"
          />
          <View className="mt-2 rounded-3xl overflow-hidden shadow-sm shadow-black/5" style={cardStyle}>
            <View className="p-5">
              <View className="flex-row items-center">
                <View
                  className="w-14 h-14 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: theme.rowBg }}
                >
                  <Ionicons name="restaurant" size={26} color="#c2410c" />
                </View>
                <View className="ml-4 flex-1">
                  <ThemedText className="text-lg font-extrabold">Personalised Nutrition Guidance</ThemedText>
                  <ThemedText variant="secondary" className="text-sm mt-1">
                    Explore your personalised meal ideas and daily recipe suggestions.
                  </ThemedText>
                </View>
              </View>

              <View className="mt-5">
                <Pressable
                  className="rounded-full overflow-hidden"
                  style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}
                  onPress={() => router.push("/meal-plan" as any)}
                >
                  <LinearGradient
                    colors={["#f59e0b", "#f97316"]}
                    className="py-3.5 rounded-full items-center"
                  >
                    <Text className="text-white font-bold text-base">
                      View Nutrition Guidance
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </View>

        </View>
      </ScrollView>

      {/* Plan duration picker (first time) */}
      <Modal visible={planPickerVisible} transparent animationType="fade" onRequestClose={() => setPlanPickerVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded-3xl p-6" style={cardStyle}>
            <ThemedText className="text-2xl font-extrabold">Choose your plan</ThemedText>
            <ThemedText variant="muted" className="mt-2 leading-6">
              Select a duration and we will generate a personalised workout plan for you.
            </ThemedText>

            <View className="mt-5 gap-3">
              <Pressable
                disabled={savingPlan}
                onPress={() => setPendingDuration("week")}
                className="rounded-3xl p-5 border active:opacity-90"
                style={
                  pendingDuration === "week"
                    ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
                    : { backgroundColor: theme.rowBg, borderColor: theme.cardBorder }
                }
              >
                <ThemedText className="text-xl font-extrabold">One Week Plan</ThemedText>
                <ThemedText variant="muted" className="text-sm mt-1">7 days · Short Term Schedule</ThemedText>
              </Pressable>

              <Pressable
                disabled={savingPlan}
                onPress={() => setPendingDuration("biweekly")}
                className="rounded-3xl p-5 border active:opacity-90"
                style={
                  pendingDuration === "biweekly"
                    ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
                    : { backgroundColor: theme.rowBg, borderColor: theme.cardBorder }
                }
              >
                <ThemedText className="text-xl font-extrabold">Biweekly Plan</ThemedText>
                <ThemedText variant="muted" className="text-sm mt-1">14 days · Medium Term Schedule</ThemedText>
              </Pressable>

              <Pressable
                disabled={savingPlan}
                onPress={() => setPendingDuration("monthly")}
                className="rounded-3xl p-5 border active:opacity-90"
                style={
                  pendingDuration === "monthly"
                    ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
                    : { backgroundColor: theme.rowBg, borderColor: theme.cardBorder }
                }
              >
                <ThemedText className="text-xl font-extrabold">Monthly Plan</ThemedText>
                <ThemedText variant="muted" className="text-sm mt-1">30 days · Long Term Schedule</ThemedText>
              </Pressable>
            </View>

            <Pressable
              disabled={savingPlan}
              onPress={() => void chooseDurationAndSave(pendingDuration)}
              className={`mt-5 rounded-full overflow-hidden ${savingPlan ? "opacity-60" : "opacity-100"}`}
            >
              <LinearGradient
                colors={["#76C893", "#52B69A"]}
                className="py-4 items-center rounded-2xl"
              >
                {savingPlan ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white text-lg font-semibold">Continue</Text>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              disabled={savingPlan}
              onPress={() => setPlanPickerVisible(false)}
              className="mt-5 py-3 rounded-full items-center border active:opacity-90"
              style={cardStyle}
            >
              <ThemedText className="font-extrabold">Cancel</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>

      <BottomTabBar active="home" />
    </View>
  );
}