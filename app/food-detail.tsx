import { Pressable } from "@/components/Pressable";
import { FoodTagChips } from "@/components/nutrition/FoodTagChips";
import { MacroDonut } from "@/components/nutrition/MacroDonut";
import { ThemedBackButton, ThemedText, useProfileCardStyles } from "@/components/themed/ThemedUi";
import { getFoodById, isFoodDatasetReady, prefetchFoodDataset, type FoodItem } from "@/lib/foodDataset";
import { logMealFood } from "@/lib/mealLogService";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatServesLabel(servingSize: string): string | null {
  const trimmed = servingSize.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+)\s*serving/i);
  if (match) return `Serves ${match[1]}`;
  return trimmed;
}

export default function FoodDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const calendarTz = useUserCalendarTimezone();
  const { screenStyle, textPrimary, theme } = useThemedScreen();
  const { inputStyle, placeholderColor } = useProfileCardStyles();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const foodId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";
  const [food, setFood] = useState<FoodItem | null>(() => (foodId ? getFoodById(foodId) ?? null : null));
  const [loadingFood, setLoadingFood] = useState(() => foodId.length > 0 && !isFoodDatasetReady());

  useEffect(() => {
    if (!foodId) {
      setFood(null);
      setLoadingFood(false);
      return;
    }

    if (isFoodDatasetReady()) {
      setFood(getFoodById(foodId) ?? null);
      setLoadingFood(false);
      return;
    }

    setLoadingFood(true);
    void prefetchFoodDataset().then(() => {
      setFood(getFoodById(foodId) ?? null);
      setLoadingFood(false);
    });
  }, [foodId]);

  const [servingsText, setServingsText] = useState("1");
  const [logging, setLogging] = useState(false);

  const servings = Math.max(0.25, Math.min(10, Number(servingsText) || 1));
  const nutrition = useMemo(() => {
    if (!food) return null;
    return {
      calories: Math.round(food.nutrition.calories * servings),
      proteinG: food.nutrition.proteinG * servings,
      carbsG: food.nutrition.carbsG * servings,
      fatG: food.nutrition.fatG * servings,
    };
  }, [food, servings]);

  const servesLabel = food?.servingSize ? formatServesLabel(food.servingSize) : null;

  const submitLog = () => {
    if (!food || !nutrition) return;
    void (async () => {
      setLogging(true);
      try {
        await logMealFood({
          title: food.name,
          calories: nutrition.calories,
          source: "dataset",
          category: food.category,
          foodId: food.id,
          proteinG: Math.round(nutrition.proteinG),
          carbsG: Math.round(nutrition.carbsG),
          fatG: Math.round(nutrition.fatG),
          servings,
          calendarTz,
        });
        Alert.alert("Logged", `${food.name} (${nutrition.calories} kcal) added to today.`, [
          { text: "OK", onPress: () => router.back() },
        ]);
      } catch (e: unknown) {
        Alert.alert("Error", e instanceof Error ? e.message : "Could not log meal.");
      } finally {
        setLogging(false);
      }
    })();
  };

  const handleLog = () => {
    if (!food || !nutrition) return;
    Alert.alert(
      "Log this food?",
      `Add ${food.name} (${nutrition.calories} kcal) to today's meals?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log Food", onPress: submitLog },
      ]
    );
  };

  const handleTagPress = (tag: string) => {
    router.push({ pathname: "/food-by-tag", params: { tag } });
  };

  return (
    <View className="flex-1" style={screenStyle}>
      <View
        className="flex-row items-center px-3"
        style={{ paddingTop: insets.top + 8, paddingBottom: 8 }}
      >
        <ThemedBackButton onPress={() => router.back()} className="w-11 h-11 mr-2" />
        <Text className="text-xl font-extrabold flex-1" style={textPrimary}>
          Food Details
        </Text>
      </View>

      {!food && loadingFood ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : !food ? (
        <View className="flex-1 items-center justify-center px-6">
          <ThemedText variant="muted" className="text-center text-base">
            Recipe not found.
          </ThemedText>
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View className="relative">
            {food.imageUrl ? (
              <Image
                source={{ uri: food.imageUrl }}
                style={{ width: "100%", height: 260 }}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={{ width: "100%", height: 260, backgroundColor: theme.rowBg }} />
            )}
          </View>

          <View className="px-5 pt-5">
            <Text className="text-3xl font-extrabold text-gray-900 leading-tight">{food.name}</Text>
            {servesLabel ? (
              <Text className="text-base text-gray-500 mt-2">{servesLabel}</Text>
            ) : null}

            <FoodTagChips tags={food.tags ?? []} onTagPress={handleTagPress} />

            <Text className="text-xl font-extrabold text-gray-900 mt-6 mb-4">Nutrition Per Serving</Text>
            {nutrition ? (
              <MacroDonut
                proteinG={nutrition.proteinG}
                carbsG={nutrition.carbsG}
                fatG={nutrition.fatG}
                calories={nutrition.calories}
              />
            ) : null}

            <View className="mt-6 mb-2">
              <ThemedText variant="muted" className="text-xs mb-1">
                Servings
              </ThemedText>
              <TextInput
                value={servingsText}
                onChangeText={setServingsText}
                keyboardType="decimal-pad"
                className="rounded-xl px-3 py-3 text-base"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
                placeholder="1"
              />
            </View>

            {food.ingredients.length ? (
              <View className="mt-5 mb-4">
                <ThemedText className="text-lg font-extrabold mb-2">Ingredients</ThemedText>
                {food.ingredients.map((item) => (
                  <ThemedText key={item} variant="secondary" className="text-sm leading-6 mb-1">
                    {"\u2022 "} {item}
                  </ThemedText>
                ))}
              </View>
            ) : null}

            {food.directions.length ? (
              <View className="mb-5">
                <ThemedText className="text-lg font-extrabold mb-2">Directions</ThemedText>
                {food.directions.map((step, index) => (
                  <ThemedText key={`${index}-${step}`} variant="secondary" className="text-sm leading-6 mb-2">
                    {index + 1}. {step}
                  </ThemedText>
                ))}
              </View>
            ) : null}
          </View>
          </ScrollView>

          <View
            className="px-5 pt-3 border-t border-gray-200"
            style={{
              paddingBottom: insets.bottom + 12,
              backgroundColor: theme.screenBg,
            }}
          >
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
          </View>
        </>
      )}
    </View>
  );
}
