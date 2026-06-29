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
import { Alert, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { doc, setDoc } from "firebase/firestore";
import { useRegistration } from "../context/registrationContext";
import { auth, db } from "../firebaseConfig";

type ActivityKey =
  | "sedentary"
  | "light"
  | "moderate"
  | "very_active"
  | "extra_active";

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function ActivityLevel() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account, profile, reset, setActivity } = useRegistration();
  const { theme, cardStyle } = useThemedScreen();

  const [selected, setSelected] = useState<ActivityKey | null>(null);
  const [saving, setSaving] = useState(false);

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
        key: "extra_active" as const,
        title: "Extra Active",
        subtitle: "Exercise 2 times a day",
        multiplier: 1.9,
        icon: "flash-outline" as IoniconName,
      },
    ],
    []
  );

  const select = (key: ActivityKey) => setSelected(key);

  const continueToHome = async () => {
    const picked = options.find((o) => o.key === selected);
    if (!picked) return;
    if (!account || !profile) {
      router.replace("/register");
      return;
    }

    try {
      setSaving(true);

      setActivity({ activityLevel: picked.key, activityMultiplier: picked.multiplier });

      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Session expired", "Please register again.");
        router.replace("/register");
        return;
      }

      await setDoc(
        doc(db, "users", user.uid),
        {
          name: account.name,
          email: user.email ?? account.email,
          createdAt: Date.now(),
          gender: profile.gender,
          profileImage: null,
          age: profile.age,
          height: profile.height,
          weight: profile.weight,
          activityLevel: picked.key,
          activityMultiplier: picked.multiplier,
        },
        { merge: true }
      );

      router.push("/BMIanalysis");
    } catch (error: any) {
      if (error?.code === "permission-denied") {
        Alert.alert(
          "Firestore: permission denied",
          "Your Firestore security rules are blocking saving the new profile. In Firebase Console → Firestore Database → Rules, publish the rules from the firestore.rules file in this project (or run: firebase deploy --only firestore:rules after firebase login)."
        );
      } else {
        Alert.alert("Error", error?.message ?? "Failed to complete registration.");
      }
      console.log("Error saving activity level:", error);
    } finally {
      setSaving(false);
      reset();
    }
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
              onPress={() => select(o.key)}
              className="rounded-3xl p-5 flex-row items-center justify-between"
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
              <View className="flex-row items-center">
                <View
                  className="w-16 h-16 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: isActive ? theme.accent : theme.rowBg }}
                >
                  <Ionicons
                    name={o.icon}
                    size={26}
                    color={isActive ? "white" : theme.textPrimary}
                  />
                </View>

                <View className="ml-4">
                  <ThemedText className="text-xl font-extrabold">{o.title}</ThemedText>
                  <ThemedText variant="secondary" className="mt-1">
                    {o.subtitle}
                  </ThemedText>
                </View>
              </View>

              <View
                className="w-7 h-7 rounded-full border-2 items-center justify-center"
                style={{ borderColor: isActive ? theme.accent : theme.iconMuted }}
              >
                {isActive && (
                  <View
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: theme.accent }}
                  />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-1 justify-end pb-10 mt-3">
        <Pressable
          onPress={continueToHome}
          disabled={saving}
          className={`rounded-full overflow-hidden ${saving ? "opacity-60" : "opacity-100"}`}
        >
          <LinearGradient
            colors={[theme.accent, theme.accentText]}
            className="py-4 items-center rounded-2xl"
          >
            <View className="flex-row items-center">
              <Text className="text-white text-lg font-semibold mr-2">
                {saving ? "Analysis.." : "Continue"}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </ThemedScreen>
  );
}
