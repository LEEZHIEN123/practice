import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  Alert,
  ScrollView,
  Modal,
} from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { auth, db } from "../firebaseConfig";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { ImageEditor } from "expo-dynamic-image-crop";

type ActivityKey =
  | "sedentary"
  | "light"
  | "moderate"
  | "very_active"
  | "extra_active";

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function EditProfile() {
  const router = useRouter();

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userBio, setUserBio] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const [age, setAge] = useState(28);
  const [height, setHeight] = useState(175.0);
  const [weight, setWeight] = useState(72.0);

  const [ageText, setAgeText] = useState("28");
  const [heightText, setHeightText] = useState("175.0");
  const [weightText, setWeightText] = useState("72.0");

  const [ageError, setAgeError] = useState("");
  const [heightError, setHeightError] = useState("");
  const [weightError, setWeightError] = useState("");

  const [activityLevel, setActivityLevel] = useState<ActivityKey | null>(null);
  const [loading, setLoading] = useState(false);

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
        key: "extra_active" as const,
        title: "Extra Active",
        subtitle: "Exercise 2 times a day",
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

  const requestPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "We need access to your photo library."
      );
    }
  };

  useEffect(() => {
    requestPermission();

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

        if (typeof data.age === "number") {
          setAge(data.age);
          setAgeText(String(data.age));
        }

        if (typeof data.height === "number") {
          setHeight(data.height);
          setHeightText(data.height.toFixed(1));
        }

        if (typeof data.weight === "number") {
          setWeight(data.weight);
          setWeightText(data.weight.toFixed(1));
        }

        if (data.activityLevel) {
          setActivityLevel(data.activityLevel as ActivityKey);
        }
      } catch (error) {
        console.log("Error loading user profile:", error);
      }
    };

    loadProfile();
  }, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      const selected = result.assets[0];
      setEditorImage(selected.uri);
      setEditorVisible(true);
    }
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

    try {
      setLoading(true);

      const validAge = clamp(age, 20, 90);
      const validHeight = clamp(height, 120, 220);
      const validWeight = clamp(weight, 30, 200);

      const bmi = calculateBMI(validWeight, validHeight);
      const pickedActivity = options.find((o) => o.key === activityLevel);

      await updateDoc(doc(db, "users", user.uid), {
        name: userName,
        bio: userBio,
        profileImage,
        age: validAge,
        height: validHeight,
        weight: validWeight,
        bmi,
        activityLevel: pickedActivity?.key ?? null,
        activityMultiplier: pickedActivity?.multiplier ?? null,
      });

      Alert.alert(
        "Profile Updated",
        "Your profile has been updated successfully!"
      );
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
        className="flex-1 bg-[#eef2f1] px-6 pt-14"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="relative mb-4 h-14 justify-center">
          <Pressable
            onPress={() => router.push("/profile")}
            hitSlop={12}
            className="absolute left-0 top-4 h-14 w-20 justify-center pl-2"
          >
            <View className="h-12 w-12 items-center justify-center rounded-full bg-white">
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </View>
          </Pressable>

          <Text className="text-center text-2xl font-extrabold text-gray-900">
            Edit Profile
          </Text>
        </View>

        <View className="items-center mb-6">
          <View className="relative">
            <Pressable onPress={pickImage}>
              <View className="w-36 h-36 rounded-full border-4 border-[#b7ead1] bg-[#f7ead9] items-center justify-center overflow-hidden">
                <Image
                  source={
                    profileImage
                      ? { uri: profileImage }
                      : require("../assets/images/malefitnesspic.avif")
                  }
                  className="w-full h-full rounded-full"
                  resizeMode="cover"
                />
              </View>
            </Pressable>

            <Pressable
              onPress={pickImage}
              className="absolute bottom-1 right-1 w-11 h-11 rounded-full bg-[#76C893] items-center justify-center border-2 border-white"
            >
              <Ionicons name="camera" size={18} color="white" />
            </Pressable>
          </View>

          <Text className="text-sm text-gray-600 mt-3 mb-3">
            Tap photo icon to change profile picture
          </Text>

          <Pressable
            onPress={reopenEditor}
            className="flex-row items-center bg-white px-4 py-3 rounded-xl border border-gray-200"
          >
            <Ionicons name="create-outline" size={18} color="#111827" />
            <Text className="ml-2 text-gray-800 font-medium">
              Edit Current Photo
            </Text>
          </Pressable>
        </View>

        <Text className="text-lg text-gray-700 mb-2">Full Name</Text>
        <TextInput
          value={userName}
          onChangeText={setUserName}
          className="bg-white rounded-xl px-4 py-3 mb-4 text-gray-700"
          placeholder="Enter your full name"
        />

        <View className="mb-4">
          <Text className="text-lg text-gray-700 mb-2">Email Address</Text>
          <View className="bg-gray-100 rounded-xl px-4 py-3 flex-row items-center justify-between">
            <Text className="text-gray-500 flex-1">{userEmail}</Text>
            <Ionicons name="lock-closed" size={18} color="#6b7280" />
          </View>
        </View>

        <Text className="text-lg text-gray-700 mb-2">Bio</Text>
        <TextInput
          value={userBio}
          onChangeText={setUserBio}
          className="bg-white rounded-xl px-4 py-3 mb-6 text-gray-700 min-h-[110px]"
          placeholder="Write a short bio"
          multiline
          textAlignVertical="top"
        />

        <View className="mb-3">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-gray-600 font-semibold ml-1">AGE</Text>

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
                className="w-16 bg-white rounded-lg px-3 py-2 text-center text-gray-800"
              />
              <Text className="ml-2 text-gray-500 mr-1">years</Text>
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
            minimumTrackTintColor="#76C893"
            maximumTrackTintColor="#0c3a23"
            thumbTintColor="#76C893"
          />

          {!!ageError && (
            <Text className="text-red-500 text-sm mt-1 ml-1">{ageError}</Text>
          )}
        </View>

        <View className="mb-3">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-gray-600 font-semibold ml-1">HEIGHT</Text>

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
                className="w-20 bg-white rounded-lg px-3 py-2 text-center text-gray-800"
              />
              <Text className="ml-2 text-gray-500 mr-1">cm</Text>
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
            minimumTrackTintColor="#76C893"
            maximumTrackTintColor="#0c3a23"
            thumbTintColor="#76C893"
          />

          {!!heightError && (
            <Text className="text-red-500 text-sm mt-1 ml-1">
              {heightError}
            </Text>
          )}
        </View>

        <View className="mb-4">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-gray-600 font-semibold ml-1">WEIGHT</Text>

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
                className="w-20 bg-white rounded-lg px-3 py-2 text-center text-gray-800"
              />
              <Text className="ml-2 text-gray-500 mr-1">kg</Text>
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
            minimumTrackTintColor="#76C893"
            maximumTrackTintColor="#0c3a23"
            thumbTintColor="#76C893"
          />

          {!!weightError && (
            <Text className="text-red-500 text-sm mt-1 ml-1">
              {weightError}
            </Text>
          )}
        </View>

        <Text className="text-lg text-gray-700 mb-3">Activity Level</Text>

        <View className="gap-3 mb-6">
          {options.map((o) => {
            const isActive = activityLevel === o.key;

            return (
              <Pressable
                key={o.key}
                onPress={() => setActivityLevel(o.key)}
                className={`rounded-2xl p-4 flex-row items-center justify-between ${
                  isActive
                    ? "bg-[#eaf7f0] border-2 border-[#76C893]"
                    : "bg-white"
                }`}
              >
                <View className="flex-row items-center">
                  <View
                    className={`w-14 h-14 rounded-2xl items-center justify-center ${
                      isActive ? "bg-[#76C893]" : "bg-gray-100"
                    }`}
                  >
                    <Ionicons
                      name={o.icon}
                      size={24}
                      color={isActive ? "white" : "#111827"}
                    />
                  </View>

                  <View className="ml-4">
                    <Text className="text-lg font-bold text-gray-900">
                      {o.title}
                    </Text>
                    <Text className="text-gray-500">{o.subtitle}</Text>
                  </View>
                </View>

                <View
                  className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                    isActive ? "border-[#76C893]" : "border-gray-300"
                  }`}
                >
                  {isActive && (
                    <View className="w-3 h-3 rounded-full bg-[#76C893]" />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={handleSave}
          disabled={loading}
          className={`w-full bg-[#76C893] py-4 rounded-xl items-center ${
            loading ? "opacity-50" : ""
          }`}
        >
          <Text className="text-white text-lg font-semibold">
            {loading ? "Saving..." : "Save Changes"}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal visible={editorVisible} animationType="slide" transparent={false}>
        <View className="flex-1 bg-black">
          <View className="flex-row items-center justify-between px-5 pt-14 pb-4">
            <Pressable onPress={cancelEditor}>
              <Ionicons name="arrow-back" size={26} color="white" />
            </Pressable>

            <Text className="text-white text-lg font-bold">Edit Photo</Text>

            <Pressable onPress={saveEditedPhoto}>
              <Text className="text-[#76C893] text-base font-bold">Save</Text>
            </Pressable>
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

          <View className="px-5 pb-10 pt-4 bg-[#111827] rounded-t-3xl">
            <Text className="text-center text-gray-300 mb-5">
              {processingPhoto ? "Processing..." : "Photo tools"}
            </Text>

            <View className="flex-row justify-between">
              <Pressable
                onPress={rotateLeft}
                disabled={processingPhoto}
                className="flex-1 mr-2 bg-[#1f2937] rounded-2xl py-4 items-center"
              >
                <Ionicons name="refresh-outline" size={22} color="white" />
                <Text className="text-white mt-2 font-medium">Rotate Left</Text>
              </Pressable>

              <Pressable
                onPress={rotateRight}
                disabled={processingPhoto}
                className="flex-1 ml-2 bg-[#1f2937] rounded-2xl py-4 items-center"
              >
                <Ionicons name="reload-outline" size={22} color="white" />
                <Text className="text-white mt-2 font-medium">
                  Rotate Right
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={openFreeCrop}
              disabled={processingPhoto}
              className="mt-4 bg-[#1f2937] rounded-2xl py-4 items-center"
            >
              <Ionicons name="crop-outline" size={22} color="white" />
              <Text className="text-white mt-2 font-medium">Free Crop</Text>
            </Pressable>

            <Pressable
              onPress={saveEditedPhoto}
              disabled={processingPhoto}
              className="mt-4 bg-[#76C893] rounded-2xl py-4 items-center"
            >
              <Text className="text-white text-base font-bold">
                Use This Photo
              </Text>
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