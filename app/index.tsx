import React from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

export default function Home() {
  const router = useRouter();

  const handleGetStarted = () => {
    router.push("/login");
  };

  return (
    <LinearGradient
      colors={["#f7fdf9", "#e6f4ee"]}
      className="flex-1 items-center justify-center px-6"
    >
      {/* Image */}
      <Image
        source={require("../assets/images/download.jpg")}
        className="w-72 h-72 mb-8"
        resizeMode="contain"
      />

      {/* Title */}
      <Text className="text-4xl font-bold text-green-500 text-center mb-4">
        Ready To Glow?
      </Text>

      {/* Subtitle */}
      <Text className="text-lg text-gray-500 text-center mb-10">
        Track your journey to achieve your fitness goal.
      </Text>

      {/* Custom Rounded Button */}
      <TouchableOpacity
        onPress={handleGetStarted}
        className="px-20 bg-green-300 py-5 rounded-full items-center shadow-lg flex-row justify-center"
      >
        <Text className="text-green-700 text-xl font-semibold mr-2">
          Get Started
        </Text>

        <Ionicons name="arrow-forward" size={22} color="#15803d" />
      </TouchableOpacity>
    </LinearGradient>
  );
}