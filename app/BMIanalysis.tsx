import { Pressable } from "@/components/Pressable";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

type PlanKey = "gain" | "maintain" | "lose";

function getPlan(bmi: number): {
  planKey: PlanKey;
  titleTop: string;
  status: string;
  recommendationTitle: string;
  recommendationSubtitle: string;
  description: string;
} {
  if (bmi < 18.5) {
    return {
      planKey: "gain",
      titleTop: "Your BMI is",
      status: "Underweight",
      recommendationTitle: "Gain Weight",
      recommendationSubtitle: "Reach a healthier BMI range",
      description:
        "A BMI of {BMI} is below the ideal range.\n" +
        "Gaining weight gradually with a balanced diet and strength training can help you reach a healthier range.",
    };
  }

  if (bmi < 25) {
    return {
      planKey: "maintain",
      titleTop: "Your BMI is",
      status: "Normal",
      recommendationTitle: "Maintain Weight",
      recommendationSubtitle: "Stay within a healthy BMI range",
      description:
        "A BMI of {BMI} is within the ideal range.\n" +
        "Maintaining your current habits (balanced meals + regular activity) helps keep you healthy.",
    };
  }

  return {
    planKey: "lose",
    titleTop: "Your BMI is",
    status: "Overweight",
    recommendationTitle: "Lose Weight",
    recommendationSubtitle: "Achieve a healthier BMI range",
    description:
      "A BMI of {BMI} is above the ideal range.\n" +
      "Reducing your weight by 5–10% can significantly lower health risks such as blood pressure and heart strain.",
  };
}

