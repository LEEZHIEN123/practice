import { Pressable } from "@/components/Pressable";
import {
  ThemedBackButton,
  ThemedScreen,
  ThemedText,
} from "@/components/themed/ThemedUi";
import { saveInitialUserPlans, type RecommendedPlan } from "@/lib/saveInitialUserPlans";
import { getBmiRecommendation } from "@/lib/bmiRecommendation";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { calcBmi, type PlanDuration } from "@/lib/workoutPlan";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
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

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function SchedulePlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, cardStyle } = useThemedScreen();

  const [selected, setSelected] = useState<PlanDuration | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<Record<string, unknown> | null>(null);
  const [bmi, setBmi] = useState(0);
  const [recommendedPlan, setRecommendedPlan] = useState<RecommendedPlan | null>(null);

  const options = useMemo(
    () =>
      [
        {
          key: "week" as const,
          title: "One Week Plan",
          subtitle: "7 days · Short Term Schedule",
          icon: "calendar-outline" as IoniconName,
        },
        {
          key: "biweekly" as const,
          title: "Biweekly Plan",
          subtitle: "14 days · Medium Term Schedule",
          icon: "calendar-number-outline" as IoniconName,
        },
        {
          key: "monthly" as const,
          title: "Monthly Plan",
          subtitle: "30 days · Long Term Schedule",
          icon: "calendar-clear-outline" as IoniconName,
        },
      ] satisfies Array<{
        key: PlanDuration;
        title: string;
        subtitle: string;
        icon: IoniconName;
      }>,
    []
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const user = auth.currentUser;
      if (!user) {
        router.replace("/register");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};

        if (cancelled) return;

        const savedDuration =
          data.planDuration === "week" ||
          data.planDuration === "biweekly" ||
          data.planDuration === "monthly"
            ? data.planDuration
            : null;
        if (savedDuration) {
          if (data.bmiAnalysisComplete === false) {
            router.replace("/BMIanalysis");
          } else {
            router.replace("/home");
          }
          return;
        }

        const heightCm = typeof data.height === "number" ? data.height : 0;
        const weightKg = typeof data.weight === "number" ? data.weight : 0;
        const computedBmi = calcBmi(weightKg, heightCm) ?? 0;

        if (!computedBmi) {
          router.replace("/profiledetails");
          return;
        }

        const recommendation = getBmiRecommendation(computedBmi);
        setUserData(data);
        setBmi(computedBmi);
        setRecommendedPlan(recommendation.planKey as RecommendedPlan);
      } catch (e) {
        console.log("Failed to load schedule plan screen:", e);
        Alert.alert("Error", "Could not load your profile. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleContinue = async () => {
    const user = auth.currentUser;
    if (!user || !selected || !userData || !recommendedPlan || !bmi) return;

    try {
      setSaving(true);
      await saveInitialUserPlans({
        uid: user.uid,
        duration: selected,
        bmi,
        recommendedPlan,
        userData,
      });
      router.replace("/BMIanalysis");
    } catch (e) {
      console.log("Failed to save schedule plan:", e);
      Alert.alert("Error", "Failed to generate your plan. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ThemedScreen
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 12,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={theme.accent} />
        <ThemedText variant="muted" className="mt-4">
          Loading...
        </ThemedText>
      </ThemedScreen>
    );
  }

  return (
    <ThemedScreen style={{ paddingTop: insets.top + 12, paddingHorizontal: 12 }}>
      <View className="relative mb-6 h-12 justify-center">
        <View className="absolute left-0 top-0 h-16 w-24 justify-center pl-2">
          <ThemedBackButton onPress={() => router.back()} icon="arrow-back" />
        </View>
        <ThemedText className="text-center text-xl font-extrabold">Profile Details</ThemedText>
      </View>

      <ThemedText className="text-center text-3xl font-extrabold mt-2">Schedule Plan</ThemedText>
      <ThemedText variant="secondary" className="text-center mt-3 mb-6 text-base px-2">
        Select a schedule length. This first choice applies to both your workout plan and
        nutrition guidance.
      </ThemedText>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4">
          {options.map((option) => {
            const isActive = selected === option.key;

            return (
              <Pressable
                key={option.key}
                onPress={() => setSelected(option.key)}
                className="rounded-3xl p-5 flex-row items-center"
                style={
                  isActive
                    ? {
                        backgroundColor: theme.accentSoft,
                        borderColor: theme.accent,
                        borderWidth: 2,
                      }
                    : cardStyle
                }
              >
                <View className="min-w-0 flex-1 flex-row items-center pr-3">
                  <View
                    className="h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: isActive ? theme.accent : theme.rowBg }}
                  >
                    <Ionicons
                      name={option.icon}
                      size={26}
                      color={isActive ? "white" : theme.textPrimary}
                    />
                  </View>

                  <View className="ml-4 min-w-0 flex-1">
                    <ThemedText className="text-xl font-extrabold">{option.title}</ThemedText>
                    <ThemedText variant="secondary" className="mt-1 shrink">
                      {option.subtitle}
                    </ThemedText>
                  </View>
                </View>

                <View
                  className="h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
                  style={{ borderColor: isActive ? theme.accent : theme.iconMuted }}
                >
                  {isActive ? (
                    <View
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ backgroundColor: theme.accent }}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View
        className="absolute left-0 right-0 px-3 pt-3"
        style={{ bottom: 0, paddingBottom: insets.bottom + 12, backgroundColor: theme.screenBg }}
      >
        <Pressable
          onPress={() => void handleContinue()}
          disabled={!selected || saving}
          className={`rounded-full overflow-hidden ${!selected || saving ? "opacity-60" : "opacity-100"}`}
        >
          <LinearGradient
            colors={[theme.accent, theme.accentText]}
            className="py-4 items-center rounded-2xl"
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <View className="flex-row items-center">
                <Text className="text-white text-lg font-semibold mr-2">Continue</Text>
                <Ionicons name="arrow-forward" size={20} color="white" />
              </View>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </ThemedScreen>
  );
}
