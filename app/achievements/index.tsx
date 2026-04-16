import { Pressable } from "@/components/Pressable";
import { auth } from "@/firebaseConfig";
import {
    type AchievementCategory,
    type AchievementFilter,
    type AchievementRowModel,
    type AchievementSectionModel,
    loadAndSyncAchievements,
} from "@/lib/achievements";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const allRows = visibleSections.flatMap((s) => s.rows);
  const activeAllSections = (sections ?? []).filter((s) => !s.comingSoon);
  const completedVisible = activeAllSections.reduce((sum, s) => sum + s.completedCount, 0);
  const totalVisible = activeAllSections.reduce((sum, s) => sum + s.totalCount, 0);
  const progressPct =
    totalVisible > 0 ? Math.round((completedVisible / totalVisible) * 100) : 0;

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 36,
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
      >
        <View className="flex-row items-center mb-5">
          <Pressable
            onPress={() => router.back()}
            className="w-12 h-12 rounded-full bg-white items-center justify-center mr-3"
          >
            <Ionicons name="chevron-back" size={28} color="#1f2937" />
          </Pressable>
          <Text className="text-3xl font-extrabold text-gray-900">Achievements</Text>
        </View>
        <View className="mt-3 bg-white border border-gray-200 rounded-2xl px-4 py-3.5">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-sm text-gray-500">Progress</Text>
              <Text className="text-2xl font-extrabold text-gray-900 mt-0.5">{progressPct}%</Text>
            </View>
            <View className="items-end">
              <Text className="text-sm text-gray-500">Done</Text>
              <Text className="text-lg font-extrabold text-[#52B69A] mr-4">
                {completedVisible}/{totalVisible}
              </Text>
            </View>
          </View>
          <View className="w-full h-2 rounded-full bg-gray-100 mt-3 overflow-hidden">
            <View
              className="h-2 rounded-full bg-[#76C893]"
              style={{ width: `${Math.max(0, Math.min(progressPct, 100))}%` }}
            />
          </View>
        </View>

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
        ) : filter === "all" ? (
          <View className="mt-8 gap-3">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center flex-1">
                <View className="w-14 h-14 rounded-2xl items-center justify-center bg-[#eaf7f0]">
                  <Ionicons name="trophy-outline" size={26} color="#52B69A" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-2xl font-extrabold text-gray-900">All Categories</Text>
                  <Text className="text-base text-gray-500 mt-1">
                    All of the achievements
                  </Text>
                </View>
              </View>
              <Text className="text-sm mr-4 font-bold text-[#76C893]">
                {completedVisible} / {totalVisible}
              </Text>
            </View>
            {allRows.map((row) => (
              <AchievementRow key={row.id} row={row} />
            ))}
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
        <View className="gap-3">
          {comingSoonRows(section.category).map((row) => (
            <View key={row.title} className="flex-row items-center bg-white rounded-2xl px-4 py-3.5 border border-gray-200">
              <View className={`w-10 h-10 rounded-xl items-center justify-center ${row.bgClass}`}>
                <Ionicons name={row.icon} size={20} color={row.iconColor} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-semibold text-gray-800">{row.title}</Text>
                <Text className="text-sm text-gray-500 mt-0.5">{row.label}</Text>
              </View>
              <View className="px-2.5 py-1 rounded-full bg-gray-100">
                <Text className="text-xs font-bold text-gray-500">SOON</Text>
              </View>
            </View>
          ))}
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
        <Text className="text-sm font-bold text-[#76C893] mr-4">{summary}</Text>
      </View>
      <View className="gap-3">
        {section.rows.map((row) => (
          <AchievementRow key={row.id} row={row} />
        ))}
      </View>
    </View>
  );
}

