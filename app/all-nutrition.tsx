import { Pressable } from "@/components/Pressable";
import { CommunitySearchBar } from "@/components/community/CommunitySearchBar";
import { BarcodeCameraScanner } from "@/components/nutrition/BarcodeCameraScanner";
import { FoodLibraryRowMemo } from "@/components/nutrition/FoodLibraryRow";
import { FoodLogSheet } from "@/components/nutrition/FoodLogSheet";
import { MealDescriptionSections } from "@/components/nutrition/MealDescriptionSections";
import { MealPhotoSection } from "@/components/nutrition/MealPhotoSection";
import { MealHistoryFilterBar, MealLogModePicker, MealTypePicker } from "@/components/nutrition/MealTypePicker";
import { ProfileScreenHeader, ThemedCard, ThemedText, useProfileCardStyles } from "@/components/themed/ThemedUi";
import {
    FOOD_INDEX,
    getFoodDatasetForSearch,
    prefetchFoodDataset,
    type FoodListItem,
} from "@/lib/foodDataset";
import { analyzeMealPhoto, isGeminiConfigured } from "@/lib/geminiFoodVision";
import {
    MANUAL_MEAL_TYPE_LABELS,
    type ManualMealType,
    type MealHistoryFilter,
} from "@/lib/manualMealTypes";
import {
    findMealHistoryMatch,
    formatDescriptionPreview,
    formatHistoryMacros,
    loadMealHistory,
    mealDescriptionsMatchSearch,
    normalizeMealDescriptions,
    parseOptionalGrams,
    removeMealHistoryEntry,
    type MealHistoryEntry,
} from "@/lib/mealLogHistory";
import { logMealFood } from "@/lib/mealLogService";
import { fetchFoodByBarcode, type ScannedFoodProduct } from "@/lib/openFoodFacts";
import { useScrollFieldAboveKeyboard } from "@/lib/useScrollFieldAboveKeyboard";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";

type NutritionSection = "library" | "barcode" | "log";

function macroTextFromAnalysis(value: number | null): string {
  return value != null ? String(value) : "";
}

type LogTarget = { kind: "barcode"; product: ScannedFoodProduct };

const SECTION_TABS: { key: NutritionSection; label: string }[] = [
  { key: "library", label: "Food Library" },
  { key: "barcode", label: "Barcode" },
  { key: "log", label: "Log Meal" },
];

export default function AllNutritionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const calendarTz = useUserCalendarTimezone();
  const { screenStyle, textPrimary, theme, cardStyle } = useThemedScreen();
  const { inputStyle, placeholderColor } = useProfileCardStyles();

  const [section, setSection] = useState<NutritionSection>("library");
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    void prefetchFoodDataset();
  }, []);

  const handleLog = async (servings: number, calories: number) => {
    if (!logTarget) return;
    setLogging(true);
    try {
      const p = logTarget.product;
      await logMealFood({
        title: p.name,
        calories,
        source: "barcode",
        barcode: p.barcode,
        proteinG: p.proteinG != null ? Math.round(p.proteinG * servings) : undefined,
        carbsG: p.carbsG != null ? Math.round(p.carbsG * servings) : undefined,
        fatG: p.fatG != null ? Math.round(p.fatG * servings) : undefined,
        servings,
        calendarTz,
      });
    } finally {
      setLogging(false);
    }
  };

  const sheetProps = useMemo(() => {
    if (!logTarget) return null;
    const p = logTarget.product;
    return {
      title: p.name,
      servingSize: p.servingSize,
      calories: p.calories,
      nutrition: {
        calories: p.calories,
        proteinG: p.proteinG ?? 0,
        carbsG: p.carbsG ?? 0,
        fatG: p.fatG ?? 0,
        fiberG: p.fiberG,
        sodiumMg: p.sodiumMg,
      },
      ingredients: p.ingredients,
      directions: ["Enjoy as packaged or prepared per label instructions."],
      sourceLabel: `Barcode ${p.barcode} · Open Food Facts`,
    };
  }, [logTarget]);

  return (
    <View className="flex-1" style={screenStyle}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12 }}>
        <ProfileScreenHeader title="All Nutrition" onBack={() => router.back()} />

        <View className="flex-row mb-5 gap-2">
          {SECTION_TABS.map((tab) => {
            const active = section === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setSection(tab.key)}
                className="flex-1 rounded-full py-3.5 items-center justify-center border-2"
                style={
                  active
                    ? { backgroundColor: theme.accent, borderColor: theme.accent }
                    : cardStyle
                }
              >
                <Text
                  className={`font-extrabold text-center ${active ? "text-base" : "text-sm"}`}
                  style={{ color: active ? "#ffffff" : theme.textSecondary }}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {section === "log" ? (
        <MealLogSection
          calendarTz={calendarTz}
          theme={theme}
          inputStyle={inputStyle}
          placeholderColor={placeholderColor}
        />
      ) : section === "library" ? (
        <FoodLibrarySection
          foods={FOOD_INDEX}
          onSelectFood={(foodId) => router.push({ pathname: "/food-detail", params: { id: foodId } })}
          theme={theme}
          bottomInset={insets.bottom + 24}
        />
      ) : (
      <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 12,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {section === "barcode" ? (
            <BarcodeSection
              inputStyle={inputStyle}
              placeholderColor={placeholderColor}
              theme={theme}
              onProductFound={(product) => setLogTarget({ kind: "barcode", product })}
            />
          ) : null}
        </ScrollView>
      )}

      {sheetProps ? (
        <FoodLogSheet
          visible={logTarget != null}
          onClose={() => setLogTarget(null)}
          logging={logging}
          onLog={handleLog}
          {...sheetProps}
        />
      ) : null}
    </View>
  );
}

