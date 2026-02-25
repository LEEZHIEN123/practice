import React, { useMemo, useState, useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { auth, db } from "../firebaseConfig";
import { doc, updateDoc, getDoc } from "firebase/firestore";

type ActivityKey =
  | "sedentary"
  | "light"
  | "moderate"
  | "very_active"
  | "extra_active";

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function ActivityLevel() {
  const router = useRouter();
const [selected, setSelected] = useState<ActivityKey | null>(null);  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () => [
      {
        key: "sedentary" as const,
        title: "Sedentary",
        subtitle: "Little to no exercise",
        multiplier: 1.2,
        icon: "bed-outline" as IoniconName,
      },
      {
        key: "light" as const,
        title: "Light",
        subtitle: "Exercise 1–3 days/week",
        multiplier: 1.375,
        icon: "walk-outline" as IoniconName,
      },
      {
        key: "moderate" as const,
        title: "Moderate",
        subtitle: "Exercise 3–5 days/week",
        multiplier: 1.55,
        icon: "barbell-outline" as IoniconName,
      },
      {
        key: "very_active" as const,
        title: "Very Active",
        subtitle: "Exercise 6–7 days/week",
        multiplier: 1.725,
        icon: "fitness-outline" as IoniconName,
      },
      {
        key: "extra_active" as const,
        title: "Extra Active",
        subtitle: "Exercise 2 times a day",
        multiplier: 1.9,
        icon: "flash-outline" as IoniconName,
      },
    ],
    []
  );

  // ✅ Load previously saved activity level
  useEffect(() => {
    const loadActivity = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) return;

      const data = snap.data();

      if (data.activityLevel) {
        setSelected(data.activityLevel as ActivityKey);
      }
    };

    loadActivity();
  }, []);

  // ✅ Auto-save when user selects an option (so Back keeps it)
  const selectAndSave = async (key: ActivityKey, multiplier: number) => {
    setSelected(key);

    const user = auth.currentUser;
    if (!user) return;

    try {
      await updateDoc(doc(db, "users", user.uid), {
        activityLevel: key,
        activityMultiplier: multiplier,
      });
    } catch (e) {
      console.log("Auto-save activity failed:", e);
    }
  };

  // Continue goes to Home (final step)
  const continueToHome = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const picked = options.find((o) => o.key === selected);
    if (!picked) return;

    try {
      setSaving(true);

      // (Optional) save again to be 100% sure
      await updateDoc(doc(db, "users", user.uid), {
        activityLevel: picked.key,
        activityMultiplier: picked.multiplier,
      });

router.push("/BMIanalysis");    } catch (error) {
      console.log("Error saving activity level:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-[#eef2f1] px-6 pt-12">
      {/* Header */}
      <View className="relative mb-8">
        {/* Bigger tap area back */}
        <Pressable
          onPress={() => router.back()}
          className="absolute left-0 top-5 h-16 w-24 justify-center pl-2"
        >
          <View className="w-12 h-12 rounded-full bg-white items-center justify-center">
            <Ionicons name="chevron-back" size={26} color="#1f2937" />
          </View>
        </Pressable>

        <Text className="text-center text-2xl font-bold text-gray-900 mt-3">
          Profile Details
        </Text>

        {/* Progress Indicator */}
        <View className="flex-row justify-center items-center mt-3">
          <View className="w-2 h-2 rounded-full bg-green-300 mx-1" />
          <View className="w-10 h-2 rounded-full bg-green-500 mx-1" />
          <View className="w-2 h-2 rounded-full bg-green-300 mx-1" />
        </View>
      </View>

      {/* Title */}
      <Text className="text-center text-3xl font-extrabold text-gray-900 mt-2">
        Activity Level
      </Text>

      <Text className="text-center text-gray-500 mt-3 mb-6 text-base">
        This helps us personalize your fitness journey{"\n"}and track progress
        accurately.
      </Text>

      {/* Activity Options */}
      <View className="gap-4">
        {options.map((o) => {
          const isActive = selected === o.key;

          return (
            <Pressable
              key={o.key}
              onPress={() => selectAndSave(o.key, o.multiplier)}
              className={`rounded-3xl p-5 flex-row items-center justify-between ${
                isActive
                  ? "bg-[#eaf7f0] border-2 border-[#76C893]"
                  : "bg-white"
              }`}
            >
              <View className="flex-row items-center">
                <View
                  className={`w-16 h-16 rounded-2xl items-center justify-center ${
                    isActive ? "bg-[#76C893]" : "bg-gray-100"
                  }`}
                >
                  <Ionicons
                    name={o.icon}
                    size={26}
                    color={isActive ? "white" : "#111827"}
                  />
                </View>

                <View className="ml-4">
                  <Text className="text-xl font-extrabold text-gray-900">
                    {o.title}
                  </Text>
                  <Text className="text-gray-500 mt-1">{o.subtitle}</Text>
                </View>
              </View>

              {/* Radio Circle */}
              <View
                className={`w-7 h-7 rounded-full border-2 items-center justify-center ${
                  isActive ? "border-[#76C893]" : "border-gray-300"
                }`}
              >
                {isActive && (
                  <View className="w-3.5 h-3.5 rounded-full bg-[#76C893]" />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Continue Button */}
      <View className="flex-1 justify-end pb-10">
        <Pressable
          onPress={continueToHome}
          disabled={saving}
          className={`rounded-full overflow-hidden ${
            saving ? "opacity-60" : "opacity-100"
          }`}
        >
          <LinearGradient
            colors={["#76C893", "#52B69A"]}
            className="py-4 items-center rounded-2xl"
          >
            <View className="flex-row items-center">
              <Text className="text-white text-lg font-semibold mr-2">
                {saving ? "Saving..." : "Continue"}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}