function comingSoonRows(category: AchievementCategory) {
  if (category === "meal") {
    return [
      { title: "Meal Starter", label: "Log your first meal entry", icon: "restaurant-outline", bgClass: "bg-[#fff4e6]", iconColor: "#d97706" },
      { title: "Breakfast Builder", label: "Complete 5 breakfast logs", icon: "cafe-outline", bgClass: "bg-[#fff4e6]", iconColor: "#d97706" },
      { title: "Lunch Tracker", label: "Log 5 lunch meals", icon: "fast-food-outline", bgClass: "bg-[#fff4e6]", iconColor: "#d97706" },
      { title: "Dinner Planner", label: "Log 5 dinner meals", icon: "restaurant-outline", bgClass: "bg-[#fff4e6]", iconColor: "#d97706" },
      { title: "Healthy Balance", label: "Reach your balanced meal target", icon: "leaf-outline", bgClass: "bg-[#fff4e6]", iconColor: "#d97706" },
      { title: "Macro Watch", label: "Review your nutrition summary", icon: "stats-chart-outline", bgClass: "bg-[#fff4e6]", iconColor: "#d97706" },
      { title: "Nutrition Master", label: "Stay consistent across meal plans", icon: "medal-outline", bgClass: "bg-[#fff4e6]", iconColor: "#d97706" },
    ] as const;
  }
  return [
    { title: "Welcome In", label: "Join your first community room", icon: "people-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "First Chat", label: "Send your first message", icon: "chatbubble-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "Helpful Reply", label: "Reply to a community post", icon: "send-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "Challenge Joiner", label: "Join a weekly challenge", icon: "trophy-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "Supportive Member", label: "React to 10 messages", icon: "heart-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "Active Voice", label: "Participate for 7 days", icon: "megaphone-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "Community Champion", label: "Complete all social milestones", icon: "ribbon-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
  ] as const;
}

function achievementLogo(
  id: string
): { name: keyof typeof Ionicons.glyphMap; bgClass: string; color: string } {
  const map: Record<string, { name: keyof typeof Ionicons.glyphMap; bgClass: string; color: string }> = {
    wo_profile: { name: "person-outline", bgClass: "bg-[#eaf7f0]", color: "#52B69A" },
    wo_goal: { name: "flag-outline", bgClass: "bg-[#eaf7f0]", color: "#52B69A" },
    wo_plan_generated: { name: "document-text-outline", bgClass: "bg-[#eaf7f0]", color: "#52B69A" },
    wo_plan_days: { name: "calendar-outline", bgClass: "bg-[#eaf7f0]", color: "#52B69A" },
    wo_first_complete: { name: "play-circle-outline", bgClass: "bg-[#eaf7f0]", color: "#52B69A" },
    wo_complete_10: { name: "fitness-outline", bgClass: "bg-[#eaf7f0]", color: "#52B69A" },
    wo_complete_25: { name: "trophy-outline", bgClass: "bg-[#eaf7f0]", color: "#52B69A" },
    ml_water_first: { name: "water-outline", bgClass: "bg-[#fff4e6]", color: "#d97706" },
    ml_water_5: { name: "water", bgClass: "bg-[#fff4e6]", color: "#d97706" },
    ml_water_20: { name: "flask-outline", bgClass: "bg-[#fff4e6]", color: "#d97706" },
    ml_meal_reminder: { name: "notifications-outline", bgClass: "bg-[#fff4e6]", color: "#d97706" },
    ml_water_reminder: { name: "alarm-outline", bgClass: "bg-[#fff4e6]", color: "#d97706" },
    ml_repeat_days: { name: "repeat-outline", bgClass: "bg-[#fff4e6]", color: "#d97706" },
    ml_water_50: { name: "medal-outline", bgClass: "bg-[#fff4e6]", color: "#d97706" },
    st_steps_first: { name: "walk-outline", bgClass: "bg-[#fff7ed]", color: "#ea580c" },
    st_steps_3: { name: "footsteps-outline", bgClass: "bg-[#fff7ed]", color: "#ea580c" },
    st_steps_7: { name: "fitness-outline", bgClass: "bg-[#fff7ed]", color: "#ea580c" },
    st_steps_14: { name: "trophy-outline", bgClass: "bg-[#fff7ed]", color: "#ea580c" },
    st_water_first: { name: "water-outline", bgClass: "bg-[#fff7ed]", color: "#ea580c" },
    st_water_10: { name: "flask-outline", bgClass: "bg-[#fff7ed]", color: "#ea580c" },
    st_water_30: { name: "medal-outline", bgClass: "bg-[#fff7ed]", color: "#ea580c" },
  };
  if (map[id]) return map[id];
  if (id.startsWith("cm_")) return { name: "people-outline", bgClass: "bg-[#eef2ff]", color: "#4f46e5" };
  if (id.startsWith("st_")) return { name: "flame-outline", bgClass: "bg-[#fff7ed]", color: "#ea580c" };
  return { name: "flame-outline", bgClass: "bg-[#fff7ed]", color: "#ea580c" };
}

function AchievementRow({ row }: { row: AchievementRowModel }) {
  const logo = achievementLogo(row.id);
  if (row.variant === "done") {
    return (
      <View className="flex-row items-center bg-white rounded-2xl px-4 py-3.5 border border-gray-200">
        <View className={`w-10 h-10 rounded-xl items-center justify-center ${logo.bgClass}`}>
          <Ionicons name={logo.name} size={20} color={logo.color} />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-base font-semibold text-gray-800">{row.title ?? row.label}</Text>
          <Text className="text-sm text-gray-600 mt-0.5">{row.label}</Text>
        </View>
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
      <View className={`w-10 h-10 rounded-xl items-center justify-center ${logo.bgClass}`}>
        <Ionicons name={logo.name} size={20} color={logo.color} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-base font-semibold text-gray-800">{row.title ?? row.label}</Text>
        <Text className="text-sm text-gray-600 mt-0.5">{row.label}</Text>
      </View>
      <Text className="text-sm text-gray-400 font-semibold">{row.rightLabel}</Text>
    </View>
  );
}
