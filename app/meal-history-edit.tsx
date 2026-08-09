import { Pressable } from "@/components/Pressable";
import { MealDescriptionSections } from "@/components/nutrition/MealDescriptionSections";
import { MealPhotoSection } from "@/components/nutrition/MealPhotoSection";
import { MealTypePicker } from "@/components/nutrition/MealTypePicker";
import { ProfileScreenHeader, ThemedText, useProfileCardStyles } from "@/components/themed/ThemedUi";
import { MANUAL_MEAL_TYPE_LABELS, type ManualMealType } from "@/lib/manualMealTypes";
import {
  formatHistoryMacros,
  getMealHistoryEntry,
  normalizeMealDescriptions,
  parseOptionalGrams,
  updateMealHistoryEntry,
  type MealHistoryEntry,
} from "@/lib/mealLogHistory";
import { logMealFood, resolveMealPhotoUri } from "@/lib/mealLogService";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";

export default function MealHistoryEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ entryId?: string }>();
  const entryId = params.entryId ? String(params.entryId) : "";
  const calendarTz = useUserCalendarTimezone();
  const { screenStyle, textPrimary, theme } = useThemedScreen();
  const { inputStyle, placeholderColor } = useProfileCardStyles();

  const [authUid, setAuthUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logging, setLogging] = useState(false);
  const [entry, setEntry] = useState<MealHistoryEntry | null>(null);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [foodName, setFoodName] = useState("");
  const [caloriesText, setCaloriesText] = useState("");
  const [proteinText, setProteinText] = useState("");
  const [carbsText, setCarbsText] = useState("");
  const [fatText, setFatText] = useState("");
  const [descriptionSections, setDescriptionSections] = useState<string[]>([""]);
  const [mealType, setMealType] = useState<ManualMealType>("breakfast");
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollToField = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, Platform.OS === "ios" ? 50 : 150);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  const loadEntry = useCallback(async (uid: string | null) => {
    if (!entryId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const row = await getMealHistoryEntry(uid, entryId);
    setEntry(row);
    if (row) {
      setFoodName(row.title);
      setCaloriesText(String(row.calories));
      setProteinText(row.proteinG != null ? String(row.proteinG) : "");
      setCarbsText(row.carbsG != null ? String(row.carbsG) : "");
      setFatText(row.fatG != null ? String(row.fatG) : "");
      const sections = normalizeMealDescriptions({
        descriptionSections: row.descriptionSections,
        description: row.description,
      });
      setDescriptionSections(sections.length > 0 ? sections : [""]);
      setImageUri(row.photoUri ?? null);
      setMealType(row.mealType ?? "other");
    }
    setLoading(false);
  }, [entryId]);

  useEffect(() => {
    void loadEntry(authUid);
  }, [authUid, loadEntry]);

  const parseForm = () => {
    const title = foodName.trim();
    const calories = Math.round(Number(caloriesText.replace(/[^\d.]/g, "")));
    if (!title) {
      Alert.alert("Food name", "Enter what you ate.");
      return null;
    }
    if (!Number.isFinite(calories) || calories <= 0) {
      Alert.alert("Calories", "Enter a valid calorie amount.");
      return null;
    }
    return {
      title,
      calories,
      proteinG: parseOptionalGrams(proteinText),
      carbsG: parseOptionalGrams(carbsText),
      fatG: parseOptionalGrams(fatText),
      mealType,
      descriptionSections: normalizeMealDescriptions({ descriptionSections }),
      photoUri: imageUri ?? undefined,
    };
  };

  const handleSave = async () => {
    if (!authUid || !entry) return;
    const values = parseForm();
    if (!values) return;

    try {
      setSaving(true);
      const photoUri = await resolveMealPhotoUri(values.photoUri);
      await updateMealHistoryEntry(authUid, entry.id, { ...values, photoUri });
      Alert.alert("Saved", "Meal history updated.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save meal.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogMeal = () => {
    const values = parseForm();
    if (!values) return;

    Alert.alert(
      "Log this meal?",
      `Food: ${values.title}\nCalories: ${values.calories} kcal\nType: ${MANUAL_MEAL_TYPE_LABELS[values.mealType]}${
        formatHistoryMacros(values) ? `\n${formatHistoryMacros(values)}` : ""
      }\n\nAdd this meal to today?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log meal",
          onPress: () => void submitLog(values),
        },
      ]
    );
  };

  const submitLog = async (values: {
    title: string;
    calories: number;
    mealType: ManualMealType;
    descriptionSections?: string[];
    photoUri?: string;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
  }) => {
    if (!authUid) {
      Alert.alert("Sign in required", "Log in to save meals.");
      return;
    }
    try {
      setLogging(true);
      await logMealFood({
        title: values.title,
        calories: values.calories,
        source: "manual",
        category: values.mealType,
        descriptionSections: values.descriptionSections,
        photoUri: values.photoUri,
        proteinG: values.proteinG,
        carbsG: values.carbsG,
        fatG: values.fatG,
        calendarTz,
      });
      Alert.alert("Logged", `${values.title} (${values.calories} kcal) added to today.`);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not log meal.");
    } finally {
      setLogging(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={screenStyle}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!entry) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={screenStyle}>
        <ThemedText className="text-base font-extrabold text-center mb-4">Meal not found</ThemedText>
        <Pressable onPress={() => router.back()} className="rounded-full px-6 py-3 bg-[#52B69A]">
          <Text className="font-extrabold" style={{ color: "#ffffff" }}>
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      style={screenStyle}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 12 : 0}
    >
      <View className="flex-1" style={{ paddingTop: insets.top + 12 }}>
        <View className="px-3">
          <ProfileScreenHeader title="Edit meal" onBack={() => router.back()} />
        </View>

        <ScrollView
          ref={scrollRef}
          className="flex-1 px-3"
          contentContainerStyle={{
            paddingBottom: Math.max(keyboardHeight, insets.bottom) + 120,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <ThemedText variant="muted" className="text-sm mb-4 leading-5">
            Update meal details, save to history, or log it to today&apos;s calories.
          </ThemedText>

          <MealPhotoSection imageUri={imageUri} onImageChange={setImageUri} />

          <MealTypePicker value={mealType} onChange={setMealType} />

          <ThemedText variant="muted" className="text-xs mb-1">
            Food name
          </ThemedText>
          <TextInput
            value={foodName}
            onChangeText={setFoodName}
            onFocus={scrollToField}
            className="rounded-xl px-3 py-3 mb-3 text-base"
            style={inputStyle}
            placeholderTextColor={placeholderColor}
            placeholder="What did you eat?"
          />

          <ThemedText variant="muted" className="text-xs mb-1">
            Calories (kcal)
          </ThemedText>
          <TextInput
            value={caloriesText}
            onChangeText={setCaloriesText}
            onFocus={scrollToField}
            keyboardType="number-pad"
            className="rounded-xl px-3 py-3 mb-3 text-base"
            style={inputStyle}
            placeholderTextColor={placeholderColor}
            placeholder="e.g. 450"
          />

          <ThemedText variant="muted" className="text-xs mb-2">
            Macros (optional)
          </ThemedText>
          <View className="flex-row gap-2 mb-3">
            <View className="flex-1">
              <ThemedText variant="muted" className="text-[10px] mb-1">
                Protein (g)
              </ThemedText>
              <TextInput
                value={proteinText}
                onChangeText={setProteinText}
                onFocus={scrollToField}
                keyboardType="decimal-pad"
                className="rounded-xl px-3 py-3 text-base"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
                placeholder="—"
              />
            </View>
            <View className="flex-1">
              <ThemedText variant="muted" className="text-[10px] mb-1">
                Carbs (g)
              </ThemedText>
              <TextInput
                value={carbsText}
                onChangeText={setCarbsText}
                onFocus={scrollToField}
                keyboardType="decimal-pad"
                className="rounded-xl px-3 py-3 text-base"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
                placeholder="—"
              />
            </View>
            <View className="flex-1">
              <ThemedText variant="muted" className="text-[10px] mb-1">
                Fat (g)
              </ThemedText>
              <TextInput
                value={fatText}
                onChangeText={setFatText}
                onFocus={scrollToField}
                keyboardType="decimal-pad"
                className="rounded-xl px-3 py-3 text-base"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
                placeholder="—"
              />
            </View>
          </View>

          <MealDescriptionSections
            sections={descriptionSections}
            onChange={setDescriptionSections}
            onFocus={scrollToField}
            inputStyle={inputStyle}
            placeholderColor={placeholderColor}
            theme={theme}
          />
        </ScrollView>

        <View
          className="flex-row gap-3 px-3 pt-3 border-t"
          style={{ borderColor: theme.cardBorder, paddingBottom: insets.bottom + 12 }}
        >
          <Pressable
            onPress={handleLogMeal}
            disabled={logging || saving}
            className="flex-1 rounded-full py-3.5 items-center border-2"
            style={{ borderColor: theme.accent, backgroundColor: theme.accentSoft }}
          >
            {logging ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <Text className="font-extrabold" style={{ color: theme.accentText }}>
                Log meal
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => void handleSave()}
            disabled={logging || saving}
            className="flex-1 rounded-full py-3.5 items-center bg-[#52B69A]"
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="font-extrabold" style={{ color: "#ffffff" }}>
                Save
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
