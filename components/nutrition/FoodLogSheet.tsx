import { Pressable } from "@/components/Pressable";
import { ThemedCard, ThemedText, useProfileCardStyles } from "@/components/themed/ThemedUi";
import type { FoodNutrition } from "@/lib/foodDataset";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

export type FoodLogSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  servingSize?: string;
  calories: number;
  nutrition?: FoodNutrition;
  ingredients?: string[];
  directions?: string[];
  sourceLabel?: string;
  logging?: boolean;
  onLog: (servings: number, calories: number) => Promise<void>;
};

export function FoodLogSheet({
  visible,
  onClose,
  title,
  servingSize,
  calories,
  nutrition,
  ingredients,
  directions,
  sourceLabel,
  logging = false,
  onLog,
}: FoodLogSheetProps) {
  const { theme } = useThemedScreen();
  const { inputStyle, modalCardStyle, placeholderColor } = useProfileCardStyles();
  const [servingsText, setServingsText] = useState("1");

  useEffect(() => {
    if (visible) setServingsText("1");
  }, [visible, title, calories]);

  const servings = Math.max(0.25, Math.min(10, Number(servingsText) || 1));
  const totalCalories = Math.round(calories * servings);

  const handleLog = () => {
    void (async () => {
      try {
        await onLog(servings, totalCalories);
        onClose();
        Alert.alert("Logged", `${title} (${totalCalories} kcal) added to today.`);
      } catch (e: unknown) {
        Alert.alert("Error", e instanceof Error ? e.message : "Could not log meal.");
      }
    })();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: theme.modalOverlay }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[modalCardStyle, { maxHeight: "88%", borderTopLeftRadius: 24, borderTopRightRadius: 24 }]}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            <View className="flex-row items-start justify-between mb-3">
              <View className="flex-1 pr-3">
                <ThemedText className="text-xl font-extrabold">{title}</ThemedText>
                {sourceLabel ? (
                  <ThemedText variant="muted" className="text-xs mt-1">
                    {sourceLabel}
                  </ThemedText>
                ) : null}
                {servingSize ? (
                  <ThemedText variant="secondary" className="text-sm mt-1">
                    Serving: {servingSize}
                  </ThemedText>
                ) : null}
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={24} color={theme.iconMuted} />
              </Pressable>
            </View>

            <ThemedCard className="p-4 mb-4">
              <ThemedText className="text-3xl font-extrabold" style={{ color: theme.accentText }}>
                {totalCalories} kcal
              </ThemedText>
              <ThemedText variant="muted" className="text-sm mt-1">
                {Math.round(calories)} kcal per serving
              </ThemedText>

              {nutrition ? (
                <View className="flex-row flex-wrap gap-2 mt-3">
                  {[
                    { label: "Protein", value: `${Math.round(nutrition.proteinG * servings)}g` },
                    { label: "Carbs", value: `${Math.round(nutrition.carbsG * servings)}g` },
                    { label: "Fat", value: `${Math.round(nutrition.fatG * servings)}g` },
                  ].map((row) => (
                    <View
                      key={row.label}
                      className="rounded-xl px-3 py-2"
                      style={{ backgroundColor: theme.rowBg }}
                    >
                      <ThemedText variant="muted" className="text-[10px] font-bold">
                        {row.label}
                      </ThemedText>
                      <ThemedText className="text-sm font-extrabold">{row.value}</ThemedText>
                    </View>
                  ))}
                </View>
              ) : null}
            </ThemedCard>

            <ThemedText variant="muted" className="text-xs mb-1">
              Servings
            </ThemedText>
            <TextInput
              value={servingsText}
              onChangeText={setServingsText}
              keyboardType="decimal-pad"
              className="rounded-xl px-3 py-3 mb-4 text-base"
              style={inputStyle}
              placeholderTextColor={placeholderColor}
              placeholder="1"
            />

            {ingredients?.length ? (
              <View className="mb-4">
                <ThemedText className="text-base font-extrabold mb-2">Ingredients</ThemedText>
                {ingredients.map((item, index) => (
                  <ThemedText key={`ingredient-${index}`} variant="secondary" className="text-sm leading-5 mb-1">
                    {"\u2022 "} {item}
                  </ThemedText>
                ))}
              </View>
            ) : null}

            {directions?.length ? (
              <View className="mb-4">
                <ThemedText className="text-base font-extrabold mb-2">Directions</ThemedText>
                {directions.map((step, index) => (
                  <ThemedText key={`${index}-${step}`} variant="secondary" className="text-sm leading-5 mb-2">
                    {index + 1}. {step}
                  </ThemedText>
                ))}
              </View>
            ) : null}

            <Pressable
              onPress={handleLog}
              disabled={logging}
              className="rounded-full py-4 items-center bg-[#52B69A]"
            >
              {logging ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-extrabold text-base">Log Food</Text>
              )}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