function FoodLibrarySection({
  foods,
  onSelectFood,
  theme,
  bottomInset,
}: {
  foods: FoodListItem[];
  onSelectFood: (foodId: string) => void;
  theme: ReturnType<typeof useThemedScreen>["theme"];
  bottomInset: number;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [fullDatasetReady, setFullDatasetReady] = useState(false);

  useEffect(() => {
    void prefetchFoodDataset().then(() => setFullDatasetReady(true));
  }, []);

  const filteredFoods = useMemo((): FoodListItem[] => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return foods;

    if (fullDatasetReady) {
      return getFoodDatasetForSearch().filter(
        (food) =>
          food.name.toLowerCase().includes(q) ||
          food.ingredients.some((item) => item.toLowerCase().includes(q))
      );
    }

    return foods.filter((food) => food.name.toLowerCase().includes(q));
  }, [foods, fullDatasetReady, searchQuery]);

  const handleSelectFood = useCallback(
    (foodId: string) => {
      onSelectFood(foodId);
    },
    [onSelectFood]
  );

  const renderItem = useCallback(
    ({ item }: { item: FoodListItem }) => (
      <FoodLibraryRowMemo
        food={item}
        accentText={theme.accentText}
        iconMuted={theme.iconMuted}
        rowBg={theme.rowBg}
        onPress={handleSelectFood}
      />
    ),
    [handleSelectFood, theme.accentText, theme.iconMuted, theme.rowBg]
  );

  const listHeader = useMemo(
    () => (
      <View>
        <ThemedText variant="muted" className="text-sm mb-3 leading-5">
          Browse {foods.length} recipes with calories, nutrition, ingredients, and directions. Tap a food to log it.
        </ThemedText>

        <CommunitySearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search recipes or ingredients"
          className="mb-4"
        />

        {searchQuery.trim().length >= 2 && !fullDatasetReady ? (
          <ThemedText variant="muted" className="text-xs mb-3">
            Searching recipe names first. Ingredient search appears once recipes finish loading.
          </ThemedText>
        ) : null}
      </View>
    ),
    [foods.length, fullDatasetReady, searchQuery]
  );

  const listEmpty = useMemo(
    () => (
      <ThemedText variant="muted" className="text-sm text-center py-6 px-3">
        No recipes match your search.
      </ThemedText>
    ),
    []
  );

  return (
    <FlatList
      data={filteredFoods}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      windowSize={7}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: 12 }}
      ItemSeparatorComponent={FoodLibrarySeparator}
    />
  );
}

