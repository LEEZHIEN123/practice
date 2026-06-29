import { Pressable } from "@/components/Pressable";
import { ThemedText } from "@/components/themed/ThemedUi";
import {
  MANUAL_MEAL_TYPES,
  MANUAL_MEAL_TYPE_LABELS,
  MEAL_HISTORY_FILTER_LABELS,
  MEAL_HISTORY_FILTERS,
  type ManualMealType,
  type MealHistoryFilter,
} from "@/lib/manualMealTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { ScrollView, Text, View } from "react-native";

type MealTypePickerProps = {
  value: ManualMealType;
  onChange: (value: ManualMealType) => void;
};

export function MealTypePicker({ value, onChange }: MealTypePickerProps) {
  const { theme } = useThemedScreen();

  return (
    <View className="mb-3">
      <ThemedText variant="muted" className="text-xs mb-2">
        Meal type
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {MANUAL_MEAL_TYPES.map((type) => {
            const active = value === type;
            return (
              <Pressable
                key={type}
                onPress={() => onChange(type)}
                className="rounded-full px-4 py-2 border"
                style={{
                  backgroundColor: active ? theme.accentSoft : theme.rowBg,
                  borderColor: active ? theme.accent : theme.cardBorder,
                }}
              >
                <Text
                  className="text-sm font-bold"
                  style={{ color: active ? theme.accentText : theme.textMuted }}
                >
                  {MANUAL_MEAL_TYPE_LABELS[type]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

type MealHistoryFilterBarProps = {
  value: MealHistoryFilter;
  onChange: (value: MealHistoryFilter) => void;
};

export function MealHistoryFilterBar({ value, onChange }: MealHistoryFilterBarProps) {
  const { theme } = useThemedScreen();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
      <View className="flex-row gap-2">
        {MEAL_HISTORY_FILTERS.map((filter) => {
          const active = value === filter;
          return (
            <Pressable
              key={filter}
              onPress={() => onChange(filter)}
              className="rounded-full px-4 py-2 border"
              style={{
                backgroundColor: active ? theme.accent : theme.rowBg,
                borderColor: active ? theme.accent : theme.cardBorder,
              }}
            >
              <Text
                className="text-sm font-bold"
                style={{ color: active ? "#ffffff" : theme.textMuted }}
              >
                {MEAL_HISTORY_FILTER_LABELS[filter]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
