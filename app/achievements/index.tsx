import { Pressable } from "@/components/Pressable";
import { ThemedBackButton, ProfileScreenHeader, useProfileCardStyles } from "@/components/themed/ThemedUi";
import { auth } from "@/firebaseConfig";
import {
  type AchievementCategory,
  type AchievementFilter,
  type AchievementRowModel,
  type AchievementSectionModel,
  loadAndSyncAchievements,
} from "@/lib/achievements";
import {
  backfillAllAchievementRankings,
  subscribeAchievementRanking,
  TOTAL_ACHIEVEMENTS,
  type AchievementRankingEntry,
} from "@/lib/achievementLeaderboard";
import { subscribeFriendsList } from "@/lib/communityService";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type RankingScope = "all" | "friends";

const SECTION_META: Record<
  AchievementCategory,
  {
    title: string;
    subtitle: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    iconBgColor: string;
    iconBgKey: "accentSoft" | "rowBg";
  }
> = {
  workout: {
    title: "Workout",
    subtitle: "Training & activity goals",
    icon: "barbell-outline",
    iconColor: "#76C893",
    iconBgColor: "#E8F8F0",
    iconBgKey: "accentSoft",
  },
  meal: {
    title: "Meal",
    subtitle: "Logging & nutrition habits",
    icon: "nutrition-outline",
    iconColor: "#d97706",
    iconBgColor: "#FFF4E6",
    iconBgKey: "rowBg",
  },
  community: {
    title: "Community",
    subtitle: "Social posts, chat & challenges",
    icon: "people-outline",
    iconColor: "#2563eb",
    iconBgColor: "#E8F4FC",
    iconBgKey: "rowBg",
  },
  streaks: {
    title: "Streaks",
    subtitle: "Consistency & weigh-ins",
    icon: "flame-outline",
    iconColor: "#9333ea",
    iconBgColor: "#F3E8FF",
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

const ALL_FILTER_COLOR = "#166534";

function filterChipColor(key: AchievementFilter): string {
  if (key === "all") return ALL_FILTER_COLOR;
  return SECTION_META[key].iconColor;
}

export default function AchievementsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    cardStyle,
    screenStyle,
    segmentTrackStyle,
    segmentActiveStyle,
    textPrimary,
    textMuted,
    theme,
  } = useThemedScreen();
  const [activeSection, setActiveSection] = useState<"achievements" | "ranking">(
    "achievements"
  );
  const [filter, setFilter] = useState<AchievementFilter>("all");
  const [sections, setSections] = useState<AchievementSectionModel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [rankingScope, setRankingScope] = useState<RankingScope>("all");
  const [rankingEntries, setRankingEntries] = useState<AchievementRankingEntry[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const authUid = auth.currentUser?.uid ?? null;

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

  useEffect(() => {
    if (activeSection !== "ranking" || !authUid) return;
    setRankingLoading(true);
    setRankingError(null);
    const unsubscribeRanking = subscribeAchievementRanking(
      (entries) => {
        setRankingEntries(entries);
        setRankingLoading(false);
      },
      () => {
        setRankingEntries([]);
        setRankingError("Could not load achievement ranking.");
        setRankingLoading(false);
      }
    );
    const unsubscribeFriends = subscribeFriendsList(
      (friends) => setFriendIds(new Set(friends.map((friend) => friend.id))),
      () => setFriendIds(new Set())
    );
    void backfillAllAchievementRankings().catch((error) => {
      console.log("Achievement ranking backfill unavailable:", error);
    });
    return () => {
      unsubscribeRanking();
      unsubscribeFriends();
    };
  }, [activeSection, authUid]);

  const visibleRankingEntries = useMemo(() => {
    if (rankingScope === "all") return rankingEntries;
    return rankingEntries.filter(
      (entry) => entry.uid === authUid || friendIds.has(entry.uid)
    );
  }, [authUid, friendIds, rankingEntries, rankingScope]);

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
      <View
        className="px-3 pb-3"
        style={{ paddingTop: insets.top + 12, backgroundColor: theme.screenBg, zIndex: 20 }}
      >
        <ProfileScreenHeader title="Achievements" onBack={() => router.back()} titleClassName="text-3xl" />
        <View className="mt-3 rounded-full p-1 flex-row" style={segmentTrackStyle}>
          {(["achievements", "ranking"] as const).map((section) => {
            const active = activeSection === section;
            return (
              <Pressable
                key={section}
                onPress={() => setActiveSection(section)}
                className="flex-1 py-3 rounded-full items-center"
                style={active ? segmentActiveStyle : undefined}
              >
                <Text
                  className="font-extrabold"
                  style={{ color: active ? theme.accentText : theme.textMuted }}
                >
                  {section === "achievements" ? "Achievements" : "Ranking"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: insets.bottom + 36,
          paddingHorizontal: 12,
        }}
      >
        {activeSection === "achievements" ? (
          <>
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
            const chipColor = filterChipColor(key);
            return (
              <Pressable
                key={key}
                onPress={() => setFilter(key)}
                className="px-5 py-3 rounded-full border"
                style={
                  active
                    ? { backgroundColor: chipColor, borderColor: chipColor }
                    : { ...cardStyle, borderColor: chipColor }
                }
              >
                <Text
                  className="text-base font-bold"
                  style={{ color: active ? "#ffffff" : chipColor }}
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
              <Text className="text-sm mr-4 font-bold" style={{ color: ALL_FILTER_COLOR }}>
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
          </>
        ) : !auth.currentUser ? (
          <View className="mt-10 items-center">
            <Text className="text-base text-center" style={textMuted}>
              Sign in to view the achievement ranking.
            </Text>
          </View>
        ) : (
          <View className="mt-5 rounded-3xl p-5" style={cardStyle}>
            <View className="items-center">
              <Ionicons name="trophy" size={34} color="#f59e0b" />
              <Text className="mt-2 text-xl font-extrabold" style={textPrimary}>
                Achievement Ranking
              </Text>
              <Text className="mt-1 text-sm text-center" style={textMuted}>
                Ranked by total achievements unlocked
              </Text>
            </View>

            <View className="mt-5 rounded-full p-1 flex-row" style={segmentTrackStyle}>
              {(["all", "friends"] as const).map((scope) => {
                const active = rankingScope === scope;
                return (
                  <Pressable
                    key={scope}
                    onPress={() => setRankingScope(scope)}
                    className="flex-1 py-3 rounded-full items-center"
                    style={active ? segmentActiveStyle : undefined}
                  >
                    <Text
                      className="font-bold"
                      style={{ color: active ? theme.accentText : theme.textMuted }}
                    >
                      {scope === "all" ? "All" : "Friends"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {rankingLoading ? (
              <View className="items-center py-8">
                <ActivityIndicator size="large" color={theme.accent} />
              </View>
            ) : rankingError ? (
              <Text className="py-8 text-center" style={textMuted}>
                {rankingError}
              </Text>
            ) : visibleRankingEntries.length === 0 ? (
              <Text className="py-8 text-center" style={textMuted}>
                {rankingScope === "friends"
                  ? "None of your friends are on the achievement ranking yet."
                  : "No achievement ranking is available yet."}
              </Text>
            ) : (
              (() => {
                const podiumEntries = visibleRankingEntries
                  .slice(0, 3)
                  .filter((entry) => entry.unlockedCount > 0);
                const listEntries = visibleRankingEntries
                  .map((entry, index) => ({ entry, rank: index + 1 }));
                const medalColors = ["#f59e0b", "#94a3b8", "#b45309"];
                const stageHeights = [76, 56, 44];
                const renderPodiumSlot = (rankIndex: number) => {
                  const entry = podiumEntries[rankIndex];
                  const isFirst = rankIndex === 0;
                  const avatarSize = isFirst ? 72 : 56;
                  if (!entry) return <View key={`podium-empty-${rankIndex}`} className="flex-1" />;
                  const isCurrentUser = entry.uid === auth.currentUser?.uid;
                  return (
                    <View key={entry.uid} className="flex-1 items-center justify-end">
                      {isFirst ? (
                        <Ionicons name="trophy" size={22} color="#f59e0b" style={{ marginBottom: 4 }} />
                      ) : null}
                      <View
                        className="overflow-hidden rounded-full items-center justify-center"
                        style={{
                          width: avatarSize,
                          height: avatarSize,
                          backgroundColor: theme.accentSoft,
                          borderWidth: 3,
                          borderColor: medalColors[rankIndex],
                        }}
                      >
                        {entry.profileImage ? (
                          <Image
                            source={{ uri: entry.profileImage }}
                            style={{ width: avatarSize, height: avatarSize }}
                            contentFit="cover"
                          />
                        ) : (
                          <Ionicons
                            name="person"
                            size={isFirst ? 30 : 24}
                            color={theme.accentText}
                          />
                        )}
                      </View>
                      <Text
                        className="mt-1.5 text-xs font-extrabold text-center"
                        style={textPrimary}
                        numberOfLines={1}
                      >
                        {entry.name}
                        {isCurrentUser ? " (You)" : ""}
                      </Text>
                      <Text className="text-xs font-bold" style={{ color: theme.accentText }}>
                        {entry.unlockedCount}
                      </Text>
                      <View
                        className="mt-1.5 w-full items-center justify-start rounded-t-2xl pt-1.5"
                        style={{
                          height: stageHeights[rankIndex],
                          backgroundColor: medalColors[rankIndex],
                        }}
                      >
                        <Text className="text-lg font-extrabold" style={{ color: "#ffffff" }}>
                          {rankIndex + 1}
                        </Text>
                      </View>
                    </View>
                  );
                };

                return (
                  <>
                    {podiumEntries.length > 0 ? (
                      <View className="mt-6 flex-row items-end gap-2 px-1">
                        {renderPodiumSlot(1)}
                        {renderPodiumSlot(0)}
                        {renderPodiumSlot(2)}
                      </View>
                    ) : null}

                    {listEntries.length > 0 ? (
                      <View className="mt-5 gap-3">
                        {listEntries.map(({ entry, rank }) => {
                          const isCurrentUser = entry.uid === auth.currentUser?.uid;
                          return (
                            <View
                              key={entry.uid}
                              className={`flex-row items-center rounded-2xl border px-4 py-3 ${
                                isCurrentUser ? "border-2" : ""
                              }`}
                              style={{
                                backgroundColor: theme.rowBg,
                                borderColor: isCurrentUser ? theme.accent : theme.cardBorder,
                              }}
                            >
                              <Text
                                className="w-8 text-center text-base font-extrabold"
                                style={{ color: theme.textMuted }}
                              >
                                {rank}
                              </Text>
                              <View
                                className="ml-2 h-11 w-11 overflow-hidden rounded-full items-center justify-center"
                                style={{ backgroundColor: theme.accentSoft }}
                              >
                                {entry.profileImage ? (
                                  <Image
                                    source={{ uri: entry.profileImage }}
                                    style={{ width: 44, height: 44 }}
                                    contentFit="cover"
                                  />
                                ) : (
                                  <Ionicons name="person" size={20} color={theme.accentText} />
                                )}
                              </View>
                              <View className="ml-3 flex-1">
                                <Text className="font-extrabold" style={textPrimary} numberOfLines={1}>
                                  {entry.name}
                                  {isCurrentUser ? " (You)" : ""}
                                </Text>
                                <Text className="mt-0.5 text-xs" style={textMuted}>
                                  {entry.unlockedCount} of {TOTAL_ACHIEVEMENTS} unlocked
                                </Text>
                              </View>
                              <Text className="ml-2 text-lg font-extrabold" style={{ color: theme.accentText }}>
                                {entry.unlockedCount}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </>
                );
              })()
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function sectionIconBackground(
  category: AchievementCategory,
  theme: ReturnType<typeof useThemedScreen>["theme"]
): string {
  const meta = SECTION_META[category];
  return category === "workout" ? theme.accentSoft : meta.iconBgColor;
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
              style={{ backgroundColor: sectionIconBackground(section.category, theme) }}
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
                style={{ backgroundColor: sectionIconBackground(section.category, theme) }}
              >
                <Ionicons name={row.icon} size={20} color={meta.iconColor} />
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
            style={{ backgroundColor: sectionIconBackground(section.category, theme) }}
          >
            <Ionicons name={meta.icon} size={26} color={meta.iconColor} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-2xl font-extrabold" style={textPrimary}>{meta.title}</Text>
            <Text className="text-base mt-1" style={textMuted}>{meta.subtitle}</Text>
          </View>
        </View>
        <Text className="text-sm font-bold mr-4" style={{ color: meta.iconColor }}>{summary}</Text>
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
      { title: "Nutrition Master", label: "Log 25 meals", icon: "medal-outline", bgClass: "bg-[#fff4e6]", iconColor: "#d97706" },
      { title: "Hydration Master", label: "Log water 50 times", icon: "water", bgClass: "bg-[#fff4e6]", iconColor: "#d97706" },
      { title: "Repeat Planner", label: "Enable reminders on 3+ days", icon: "repeat-outline", bgClass: "bg-[#fff4e6]", iconColor: "#d97706" },
    ] as const;
  }
  return [
    { title: "Community Welcome", label: "Post, chat, comment, or add a friend to get started", icon: "people-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "First Chat", label: "Send your first message", icon: "chatbubble-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "Helpful Reply", label: "Reply to a community post", icon: "send-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "Challenge Junior", label: "Join a weekly challenge with the challenge tag", icon: "trophy-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "Supportive Member", label: "React to 10 messages", icon: "heart-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "Active Voice", label: "Participate for 7 days", icon: "megaphone-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "Community Legend", label: "Complete every community milestone", icon: "ribbon-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "First Post", label: "Share your first post", icon: "create-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
    { title: "Social Circle", label: "Add 3 friends", icon: "person-add-outline", bgClass: "bg-[#e8f4fc]", iconColor: "#2563eb" },
  ] as const;
}

function achievementCategoryFromId(id: string): AchievementCategory {
  if (id.startsWith("wo_")) return "workout";
  if (id.startsWith("ml_")) return "meal";
  if (id.startsWith("cm_")) return "community";
  return "streaks";
}

function achievementIconName(id: string): keyof typeof Ionicons.glyphMap {
  const map: Record<string, keyof typeof Ionicons.glyphMap> = {
    wo_profile: "person-outline",
    wo_goal: "flag-outline",
    wo_plan_generated: "document-text-outline",
    wo_plan_days: "calendar-outline",
    wo_first_complete: "play-circle-outline",
    wo_complete_10: "fitness-outline",
    wo_complete_25: "trophy-outline",
    wo_complete_50: "medal-outline",
    wo_discover_5: "compass-outline",
    wo_weight_first: "scale-outline",
    wo_complete_100: "flame-outline",
    wo_discover_15: "map-outline",
    wo_weight_5: "analytics-outline",
    wo_plan_days_10: "calendar-number-outline",
    wo_nutrition_plan: "restaurant-outline",
    ml_water_first: "water-outline",
    ml_water_5: "water",
    ml_water_20: "flask-outline",
    ml_water_50: "medal-outline",
    ml_water_100: "trophy-outline",
    ml_meal_first: "restaurant-outline",
    ml_meal_10: "fast-food-outline",
    ml_meal_25: "nutrition-outline",
    ml_meal_50: "pizza-outline",
    ml_meal_100: "ribbon-outline",
    ml_plan_meal_first: "leaf-outline",
    ml_plan_meal_10: "checkmark-done-outline",
    ml_dietary: "options-outline",
    ml_meal_days_7: "calendar-outline",
    ml_meal_days_14: "calendar-number-outline",
    st_steps_first: "walk-outline",
    st_steps_3: "footsteps-outline",
    st_steps_7: "fitness-outline",
    st_steps_14: "trophy-outline",
    st_steps_30: "flame-outline",
    st_water_first: "water-outline",
    st_water_10: "flask-outline",
    st_water_30: "medal-outline",
    st_water_50: "trophy-outline",
    st_login_7: "calendar-outline",
    st_login_14: "calendar-number-outline",
    st_login_30: "time-outline",
    st_weight_first: "scale-outline",
    st_weight_10: "analytics-outline",
    st_weight_25: "bar-chart-outline",
    cm_welcome: "people-outline",
    cm_first_chat: "chatbubble-outline",
    cm_first_reply: "send-outline",
    cm_challenge: "trophy-outline",
    cm_likes_10: "heart-outline",
    cm_active_7: "megaphone-outline",
    cm_first_post: "create-outline",
    cm_friend_3: "person-add-outline",
    cm_posts_5: "newspaper-outline",
    cm_champion: "ribbon-outline",
    cm_likes_25: "heart",
    cm_friend_5: "people-circle-outline",
    cm_posts_10: "documents-outline",
    cm_active_14: "pulse-outline",
    cm_comments_10: "chatbubbles-outline",
  };
  return map[id] ?? SECTION_META[achievementCategoryFromId(id)].icon;
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
  const category = achievementCategoryFromId(id);
  const section = SECTION_META[category];
  const iconName = achievementIconName(id);

  return (
    <View
      className="rounded-xl items-center justify-center"
      style={{
        width: boxSize,
        height: boxSize,
        backgroundColor: sectionIconBackground(category, theme),
      }}
    >
      <Ionicons name={iconName} size={size} color={section.iconColor} />
    </View>
  );
}

function sectionDoneStyle(category: AchievementCategory): { backgroundColor: string; color: string } {
  const meta = SECTION_META[category];
  return { backgroundColor: meta.iconBgColor, color: meta.iconColor };
}

function AchievementRow({ row }: { row: AchievementRowModel }) {
  const { textPrimary, textMuted } = useThemedScreen();
  const { cardStyle } = useProfileCardStyles();
  const category = achievementCategoryFromId(row.id);
  const doneStyle = sectionDoneStyle(category);

  return (
    <View className="flex-row items-center rounded-2xl px-4 py-3.5" style={cardStyle}>
      <AchievementIcon id={row.id} />
      <View className="ml-3 flex-1">
        <Text className="text-base font-semibold" style={textPrimary}>{row.title ?? row.label}</Text>
        <Text className="text-sm mt-0.5" style={textMuted}>{row.label}</Text>
      </View>
      {row.isComplete ? (
        <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: doneStyle.backgroundColor }}>
          <Text className="text-xs font-bold" style={{ color: doneStyle.color }}>DONE</Text>
        </View>
      ) : (
        <Text className="text-sm font-semibold" style={{ color: SECTION_META[category].iconColor }}>
          {row.rightLabel}
        </Text>
      )}
    </View>
  );
}