function FoodLibrarySeparator() {
  return <View className="h-3" />;
}

function BarcodeSection({
  inputStyle,
  placeholderColor,
  onProductFound,
}: {
  inputStyle: object;
  placeholderColor: string;
  theme: ReturnType<typeof useThemedScreen>["theme"];
  onProductFound: (product: ScannedFoodProduct) => void;
}) {
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(
    async (code: string) => {
      const trimmed = code.replace(/\D/g, "").trim();
      if (trimmed.length < 8) {
        Alert.alert("Barcode", "Enter or scan a valid barcode.");
        return;
      }
      try {
        setLoading(true);
        const product = await fetchFoodByBarcode(trimmed);
        onProductFound(product);
      } catch (e: unknown) {
        Alert.alert("Not found", e instanceof Error ? e.message : "Could not find product.");
      } finally {
        setLoading(false);
      }
    },
    [onProductFound]
  );

  return (
    <View>
      <ThemedText variant="muted" className="text-sm mb-4 leading-5">
        Scan a product barcode or enter it manually. Nutrition data comes from Open Food Facts.
      </ThemedText>

      <BarcodeCameraScanner
        disabled={loading}
        onScanned={(data) => {
          setBarcode(data);
          void lookup(data);
        }}
      />

      <ThemedText variant="muted" className="text-xs mb-1">
        Barcode number
      </ThemedText>
      <TextInput
        value={barcode}
        onChangeText={setBarcode}
        keyboardType="number-pad"
        className="rounded-xl px-3 py-3 mb-4 text-base"
        style={inputStyle}
        placeholderTextColor={placeholderColor}
        placeholder="e.g. 3017620422003"
      />

      <Pressable
        onPress={() => void lookup(barcode)}
        disabled={loading}
        className="rounded-full py-4 items-center bg-[#52B69A]"
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-extrabold text-base">Look Up Product</Text>
        )}
      </Pressable>
    </View>
  );
}

type ManualLogInput = {
  title: string;
  calories: number;
  mealType: ManualMealType;
  descriptionSections?: string[];
  photoUri?: string;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
};

