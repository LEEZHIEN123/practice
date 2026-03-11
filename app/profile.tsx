import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Image } from "react-native";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

type GoalLabel = "Gain Weight" | "Maintain Weight" | "Lose Weight";
type Gender = "male" | "female";

export default function ProfileScreen() {
  const router = useRouter();

  const [userName, setUserName] = useState(" ");
  const [userEmail, setUserEmail] = useState(" ");
  const [goal, setGoal] = useState<GoalLabel>("Lose Weight");
  const [gender, setGender] = useState<Gender>("male");
  const [profileImage, setProfileImage] = useState<string | null>(null); // State for profile image

  useEffect(() => {
    const loadProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "users", user.uid));

        if (snap.exists()) {
          const data = snap.data();

          if (data.name) setUserName(data.name);
          if (data.email) setUserEmail(data.email);
          if (data.gender === "male" || data.gender === "female") {
            setGender(data.gender);
          }

          if (data.recommendedPlan === "gain") setGoal("Gain Weight");
          else if (data.recommendedPlan === "maintain") setGoal("Maintain Weight");
          else if (data.recommendedPlan === "lose") setGoal("Lose Weight");

          // Fetch and set the profile image from Firestore
          setProfileImage(data.profileImage || null);
        }
      } catch (error) {
        console.log("Failed to load profile:", error);
      }
    };

    loadProfile();
  }, []); // Empty dependency array ensures it runs once after the component mounts

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.log("Logout failed:", error);
    }
  };

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="px-6 pt-14">
          {/* Header */}
          <View className="relative items-center justify-center mb-8">
         

            <Text className="text-2xl font-extrabold text-gray-900">
              Profile
            </Text>
          </View>

          {/* Avatar */}
          <View className="items-center mb-6">
            <View className="relative">
              <View className="w-36 h-36 rounded-full border-4 border-[#b7ead1] bg-[#f7ead9] items-center justify-center overflow-hidden">
                <Image
                  source={
                    profileImage // If profile image exists, show it; otherwise, use default
                      ? { uri: profileImage }
                      : gender === "male"
                      ? require("../assets/images/malefitnesspic.avif") // default male profile image
                      : require("../assets/images/femalefitnesspic.avif") // default female profile image
                  }
                  className="w-28 h-28"
                  resizeMode="contain"
                />
              </View>
            </View>

            <Text className="text-3xl font-extrabold text-gray-900 mt-5">
              {userName}
            </Text>
            <Text className="text-gray-500 text-lg mt-1">{userEmail}</Text>
          </View>

          {/* Edit Profile Button */}
          <Pressable
            onPress={() => router.push("/EditProfile")}
            className="bg-[#f7f7f7] rounded-3xl px-5 py-6 flex-row items-center justify-between mb-4 shadow-sm"
          >
            <View className="flex-row items-center">
              <View className="w-12 h-12 rounded-full bg-[#eef7f1] items-center justify-center">
                <Ionicons name="person" size={22} color="#76C893" />
              </View>
              <Text className="text-2xl font-bold text-gray-900 ml-4">
                Edit Profile
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={22} color="#9ca3af" />
          </Pressable>

          {/* My Goals */}
          <Pressable className="bg-[#f7f7f7] rounded-3xl px-5 py-6 flex-row items-center justify-between mb-4 shadow-sm">
            <View className="flex-row items-center">
              <View className="w-12 h-12 rounded-full bg-[#eef7f1] items-center justify-center">
                <Ionicons
                  name="radio-button-on-outline"
                  size={22}
                  color="#76C893"
                />
              </View>

              <View className="ml-4">
                <Text className="text-2xl font-bold text-gray-900">
                  My Goals
                </Text>
                <Text className="text-[#76C893] text-base font-semibold mt-1">
                  Goal: {goal}
                </Text>
              </View>
            </View>

            <Ionicons name="chevron-forward" size={22} color="#9ca3af" />
          </Pressable>

          {/* Reminders */}
      <Pressable
  onPress={() => router.push("/reminder")}
  className="bg-[#f7f7f7] rounded-3xl px-5 py-6 mb-4 shadow-sm"
>
  <View className="flex-row items-center justify-between mb-4">
    <View className="flex-row items-center">
      <View className="w-12 h-12 rounded-full bg-[#eef7f1] items-center justify-center">
        <Ionicons name="alarm-outline" size={22} color="#76C893" />
      </View>
      <Text className="text-2xl font-bold text-gray-900 ml-4">
        Reminders
      </Text>
    </View>

    <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
  </View>

  <View className="ml-16">
    <View className="flex-row justify-between items-center mb-3">
      <Text className="text-gray-700 text-lg">Workout Time</Text>
      <Text className="text-[#76C893] text-lg font-bold">Tap to manage</Text>
    </View>

    <View className="flex-row justify-between items-center mb-3">
      <Text className="text-gray-700 text-lg">Meal Time</Text>
      <Text className="text-[#76C893] text-lg font-bold">Tap to manage</Text>
    </View>

    <View className="flex-row justify-between items-center">
      <Text className="text-gray-700 text-lg">Water Intake</Text>
      <Text className="text-[#76C893] text-lg font-bold">Tap to manage</Text>
    </View>
  </View>
</Pressable>

          {/* Terms of Service */}
          <Pressable className="bg-[#f7f7f7] rounded-3xl px-5 py-6 flex-row items-center justify-between mb-4 shadow-sm">
            <View className="flex-row items-center">
              <View className="w-12 h-12 rounded-full bg-[#eef7f1] items-center justify-center">
                <Feather name="file-text" size={20} color="#76C893" />
              </View>
              <Text className="text-2xl font-bold text-gray-900 ml-4">
                Terms of Service
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={22} color="#9ca3af" />
          </Pressable>

          {/* Contact Us */}
          <Pressable className="bg-[#f7f7f7] rounded-3xl px-5 py-6 flex-row items-center justify-between mb-10 shadow-sm">
            <View className="flex-row items-center">
              <View className="w-12 h-12 rounded-full bg-[#eef7f1] items-center justify-center">
                <Feather name="mail" size={20} color="#76C893" />
              </View>
              <Text className="text-2xl font-bold text-gray-900 ml-4">
                Contact Us
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={22} color="#9ca3af" />
          </Pressable>

          {/* Logout */}
          <Pressable
            onPress={handleLogout}
            className="bg-[#f7f7f7] rounded-3xl py-6 items-center justify-center"
          >
            <View className="flex-row items-center">
              <MaterialCommunityIcons name="logout" size={22} color="#ef4444" />
              <Text className="text-red-500 text-2xl font-bold ml-2">
                Logout
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex-row justify-around py-3">
        <Pressable
          onPress={() => router.replace("/home")}
          className="items-center"
        >
          <Ionicons name="home-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">HOME</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/discover")}
          className="items-center"
        >
          <Ionicons name="compass-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">
            DISCOVER
          </Text>
        </Pressable>

        <Pressable className="items-center">
          <Ionicons name="stats-chart-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">
            PROGRESS
          </Text>
        </Pressable>

        <Pressable className="items-center">
          <Ionicons name="person" size={20} color="#76C893" />
          <Text className="text-[10px] text-[#76C893] font-bold mt-1">
            PROFILE
          </Text>
        </Pressable>
      </View>
    </View>
  );
}