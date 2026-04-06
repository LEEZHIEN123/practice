import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, TouchableOpacity } from "react-native";
import { auth } from "../firebaseConfig";

export default function Home() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  const handleGetStarted = () => {
    router.push("/login");
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/home");
        return;
      }
      setCheckingSession(false);
    });
    return unsub;
  }, [router]);

  if (checkingSession) {
    return (
      <LinearGradient
        colors={["#f7fdf9", "#e6f4ee"]}
        className="flex-1 items-center justify-center px-6"
      >
        <ActivityIndicator size="large" color="#76C893" />
        <Text className="text-gray-500 text-base mt-4">Loading…</Text>
      </LinearGradient>
    );
  }

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