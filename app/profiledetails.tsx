import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, Image, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { auth, db } from "../firebaseConfig";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import * as ImagePicker from "expo-image-picker"; // To pick profile image
import Slider from "@react-native-community/slider"; // For horizontal scrolling

export default function EditProfile() {
  const router = useRouter();

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userBio, setUserBio] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [age, setAge] = useState(28);
  const [height, setHeight] = useState(175);
  const [weight, setWeight] = useState(72);
  const [loading, setLoading] = useState(false);

  // Error states for age, height, and weight
  const [ageError, setAgeError] = useState("");
  const [heightError, setHeightError] = useState("");
  const [weightError, setWeightError] = useState("");

  // Request permission for accessing photos
  const requestPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      alert("Sorry, we need permission to access your photo library.");
    }
  };

  // Fetch current user data from Firestore
  useEffect(() => {
    requestPermission(); // Request permission when component mounts

    const loadProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserName(data.name);
          setUserEmail(data.email);
          setUserBio(data.bio || "");
          setProfileImage(data.profileImage || null); // Set the profile image from Firestore
          setAge(data.age || 28); // Set default age if not provided
          setHeight(data.height || 175); // Set default height if not provided
          setWeight(data.weight || 72); // Set default weight if not provided
        }
      } catch (error) {
        console.log("Error loading user profile:", error);
      }
    };

    loadProfile();
  }, []);

  // Validate and clamp values for age, height, and weight
  const validateInput = () => {
    let validAge = age;
    let validHeight = height;
    let validWeight = weight;

    // Validate age
    if (age < 20 || age > 90) {
      setAgeError("Age must be between 20 and 90");
      validAge = Math.min(Math.max(age, 20), 90);
    } else {
      setAgeError("");
    }

    // Validate height
    if (height < 120 || height > 220) {
      setHeightError("Height must be between 120cm and 220cm");
      validHeight = Math.min(Math.max(height, 120), 220);
    } else {
      setHeightError("");
    }

    // Validate weight
    if (weight < 30 || weight > 200) {
      setWeightError("Weight must be between 30kg and 200kg");
      validWeight = Math.min(Math.max(weight, 30), 200);
    } else {
      setWeightError("");
    }

    setAge(validAge);
    setHeight(validHeight);
    setWeight(validWeight);
  };

  // Update the user's profile data
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setLoading(true);

      // Validate input before updating
      validateInput();

      // Update Firestore with the new profile data
      await updateDoc(doc(db, "users", user.uid), {
        name: userName,
        email: userEmail,
        bio: userBio,
        profileImage: profileImage, // Save the updated profile image URI
        age: age,
        height: height,
        weight: weight,
      });

      Alert.alert("Profile Updated", "Your profile has been updated successfully!");
      router.push("/profile"); // Redirect back to the profile page
    } catch (error) {
      console.log("Error saving profile:", error);
      Alert.alert("Error", "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  // Allow the user to pick an image
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    // Check if the user did not cancel and a URI exists
    if (!result.canceled && result.assets?.[0]?.uri) {
      setProfileImage(result.assets[0].uri); // Set the selected image URI
    }
  };

  return (
    <View className="flex-1 bg-[#eef2f1] px-6 pt-14">
      <Text className="text-2xl font-extrabold text-gray-900 mb-4">Edit Profile</Text>

      {/* Profile Picture Section */}
      <View className="items-center mb-6">
        <Pressable onPress={pickImage}>
          <View className="w-36 h-36 rounded-full border-4 border-[#b7ead1] bg-[#f7ead9] items-center justify-center overflow-hidden">
            <Image
              source={
                profileImage
                  ? { uri: profileImage }
                  : require("../assets/images/malefitnesspic.avif") // default image
              }
              className="w-28 h-28"
              resizeMode="contain"
            />
          </View>
        </Pressable>
        <Text className="text-sm text-gray-600 mt-2">Tap to change profile picture</Text>
      </View>

      {/* Full Name Input */}
      <Text className="text-lg text-gray-700 mb-2">Full Name</Text>
      <TextInput
        value={userName}
        onChangeText={setUserName}
        className="bg-white rounded-xl px-4 py-3 mb-4 text-gray-700"
        placeholder="Enter your full name"
      />

      {/* Email Input */}
      <Text className="text-lg text-gray-700 mb-2">Email Address</Text>
      <TextInput
        value={userEmail}
        onChangeText={setUserEmail}
        className="bg-white rounded-xl px-4 py-3 mb-4 text-gray-700"
        placeholder="Enter your email address"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      {/* Bio Input as a Text Area */}
      <Text className="text-lg text-gray-700 mb-2">Bio</Text>
      <TextInput
        value={userBio}
        onChangeText={setUserBio}
        className="bg-white rounded-xl px-4 py-3 mb-6 text-gray-700"
        placeholder="Write a short bio"
        multiline={true} // Enable multiline for the text area
        numberOfLines={4} // Optional: Set initial visible number of lines
        textAlignVertical="top" // Align text to the top
      />

      {/* Age Section */}
      <Text className="text-lg text-gray-700 mb-2">Age</Text>
      <View className="flex-row items-center mb-4">
        <Slider
          style={{ width: "80%" }}
          minimumValue={20}
          maximumValue={90}
          step={1}
          value={age}
          onValueChange={(v) => setAge(v)}
          minimumTrackTintColor="#76C893"
          maximumTrackTintColor="#0c3a23"
          thumbTintColor="#76C893"
        />
        <TextInput
          value={String(age)}
          onChangeText={(text) => setAge(Number(text))}
          keyboardType="numeric"
          className="bg-white rounded-xl px-3 py-2 text-gray-700 ml-4 w-20 text-center"
          placeholder="Age"
          onBlur={() => validateInput()} // Ensure value is valid when losing focus
        />
      </View>
      {ageError ? <Text className="text-red-500 text-sm">{ageError}</Text> : null}

      {/* Height Section */}
      <Text className="text-lg text-gray-700 mb-2">Height (cm)</Text>
      <View className="flex-row items-center mb-4">
        <Slider
          style={{ width: "80%" }}
          minimumValue={120}
          maximumValue={220}
          step={0.1}
          value={height}
          onValueChange={(v) => setHeight(v)}
          minimumTrackTintColor="#76C893"
          maximumTrackTintColor="#0c3a23"
          thumbTintColor="#76C893"
        />
        <TextInput
          value={String(height)}
          onChangeText={(text) => setHeight(Number(text))}
          keyboardType="numeric"
          className="bg-white rounded-xl px-3 py-2 text-gray-700 ml-4 w-20 text-center"
          placeholder="Height"
          onBlur={() => validateInput()} // Ensure value is valid when losing focus
        />
      </View>
      {heightError ? <Text className="text-red-500 text-sm">{heightError}</Text> : null}

      {/* Weight Section */}
      <Text className="text-lg text-gray-700 mb-2">Weight (kg)</Text>
      <View className="flex-row items-center mb-6">
        <Slider
          style={{ width: "80%" }}
          minimumValue={30}
          maximumValue={200}
          step={0.1}
          value={weight}
          onValueChange={(v) => setWeight(v)}
          minimumTrackTintColor="#76C893"
          maximumTrackTintColor="#0c3a23"
          thumbTintColor="#76C893"
        />
        <TextInput
          value={String(weight)}
          onChangeText={(text) => setWeight(Number(text))}
          keyboardType="numeric"
          className="bg-white rounded-xl px-3 py-2 text-gray-700 ml-4 w-20 text-center"
          placeholder="Weight"
          onBlur={() => validateInput()} // Ensure value is valid when losing focus
        />
      </View>
      {weightError ? <Text className="text-red-500 text-sm">{weightError}</Text> : null}

      {/* Save Button */}
      <Pressable
        onPress={handleSave}
        disabled={loading}
        className={`w-full bg-[#76C893] py-4 rounded-xl items-center ${loading ? "opacity-50" : ""}`}
      >
        <Text className="text-white text-lg font-semibold">
          {loading ? "Saving..." : "Save Changes"}
        </Text>
      </Pressable>
    </View>
  );
}