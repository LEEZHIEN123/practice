import { Pressable } from "@/components/Pressable";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import { auth } from "@/firebaseConfig";
import {
  type AchievementCategory,
  type AchievementFilter,
  type AchievementRowModel,
  type AchievementSectionModel,
  loadAndSyncAchievements,
} from "@/lib/achievements";
import { useThemedScreen } from "@/lib/useThemedScreen";
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
    iconColor: string;
    iconBgKey: "accentSoft" | "rowBg";
  }
> = {
  workout: {
    title: "Workout",
    subtitle: "Training & activity goals",
    icon: "barbell-outline",
    iconColor: "#76C893",
    iconBgKey: "accentSoft",
  },
  meal: {
    title: "Meal",
    subtitle: "Logging & nutrition habits",
    icon: "nutrition-outline",
    iconColor: "#d97706",
    iconBgKey: "rowBg",
  },
  community: {
    title: "Community",
    subtitle: "Social posts, chat & challenges",
    icon: "people-outline",
    iconColor: "#2563eb",
    iconBgKey: "rowBg",
  },
  streaks: {
    title: "Streaks",
    subtitle: "Consistency & weigh-ins",
    icon: "flame-outline",
    iconColor: "#ea580c",
    iconBgKey: "rowBg",
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
  const { cardStyle, screenStyle, textPrimary, textMuted, theme } = useThemedScreen();
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
    <View style={screenStyle}>
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
            className="w-12 h-12 rounded-full items-center justify-center mr-3"
            style={cardStyle}
          >
            <Ionicons name="chevron-back" size={28} color={theme.textPrimary} />
          </Pressable>
          <Text className="text-3xl font-extrabold" style={textPrimary}>
            Achievements
          </Text>
        </View>
        <View className="mt-3 rounded-2xl px-4 py-3.5" style={cardStyle}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-sm" style={textMuted}>
                Achievement Progress
              </Text>
              <Text className="text-2xl font-extrabold mt-0.5" style={textPrimary}>
                {progressPct}%
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-sm" style={textMuted}>
                Done
              </Text>
              <Text className="text-lg font-extrabold mr-4" style={{ color: theme.accentText }}>
                {completedVisible}/{totalVisible}
              </Text>
            </View>
          </View>
          <View
            className="w-full h-2 rounded-full mt-3 overflow-hidden"
            style={{ backgroundColor: theme.rowBg }}
          >
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
                className="px-5 py-3 rounded-full border"
                style={
                  active
                    ? { backgroundColor: theme.accent, borderColor: theme.accent }
                    : cardStyle
                }
              >
                <Text
                  className="text-base font-bold"
                  style={{ color: active ? "#ffffff" : theme.textSecondary }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {!auth.currentUser ? (
          <View className="mt-10 items-center">
            <Text className="text-base text-center" style={textMuted}>
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
            <Text className="text-base mt-4" style={textMuted}>Loading your progress…</Text>
          </View>
        ) : !sections?.length ? (
          <View className="mt-10">
            <Text className="text-base" style={textMuted}>
              Could not load achievements. Check your connection and try again.
            </Text>
            <Pressable
              onPress={() => void refresh()}
              className="mt-4 self-start px-5 py-3 rounded-full"
              style={cardStyle}
            >
              <Text className="text-base font-bold" style={textPrimary}>Retry</Text>
            </Pressable>
          </View>
        ) : filter === "all" ? (
          <View className="mt-8 gap-3">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center flex-1">
                <View
                  className="w-14 h-14 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: theme.accentSoft }}
                >
                  <Ionicons name="trophy-outline" size={26} color={theme.accentText} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-2xl font-extrabold" style={textPrimary}>All Categories</Text>
                  <Text className="text-base mt-1" style={textMuted}>
                    All of the achievements
                  </Text>
                </View>
              </View>
              <Text className="text-sm mr-4 font-bold" style={{ color: theme.accentText }}>
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
  const { textPrimary, textMuted, theme } = useThemedScreen();
  const { cardStyle } = useProfileCardStyles();
  const meta = SECTION_META[section.category];
  const summary = `${section.completedCount} / ${section.totalCount}`;

  if (section.comingSoon) {
    return (
      <View>
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center flex-1">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center"
              style={{ backgroundColor: theme[meta.iconBgKey] }}
            >
              <Ionicons name={meta.icon} size={26} color={meta.iconColor} />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-2xl font-extrabold" style={textPrimary}>{meta.title}</Text>
              <Text className="text-base mt-1" style={textMuted}>{meta.subtitle}</Text>
            </View>
          </View>
          <View className="px-3 py-1.5 rounded-full" style={{ backgroundColor: theme.rowBg }}>
            <Text className="text-sm font-bold" style={textMuted}>Coming soon</Text>
          </View>
        </View>
        <View className="gap-3">
          {comingSoonRows(section.category).map((row) => (
            <View key={row.title} className="flex-row items-center rounded-2xl px-4 py-3.5" style={cardStyle}>
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: theme.rowBg }}
              >
                <Ionicons name={row.icon} size={20} color={row.iconColor} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-semibold" style={textPrimary}>{row.title}</Text>
                <Text className="text-sm mt-0.5" style={textMuted}>{row.label}</Text>
              </View>
              <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: theme.rowBg }}>
                <Text className="text-xs font-bold" style={textMuted}>SOON</Text>
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
            className="w-14 h-14 rounded-2xl items-center justify-center"
            style={{ backgroundColor: theme[meta.iconBgKey] }}
          >
            <Ionicons name={meta.icon} size={26} color={meta.iconColor} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-2xl font-extrabold" style={textPrimary}>{meta.title}</Text>
            <Text className="text-base mt-1" style={textMuted}>{meta.subtitle}</Text>
          </View>
        </View>
        <Text className="text-sm font-bold mr-4" style={{ color: theme.accentText }}>{summary}</Text>
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
): { name: keyof typeof Ionicons.glyphMap; color: string } {
  const map: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
    wo_profile: { name: "person-outline", color: "#52B69A" },
    wo_goal: { name: "flag-outline", color: "#52B69A" },
    wo_plan_generated: { name: "document-text-outline", color: "#52B69A" },
    wo_plan_days: { name: "calendar-outline", color: "#52B69A" },
    wo_first_complete: { name: "play-circle-outline", color: "#52B69A" },
    wo_complete_10: { name: "fitness-outline", color: "#52B69A" },
    wo_complete_25: { name: "trophy-outline", color: "#52B69A" },
    ml_water_first: { name: "water-outline", color: "#d97706" },
    ml_water_5: { name: "water", color: "#d97706" },
    ml_water_20: { name: "flask-outline", color: "#d97706" },
    ml_meal_reminder: { name: "notifications-outline", color: "#d97706" },
    ml_water_reminder: { name: "alarm-outline", color: "#d97706" },
    ml_repeat_days: { name: "repeat-outline", color: "#d97706" },
    ml_water_50: { name: "medal-outline", color: "#d97706" },
    st_steps_first: { name: "walk-outline", color: "#ea580c" },
    st_steps_3: { name: "footsteps-outline", color: "#ea580c" },
    st_steps_7: { name: "fitness-outline", color: "#ea580c" },
    st_steps_14: { name: "trophy-outline", color: "#ea580c" },
    st_water_first: { name: "water-outline", color: "#ea580c" },
    st_water_10: { name: "flask-outline", color: "#ea580c" },
    st_water_30: { name: "medal-outline", color: "#ea580c" },
    cm_welcome: { name: "people-outline", color: "#2563eb" },
    cm_first_chat: { name: "chatbubble-outline", color: "#2563eb" },
    cm_first_reply: { name: "send-outline", color: "#2563eb" },
    cm_challenge: { name: "trophy-outline", color: "#2563eb" },
    cm_likes_10: { name: "heart-outline", color: "#2563eb" },
    cm_active_7: { name: "megaphone-outline", color: "#2563eb" },
    cm_champion: { name: "ribbon-outline", color: "#2563eb" },
  };
  if (map[id]) return map[id];
  if (id.startsWith("cm_")) return { name: "people-outline", color: "#4f46e5" };
  if (id.startsWith("st_")) return { name: "flame-outline", color: "#ea580c" };
  return { name: "flame-outline", color: "#ea580c" };
}

function AchievementIcon({
  id,
  size = 20,
  boxSize = 40,
}: {
  id: string;
  size?: number;
  boxSize?: number;
}) {
  const { theme } = useThemedScreen();
  const logo = achievementLogo(id);
  const bg =
    id.startsWith("wo_") ? theme.accentSoft : theme.rowBg;

  return (
    <View
      className="rounded-xl items-center justify-center"
      style={{ width: boxSize, height: boxSize, backgroundColor: bg }}
    >
      <Ionicons name={logo.name} size={size} color={logo.color} />
    </View>
  );
}

function AchievementRow({ row }: { row: AchievementRowModel }) {
  const { textPrimary, textMuted, theme } = useThemedScreen();
  const { cardStyle } = useProfileCardStyles();
  if (row.variant === "done") {
    return (
      <View className="flex-row items-center rounded-2xl px-4 py-3.5" style={cardStyle}>
        <AchievementIcon id={row.id} />
        <View className="ml-3 flex-1">
          <Text className="text-base font-semibold" style={textPrimary}>{row.title ?? row.label}</Text>
          <Text className="text-sm mt-0.5" style={textMuted}>{row.label}</Text>
        </View>
        {row.isComplete ? (
          <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: theme.accentSoft }}>
            <Text className="text-xs font-bold" style={{ color: theme.accentText }}>DONE</Text>
          </View>
        ) : (
          <Text className="text-sm font-semibold" style={textMuted}>{row.rightLabel}</Text>
        )}
      </View>
    );
  }

  return (
    <View className="flex-row items-center rounded-2xl px-4 py-3.5" style={cardStyle}>
      <AchievementIcon id={row.id} />
      <View className="ml-3 flex-1">
        <Text className="text-base font-semibold" style={textPrimary}>{row.title ?? row.label}</Text>
        <Text className="text-sm mt-0.5" style={textMuted}>{row.label}</Text>
      </View>
      {row.isComplete ? (
        <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: theme.accentSoft }}>
          <Text className="text-xs font-bold" style={{ color: theme.accentText }}>DONE</Text>
        </View>
      ) : (
        <Text className="text-sm font-semibold" style={textMuted}>{row.rightLabel}</Text>
      )}
    </View>
  );
}
