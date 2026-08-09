import { FavouriteButton } from "@/components/FavouriteButton";
import { Pressable } from "@/components/Pressable";
import { ZoomableImageModal } from "@/components/ZoomableImageModal";
import { MacroDonut } from "@/components/nutrition/MacroDonut";
import { ProfileScreenHeader, ThemedText } from "@/components/themed/ThemedUi";
import { buildNutritionPlanMealFavouriteItem } from "@/lib/favourites";
import { resolveNutritionGuidanceImage } from "@/lib/foodImages";
import { logMealFood } from "@/lib/mealLogService";
import {
    expandCookingAbbreviations,
    expandNutritionPlanText,
    type ActiveNutritionPlan,
    type NutritionMealSuggestion,
} from "@/lib/nutritionPlan";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDoc, limit, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

function mealTypeLabel(type: MealType): string {
  if (type === "breakfast") return "Breakfast";
  if (type === "lunch") return "Lunch";
  if (type === "dinner") return "Dinner";
  return "Snack";
}

function isMealType(value: string): value is MealType {
  return value === "breakfast" || value === "lunch" || value === "dinner" || value === "snack";
}

export default function NutritionMealDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const calendarTz = useUserCalendarTimezone();
  const { screenStyle, theme } = useThemedScreen();
  const params = useLocalSearchParams<{
    day?: string;
    mealType?: string;
    unlockedMaxDay?: string;
  }>();

  const day = Math.max(1, Math.floor(Number(params.day) || 1));
  const unlockedMaxDay = Math.max(1, Math.floor(Number(params.unlockedMaxDay) || 1));
  const canLog = day <= unlockedMaxDay;
  const mealTypeRaw = typeof params.mealType === "string" ? params.mealType : "";
  const mealType: MealType | null = isMealType(mealTypeRaw) ? mealTypeRaw : null;

  const [meal, setMeal] = useState<NutritionMealSuggestion | null>(null);
  const [planCreatedAt, setPlanCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [alreadyLogged, setAlreadyLogged] = useState(false);

  const guidanceImage = useMemo(
    () => (meal ? resolveNutritionGuidanceImage(meal.name) : { url: null, source: null }),
    [meal]
  );
  const mealImageUri = guidanceImage.url;
  const hasMealImage = Boolean(mealImageUri) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [mealImageUri]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!mealType) {
        if (!cancelled) {
          setMeal(null);
          setPlanCreatedAt(null);
          setLoading(false);
        }
        return;
      }
      const user = auth.currentUser;
      if (!user) {
        if (!cancelled) {
          setMeal(null);
          setPlanCreatedAt(null);
          setLoading(false);
        }
        return;
      }
      try {
        setLoading(true);
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
        const raw = (data.activeNutritionPlan as ActiveNutritionPlan | undefined) ?? null;
        const plan = raw ? expandNutritionPlanText(raw) : null;
        const row = plan?.schedule?.find((r) => r.day === day) ?? null;
        const next = row?.[mealType] ?? null;
        if (!cancelled) {
          setPlanCreatedAt(typeof plan?.createdAt === "string" ? plan.createdAt : null);
          setMeal(
            next
              ? {
                  ...next,
                  name: expandCookingAbbreviations(next.name),
                  ingredients: (next.ingredients ?? []).map(expandCookingAbbreviations),
                  directions: (next.directions ?? []).map(expandCookingAbbreviations),
                }
              : null
          );
        }
      } catch {
        if (!cancelled) {
          setMeal(null);
          setPlanCreatedAt(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [day, mealType]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !mealType || !planCreatedAt) {
      setAlreadyLogged(false);
      return;
    }

    const qLogs = query(
      collection(db, "users", user.uid, "mealLogs"),
      where("origin", "==", "nutritionPlan"),
      limit(200)
    );

    const unsub = onSnapshot(qLogs, (snap) => {
      let hit = false;
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        if (data.planCreatedAt !== planCreatedAt) continue;
        if (Number(data.planDay) !== day) continue;
        if (data.category !== mealType) continue;
        hit = true;
        break;
      }
      setAlreadyLogged(hit);
    });

    return unsub;
  }, [day, mealType, planCreatedAt]);

  const nutrition = useMemo(() => {
    if (!meal) return null;
    return {
      calories: Math.round(meal.calories || 0),
      proteinG: meal.proteinG || 0,
      carbsG: meal.carbsG || 0,
      fatG: meal.fatG || 0,
    };
  }, [meal]);

  const favouriteItem = useMemo(
    () =>
      meal && mealType
        ? buildNutritionPlanMealFavouriteItem(
            day,
            mealType,
            meal.name,
            unlockedMaxDay,
            meal.calories
          )
        : null,
    [day, meal, mealType, unlockedMaxDay]
  );

  const submitLog = () => {
    if (!meal || !mealType || !nutrition || !canLog) return;
    void (async () => {
      setLogging(true);
      try {
        await logMealFood({
          title: meal.name,
          calories: nutrition.calories,
          source: "dataset",
          category: mealType,
          proteinG: Math.round(nutrition.proteinG),
          carbsG: Math.round(nutrition.carbsG),
          fatG: Math.round(nutrition.fatG),
          servings: 1,
          calendarTz,
          origin: "nutritionPlan",
          planDay: day,
          planCreatedAt,
        });
        Alert.alert("Logged", `${meal.name} (${nutrition.calories} kcal) added to today.`, [
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
    if (!meal || !nutrition) return;
    if (!canLog) return;

    if (alreadyLogged) {
      Alert.alert(
        "Log again?",
        `You've already logged ${meal.name}. Add it again (${nutrition.calories} kcal) to today's meals?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Log Again", onPress: submitLog },
        ]
      );
      return;
    }

    Alert.alert(
      "Log this meal?",
      `Add ${meal.name} (${nutrition.calories} kcal) to today's meals?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log Meal", onPress: submitLog },
      ]
    );
  };

  return (
    <View className="flex-1" style={screenStyle}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12, paddingBottom: 8 }}>
        <ProfileScreenHeader
          title="Meal Details"
          onBack={() => router.back()}
          titleClassName="text-xl"
          rightSlot={<FavouriteButton item={favouriteItem} />}
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : !meal || !mealType ? (
        <View className="flex-1 items-center justify-center px-6">
          <ThemedText variant="muted" className="text-center text-base">
            Meal not found.
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
            <View className="px-5 pt-2">
              <Text className="text-3xl font-extrabold text-gray-900 leading-tight">{meal.name}</Text>
              <Text className="text-base text-gray-500 mt-2">
                Day {day} · {mealTypeLabel(mealType)} · {meal.calories} kcal
              </Text>
              {alreadyLogged ? (
                <View
                  className="mt-3 self-start px-3 py-1 rounded-full border"
                  style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                >
                  <ThemedText variant="accent" className="text-xs font-extrabold">
                    DONE
                  </ThemedText>
                </View>
              ) : null}
            </View>

            <View className="mt-4 mx-5 overflow-hidden rounded-3xl">
              {hasMealImage && mealImageUri ? (
                <Pressable onPress={() => setViewerOpen(true)} className="active:opacity-95">
                  <Image
                    source={{ uri: mealImageUri }}
                    style={{ width: "100%", height: 260, backgroundColor: theme.rowBg }}
                    contentFit="cover"
                    transition={200}
                    onError={() => setImageFailed(true)}
                  />
                </Pressable>
              ) : (
                <View
                  style={{
                    width: "100%",
                    height: 260,
                    backgroundColor: theme.rowBg,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 24,
                  }}
                >
                  <ThemedText className="text-base font-extrabold text-center">
                    Photo unavailable
                  </ThemedText>
                  <ThemedText variant="muted" className="text-sm text-center mt-2 leading-5">
                    {`A matching image for "${meal.name}" is not available right now.`}
                  </ThemedText>
                </View>
              )}
            </View>

            <View className="px-5 pt-5">
              <Text className="text-xl font-extrabold text-gray-900 mb-4">Nutrition</Text>
              {nutrition ? (
                <MacroDonut
                  proteinG={nutrition.proteinG}
                  carbsG={nutrition.carbsG}
                  fatG={nutrition.fatG}
                  calories={nutrition.calories}
                />
              ) : null}

              {meal.ingredients.length ? (
                <View className="mt-5 mb-4">
                  <ThemedText className="text-lg font-extrabold mb-2">Ingredients</ThemedText>
                  {meal.ingredients.map((item, index) => (
                    <ThemedText key={`ingredient-${index}`} variant="secondary" className="text-sm leading-6 mb-1">
                      {"\u2022 "} {item}
                    </ThemedText>
                  ))}
                </View>
              ) : null}

              {meal.directions.length ? (
                <View className="mb-5">
                  <ThemedText className="text-lg font-extrabold mb-2">Directions</ThemedText>
                  {meal.directions.map((step, index) => (
                    <ThemedText
                      key={`${index}-${step}`}
                      variant="secondary"
                      className="text-sm leading-6 mb-2"
                    >
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
              disabled={logging || !canLog}
              className="rounded-full py-4 items-center"
              style={{ backgroundColor: canLog ? "#52B69A" : "#9ca3af" }}
            >
              {logging ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-extrabold text-base">Log Meal</Text>
              )}
            </Pressable>
          </View>

          {hasMealImage && mealImageUri ? (
            <ZoomableImageModal
              visible={viewerOpen}
              uri={mealImageUri}
              onClose={() => setViewerOpen(false)}
            />
          ) : null}
        </>
      )}
    </View>
  );
}
