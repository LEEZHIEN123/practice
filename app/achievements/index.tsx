import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "@/firebaseConfig";
import {
  type AchievementCategory,
  type AchievementFilter,
  type AchievementRowModel,
  type AchievementSectionModel,
  loadAndSyncAchievements,
} from "@/lib/achievements";

const SECTION_META: Record<
  AchievementCategory,
  {
    title: string;
    subtitle: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconBg: string;
    iconColor: string;
  }
> = {
  workout: {
    title: "Workout",
    subtitle: "Training & activity goals",
    icon: "barbell-outline",
    iconBg: "bg-[#eaf7f0]",
    iconColor: "#76C893",
  },
  meal: {
    title: "Meal",
    subtitle: "Logging & nutrition habits",
    icon: "nutrition-outline",
    iconBg: "bg-[#fff4e6]",
    iconColor: "#d97706",
  },
  community: {
    title: "Community",
    subtitle: "Discover & connect",
    icon: "people-outline",
    iconBg: "bg-[#e8f4fc]",
    iconColor: "#2563eb",
  },
  streaks: {
    title: "Streaks",
    subtitle: "Consistency & weigh-ins",
    icon: "flame-outline",
    iconBg: "bg-[#fef3c7]",
    iconColor: "#ea580c",
  },
};

const FILTER_CHIPS: { key: AchievementFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "workout", label: "Workout" },
  { key: "meal", label: "Meal" },
  { key: "community", label: "Community" },
  { key: "streaks", label: "Streaks" },
];

export default function AchievementsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<AchievementFilter>("all");
  const [sections, setSections] = useState<AchievementSectionModel[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!auth.currentUser) {
      setSections(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await loadAndSyncAchievements();
      setSections(s);
    } catch (e) {
      console.log("Achievements load failed:", e);
      setSections(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const visibleSections =
    sections?.filter((s) => filter === "all" || s.category === filter) ?? [];

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 36,
          paddingHorizontal: 24,
          paddingTop: insets.top + 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-12 h-12 rounded-full bg-white items-center justify-center mb-5"
        >
          <Ionicons name="chevron-back" size={28} color="#1f2937" />
        </Pressable>

        <Text className="text-3xl font-extrabold text-gray-900">Achievements</Text>
        <Text className="text-base text-gray-500 mt-2 leading-6">
          Progress is saved to your account and updates as you use the app.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-6 -mx-1"
          contentContainerStyle={{ paddingHorizontal: 4, gap: 10 }}
        >
          {FILTER_CHIPS.map(({ key, label }) => {
            const active = filter === key;
            return (
              <Pressable
                key={key}
                onPress={() => setFilter(key)}
                className={`px-5 py-3 rounded-full border ${
                  active
                    ? "bg-[#76C893] border-[#76C893]"
                    : "bg-white border-gray-200"
                }`}
              >
                <Text
                  className={`text-base font-bold ${
                    active ? "text-white" : "text-gray-700"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {!auth.currentUser ? (
          <View className="mt-10 items-center">
            <Text className="text-base text-gray-600 text-center">
              Sign in to track achievements.
            </Text>
            <Pressable
              onPress={() => router.replace("/login")}
              className="mt-4 bg-[#76C893] px-6 py-3 rounded-full"
            >
              <Text className="text-white font-bold text-base">Go to login</Text>
            </Pressable>
          </View>
        ) : loading ? (
          <View className="mt-16 items-center">
            <ActivityIndicator size="large" color="#76C893" />
            <Text className="text-base text-gray-500 mt-4">Loading your progress…</Text>
          </View>
        ) : !sections?.length ? (
          <View className="mt-10">
            <Text className="text-base text-gray-600">
              Could not load achievements. Check your connection and try again.
            </Text>
            <Pressable
              onPress={() => void refresh()}
              className="mt-4 self-start bg-white border border-gray-200 px-5 py-3 rounded-full"
            >
              <Text className="text-base font-bold text-gray-800">Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View className="mt-8 gap-10">
            {visibleSections.map((section) => (
              <AchievementSectionBlock key={section.category} section={section} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function AchievementSectionBlock({ section }: { section: AchievementSectionModel }) {
  const meta = SECTION_META[section.category];
  const summary = `${section.completedCount} / ${section.totalCount}`;

  if (section.comingSoon) {
    return (
      <View>
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center flex-1">
            <View
              className={`w-14 h-14 rounded-2xl items-center justify-center ${meta.iconBg}`}
            >
              <Ionicons name={meta.icon} size={26} color={meta.iconColor} />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-2xl font-extrabold text-gray-900">{meta.title}</Text>
              <Text className="text-base text-gray-500 mt-1">{meta.subtitle}</Text>
            </View>
          </View>
          <View className="px-3 py-1.5 rounded-full bg-gray-200">
            <Text className="text-sm font-bold text-gray-600">Coming soon</Text>
          </View>
        </View>
        <View className="bg-white rounded-2xl px-5 py-8 border border-gray-200 items-center">
          <Ionicons name="hourglass-outline" size={36} color="#9ca3af" />
          <Text className="text-lg font-extrabold text-gray-800 mt-4 text-center">
            Coming soon
          </Text>
          <Text className="text-base text-gray-500 mt-2 text-center leading-6">
            {section.category === "meal"
              ? "Meal achievements will track logging, goals, and nutrition milestones."
              : "Community achievements will track challenges, sharing, and social goals."}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center flex-1">
          <View
            className={`w-14 h-14 rounded-2xl items-center justify-center ${meta.iconBg}`}
          >
            <Ionicons name={meta.icon} size={26} color={meta.iconColor} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-2xl font-extrabold text-gray-900">{meta.title}</Text>
            <Text className="text-base text-gray-500 mt-1">{meta.subtitle}</Text>
          </View>
        </View>
        <Text className="text-sm font-bold text-[#76C893]">{summary}</Text>
      </View>
      <View className="gap-3">
        {section.rows.map((row) => (
          <AchievementRow key={row.id} row={row} />
        ))}
      </View>
    </View>
  );
}

function AchievementRow({ row }: { row: AchievementRowModel }) {
  if (row.variant === "done") {
    return (
      <View className="flex-row items-center bg-white rounded-2xl px-4 py-3.5 border border-gray-200">
        <Ionicons
          name={row.isComplete ? "checkmark-circle" : "ellipse-outline"}
          size={22}
          color={row.isComplete ? "#76C893" : "#d1d5db"}
        />
        <Text
          className={`ml-3 flex-1 text-base leading-5 ${
            row.isComplete ? "text-gray-800 font-semibold" : "text-gray-600"
          }`}
        >
          {row.label}
        </Text>
        {row.isComplete ? (
          <View className="px-2.5 py-1 rounded-full bg-[#eaf7f0]">
            <Text className="text-xs font-bold text-[#52B69A]">DONE</Text>
          </View>
        ) : (
          <Text className="text-sm text-gray-400 font-semibold">{row.rightLabel}</Text>
        )}
      </View>
    );
  }

  return (
    <View className="flex-row items-center bg-white rounded-2xl px-4 py-3.5 border border-gray-200">
      <Ionicons
        name={row.isComplete ? "checkmark-circle" : "ellipse-outline"}
        size={22}
        color={row.isComplete ? "#76C893" : "#d1d5db"}
      />
      <Text
        className={`ml-3 flex-1 text-base leading-5 ${
          row.isComplete ? "text-gray-800 font-semibold" : "text-gray-600"
        }`}
      >
        {row.label}
      </Text>
      <Text className="text-sm text-gray-400 font-semibold">{row.rightLabel}</Text>
    </View>
  );
}
