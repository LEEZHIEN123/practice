import { Pressable } from "@/components/Pressable";
import { ThemedScreen, ThemedText } from "@/components/themed/ThemedUi";
import { getBmiRecommendation } from "@/lib/bmiRecommendation";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

const BMI_CATEGORY_COLORS = [
  { bg: "#0c2a3d", bgLight: "#f0f9ff", border: "#0284c7", text: "#38bdf8", textLight: "#0284c7" },
  { bg: "#0f2e24", bgLight: "#ecfdf5", border: "#059669", text: "#34d399", textLight: "#059669" },
  { bg: "#2e2208", bgLight: "#fffbeb", border: "#d97706", text: "#fbbf24", textLight: "#d97706" },
  { bg: "#2e1212", bgLight: "#fef2f2", border: "#dc2626", text: "#f87171", textLight: "#dc2626" },
] as const;

export default function BmiAnalysis() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark, cardStyle } = useThemedScreen();

  const [saving, setSaving] = useState(false);

  const [heightCm, setHeightCm] = useState<number>(0);
  const [weightKg, setWeightKg] = useState<number>(0);

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? snap.data() : {};

        const h = typeof data.height === "number" ? data.height : 0;
        const w = typeof data.weight === "number" ? data.weight : 0;

        setHeightCm(h);
        setWeightKg(w);
      } catch (e) {
        console.log("Failed to load BMI analysis:", e);
      }
    };

    load();
  }, []);

  const bmi = useMemo(() => {
    if (!heightCm || !weightKg) return 0;
    const m = heightCm / 100;
    const value = weightKg / (m * m);
    return Number.isFinite(value) ? value : 0;
  }, [heightCm, weightKg]);

  const plan = useMemo(() => getBmiRecommendation(bmi || 0), [bmi]);

  const bmiCategoryIdx = useMemo(() => {
    if (!bmi) return 1;
    if (bmi < 18.5) return 0;
    if (bmi <= 24.9) return 1;
    if (bmi <= 29.9) return 2;
    return 3;
  }, [bmi]);

  const bmiCategoryLabel = useMemo(() => {
    if (!bmi) return "—";
    return (["UNDER", "NORMAL", "OVER", "OBESE"] as const)[bmiCategoryIdx];
  }, [bmi, bmiCategoryIdx]);

  const categoryColors = BMI_CATEGORY_COLORS[bmiCategoryIdx];

  const bmiMarkerPct = useMemo(() => {
    if (!bmi) return 12.5;
    const b = Math.min(Math.max(bmi, 12), 48);
    if (b < 18.5) return ((b - 12) / (18.5 - 12)) * 25;
    if (b <= 24.9) return 25 + ((b - 18.5) / (24.9 - 18.5)) * 25;
    if (b <= 29.9) return 50 + ((b - 25) / (29.9 - 25)) * 25;
    return 75 + Math.min((b - 30) / (48 - 30), 1) * 25;
  }, [bmi]);

  const bmiCaretColor = useMemo(() => {
    if (!bmi) return theme.accentText;
    return isDark ? categoryColors.text : categoryColors.textLight;
  }, [bmi, categoryColors, isDark, theme.accentText]);

  useEffect(() => {
    const saveBmi = async () => {
      const user = auth.currentUser;
      if (!user) return;
      if (!bmi) return;

      try {
        await updateDoc(doc(db, "users", user.uid), {
          bmi: Number(bmi.toFixed(2)),
          recommendedPlan: plan.planKey,
        });
      } catch (e) {
        console.log("Failed to save BMI:", e);
      }
    };

    saveBmi();
  }, [bmi, plan.planKey]);

  const goNext = async () => {
    try {
      setSaving(true);
      const user = auth.currentUser;
      if (user) {
        await updateDoc(doc(db, "users", user.uid), {
          bmiAnalysisComplete: true,
        });
      }
      router.replace("/home");
    } finally {
      setSaving(false);
    }
  };

  const barLabels = [
    { key: "under", label: "UNDER", range: "< 18.5", color: isDark ? "#38bdf8" : "#0284c7" },
    { key: "normal", label: "NORMAL", range: "18.5 – 24.9", color: isDark ? "#34d399" : "#059669" },
    { key: "over", label: "OVER", range: "25.0 – 29.9", color: isDark ? "#fbbf24" : "#d97706" },
    { key: "obese", label: "OBESE", range: ">= 30.0", color: isDark ? "#f87171" : "#dc2626" },
  ] as const;

  return (
    <ThemedScreen>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12 }}>
        <View className="relative mb-6 h-12 justify-center">
          <ThemedText className="text-center text-xl font-extrabold">BMI Analysis</ThemedText>
        </View>

        <View className="flex-row justify-center items-center -mt-1 mb-3">
          <View className="w-2 h-2 rounded-full mx-1" style={{ backgroundColor: theme.accent, opacity: 0.45 }} />
          <View className="w-2 h-2 rounded-full mx-1" style={{ backgroundColor: theme.accent, opacity: 0.45 }} />
          <View className="w-10 h-2 rounded-full mx-1" style={{ backgroundColor: theme.accent }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText className="text-center text-2xl font-bold">{plan.titleTop}</ThemedText>
        <Text
          className="text-center text-3xl font-extrabold mt-2"
          style={{ color: isDark ? categoryColors.text : categoryColors.textLight }}
        >
          {plan.status}
        </Text>

        <ThemedText variant="secondary" className="text-center mt-3 mb-5 text-base">
          To improve your health, we recommended a{"\n"}
          <Text className="font-extrabold text-lg" style={{ color: theme.danger }}>
            {(plan.recommendationTitle + " Goal").toUpperCase()}
          </Text>
          .
        </ThemedText>

        <View className="items-center">
          <View
            className="px-3 py-1.5 rounded-full border"
            style={
              bmi
                ? {
                    backgroundColor: isDark ? categoryColors.bg : categoryColors.bgLight,
                    borderColor: categoryColors.border,
                  }
                : { backgroundColor: theme.rowBg, borderColor: theme.cardBorder }
            }
          >
            <Text
              className="text-xs font-extrabold"
              style={{ color: bmi ? (isDark ? categoryColors.text : categoryColors.textLight) : theme.textMuted }}
            >
              {bmiCategoryLabel}
            </Text>
          </View>
          <View className="flex-row items-end">
            <ThemedText className="text-4xl font-extrabold">
              {bmi ? bmi.toFixed(1) : "--"}
            </ThemedText>
            <ThemedText variant="muted" className="ml-2 mb-1 text-sm">
              kg/m²
            </ThemedText>
          </View>
        </View>
        <ThemedText variant="muted" className="text-center text-xs tracking-widest mt-2">
          BMI SCORE
        </ThemedText>

        <View className="mt-6">
          <View className="h-6 justify-end">
            <View className="relative w-full h-5">
              <View
                style={{ position: "absolute", left: `${bmiMarkerPct}%`, marginLeft: -10, bottom: 0 }}
                className="items-center w-5"
              >
                <Ionicons name="caret-down" size={22} color={bmiCaretColor} />
              </View>
            </View>
          </View>

          <View className="flex-row h-3 rounded-full overflow-hidden mt-1">
            <View className="flex-1 bg-sky-300" />
            <View className="flex-1 bg-emerald-400" />
            <View className="flex-1 bg-amber-400" />
            <View className="flex-1 bg-red-400" />
          </View>

          <View className="flex-row justify-between mt-3">
            {barLabels.map((row, idx) => {
              const active = bmiCategoryIdx === idx;
              return (
                <View key={row.key} className="flex-1 items-center px-0.5">
                  <Text
                    className="text-[10px] font-extrabold"
                    style={{ color: active ? row.color : theme.iconMuted }}
                  >
                    {row.label}
                  </Text>
                  <ThemedText variant="muted" className="text-[9px] mt-1 text-center leading-tight">
                    {row.range}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </View>

        <ThemedText variant="muted" className="mt-6 text-xs tracking-widest font-semibold">
          RECOMMENDED GOAL
        </ThemedText>

        <View
          className="mt-3 rounded-3xl p-5"
          style={{ ...cardStyle, borderColor: theme.accent, borderWidth: 1 }}
        >
          <View className="flex-row items-center">
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: theme.rowBg }}
            >
              {plan.planKey === "gain" && (
                <Ionicons name="trending-up-outline" size={20} color={theme.textPrimary} />
              )}
              {plan.planKey === "maintain" && (
                <Ionicons name="remove-outline" size={20} color={theme.textPrimary} />
              )}
              {plan.planKey === "lose" && (
                <Ionicons name="trending-down-outline" size={20} color={theme.textPrimary} />
              )}
            </View>

            <View className="ml-3">
              <ThemedText className="text-lg font-extrabold">{plan.recommendationTitle}</ThemedText>
              <ThemedText variant="secondary" className="text-sm">
                {plan.recommendationSubtitle}
              </ThemedText>
            </View>
          </View>

          <ThemedText variant="secondary" className="text-xs mt-4 leading-5">
            {plan.description.replace("{BMI}", bmi ? bmi.toFixed(1) : "--")}
          </ThemedText>
        </View>

        <View
          className="mt-3 rounded-2xl p-4"
          style={{
            backgroundColor: theme.accentSoft,
            borderColor: theme.accent,
            borderWidth: 1,
          }}
        >
          <View className="flex-row items-start">
            <View
              className="w-8 h-8 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: theme.cardBg }}
            >
              <Ionicons name="information-circle-outline" size={18} color={theme.accentText} />
            </View>

            <ThemedText variant="secondary" className="flex-1 text-xs leading-5">
              Tip: If you don't want to follow the recommended goal, you can manually adjust your
              goal anytime in the app.
            </ThemedText>
          </View>
        </View>
      </ScrollView>

      <View
        className="absolute left-0 right-0 px-3 pt-3"
        style={{ bottom: 0, paddingBottom: insets.bottom + 12, backgroundColor: theme.screenBg }}
      >
        <Pressable
          onPress={goNext}
          disabled={saving || !bmi}
          className={`rounded-full overflow-hidden ${saving || !bmi ? "opacity-60" : "opacity-100"}`}
        >
          <LinearGradient
            colors={[theme.accent, theme.accentText]}
            className="py-4 items-center rounded-2xl"
          >
            <View className="flex-row items-center">
              <Text className="text-white text-lg font-semibold mr-2">
                {saving ? "Loading..." : "Continue"}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </ThemedScreen>
  );
}
