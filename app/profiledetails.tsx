import { Pressable } from "@/components/Pressable";
import {
  ThemedCard,
  ThemedScreen,
  ThemedText,
  useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isOnboardingGate } from "@/lib/onboardingGate";
import { useRegistration } from "../context/registrationContext";
import { auth, db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

type Gender = "male" | "female";

export default function ProfileDetails() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account, setAccount, setProfile, setOnboardingInProgress } = useRegistration();
  const { theme } = useThemedScreen();
  const { inputStyle } = useProfileCardStyles();

  const [gender, setGender] = useState<Gender>("male");
  const [age, setAge] = useState(28);
  const [height, setHeight] = useState(175.0);
  const [weight, setWeight] = useState(72.0);
  const [saving, setSaving] = useState(false);

  const [ageText, setAgeText] = useState(String(28));
  const [heightText, setHeightText] = useState((175).toFixed(1));
  const [weightText, setWeightText] = useState((72).toFixed(1));

  const [ageError, setAgeError] = useState("");
  const [heightError, setHeightError] = useState("");
  const [weightError, setWeightError] = useState("");

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const sanitizeInt = (t: string) => t.replace(/[^\d]/g, "");
  const sanitizeDecimal = (t: string) => {
    const cleaned = t.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    const [a, b] = cleaned.split(".");
    if (b === undefined) return a ?? "";
    return `${a ?? ""}.${b.slice(0, 1)}`;
  };

  const ranges = useMemo(
    () => ({
      age: { min: 20, max: 90, step: 1 },
      height: { min: 120, max: 220, step: 0.1 },
      weight: { min: 30, max: 200, step: 0.1 },
    }),
    []
  );

  useEffect(() => {
    setOnboardingInProgress(true);
    if (account) return;
    const user = auth.currentUser;
    if (!user) {
      // Account may still be creating — do not bounce while the gate is on.
      if (isOnboardingGate()) return;
      router.replace("/register");
      return;
    }
    void getDoc(doc(db, "users", user.uid)).then((snap) => {
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
      setAccount({
        name: String(data.name ?? ""),
        email: String(data.email ?? user.email ?? ""),
        password: "",
      });
    });
  }, [account, router, setAccount, setOnboardingInProgress]);

  useEffect(() => {
    setAge((v) => {
      const n = clamp(v, ranges.age.min, ranges.age.max);
      setAgeText(String(n));
      return n;
    });
    setHeight((v) => {
      const n = clamp(v, ranges.height.min, ranges.height.max);
      setHeightText(n.toFixed(1));
      return n;
    });
    setWeight((v) => {
      const n = clamp(v, ranges.weight.min, ranges.weight.max);
      setWeightText(n.toFixed(1));
      return n;
    });
  }, [ranges.age.max, ranges.age.min, ranges.height.max, ranges.height.min, ranges.weight.max, ranges.weight.min]);

  const handleContinue = async () => {
    try {
      setSaving(true);
      if (!account) {
        router.replace("/register");
        return;
      }

      let ok = true;

      const parsedAge = parseInt(ageText || "", 10);
      if (!Number.isFinite(parsedAge) || parsedAge < ranges.age.min || parsedAge > ranges.age.max) {
        setAgeError("Age must be between 20 and 90.");
        ok = false;
      } else {
        setAgeError("");
      }

      const parsedHeight = parseFloat(heightText || "");
      if (
        !Number.isFinite(parsedHeight) ||
        parsedHeight < ranges.height.min ||
        parsedHeight > ranges.height.max
      ) {
        setHeightError("Height must be between 120 cm and 220 cm.");
        ok = false;
      } else {
        setHeightError("");
      }

      const parsedWeight = parseFloat(weightText || "");
      if (
        !Number.isFinite(parsedWeight) ||
        parsedWeight < ranges.weight.min ||
        parsedWeight > ranges.weight.max
      ) {
        setWeightError("Weight must be between 30 kg and 200 kg.");
        ok = false;
      } else {
        setWeightError("");
      }

      if (!ok) {
        return;
      }

      const nextAge = clamp(parsedAge, ranges.age.min, ranges.age.max);
      const nextHeight = clamp(parsedHeight, ranges.height.min, ranges.height.max);
      const nextWeight = clamp(parsedWeight, ranges.weight.min, ranges.weight.max);

      setAge(nextAge);
      setAgeText(String(nextAge));
      setHeight(nextHeight);
      setHeightText(nextHeight.toFixed(1));
      setWeight(nextWeight);
      setWeightText(nextWeight.toFixed(1));

      setProfile({
        gender,
        age: nextAge,
        height: nextHeight,
        weight: nextWeight,
      });

      router.push("/activitylevel");
    } catch (error) {
      console.log("Error saving profile details:", error);
    } finally {
      setSaving(false);
    }
  };

  const GenderButton = ({
    value,
    label,
    icon,
  }: {
    value: Gender;
    label: string;
    icon: "male" | "female";
  }) => {
    const active = gender === value;

    return (
      <View className="items-center">
        <Pressable
          onPress={() => setGender(value)}
          className="w-20 h-20 rounded-full items-center justify-center"
          style={{ backgroundColor: active ? theme.accent : theme.accentSoft }}
        >
          <Ionicons name={icon} size={34} color={active ? "white" : theme.accent} />
        </Pressable>
        <ThemedText
          variant={active ? "accent" : "muted"}
          className="mt-2 font-semibold"
        >
          {label}
        </ThemedText>
      </View>
    );
  };

  const bottomPad = Math.max(insets.bottom, 16) + 24;

  return (
    <ThemedScreen>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: bottomPad,
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="relative mb-6 h-12 justify-center">
          <ThemedText className="text-center text-xl font-extrabold">Profile Details</ThemedText>
        </View>

        <ThemedText className="text-center text-3xl font-extrabold mt-2">
          Tell us about yourself
        </ThemedText>
        <ThemedText variant="secondary" className="text-center mt-3 text-base px-3">
          This helps us personalize your fitness{"\n"}journey and track progress accurately.
        </ThemedText>

        <View className="items-center mt-6">
          <ThemedCard className="w-52 h-56 items-center justify-center shadow-sm">
            <Image
              source={
                gender === "female"
                  ? require("../assets/images/femalefitnesspic.avif")
                  : require("../assets/images/malefitnesspic.avif")
              }
              className="w-40 h-48"
              resizeMode="contain"
            />
          </ThemedCard>
        </View>

        <View className="flex-row justify-center gap-10 mt-7">
          <GenderButton value="male" label="Male" icon="male" />
          <GenderButton value="female" label="Female" icon="female" />
        </View>

        <View className="mt-6">
          <View className="mb-3">
            <View className="flex-row justify-between items-center mb-2">
              <ThemedText variant="secondary" className="font-semibold ml-1">
                AGE
              </ThemedText>

              <View className="flex-row items-center">
                <TextInput
                  value={ageText}
                  onChangeText={(t) => {
                    setAgeText(sanitizeInt(t));
                    setAgeError("");
                  }}
                  onBlur={() => {
                    const parsed = parseInt(ageText || "", 10);

                    if (!Number.isFinite(parsed)) {
                      setAgeError("Age must be between 20 and 90.");
                      setAgeText(String(age));
                      return;
                    }

                    if (parsed < ranges.age.min || parsed > ranges.age.max) {
                      setAgeError("Age must be between 20 and 90.");
                    } else {
                      setAgeError("");
                    }

                    const n = clamp(parsed, ranges.age.min, ranges.age.max);
                    setAge(n);
                    setAgeText(String(n));
                  }}
                  keyboardType="numeric"
                  className="w-16 rounded-lg px-3 py-2 text-center"
                  style={inputStyle}
                />
                <ThemedText variant="muted" className="ml-2 mr-1">
                  years
                </ThemedText>
              </View>
            </View>

            <Slider
              style={{ width: "100%" }}
              minimumValue={ranges.age.min}
              maximumValue={ranges.age.max}
              step={1}
              value={age}
              onValueChange={(v) => {
                setAge(v);
                setAgeText(String(v));
                setAgeError("");
              }}
              minimumTrackTintColor={theme.accent}
              maximumTrackTintColor={theme.cardBorder}
              thumbTintColor={theme.accent}
            />

            {!!ageError && <Text className="text-red-500 text-sm mt-1 ml-1">{ageError}</Text>}
          </View>

          <View className="mb-3">
            <View className="flex-row justify-between items-center mb-2">
              <ThemedText variant="secondary" className="font-semibold ml-1">
                HEIGHT
              </ThemedText>

              <View className="flex-row items-center">
                <TextInput
                  value={heightText}
                  onChangeText={(t) => {
                    setHeightText(sanitizeDecimal(t));
                    setHeightError("");
                  }}
                  onBlur={() => {
                    const parsed = parseFloat(heightText || "");

                    if (!Number.isFinite(parsed)) {
                      setHeightError("Height must be between 120 cm and 220 cm.");
                      setHeightText(String(height));
                      return;
                    }

                    if (parsed < ranges.height.min || parsed > ranges.height.max) {
                      setHeightError("Height must be between 120 cm and 220 cm.");
                    } else {
                      setHeightError("");
                    }

                    const fixed = clamp(parsed, ranges.height.min, ranges.height.max);
                    setHeight(fixed);
                    setHeightText(fixed.toFixed(1));
                  }}
                  keyboardType="decimal-pad"
                  className="w-20 rounded-lg px-3 py-2 text-center"
                  style={inputStyle}
                />
                <ThemedText variant="muted" className="ml-2 mr-1">
                  cm
                </ThemedText>
              </View>
            </View>

            <Slider
              style={{ width: "100%" }}
              minimumValue={ranges.height.min}
              maximumValue={ranges.height.max}
              step={0.1}
              value={height}
              onValueChange={(v) => {
                setHeight(v);
                setHeightText(v.toFixed(1));
                setHeightError("");
              }}
              minimumTrackTintColor={theme.accent}
              maximumTrackTintColor={theme.cardBorder}
              thumbTintColor={theme.accent}
            />

            {!!heightError && (
              <Text className="text-red-500 text-sm mt-1 ml-1">{heightError}</Text>
            )}
          </View>

          <View className="mb-2">
            <View className="flex-row justify-between items-center mb-2">
              <ThemedText variant="secondary" className="font-semibold ml-1">
                WEIGHT
              </ThemedText>

              <View className="flex-row items-center">
                <TextInput
                  value={weightText}
                  onChangeText={(t) => {
                    setWeightText(sanitizeDecimal(t));
                    setWeightError("");
                  }}
                  onBlur={() => {
                    const parsed = parseFloat(weightText || "");

                    if (!Number.isFinite(parsed)) {
                      setWeightError("Weight must be between 30 kg and 200 kg.");
                      setWeightText(String(weight));
                      return;
                    }

                    if (parsed < ranges.weight.min || parsed > ranges.weight.max) {
                      setWeightError("Weight must be between 30 kg and 200 kg.");
                    } else {
                      setWeightError("");
                    }

                    const fixed = clamp(parsed, ranges.weight.min, ranges.weight.max);
                    setWeight(fixed);
                    setWeightText(fixed.toFixed(1));
                  }}
                  keyboardType="decimal-pad"
                  className="w-20 rounded-lg px-3 py-2 text-center"
                  style={inputStyle}
                />
                <ThemedText variant="muted" className="ml-2 mr-1">
                  kg
                </ThemedText>
              </View>
            </View>

            <Slider
              style={{ width: "100%" }}
              minimumValue={ranges.weight.min}
              maximumValue={ranges.weight.max}
              step={0.1}
              value={weight}
              onValueChange={(v) => {
                setWeight(v);
                setWeightText(v.toFixed(1));
                setWeightError("");
              }}
              minimumTrackTintColor={theme.accent}
              maximumTrackTintColor={theme.cardBorder}
              thumbTintColor={theme.accent}
            />

            {!!weightError && (
              <Text className="text-red-500 text-sm mt-1 ml-1">{weightError}</Text>
            )}
          </View>
        </View>

        <View className="mt-2">
          <Pressable
            onPress={handleContinue}
            disabled={saving}
            className={`rounded-full overflow-hidden ${saving ? "opacity-60" : "opacity-100"}`}
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
      </ScrollView>
    </ThemedScreen>
  );
}
