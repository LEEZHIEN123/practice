import type { AppearanceTheme } from "@/lib/appearance";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";

type ProfileStatsCardsProps = {
  totalCalories: number;
  totalWorkouts: number;
  currentWeightKg: number | null;
  theme: AppearanceTheme;
};

function formatCalories(value: number) {
  if (value >= 10000) return `${Math.round(value / 1000)}k`;
  return value.toLocaleString();
}

function formatWeightKg(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function ProfileStatsCards({
  totalCalories,
  totalWorkouts,
  currentWeightKg,
  theme,
}: ProfileStatsCardsProps) {
  return (
    <View className="flex-row gap-4 mb-5">
      <View
        className="flex-1 rounded-2xl py-3 px-2 items-center shadow-sm"
        style={{ backgroundColor: theme.statCardBg, borderColor: theme.cardBorder, borderWidth: 1 }}
      >
        <Text className="text-2xl font-extrabold" style={{ color: theme.textPrimary }}>
          {formatCalories(totalCalories)}
        </Text>
        <Text className="text-[9px] font-bold tracking-wider mt-1" style={{ color: theme.textMuted }}>
          TOTAL
        </Text>
        <View className="flex-row items-center mt-1 gap-1">
          <Ionicons name="flame" size={14} color="#f97316" />
          <Text className="text-[10px] font-bold tracking-wider" style={{ color: theme.textMuted }}>
            CALORIES
          </Text>
        </View>
      </View>

      <View
        className="flex-1 rounded-2xl py-3 px-2 items-center shadow-sm"
        style={{ backgroundColor: theme.statCardBg, borderColor: theme.cardBorder, borderWidth: 1 }}
      >
        <Text className="text-2xl font-extrabold" style={{ color: theme.textPrimary }}>
          {totalWorkouts}
        </Text>
        <Text className="text-[9px] font-bold tracking-wider mt-1" style={{ color: theme.textMuted }}>
          TOTAL
        </Text>
        <View className="flex-row items-center mt-1 gap-1">
          <MaterialCommunityIcons name="run" size={14} color={theme.accent} />
          <Text className="text-[10px] font-bold tracking-wider" style={{ color: theme.textMuted }}>
            WORKOUTS
          </Text>
        </View>
      </View>

      <View
        className="flex-1 rounded-2xl py-3 px-2 items-center shadow-sm"
        style={{ backgroundColor: theme.statCardBg, borderColor: theme.cardBorder, borderWidth: 1 }}
      >
        <Text className="text-2xl font-extrabold" style={{ color: theme.textPrimary }}>
          {formatWeightKg(currentWeightKg)}
        </Text>
        <Text className="text-[9px] font-bold tracking-wider mt-1" style={{ color: theme.textMuted }}>
          CURRENT
        </Text>
        <View className="flex-row items-center mt-1 gap-1">
          <Ionicons name="scale-outline" size={14} color="#2563eb" />
          <Text className="text-[10px] font-bold tracking-wider" style={{ color: theme.textMuted }}>
            KG
          </Text>
        </View>
      </View>
    </View>
  );
}
