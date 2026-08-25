import {
  ThemedBackButton,
  ThemedScreen,
  ThemedText,
} from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRegistration, type ActivityKey } from "../context/registrationContext";

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function ActivityLevel() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account, profile, setActivity } = useRegistration();
  const { theme, cardStyle } = useThemedScreen();

  const [selected, setSelected] = useState<ActivityKey | null>(null);

  const options = useMemo(
    () => [
      {
        key: "sedentary" as const,
        title: "Sedentary",
        subtitle: "Little to no exercise",
        multiplier: 1.2,
        icon: "bed-outline" as IoniconName,
      },
      {
        key: "light" as const,
        title: "Light",
        subtitle: "Exercise 1–3 days/week",
        multiplier: 1.375,
        icon: "walk-outline" as IoniconName,
      },
      {
        key: "moderate" as const,
        title: "Moderate",
        subtitle: "Exercise 3–5 days/week",
        multiplier: 1.55,
        icon: "barbell-outline" as IoniconName,
      },
      {
        key: "very_active" as const,
        title: "Very Active",
        subtitle: "Exercise 6–7 days/week",
        multiplier: 1.725,
        icon: "fitness-outline" as IoniconName,
      },
      {
        key: "super_active" as const,
        title: "Super Active",
        subtitle: "Very hard exercise or physically demanding work",
        multiplier: 1.9,
        icon: "flash-outline" as IoniconName,
      },
    ],
    []
  );

  const continueNext = () => {
    const picked = options.find((o) => o.key === selected);
    if (!picked) return;
    if (!account || !profile) {
      router.replace("/register");
      return;
    }

    setActivity({ activityLevel: picked.key, activityMultiplier: picked.multiplier });
    router.push("/dietary-preference" as any);
  };

  return (
    <ThemedScreen style={{ paddingTop: insets.top + 12, paddingHorizontal: 12 }}>
      <View className="relative mb-6 h-12 justify-center">
        <View className="absolute left-0 top-0 h-16 w-24 justify-center pl-2">
          <ThemedBackButton onPress={() => router.back()} icon="arrow-back" />
        </View>
        <ThemedText className="text-center text-xl font-extrabold">Profile Details</ThemedText>
      </View>

      <ThemedText className="text-center text-3xl font-extrabold mt-2">Activity Level</ThemedText>

      <ThemedText variant="secondary" className="text-center mt-3 mb-6 text-base">
        This helps us personalize your fitness journey{"\n"}and track progress accurately.
      </ThemedText>

      <View className="gap-4">
        {options.map((o) => {
          const isActive = selected === o.key;

          return (
            <Pressable
              key={o.key}
              onPress={() => setSelected(o.key)}
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
                  className="w-16 h-16 rounded-2xl items-center justify-center shrink-0"
                  style={{ backgroundColor: isActive ? theme.accent : theme.rowBg }}
                >
                  <Ionicons
                    name={o.icon}
                    size={26}
                    color={isActive ? "white" : theme.textPrimary}
                  />
                </View>

                <View className="ml-4 min-w-0 flex-1">
                  <ThemedText className="text-xl font-extrabold">{o.title}</ThemedText>
                  <ThemedText variant="secondary" className="mt-1 shrink">
                    {o.subtitle}
                  </ThemedText>
                </View>
              </View>

              <View
                className="h-7 w-7 shrink-0 rounded-full border-2 items-center justify-center"
                style={{ borderColor: isActive ? theme.accent : theme.iconMuted }}
              >
                {isActive ? (
                  <View
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: theme.accent }}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-1 justify-end pb-10 mt-3">
        <Pressable
          onPress={continueNext}
          disabled={!selected}
          className={`rounded-full overflow-hidden ${!selected ? "opacity-60" : "opacity-100"}`}
        >
          <LinearGradient
            colors={[theme.accent, theme.accentText]}
            className="py-4 items-center rounded-2xl"
          >
            <View className="flex-row items-center">
              <Text className="text-white text-lg font-semibold mr-2">Continue</Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </ThemedScreen>
  );
}