export default function BmiAnalysis() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [saving, setSaving] = useState(false);

  const [heightCm, setHeightCm] = useState<number>(0);
  const [weightKg, setWeightKg] = useState<number>(0);

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
        console.log("Failed to load BMI analysis:", e);
      }
    };

    load();
  }, []);

  const bmi = useMemo(() => {
    if (!heightCm || !weightKg) return 0;
    const m = heightCm / 100;
    const value = weightKg / (m * m);
    return Number.isFinite(value) ? value : 0;
  }, [heightCm, weightKg]);

  const plan = useMemo(() => getPlan(bmi || 0), [bmi]);

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

  const bmiCaretColor = useMemo(() => {
    if (!bmi) return "#52B69A";
    if (bmiCategoryIdx === 0) return "#0284c7";
    if (bmiCategoryIdx === 1) return "#059669";
    if (bmiCategoryIdx === 2) return "#fbbf24";
    return "#dc2626";
  }, [bmi, bmiCategoryIdx]);

  const bmiStatusTextClass = useMemo(() => {
    if (bmiCategoryIdx === 0) return "text-sky-700";
    if (bmiCategoryIdx === 1) return "text-emerald-800";
    if (bmiCategoryIdx === 2) return "text-amber-800";
    return "text-red-700";
  }, [bmiCategoryIdx]);

  // ✅ store BMI in Firestore when BMI is available
  useEffect(() => {
    const saveBmi = async () => {
      const user = auth.currentUser;
      if (!user) return;
      if (!bmi) return;

      try {
        await updateDoc(doc(db, "users", user.uid), {
          bmi: Number(bmi.toFixed(2)),
          recommendedPlan: plan.planKey,
        });
      } catch (e) {
        console.log("Failed to save BMI:", e);
      }
    };

    saveBmi();
  }, [bmi, plan.planKey]);

  const goNext = async () => {
    try {
      setSaving(true);
      // change this to your next page
      router.replace("/home");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-[#f4fcf7]">
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12 }}>
        {/* Header (same style as Contact Us) */}
        <View className="relative mb-6 h-12 justify-center">
          <Text className="text-center text-xl font-extrabold text-gray-900">
            BMI Analysis
          </Text>
        </View>

        {/* Progress indicator (kept, just moved under header) */}
        <View className="flex-row justify-center items-center -mt-1 mb-3">
          <View className="w-2 h-2 rounded-full bg-green-300 mx-1" />
          <View className="w-2 h-2 rounded-full bg-green-300 mx-1" />
          <View className="w-10 h-2 rounded-full bg-green-500 mx-1" />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
      >

      {/* Title */}
      <Text className="text-center text-2xl font-bold text-gray-900">
        {plan.titleTop}
      </Text>
      <Text className={`text-center text-3xl font-extrabold mt-2 ${bmiStatusTextClass}`}>
        {plan.status}
      </Text>

      <Text className="text-center text-gray-500 mt-3 mb-5 text-base">
        To improve your health, we recommended a{"\n"}
        <Text className="text-red-600 font-extrabold text-lg">
          {(plan.recommendationTitle + " Goal").toUpperCase()}
        </Text>
        .
      </Text>

      {/* BMI Score */}
      <View className="items-center">
        <View className={`px-3 py-1.5 rounded-full border ${bmi ? bmiCategoryPillClass : "bg-gray-50 border-gray-200"}`}>
          <Text className={`text-xs font-extrabold ${bmi ? bmiCategoryPillTextClass : "text-gray-500"}`}>
            {bmiCategoryLabel}
          </Text>
        </View>
        <View className="flex-row items-end">
          <Text className="text-4xl font-extrabold text-gray-900">
            {bmi ? bmi.toFixed(1) : "--"}
          </Text>
          <Text className="text-gray-500 ml-2 mb-1 text-sm">kg/m²</Text>
        </View>
      </View>
      <Text className="text-center text-xs tracking-widest text-gray-500 mt-2">
        BMI SCORE
      </Text>

      {/* BMI bar */}
      <View className="mt-6">
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
              { key: "obese", label: "OBESE", range: ">= 30.0", color: "text-red-600" },
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

      {/* Recommended Goal */}
      <Text className="mt-6 text-xs tracking-widest text-gray-500 font-semibold">
        RECOMMENDED GOAL
      </Text>

      <View className="mt-3 bg-white rounded-3xl p-5 border border-[#76C893]">
        {/* Goal row */}
        <View className="flex-row items-center">
          <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
            {plan.planKey === "gain" && (
              <Ionicons name="trending-up-outline" size={20} color="#111827" />
            )}
            {plan.planKey === "maintain" && (
              <Ionicons name="remove-outline" size={20} color="#111827" />
            )}
            {plan.planKey === "lose" && (
              <Ionicons name="trending-down-outline" size={20} color="#111827" />
            )}
          </View>

          <View className="ml-3">
            <Text className="text-lg font-extrabold text-gray-900">
              {plan.recommendationTitle}
            </Text>
            <Text className="text-sm text-gray-500">
              {plan.recommendationSubtitle}
            </Text>
          </View>
        </View>

        {/* Small description block */}
        <Text className="text-xs text-gray-500 mt-4 leading-5">
          {plan.description.replace("{BMI}", bmi ? bmi.toFixed(1) : "--")}
        </Text>
      </View>

      {/* Tips under recommended plan */}
      <View className="mt-3 bg-[#eaf7f0] border border-[#76C893] rounded-2xl p-4">
        <View className="flex-row items-start">
          <View className="w-8 h-8 rounded-full bg-white items-center justify-center mr-3">
            <Ionicons
              name="information-circle-outline"
              size={18}
              color="#52B69A"
            />
          </View>

          <Text className="flex-1 text-xs text-gray-1000 leading-5">
            Tip: If you don’t want to follow the recommended goal, you can
            manually adjust your goal anytime in the app.
          </Text>
        </View>
      </View>
      </ScrollView>

      <View
        className="absolute left-0 right-0 bg-[#f4fcf7] px-3 pt-3"
        style={{ bottom: 0, paddingBottom: insets.bottom + 12 }}
      >
        <Pressable
          onPress={goNext}
          disabled={saving || !bmi}
          className={`rounded-full overflow-hidden ${
            saving || !bmi ? "opacity-60" : "opacity-100"
          }`}
        >
          <LinearGradient
            colors={["#76C893", "#52B69A"]}
            className="py-4 items-center rounded-2xl"
          >
            <View className="flex-row items-center">
              <Text className="text-white text-lg font-semibold mr-2">
                {saving ? "Loading..." : "Continue"}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}