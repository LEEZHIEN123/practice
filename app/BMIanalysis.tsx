import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { auth, db } from "../firebaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";

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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [heightCm, setHeightCm] = useState<number>(0);
  const [weightKg, setWeightKg] = useState<number>(0);

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.exists() ? snap.data() : {};

      const h = typeof data.height === "number" ? data.height : 0;
      const w = typeof data.weight === "number" ? data.weight : 0;

      setHeightCm(h);
      setWeightKg(w);
      setLoading(false);
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

  if (loading) {
    return (
      <View className="flex-1 bg-[#eef2f1] items-center justify-center">
        <Text className="text-gray-600">Loading...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#eef2f1] px-6 pt-12">
      {/* Header */}
      <View className="relative mb-6">
        <Pressable
          onPress={() => router.back()}
          className="absolute left-0 top-2 h-16 w-24 justify-center pl-2"
        >
          <View className="w-12 h-12 rounded-full bg-white items-center justify-center">
            <Ionicons name="chevron-back" size={26} color="#1f2937" />
          </View>
        </Pressable>

        <Text className="text-center text-2xl font-bold text-gray-900 mt-3">
          BMI Analysis
        </Text>

        <View className="flex-row justify-center items-center mt-3">
          <View className="w-2 h-2 rounded-full bg-green-300 mx-1" />
          <View className="w-2 h-2 rounded-full bg-green-300 mx-1" />
          <View className="w-10 h-2 rounded-full bg-green-500 mx-1" />
        </View>
      </View>

      {/* Title */}
      <Text className="text-center text-2xl font-bold text-gray-900">
        {plan.titleTop}
      </Text>
      <Text className="text-center text-3xl font-extrabold text-gray-900 mt-2">
        {plan.status}
      </Text>

      <Text className="text-center text-gray-500 mt-3 mb-5 text-base">
        To improve your health, we recommend a{"\n"}
        {plan.recommendationTitle.toLowerCase()} plan.
      </Text>

      {/* BMI Score */}
      <Text className="text-center text-5xl font-extrabold text-[#52B69A]">
        {bmi ? bmi.toFixed(1) : "--"}
      </Text>
      <Text className="text-center text-xs tracking-widest text-gray-500 mt-2">
        BMI SCORE
      </Text>

      {/* BMI bar */}
      <View className="mt-6">
        <View className="flex-row h-2 rounded-full overflow-hidden">
          <View className="flex-1 bg-blue-300" />
          <View className="flex-1 bg-green-300" />
          <View className="flex-1 bg-yellow-300" />
          <View className="flex-1 bg-red-300" />
        </View>

        <View className="flex-row justify-between mt-2">
          <Text className="text-[10px] text-gray-500">UNDER</Text>
          <Text className="text-[10px] text-gray-500">NORMAL</Text>
          <Text className="text-[10px] text-gray-500">OVER</Text>
          <Text className="text-[10px] text-gray-500">OBESE</Text>
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

          <Text className="flex-1 text-xs text-gray-600 leading-5">
            Tip: If you don’t want to follow the recommended goal, you can
            manually adjust your goal anytime in the app.
          </Text>
        </View>
      </View>

      {/* Continue */}
      <View className="flex-1 justify-end pb-10">
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
                {saving ? "Loading..." : "Continue to Plan"}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}