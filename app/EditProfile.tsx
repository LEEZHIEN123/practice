import { Pressable } from "@/components/Pressable";
import {
  ProfileScreenHeader,
  ThemedBackButton,
  ThemedText,
  useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { syncAuthorProfileImageOnChats, syncAuthorProfileImageOnPosts, syncAuthorProfileNameOnChats, syncAuthorProfileNameOnPosts } from "@/lib/communityService";
import {
  BMI_CATEGORY_PLAN_CHANGE_MESSAGE,
  BMI_CATEGORY_PLAN_CHANGE_TITLE,
  didBmiCategoryChange,
} from "@/lib/bmiRecommendation";
import { saveHomeUserCache } from "@/lib/homeUserCache";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { syncTodayWeightLogFromProfile } from "@/lib/weightAutoFill";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { ImageEditor } from "expo-dynamic-image-crop";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db, storage } from "../firebaseConfig";

type ActivityKey =
  | "sedentary"
  | "light"
  | "moderate"
  | "very_active"
  | "super_active";

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function EditProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const calendarTz = useUserCalendarTimezone();
  const { theme, screenStyle, cardStyle } = useThemedScreen();
  const { inputStyle, rowStyle, placeholderColor, modalCardStyle } = useProfileCardStyles();

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userBio, setUserBio] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [gender, setGender] = useState<"male" | "female">("male");
  const [photoSourceVisible, setPhotoSourceVisible] = useState(false);

  const [age, setAge] = useState(28);
  const [height, setHeight] = useState(175.0);
  const [weight, setWeight] = useState(72.0);

  const [ageText, setAgeText] = useState("28");
  const [heightText, setHeightText] = useState("175.0");
  const [weightText, setWeightText] = useState("72.0");

  const [ageError, setAgeError] = useState("");
  const [heightError, setHeightError] = useState("");
  const [weightError, setWeightError] = useState("");
  const [nameError, setNameError] = useState("");

  const [activityLevel, setActivityLevel] = useState<ActivityKey | null>(null);
  const [loading, setLoading] = useState(false);
  /** Last saved height/weight — used to detect BMI category changes on save. */
  const savedMetricsRef = useRef<{ height: number; weight: number }>({ height: 175, weight: 72 });

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorImage, setEditorImage] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [cropperVisible, setCropperVisible] = useState(false);

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

  const clamp = (val: number, min: number, max: number) =>
    Math.min(Math.max(val, min), max);

  const sanitizeDecimal = (t: string) =>
    t.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

  const calculateBMI = (weightKg: number, heightCm: number) => {
    const heightM = heightCm / 100;
    if (!heightM || heightM <= 0) return 0;
    return Number((weightKg / (heightM * heightM)).toFixed(1));
  };

  const requestLibraryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "We need access to your photo library."
      );
      return false;
    }
    return true;
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "We need access to your camera.");
      return false;
    }
    return true;
  };

  useEffect(() => {
    void requestLibraryPermission();

    const loadProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return;

        const data = snap.data();

        setUserName(data.name || "");
        setUserEmail(data.email || user.email || "");
        setUserBio(data.bio || "");
        setProfileImage(data.profileImage || null);
        if (data.gender === "male" || data.gender === "female") {
          setGender(data.gender);
        }

        if (typeof data.age === "number") {
          setAge(data.age);
          setAgeText(String(data.age));
        }

        if (typeof data.height === "number") {
          setHeight(data.height);
          setHeightText(data.height.toFixed(1));
          savedMetricsRef.current.height = data.height;
        }

        if (typeof data.weight === "number") {
          setWeight(data.weight);
          setWeightText(data.weight.toFixed(1));
          savedMetricsRef.current.weight = data.weight;
        }

        if (data.activityLevel) {
          const level =
            data.activityLevel === "extra_active" ? "very_active" : data.activityLevel;
          setActivityLevel(level as ActivityKey);
        }
      } catch (error) {
        console.log("Error loading user profile:", error);
      }
    };

    loadProfile();
  }, []);

  const pickImage = async (useCamera: boolean) => {
    const allowed = useCamera
      ? await requestCameraPermission()
      : await requestLibraryPermission();
    if (!allowed) return;

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 1,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 1,
        });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setEditorImage(result.assets[0].uri);
      setEditorVisible(true);
    }
  };

  const openPhotoSourcePicker = () => {
    setPhotoSourceVisible(true);
  };

  const choosePhotoSource = (useCamera: boolean) => {
    setPhotoSourceVisible(false);
    void pickImage(useCamera);
  };

  const rotateLeft = async () => {
    if (!editorImage) return;

    try {
      setProcessingPhoto(true);

      const result = await ImageManipulator.manipulateAsync(
        editorImage,
        [{ rotate: -90 }],
        {
          compress: 1,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      setEditorImage(result.uri);
    } catch (error) {
      console.log("Rotate left error:", error);
      Alert.alert("Error", "Failed to rotate image.");
    } finally {
      setProcessingPhoto(false);
    }
  };

  const rotateRight = async () => {
    if (!editorImage) return;

    try {
      setProcessingPhoto(true);

      const result = await ImageManipulator.manipulateAsync(
        editorImage,
        [{ rotate: 90 }],
        {
          compress: 1,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      setEditorImage(result.uri);
    } catch (error) {
      console.log("Rotate right error:", error);
      Alert.alert("Error", "Failed to rotate image.");
    } finally {
      setProcessingPhoto(false);
    }
  };

  const openFreeCrop = () => {
    if (!editorImage) {
      Alert.alert("No photo selected", "Please choose a photo first.");
      return;
    }
    setCropperVisible(true);
  };

  const handleFreeCropComplete = (croppedImageData: { uri: string }) => {
    setEditorImage(croppedImageData.uri);
    setCropperVisible(false);
  };

  const handleCropCancel = () => {
    setCropperVisible(false);
  };

  const saveEditedPhoto = () => {
    if (!editorImage) return;
    setProfileImage(editorImage);
    setEditorVisible(false);
  };

  const cancelEditor = () => {
    setEditorVisible(false);
    setEditorImage(null);
    setCropperVisible(false);
  };

  const reopenEditor = async () => {
    if (!profileImage) {
      Alert.alert("No photo selected", "Please choose a profile photo first.");
      return;
    }

    setEditorImage(profileImage);
    setEditorVisible(true);
  };

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const trimmedName = userName.trim();
    let ok = true;

    if (!trimmedName) {
      setNameError("Full name is required.");
      ok = false;
    } else {
      setNameError("");
    }

    const parsedAge = parseInt(ageText || "", 10);
    let nextAge = 0;
    if (!Number.isFinite(parsedAge) || parsedAge < 20 || parsedAge > 90) {
      setAgeError("Age must be between 20 and 90.");
      ok = false;
    } else {
      nextAge = parsedAge;
      setAgeError("");
    }

    const parsedHeight = parseFloat(heightText || "");
    let nextHeight = 0;
    if (!Number.isFinite(parsedHeight) || parsedHeight < 120 || parsedHeight > 220) {
      setHeightError("Height must be between 120 cm and 220 cm.");
      ok = false;
    } else {
      nextHeight = parsedHeight;
      setHeightError("");
    }

    const parsedWeight = parseFloat(weightText || "");
    let nextWeight = 0;
    if (!Number.isFinite(parsedWeight) || parsedWeight < 30 || parsedWeight > 200) {
      setWeightError("Weight must be between 30 kg and 200 kg.");
      ok = false;
    } else {
      nextWeight = parsedWeight;
      setWeightError("");
    }

    if (!ok) return;

    try {
      setLoading(true);

      setAge(nextAge);
      setAgeText(String(nextAge));
      setHeight(nextHeight);
      setHeightText(nextHeight.toFixed(1));
      setWeight(nextWeight);
      setWeightText(nextWeight.toFixed(1));

      const bmi = calculateBMI(nextWeight, nextHeight);
      const pickedActivity = options.find((o) => o.key === activityLevel);

      let profileImageUrl: string | null = profileImage;
      if (profileImage && !profileImage.startsWith("http")) {
        try {
          const blob = await (await fetch(profileImage)).blob();
          const objectRef = ref(storage, `users/${user.uid}/profile.jpg`);
          await uploadBytes(objectRef, blob, { contentType: "image/jpeg" });
          profileImageUrl = await getDownloadURL(objectRef);
        } catch (e) {
          console.log("Profile image upload failed:", e);
          Alert.alert(
            "Photo upload failed",
            "Could not upload your profile picture. Check your connection and try again."
          );
          return;
        }
      }

      await updateDoc(doc(db, "users", user.uid), {
        name: trimmedName.slice(0, 14),
        email: userEmail || user.email || null,
        gender,
        bio: userBio,
        profileImage: profileImageUrl,
        age: nextAge,
        height: nextHeight,
        weight: nextWeight,
        bmi,
        activityLevel: pickedActivity?.key ?? null,
        activityMultiplier: pickedActivity?.multiplier ?? null,
      });

      // Keep Progress today's weight / chart in sync when profile weight changes.
      if (Math.abs(nextWeight - savedMetricsRef.current.weight) >= 0.05) {
        await syncTodayWeightLogFromProfile({
          uid: user.uid,
          weightKg: nextWeight,
          calendarTz,
        }).catch((e) => console.log("today weight log sync failed:", e));
      }

      await saveHomeUserCache(user.uid, {
        name: trimmedName.slice(0, 14),
        profileImage:
          typeof profileImageUrl === "string" && profileImageUrl.startsWith("http")
            ? profileImageUrl
            : null,
        weight: nextWeight,
        height: nextHeight,
        age: nextAge,
        gender,
        activityMultiplier: pickedActivity?.multiplier ?? undefined,
      });

      await Promise.all([
        syncAuthorProfileNameOnChats(trimmedName.slice(0, 14)),
        syncAuthorProfileNameOnPosts(trimmedName.slice(0, 14)),
        typeof profileImageUrl === "string" && profileImageUrl.startsWith("http")
          ? Promise.all([
              syncAuthorProfileImageOnPosts(profileImageUrl),
              syncAuthorProfileImageOnChats(profileImageUrl),
            ])
          : syncAuthorProfileImageOnChats(profileImageUrl),
      ]).catch(() => {});

      const previousBmi = calculateBMI(
        savedMetricsRef.current.weight,
        savedMetricsRef.current.height
      );
      savedMetricsRef.current = { height: nextHeight, weight: nextWeight };

      if (didBmiCategoryChange(previousBmi, bmi)) {
        Alert.alert(BMI_CATEGORY_PLAN_CHANGE_TITLE, BMI_CATEGORY_PLAN_CHANGE_MESSAGE);
      } else {
        Alert.alert(
          "Profile Updated",
          "Your profile has been updated successfully!"
        );
      }
      router.push("/profile");
    } catch (error) {
      console.log("Error saving profile:", error);
      Alert.alert("Error", "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ScrollView
        className="flex-1"
        style={screenStyle}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 84,
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ProfileScreenHeader
          title="Edit Profile"
          onBack={() => {
            try {
              router.back();
            } catch {
              router.push("/profile");
            }
          }}
          titleClassName="text-xl"
          rightSlot={
            <Pressable onPress={handleSave} disabled={loading} hitSlop={8}>
              <ThemedText variant={loading ? "muted" : "accent"} className="text-base font-extrabold">
                Save
              </ThemedText>
            </Pressable>
          }
        />

        <View className="items-center mb-6">
          <View className="relative">
            <Pressable onPress={openPhotoSourcePicker}>
              <View
                className="w-36 h-36 rounded-full border-4 items-center justify-center overflow-hidden"
                style={{ borderColor: theme.accentSoft, backgroundColor: theme.rowBg }}
              >
                <Image
                  source={
                    profileImage
                      ? { uri: profileImage }
                      : gender === "female"
                        ? require("../assets/images/femalefitnesspic.avif")
                        : require("../assets/images/malefitnesspic.avif")
                  }
                  className="w-full h-full rounded-full"
                  resizeMode="cover"
                />
              </View>
            </Pressable>

            <Pressable
              onPress={openPhotoSourcePicker}
              className="absolute bottom-1 right-1 w-11 h-11 rounded-full items-center justify-center border-2"
              style={{ backgroundColor: theme.accent, borderColor: theme.cardBg }}
            >
              <Ionicons name="camera" size={18} color="white" />
            </Pressable>
          </View>

          <ThemedText variant="secondary" className="text-sm mt-3 mb-3">
            Tap photo to use camera or gallery
          </ThemedText>

          <Pressable
            onPress={reopenEditor}
            className="flex-row items-center px-4 py-3 rounded-xl border"
            style={cardStyle}
          >
            <Ionicons name="create-outline" size={18} color={theme.textPrimary} />
            <ThemedText className="ml-2 font-medium">Edit Current Photo</ThemedText>
          </Pressable>
        </View>

        <View className="flex-row items-center justify-between mb-2">
          <ThemedText className="text-lg">Full Name</ThemedText>
          <ThemedText variant="muted" className="text-sm font-semibold">
            {Math.min(userName.length, 14)}/14
          </ThemedText>
        </View>
        <TextInput
          value={userName}
          onChangeText={(t) => {
            setUserName(t.slice(0, 14));
            if (nameError) setNameError("");
          }}
          maxLength={14}
          className="rounded-xl px-4 py-3"
          style={inputStyle}
          placeholder="Enter your full name"
          placeholderTextColor={placeholderColor}
        />
        {!!nameError ? (
          <Text className="text-red-500 text-sm mt-1 ml-1 mb-4">{nameError}</Text>
        ) : (
          <View className="mb-4" />
        )}

        <View className="mb-4">
          <ThemedText className="text-lg mb-2">Email Address</ThemedText>
          <View
            className="rounded-xl px-4 py-3 flex-row items-center justify-between"
            style={rowStyle}
          >
            <ThemedText variant="muted" className="flex-1">
              {userEmail}
            </ThemedText>
            <Ionicons name="lock-closed" size={18} color={theme.iconMuted} />
          </View>
        </View>

        <View className="flex-row items-center justify-between mb-2">
          <ThemedText className="text-lg">Bio</ThemedText>
          <ThemedText variant="muted" className="text-sm font-semibold">
            {Math.min(userBio.length, 200)}/200
          </ThemedText>
        </View>
        <TextInput
          value={userBio}
          onChangeText={(t) => setUserBio(t.slice(0, 200))}
          maxLength={200}
          className="rounded-xl px-4 py-3 mb-6 min-h-[110px]"
          style={inputStyle}
          placeholder="Write your bio here"
          placeholderTextColor={placeholderColor}
          multiline
          textAlignVertical="top"
        />

        <View className="mb-3">
          <View className="flex-row justify-between items-center mb-2">
            <ThemedText variant="secondary" className="font-semibold ml-1">
              AGE
            </ThemedText>

            <View className="flex-row items-center">
              <TextInput
                value={ageText}
                onChangeText={(t) => {
                  setAgeText(t.replace(/[^0-9]/g, ""));
                  setAgeError("");
                }}
                onBlur={() => {
                  const parsed = parseInt(ageText || "28", 10);

                  if (!Number.isFinite(parsed)) {
                    setAgeError("Age must be between 20 and 90.");
                    setAgeText(String(age));
                    return;
                  }

                  if (parsed < 20 || parsed > 90) {
                    setAgeError("Age must be between 20 and 90.");
                  } else {
                    setAgeError("");
                  }

                  const n = clamp(parsed, 20, 90);
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
            minimumValue={20}
            maximumValue={90}
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

          {!!ageError && (
            <Text className="text-red-500 text-sm mt-1 ml-1">{ageError}</Text>
          )}
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
                    setHeightText(height.toFixed(1));
                    return;
                  }

                  if (parsed < 120 || parsed > 220) {
                    setHeightError("Height must be between 120 cm and 220 cm.");
                  } else {
                    setHeightError("");
                  }

                  const fixed = clamp(parsed, 120, 220);
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
            minimumValue={120}
            maximumValue={220}
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

        <View className="mb-4">
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
                    setWeightText(weight.toFixed(1));
                    return;
                  }

                  if (parsed < 30 || parsed > 200) {
                    setWeightError("Weight must be between 30 kg and 200 kg.");
                  } else {
                    setWeightError("");
                  }

                  const fixed = clamp(parsed, 30, 200);
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
            minimumValue={30}
            maximumValue={200}
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

        <ThemedText className="text-lg mb-3">Activity Level</ThemedText>

        <View className="gap-3 mb-6">
          {options.map((o) => {
            const isActive = activityLevel === o.key;

            return (
              <Pressable
                key={o.key}
                onPress={() => setActivityLevel(o.key)}
                className="rounded-2xl p-4 flex-row items-center"
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
                    className="w-14 h-14 rounded-2xl items-center justify-center shrink-0"
                    style={{ backgroundColor: isActive ? theme.accent : theme.rowBg }}
                  >
                    <Ionicons
                      name={o.icon}
                      size={24}
                      color={isActive ? "white" : theme.textPrimary}
                    />
                  </View>

                  <View className="ml-4 min-w-0 flex-1">
                    <ThemedText className="text-lg font-bold">{o.title}</ThemedText>
                    <ThemedText variant="secondary" className="mt-1 shrink">
                      {o.subtitle}
                    </ThemedText>
                  </View>
                </View>

                <View
                  className="h-6 w-6 shrink-0 rounded-full border-2 items-center justify-center"
                  style={{ borderColor: isActive ? theme.accent : theme.iconMuted }}
                >
                  {isActive && (
                    <View
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: theme.accent }}
                    />
                  )}
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
          onPress={handleSave}
          disabled={loading}
          className={`py-4 rounded-full items-center active:opacity-90 ${loading ? "opacity-60" : ""}`}
          style={{ backgroundColor: theme.accent }}
        >
          <Text className="text-white font-bold text-base">
            {loading ? "Saving..." : "Save Change"}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={photoSourceVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoSourceVisible(false)}
      >
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: theme.modalOverlay }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => setPhotoSourceVisible(false)}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <View
            className="rounded-2xl px-4 pt-4 pb-2"
            style={[
              modalCardStyle,
              {
                width: 300,
                maxWidth: "84%",
              },
            ]}
          >
            <ThemedText className="text-base font-extrabold mb-3">
              Change profile picture
            </ThemedText>

            <View className="items-end pr-1">
              <Pressable
                onPress={() => choosePhotoSource(true)}
                className="py-2.5 px-1"
                hitSlop={4}
              >
                <ThemedText variant="accent" className="text-[15px] font-bold text-right">
                  Take Photo
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => choosePhotoSource(false)}
                className="py-2.5 px-1"
                hitSlop={4}
              >
                <ThemedText variant="accent" className="text-[15px] font-bold text-right">
                  Choose from Gallery
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setPhotoSourceVisible(false)}
                className="py-2.5 px-1 mb-1"
                hitSlop={4}
              >
                <ThemedText variant="muted" className="text-[15px] font-bold text-right">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editorVisible} animationType="slide" transparent={false}>
        <View className="flex-1" style={{ backgroundColor: "#000000" }}>
          <View className="flex-row items-center justify-between px-3 pt-14 pb-4">
            <Pressable onPress={cancelEditor}>
              <Ionicons name="arrow-back" size={26} color="white" />
            </Pressable>

            <Text className="text-white text-lg font-bold">Edit Photo</Text>

            <View className="w-12" />
          </View>

          <View className="flex-1 items-center justify-center px-4">
            {editorImage ? (
              <Image
                source={{ uri: editorImage }}
                style={{
                  width: "100%",
                  height: 420,
                  borderRadius: 20,
                }}
                resizeMode="contain"
              />
            ) : (
              <Text className="text-white">No image selected</Text>
            )}
          </View>

          <View
            className="px-3 pb-10 pt-4 rounded-t-3xl"
            style={{ backgroundColor: theme.navBg }}
          >
            <Text className="text-center mb-5" style={{ color: theme.textSecondary }}>
              {processingPhoto ? "Processing..." : "Photo tools"}
            </Text>

            <View className="flex-row justify-between">
              <Pressable
                onPress={rotateLeft}
                disabled={processingPhoto}
                className="flex-1 mr-2 rounded-2xl py-4 items-center"
                style={{ backgroundColor: theme.rowBg }}
              >
                <Ionicons name="refresh-outline" size={22} color={theme.textPrimary} />
                <Text className="mt-2 font-medium" style={{ color: theme.textPrimary }}>
                  Rotate Left
                </Text>
              </Pressable>

              <Pressable
                onPress={rotateRight}
                disabled={processingPhoto}
                className="flex-1 ml-2 rounded-2xl py-4 items-center"
                style={{ backgroundColor: theme.rowBg }}
              >
                <Ionicons name="reload-outline" size={22} color={theme.textPrimary} />
                <Text className="mt-2 font-medium" style={{ color: theme.textPrimary }}>
                  Rotate Right
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={openFreeCrop}
              disabled={processingPhoto}
              className="mt-4 rounded-2xl py-4 items-center"
              style={{ backgroundColor: theme.rowBg }}
            >
              <Ionicons name="crop-outline" size={22} color={theme.textPrimary} />
              <Text className="mt-2 font-medium" style={{ color: theme.textPrimary }}>
                Free Crop
              </Text>
            </Pressable>

            <Pressable
              onPress={saveEditedPhoto}
              disabled={processingPhoto}
              className="mt-4 rounded-2xl py-4 items-center"
              style={{ backgroundColor: theme.accent }}
            >
              <Text className="text-white text-base font-bold">Confirm</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {editorImage && (
        <ImageEditor
          isVisible={cropperVisible}
          imageUri={editorImage}
          onEditingComplete={handleFreeCropComplete}
          onEditingCancel={handleCropCancel}
          dynamicCrop={true}
        />
      )}
    </>
  );
}