function MealLogSection({
  calendarTz,
  theme,
  inputStyle,
  placeholderColor,
}: {
  calendarTz: string | null;
  theme: ReturnType<typeof useThemedScreen>["theme"];
  inputStyle: object;
  placeholderColor: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { segmentTrackStyle, segmentActiveStyle } = useThemedScreen();
  const { scrollRef, scrollFieldIntoView, scrollBottomPad, keyboardHeight, onScroll } =
    useScrollFieldAboveKeyboard(160, {
      gapAboveKeyboard: 28,
      // Include keyboard height in padding so the form can scroll above it.
      withKeyboardAvoidingView: false,
    });
  const foodNameRef = useRef<TextInput>(null);
  const foodNameWrapRef = useRef<View>(null);
  const caloriesWrapRef = useRef<View>(null);
  const macrosWrapRef = useRef<View>(null);
  const descriptionWrapRef = useRef<View>(null);
  const [authUid, setAuthUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [foodName, setFoodName] = useState("");
  const [caloriesText, setCaloriesText] = useState("");
  const [descriptionSections, setDescriptionSections] = useState<string[]>([""]);
  const [proteinText, setProteinText] = useState("");
  const [carbsText, setCarbsText] = useState("");
  const [fatText, setFatText] = useState("");
  const [logging, setLogging] = useState(false);
  const [history, setHistory] = useState<MealHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState<MealHistoryFilter>("all");
  const [mealType, setMealType] = useState<ManualMealType>("breakfast");
  const [logMode, setLogMode] = useState<"manual" | "ai">("manual");
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<MealHistoryEntry | null>(null);
  const [subTab, setSubTab] = useState<"log" | "history">("log");

  const focusFoodNameField = useCallback(() => {
    setSubTab("log");
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      foodNameRef.current?.focus();
      scrollFieldIntoView(foodNameWrapRef);
    }, Platform.OS === "ios" ? 100 : 250);
  }, [scrollFieldIntoView, scrollRef]);

  const runPhotoAnalysis = useCallback(async (uri: string) => {
    if (!isGeminiConfigured()) {
      setLogMode("manual");
      return;
    }

    setAnalyzingPhoto(true);
    try {
      const analysis = await analyzeMealPhoto(uri);
      setFoodName(analysis.title);
      setCaloriesText(String(analysis.calories));
      setProteinText(macroTextFromAnalysis(analysis.proteinG));
      setCarbsText(macroTextFromAnalysis(analysis.carbsG));
      setFatText(macroTextFromAnalysis(analysis.fatG));
      setDescriptionSections(analysis.description ? [analysis.description] : [""]);
    } catch (e: unknown) {
      setLogMode("manual");
      const message =
        e instanceof Error ? e.message : "Could not analyze this photo. Enter meal details manually.";
      Alert.alert(
        message.includes("doesn't appear to contain food") ? "No food detected" : "Photo analysis",
        message
      );
    } finally {
      setAnalyzingPhoto(false);
    }
  }, []);

  const handleMealPhotoChange = useCallback(
    async (uri: string | null) => {
      setImageUri(uri);
      if (!uri) {
        if (logMode === "ai") {
          setFoodName("");
          setCaloriesText("");
          setProteinText("");
          setCarbsText("");
          setFatText("");
          setDescriptionSections([""]);
        }
        return;
      }
      if (logMode !== "ai") return;
      await runPhotoAnalysis(uri);
    },
    [logMode, runPhotoAnalysis]
  );

  const clearLogFormFields = useCallback(() => {
    setFoodName("");
    setCaloriesText("");
    setProteinText("");
    setCarbsText("");
    setFatText("");
    setDescriptionSections([""]);
    setImageUri(null);
  }, []);

  const isLogFormBlank = useCallback(() => {
    const hasDescription = descriptionSections.some((s) => s.trim().length > 0);
    return (
      !imageUri &&
      !foodName.trim() &&
      !caloriesText.trim() &&
      !proteinText.trim() &&
      !carbsText.trim() &&
      !fatText.trim() &&
      !hasDescription
    );
  }, [
    imageUri,
    foodName,
    caloriesText,
    proteinText,
    carbsText,
    fatText,
    descriptionSections,
  ]);

  const handleLogModeChange = useCallback(
    (mode: "manual" | "ai") => {
      if (mode === logMode) return;
      if (mode === "ai" && !isGeminiConfigured()) return;

      const applySwitch = () => {
        clearLogFormFields();
        setLogMode(mode);
      };

      if (isLogFormBlank()) {
        applySwitch();
        return;
      }

      const switchingToAi = mode === "ai";
      Alert.alert(
        switchingToAi ? "Switch to AI analyse?" : "Switch to Manual?",
        switchingToAi
          ? "Switching will clear any meal details you entered. Continue?"
          : "Switching will clear the analysed photo and filled meal details. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Switch",
            style: "destructive",
            onPress: applySwitch,
          },
        ]
      );
    },
    [logMode, clearLogFormFields, isLogFormBlank]
  );

  const refreshHistory = useCallback(async (uid: string | null) => {
    setHistoryLoading(true);
    const rows = await loadMealHistory(uid);
    setHistory(rows);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    void refreshHistory(authUid);
  }, [authUid, refreshHistory]);

  useFocusEffect(
    useCallback(() => {
      void refreshHistory(authUid);
    }, [authUid, refreshHistory])
  );

  const filteredHistory = useMemo(() => {
    let rows = history;
    if (historyCategoryFilter !== "all") {
      rows = rows.filter((item) => item.mealType === historyCategoryFilter);
    }
    const q = historySearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (item) =>
        item.title.toLowerCase().includes(q) || mealDescriptionsMatchSearch(item, q)
    );
  }, [history, historySearch, historyCategoryFilter]);

  const mealLogConfirmMessage = (
    title: string,
    calories: number,
    type?: ManualMealType,
    macros?: Pick<MealHistoryEntry, "proteinG" | "carbsG" | "fatG">
  ) => {
    const typeLine = type ? `\nType: ${MANUAL_MEAL_TYPE_LABELS[type]}` : "";
    const macroLine = macros ? formatHistoryMacros(macros) : null;
    const macrosText = macroLine ? `\n${macroLine}` : "";
    return `Food: ${title}\nCalories: ${calories} kcal${typeLine}${macrosText}\n\nAdd this meal to today?`;
  };

  const submitLog = async (input: {
    title: string;
    calories: number;
    mealType?: ManualMealType;
    descriptionSections?: string[];
    photoUri?: string;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
  }): Promise<boolean> => {
    if (!authUid) {
      Alert.alert("Sign in required", "Log in to save meals.");
      return false;
    }
    try {
      setLogging(true);
      await logMealFood({
        title: input.title,
        calories: input.calories,
        source: "manual",
        category: input.mealType,
        descriptionSections: input.descriptionSections,
        photoUri: input.photoUri,
        proteinG: input.proteinG,
        carbsG: input.carbsG,
        fatG: input.fatG,
        calendarTz,
      });
      const rows = await loadMealHistory(authUid);
      setHistory(rows);
      Alert.alert("Logged", `${input.title} (${input.calories} kcal) added to today.`);
      return true;
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not log meal.");
      return false;
    } finally {
      setLogging(false);
    }
  };

  const parseLogForm = (): ManualLogInput | null => {
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
      mealType,
      descriptionSections: normalizeMealDescriptions({ descriptionSections }),
      photoUri: imageUri ?? undefined,
      proteinG: parseOptionalGrams(proteinText),
      carbsG: parseOptionalGrams(carbsText),
      fatG: parseOptionalGrams(fatText),
    };
  };

  const clearLogForm = () => {
    clearLogFormFields();
    setMealType("breakfast");
  };

  const confirmAndSubmitLog = (input: ManualLogInput) => {
    Alert.alert(
      "Log this meal?",
      mealLogConfirmMessage(input.title, input.calories, input.mealType, input),
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log meal",
          onPress: () => {
            void submitLog(input).then((ok) => {
              if (!ok) return;
              clearLogForm();
            });
          },
        },
      ]
    );
  };

  const logFromForm = () => {
    const input = parseLogForm();
    if (!input) return;

    const existing = findMealHistoryMatch(history, input.title);
    if (existing) {
      Alert.alert(
        "Already in meal history",
        `"${existing.title}" is already saved in your meal history. Replace the saved entry, or rename it on the Log meal form.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Rename",
            onPress: () => {
              focusFoodNameField();
            },
          },
          {
            text: "Replace",
            onPress: () => confirmAndSubmitLog(input),
          },
        ]
      );
      return;
    }

    confirmAndSubmitLog(input);
  };

  const confirmLogFromHistory = (item: MealHistoryEntry, onLogged?: () => void) => {
    Alert.alert(
      "Log this meal?",
      mealLogConfirmMessage(item.title, item.calories, item.mealType, item),
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log meal",
          onPress: () => {
            void submitLog({
              title: item.title,
              calories: item.calories,
              mealType: item.mealType,
              descriptionSections: item.descriptionSections,
              photoUri: item.photoUri,
              proteinG: item.proteinG,
              carbsG: item.carbsG,
              fatG: item.fatG,
            }).then((ok) => {
              if (ok) onLogged?.();
            });
          },
        },
      ]
    );
  };

  const openEditHistory = (item: MealHistoryEntry) => {
    router.push({
      pathname: "/meal-history-edit",
      params: { entryId: item.id },
    });
  };

  const confirmDeleteHistory = (item: MealHistoryEntry) => {
    if (!authUid) return;
    Alert.alert(
      "Delete from history?",
      `Remove "${item.title}" from your meal history?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void removeMealHistoryEntry(authUid, item.id).then((rows) => {
              setHistory(rows);
            });
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1">
      <View className="px-3 mb-4">
        <View className="rounded-full p-1.5 flex-row" style={segmentTrackStyle}>
          <Pressable
            onPress={() => setSubTab("log")}
            className="flex-1 rounded-full py-3 items-center"
            style={subTab === "log" ? segmentActiveStyle : undefined}
          >
            <Text
              className="text-base font-extrabold"
              style={{ color: subTab === "log" ? theme.accentText : theme.textMuted }}
            >
              Log meal
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSubTab("history")}
            className="flex-1 rounded-full py-3 items-center"
            style={subTab === "history" ? segmentActiveStyle : undefined}
          >
            <Text
              className="text-base font-extrabold"
              style={{ color: subTab === "history" ? theme.accentText : theme.textMuted }}
            >
              History
          </Text>
          </Pressable>
        </View>
      </View>

      {subTab === "log" ? (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 88 : 0}
        >
          <ScrollView
            ref={scrollRef}
            className="flex-1 px-3"
            contentContainerStyle={{
              paddingBottom: scrollBottomPad + (keyboardHeight > 0 ? 24 : 0),
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            onScroll={(event) => {
              onScroll(event.nativeEvent.contentOffset.y);
            }}
            scrollEventThrottle={16}
          >
            <ThemedCard className="p-4">
              <MealLogModePicker
                value={logMode}
                onChange={handleLogModeChange}
                aiAvailable={isGeminiConfigured()}
                className="mb-3"
              />

              <MealPhotoSection
                imageUri={imageUri}
                onImageChange={(uri) => void handleMealPhotoChange(uri)}
                analyzing={analyzingPhoto}
                aiAnalysisEnabled={logMode === "ai" && isGeminiConfigured()}
                embedded
              />

              <View
                className="mb-3"
                style={{ borderTopWidth: 1, borderTopColor: theme.cardBorder }}
              />

              <MealTypePicker value={mealType} onChange={setMealType} />

              <View ref={foodNameWrapRef}>
                <ThemedText variant="muted" className="text-xs mb-1">
                  Food name
                </ThemedText>
                <TextInput
                  ref={foodNameRef}
                  value={foodName}
                  onChangeText={setFoodName}
                  onFocus={() => scrollFieldIntoView(foodNameWrapRef)}
                  className="rounded-xl px-3 py-3 mb-3 text-base"
                  style={inputStyle}
                  placeholderTextColor={placeholderColor}
                  placeholder="What did you eat?"
                />
              </View>

              <View ref={caloriesWrapRef}>
                <ThemedText variant="muted" className="text-xs mb-1">
                  Calories (kcal)
                </ThemedText>
                <TextInput
                  value={caloriesText}
                  onChangeText={setCaloriesText}
                  onFocus={() => scrollFieldIntoView(caloriesWrapRef)}
                  keyboardType="number-pad"
                  className="rounded-xl px-3 py-3 mb-3 text-base"
                  style={inputStyle}
                  placeholderTextColor={placeholderColor}
                  placeholder="e.g. 450"
                />
              </View>

              <View ref={macrosWrapRef} className="mb-3">
                <ThemedText variant="muted" className="text-xs mb-2">
                  Macros (optional)
                </ThemedText>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <ThemedText variant="muted" className="text-[10px] mb-1">
                      Protein (g)
                    </ThemedText>
                    <TextInput
                      value={proteinText}
                      onChangeText={setProteinText}
                      onFocus={() => scrollFieldIntoView(macrosWrapRef)}
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
                      onFocus={() => scrollFieldIntoView(macrosWrapRef)}
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
                      onFocus={() => scrollFieldIntoView(macrosWrapRef)}
                      keyboardType="decimal-pad"
                      className="rounded-xl px-3 py-3 text-base"
                      style={inputStyle}
                      placeholderTextColor={placeholderColor}
                      placeholder="—"
                    />
                  </View>
                </View>
              </View>

              <View ref={descriptionWrapRef}>
                <MealDescriptionSections
                  sections={descriptionSections}
                  onChange={setDescriptionSections}
                  onFocus={() => scrollFieldIntoView(descriptionWrapRef)}
                  inputStyle={inputStyle}
                  placeholderColor={placeholderColor}
                  theme={theme}
                />
              </View>

              <Pressable
                onPress={logFromForm}
                disabled={logging}
                className="rounded-full py-3.5 items-center bg-[#52B69A]"
              >
                {logging ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="font-extrabold" style={{ color: "#ffffff" }}>
                    Log meal
              </Text>
                )}
              </Pressable>
            </ThemedCard>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          className="flex-1 px-3"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
      <ThemedCard className="p-4">
        <ThemedText variant="muted" className="text-sm mb-4 leading-5">
          Tap a meal to view details. Use Log or Edit on the right; tap × to remove from history.
        </ThemedText>

        <CommunitySearchBar
          className="mb-3"
          value={historySearch}
          onChangeText={setHistorySearch}
          placeholder="Search meals by name or notes..."
        />

        <MealHistoryFilterBar
          value={historyCategoryFilter}
          onChange={setHistoryCategoryFilter}
        />

        {historyLoading ? (
          <ActivityIndicator color={theme.accent} className="my-4" />
        ) : history.length === 0 ? (
          <ThemedText variant="secondary" className="text-sm text-center py-4">
            No meal history yet. Log your first meal in the Log meal tab.
          </ThemedText>
        ) : filteredHistory.length === 0 ? (
          <ThemedText variant="secondary" className="text-sm text-center py-4">
            {historyCategoryFilter !== "all" || historySearch.trim()
              ? "No meals match your filters."
              : "No meal history yet. Log your first meal in the Log meal tab."}
          </ThemedText>
        ) : (
          <View className="gap-3">
            {filteredHistory.map((item) => (
                  <View
                key={item.id}
                className="rounded-2xl p-3 border relative"
                    style={{ backgroundColor: theme.rowBg, borderColor: theme.cardBorder }}
                  >
                <Pressable
                  onPress={() => confirmDeleteHistory(item)}
                  hitSlop={8}
                  className="absolute z-10 w-6 h-6 rounded-full items-center justify-center"
                  style={{ top: 4, right: 4, backgroundColor: "rgba(239, 68, 68, 0.18)" }}
                >
                  <Ionicons name="close" size={14} color="#ef4444" />
                </Pressable>

                <View className="flex-row items-center pr-1">
                  <Pressable onPress={() => setDetailItem(item)} className="flex-1 min-w-0 flex-row items-center pr-2">
                    {item.photoUri ? (
                      <Image
                        source={{ uri: item.photoUri }}
                        className="w-16 h-16 rounded-xl mr-3"
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        className="w-16 h-16 rounded-xl mr-3 items-center justify-center"
                        style={{ backgroundColor: theme.accentSoft }}
                      >
                        <Ionicons name="restaurant-outline" size={24} color={theme.accentText} />
                      </View>
                    )}
                    <View className="flex-1 min-w-0">
                      <ThemedText className="text-base font-extrabold" numberOfLines={1}>
                        {item.title}
                      </ThemedText>
                      <ThemedText variant="muted" className="text-sm mt-0.5">
                        {item.calories} kcal
                        {item.mealType
                          ? ` · ${MANUAL_MEAL_TYPE_LABELS[item.mealType]}`
                          : ""}
                      </ThemedText>
                      {formatHistoryMacros(item) ? (
                        <ThemedText variant="secondary" className="text-xs mt-0.5">
                          {formatHistoryMacros(item)}
                        </ThemedText>
                      ) : null}
                      {formatDescriptionPreview(item) ? (
                        <ThemedText variant="secondary" className="text-xs mt-1" numberOfLines={2}>
                          {formatDescriptionPreview(item)}
                        </ThemedText>
                      ) : null}
                    </View>
                  </Pressable>

                  <View className="flex-row gap-3 shrink-0" style={{ marginRight: 6 }}>
                    <Pressable
                      onPress={() => confirmLogFromHistory(item)}
                      disabled={logging}
                      className="rounded-full px-4 py-2.5 items-center bg-[#52B69A] min-w-[64px]"
                    >
                      <Text className="text-sm font-extrabold" style={{ color: "#ffffff" }}>
                        Log
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => openEditHistory(item)}
                      className="rounded-full px-4 py-2.5 items-center border-2 min-w-[64px]"
                      style={{ borderColor: theme.cardBorder, backgroundColor: theme.cardBg }}
                    >
                      <Text className="text-sm font-extrabold" style={{ color: theme.textPrimary }}>
                        Edit
                    </Text>
                    </Pressable>
                  </View>
                </View>
                  </View>
                ))}
          </View>
        )}
      </ThemedCard>
        </ScrollView>
      )}

      <Modal
        visible={detailItem != null}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailItem(null)}
      >
        {detailItem ? (
          <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
            <Pressable className="flex-1" onPress={() => setDetailItem(null)} />
            <View
              className="rounded-t-3xl px-4 pt-4"
              style={{
                backgroundColor: theme.cardBg,
                paddingBottom: insets.bottom + 16,
                maxHeight: "85%",
              }}
            >
              <View className="flex-row items-center justify-between mb-4">
                <ThemedText className="text-lg font-extrabold flex-1 pr-3">Meal details</ThemedText>
                <Pressable onPress={() => setDetailItem(null)} hitSlop={8} className="p-1">
                  <Ionicons name="close" size={18} color={theme.textMuted} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {detailItem.photoUri ? (
                  <Pressable onPress={() => setViewerUri(detailItem.photoUri!)}>
                    <Image
                      source={{ uri: detailItem.photoUri }}
                      className="w-full rounded-2xl mb-4"
                      style={{ height: 200 }}
                      resizeMode="cover"
                    />
                  </Pressable>
                ) : null}

                <ThemedText className="text-xl font-extrabold">{detailItem.title}</ThemedText>
                <ThemedText className="text-base font-bold mt-1" style={{ color: theme.accentText }}>
                  {detailItem.calories} kcal
                  {detailItem.mealType
                    ? ` · ${MANUAL_MEAL_TYPE_LABELS[detailItem.mealType]}`
                    : ""}
                </ThemedText>
                {formatHistoryMacros(detailItem) ? (
                  <ThemedText variant="secondary" className="text-sm mt-2">
                    {formatHistoryMacros(detailItem)}
                  </ThemedText>
                ) : null}

                {normalizeMealDescriptions(detailItem).length > 0 ? (
                  <View className="mt-4 gap-3">
                    {normalizeMealDescriptions(detailItem).map((section, index) => (
                      <View key={`${detailItem.id}-section-${index}`}>
                        <ThemedText variant="muted" className="text-xs font-bold mb-1">
                          Section {index + 1}
                        </ThemedText>
                        <ThemedText className="text-sm leading-5">{section}</ThemedText>
                      </View>
                    ))}
                  </View>
                ) : (
                  <ThemedText variant="muted" className="text-sm mt-4">
                    No description added.
                  </ThemedText>
                )}
              </ScrollView>

              <View className="flex-row gap-3 mt-4">
                <Pressable
                  onPress={() => confirmLogFromHistory(detailItem, () => setDetailItem(null))}
                  disabled={logging}
                  className="flex-1 rounded-full py-3.5 items-center bg-[#52B69A]"
                >
                  <Text className="text-sm font-extrabold" style={{ color: "#ffffff" }}>
                    Log
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setDetailItem(null);
                    openEditHistory(detailItem);
                  }}
                  className="flex-1 rounded-full py-3.5 items-center border-2"
                  style={{ borderColor: theme.cardBorder, backgroundColor: theme.rowBg }}
                >
                  <Text className="text-sm font-extrabold" style={{ color: theme.textPrimary }}>
                    Edit
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </Modal>

      <Modal visible={viewerUri != null} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View className="flex-1 bg-black">
          <Pressable className="flex-1" onPress={() => setViewerUri(null)}>
            {viewerUri ? (
              <Image source={{ uri: viewerUri }} className="flex-1" resizeMode="contain" />
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => setViewerUri(null)}
            className="absolute right-4 w-10 h-10 rounded-full items-center justify-center"
            style={{ top: insets.top + 12, backgroundColor: "rgba(0,0,0,0.5)" }}
          >
            <Ionicons name="close" size={24} color="#ffffff" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
