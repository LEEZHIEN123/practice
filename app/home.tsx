import React, { useEffect, useMemo, useState } from "react";
import { Alert, ImageBackground, View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { auth, db } from "../firebaseConfig";
import { bumpWorkoutPlanDay } from "@/lib/achievements";
import { doc, onSnapshot } from "firebase/firestore";

type IoniconName = keyof typeof Ionicons.glyphMap;

function HomeSectionHeading({
  label,
  icon,
  tintClass,
  iconColor,
}: {
  label: string;
  icon: IoniconName;
  tintClass: string;
  iconColor: string;
}) {
  return (
    <View className="mt-6 flex-row items-center">
      <View
        className={`w-11 h-11 rounded-2xl items-center justify-center border border-white shadow-sm shadow-black/10 ${tintClass}`}
      >
        <Ionicons name={icon} size={21} color={iconColor} />
      </View>
      <View className="flex-1 ml-3">
        <Text className="text-lg font-extrabold text-gray-900 tracking-[0.06em] mt-0.5">
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
  const [userName, setUserName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [age, setAge] = useState<number>(0);
  const [heightCm, setHeightCm] = useState<number>(0);
  const [weightKg, setWeightKg] = useState<number>(0);
  const [activityMultiplier, setActivityMultiplier] = useState<number>(1.2);
  const [recommendedPlan, setRecommendedPlan] = useState<"gain" | "maintain" | "lose" | null>(null);
  const [dayKey, setDayKey] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [consumedToday, setConsumedToday] = useState(0);
  const [burnedToday, setBurnedToday] = useState(0);

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
      },
      (error) => {
        console.log("Failed to subscribe user profile:", error);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      setDayKey(`${yyyy}-${mm}-${dd}`);
    };

    // Update at least once a minute; keeps "today" correct when app stays open.
    const id = setInterval(tick, 60_000);
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
  }, [dayKey]);

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

  const comingSoon = (title: string) => {
    Alert.alert(title, "Coming soon.");
  };

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <View className="px-6 pt-12">
          {/* Header */}
          <View className="flex-row justify-between items-center">
            <View>
                
              <Text className="text-3xl font-extrabold text-gray-900 mt-1">
                Hello, {userName }
              </Text>
            </View>

            <Pressable className="w-12 h-12 rounded-full border-2 border-[#b7ead1] items-center justify-center bg-white">
              <Ionicons name="person-outline" size={22} color="#76C893" />
            </Pressable>
          </View>

          {/* Remaining Calories Card */}
          <View className="mt-4 bg-[#f3f4f3] rounded-3xl p-4 border border-gray-200">
            <View className="flex-row items-center justify-between">
              <View className="w-28 h-28 rounded-full border-[8px] border-[#76C893] items-center justify-center bg-white">
                <Text className="text-3xl font-extrabold text-gray-900">
                  {formatKcal(remainingCalories)}
                </Text>
                <Text className="text-[10px] text-gray-400 font-semibold mt-1">
                  KCAL LEFT
                </Text>
              </View>

              <View className="flex-1 ml-5">
                <Text className="text-2xl font-extrabold text-gray-900 leading-7">
                  Remaining{"\n"}Calories
                </Text>

                <View className="mt-2">
                  <View className="flex-row items-center mb-1.5">
                    <View className="w-2 h-2 rounded-full bg-[#76C893] mr-2" />
                    <Text className="text-gray-500 text-sm">Consumed: {formatKcal(consumed)}</Text>
                  </View>

                  <View className="flex-row items-center">
                    <View className="w-2 h-2 rounded-full bg-[#b7ead1] mr-2" />
                    <Text className="text-gray-500 text-sm">Burned: {formatKcal(burned)}</Text>
                  </View>
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
          />
          <ImageBackground
            source={require("../assets/images/WorkoutPlan.png")}
            resizeMode="cover"
            imageStyle={{ borderRadius: 24 }}
            className="mt-2 rounded-3xl overflow-hidden border border-gray-200 shadow-sm shadow-black/5"
          >
            {/* subtle overlay so button stays readable */}
            <View className="bg-white/20 p-4">
              <Pressable
                className="mt-28 rounded-full overflow-hidden"
                onPress={() => {
                  const u = auth.currentUser;
                  if (u) void bumpWorkoutPlanDay(u.uid);
                }}
              >
                <LinearGradient
                  colors={["#76C893", "#69c58c"]}
                  className="py-3.5 rounded-full items-center"
                >
                  <Text className="text-white font-bold text-base">
                    View Full Plan
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </ImageBackground>

          {/* Meal Suggestions */}
          <HomeSectionHeading
            label="MEAL SUGGESTIONS"
            icon="nutrition-outline"
            tintClass="bg-[#fff4e6]"
            iconColor="#c2410c"
          />
          <View className="mt-2 bg-white rounded-3xl p-4 border border-gray-200 shadow-sm shadow-black/5">
            <View className="flex-row justify-between">
              <Pressable
                onPress={() => comingSoon("Meal Suggestions")}
                className="bg-[#f3f4f3] rounded-3xl w-[31%] py-4 items-center border border-gray-200 active:opacity-90"
              >
                <View className="w-10 h-10 rounded-full bg-[#fde8db] items-center justify-center">
                  <MaterialCommunityIcons
                    name="food-croissant"
                    size={18}
                    color="#c78a5a"
                  />
                </View>
                <Text className="mt-2 text-sm font-bold text-gray-900">
                  Breakfast
                </Text>
                <Text className="text-xs text-gray-400 mt-1">320 kcal</Text>
              </Pressable>

              <Pressable
                onPress={() => comingSoon("Meal Suggestions")}
                className="bg-[#f3f4f3] rounded-3xl w-[31%] py-4 items-center border border-gray-200 active:opacity-90"
              >
                <View className="w-10 h-10 rounded-full bg-[#e7f0fb] items-center justify-center">
                  <Ionicons name="restaurant" size={18} color="#6b8db3" />
                </View>
                <Text className="mt-2 text-sm font-bold text-gray-900">Lunch</Text>
                <Text className="text-xs text-gray-400 mt-1">580 kcal</Text>
              </Pressable>

              <Pressable
                onPress={() => comingSoon("Meal Suggestions")}
                className="bg-[#f3f4f3] rounded-3xl w-[31%] py-4 items-center border border-gray-200 active:opacity-90"
              >
                <View className="w-10 h-10 rounded-full bg-[#efe4fa] items-center justify-center">
                  <Ionicons name="fast-food" size={18} color="#8f6ab3" />
                </View>
                <Text className="mt-2 text-sm font-bold text-gray-900">
                  Dinner
                </Text>
                <Text className="text-xs text-gray-400 mt-1">450 kcal</Text>
              </Pressable>
            </View>
          </View>

          {/* Achievements — single entry to full screen */}
          <HomeSectionHeading
            label="ACHIEVEMENTS"
            icon="trophy-outline"
            tintClass="bg-[#fef9c3]"
            iconColor="#ca8a04"
          />
          <Pressable
            onPress={() => router.push("/achievements")}
            className="mt-2 bg-white rounded-3xl border border-gray-200 px-5 py-4 active:bg-gray-50 mb-1 shadow-sm shadow-black/5"
          >
            <View className="mt-4 flex-row items-center">
              <View className="w-14 h-14 rounded-2xl bg-[#eaf7f0] items-center justify-center">
                <Ionicons name="trophy-outline" size={30} color="#76C893" />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-xl font-extrabold text-gray-900">Achievements</Text>
                <Text className="text-sm text-gray-500 mt-1 leading-5">
                  Workout, meal, community & streak badges
                </Text>
              </View>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex-row justify-around py-3">
        <Pressable className="items-center">
          <Ionicons name="home" size={20} color="#76C893" />
          <Text className="text-[10px] text-[#76C893] font-bold mt-1">HOME</Text>
        </Pressable>

         
        <Pressable
          onPress={() => router.push("/discover")}
          className="items-center"
        >
          <Ionicons name="compass-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">
            DISCOVER
          </Text>
        </Pressable>

        <Pressable onPress={() => router.replace("/progress")} className="items-center">
          <Ionicons name="stats-chart-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">PROGRESS</Text>
        </Pressable>

        <Pressable
  onPress={() => router.push("/profile")}
  className="items-center"
>
  <Ionicons name="person-outline" size={20} color="#9ca3af" />
  <Text className="text-[10px] text-gray-400 font-bold mt-1">
    PROFILE
  </Text>
</Pressable>
      </View>
    </View>
  );
}