import {
  ThemedBackButton,
  ThemedScreen,
  ThemedText,
} from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useRegistration,
  type ActivityKey,
  type DietaryPreference,
} from "../context/registrationContext";
import { ensureSupportChatWithAdmin } from "@/lib/communityService";
import { auth, db } from "../firebaseConfig";

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function DietaryPreferenceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account, profile, activity, reset, setDietary, setOnboardingInProgress } =
    useRegistration();
  const { theme, cardStyle } = useThemedScreen();

  const [selected, setSelected] = useState<DietaryPreference | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [fallbackProfile, setFallbackProfile] = useState<{
    name: string;
    email: string;
    gender: "male" | "female";
    age: number;
    height: number;
    weight: number;
    activityLevel: ActivityKey;
    activityMultiplier: number;
  } | null>(null);

  const options = useMemo(
    () => [
      {
        key: "omnivore" as const,
        title: "Omnivore",
        subtitle: "Eats both plant and animal foods",
        icon: "restaurant-outline" as IoniconName,
      },
      {
        key: "vegetarian" as const,
        title: "Vegetarian",
        subtitle: "No meat; may include dairy and eggs",
        icon: "leaf-outline" as IoniconName,
      },
      {
        key: "vegan" as const,
        title: "Vegan",
        subtitle: "Plant-based only; no animal products",
        icon: "nutrition-outline" as IoniconName,
      },
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (account && profile && activity) {
        setHydrating(false);
        return;
      }
      const user = auth.currentUser;
      if (!user) {
        router.replace("/register");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) {
          router.replace("/register");
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const gender = data.gender === "female" ? "female" : data.gender === "male" ? "male" : null;
        const activityLevel = data.activityLevel as ActivityKey | undefined;
        if (!gender || !activityLevel) {
          router.replace(!gender ? "/profiledetails" : "/activitylevel");
          return;
        }
        if (!cancelled) {
          setFallbackProfile({
            name: String(data.name ?? ""),
            email: String(data.email ?? user.email ?? ""),
            gender,
            age: Number(data.age ?? 28),
            height: Number(data.height ?? 175),
            weight: Number(data.weight ?? 72),
            activityLevel:
              String(activityLevel) === "extra_active"
                ? "very_active"
                : (activityLevel as ActivityKey),
            activityMultiplier: Number(data.activityMultiplier ?? 1.725),
          });
        }
      } catch {
        if (!cancelled) router.replace("/register");
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, activity, profile, router]);

  const continueNext = async () => {
    const picked = options.find((o) => o.key === selected);
    if (!picked) return;

    const resolved =
      account && profile && activity
        ? {
            name: account.name,
            email: account.email,
            gender: profile.gender,
            age: profile.age,
            height: profile.height,
            weight: profile.weight,
            activityLevel: activity.activityLevel,
            activityMultiplier: activity.activityMultiplier,
          }
        : fallbackProfile;

    if (!resolved) {
      router.replace("/register");
      return;
    }

    try {
      setSaving(true);
      setDietary({ dietaryPreference: picked.key });

      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Session expired", "Please register again.");
        router.replace("/register");
        return;
      }

      await setDoc(
        doc(db, "users", user.uid),
        {
          name: resolved.name,
          email: user.email ?? resolved.email,
          createdAt: Date.now(),
          gender: resolved.gender,
          profileImage: null,
          age: resolved.age,
          height: resolved.height,
          weight: resolved.weight,
          activityLevel: resolved.activityLevel,
          activityMultiplier: resolved.activityMultiplier,
          dietaryPreference: picked.key,
          onboardingComplete: true,
        },
        { merge: true }
      );

      // Support Admin welcome chat (non-blocking).
      void ensureSupportChatWithAdmin();

      setOnboardingInProgress(false);
      reset();
      router.replace("/BMIanalysis");
    } catch (error: any) {
      if (error?.code === "permission-denied") {
        Alert.alert(
          "Firestore: permission denied",
          "Your Firestore security rules are blocking saving the new profile. In Firebase Console → Firestore Database → Rules, publish the rules from the firestore.rules file in this project."
        );
      } else {
        Alert.alert("Error", error?.message ?? "Failed to complete registration.");
      }
      console.log("Error saving dietary preference:", error);
    } finally {
      setSaving(false);
    }
  };

  if (hydrating) {
    return (
      <ThemedScreen
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 12,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ThemedText variant="muted">Loading...</ThemedText>
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

      <ThemedText className="text-center text-3xl font-extrabold mt-2">
        Dietary Preference
      </ThemedText>

      <ThemedText variant="secondary" className="text-center mt-3 mb-6 text-base">
        This helps us personalize meal suggestions{"\n"}that fit how you eat.
      </ThemedText>

      <View className="gap-4">
        {options.map((o) => {
          const isActive = selected === o.key;

          return (
            <Pressable
              key={o.key}
              onPress={() => setSelected(o.key)}
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
              <View className="flex-row items-center flex-1 pr-3">
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

                <View className="ml-4 flex-1">
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
          onPress={() => void continueNext()}
          disabled={saving || !selected}
          className={`rounded-full overflow-hidden ${
            saving || !selected ? "opacity-60" : "opacity-100"
          }`}
        >
          <LinearGradient
            colors={[theme.accent, theme.accentText]}
            className="py-4 items-center rounded-2xl"
          >
            <View className="flex-row items-center">
              <Text className="text-white text-lg font-semibold mr-2">
                {saving ? "Saving..." : "Continue"}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </ThemedScreen>
  );
}
