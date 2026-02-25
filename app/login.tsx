import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { auth } from "../firebaseConfig";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ✅ Login
  const login = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      Alert.alert("Missing fields", "Please enter email and password.");
      return;
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      router.replace("/home");
    } catch (e: any) {
      Alert.alert("Wrong email/password", "Please provide valid email and password.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Forgot Password (more reliable + better errors)
  const handleForgotPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert("Enter your email", "Please type your email first, then tap Forgot?.");
      return;
    }

    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, cleanEmail);
      Alert.alert(
        "Reset Email Sent",
        "We sent a password reset link to your email. Please check Inbox, Spam, and Promotions."
      );
    } catch (error: any) {
      const code = error?.code;

      if (code === "auth/user-not-found") {
        Alert.alert("No account found", "This email is not registered yet.");
      } else if (code === "auth/invalid-email") {
        Alert.alert("Invalid email", "Please enter a valid email address.");
      } else if (code === "auth/too-many-requests") {
        Alert.alert("Too many requests", "Please try again later.");
      } else {
        Alert.alert("Error", error?.message ?? "Unable to send reset email.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#eef2f1] justify-center px-6">
      {/* Profile Icon */}
      <View className="items-center mb-6">
        <View className="w-28 h-28 bg-white rounded-full items-center justify-center shadow-lg">
          <Ionicons name="person" size={50} color="#76C893" />
        </View>
      </View>

      {/* Title */}
      <Text className="text-3xl font-bold text-center text-gray-800 mb-2">
        Sign In
      </Text>

      <Text className="text-center text-gray-500 mb-8">
        Welcome back! Please enter your details.
      </Text>

      {/* Email */}
      <Text className="text-gray-600 mb-2">Email</Text>
      <TextInput
        placeholder="hello123@gmail.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        className="mb-5 rounded-xl bg-white px-4 py-4 text-gray-700"
      />

      {/* Password Label + Forgot */}
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-gray-600">Password</Text>

        <Pressable onPress={handleForgotPassword} hitSlop={10}>
          <Text className="text-[#76C893] font-semibold">
            Forgot?
          </Text>
        </Pressable>
      </View>

      {/* Password Input + Eye Toggle */}
      <View className="relative mb-8">
        <TextInput
          placeholder="Your secret key"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          className="rounded-xl bg-white px-4 py-4 pr-12 text-gray-700"
        />

        <Pressable
          onPress={() => setShowPassword((prev) => !prev)}
          style={{ position: "absolute", right: 15, top: 18 }}
          hitSlop={10}
        >
          <Ionicons
            name={showPassword ? "eye-off-outline" : "eye-outline"}
            size={22}
            color="gray"
          />
        </Pressable>
      </View>

      {/* Login Button */}
      <Pressable
        onPress={login}
        className="rounded-xl overflow-hidden mb-6"
        disabled={loading}
      >
        <LinearGradient
          colors={["#76C893", "#52B69A"]}
          className="py-4 items-center rounded-xl"
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-lg font-semibold">
              Login
            </Text>
          )}
        </LinearGradient>
      </Pressable>

      {/* Sign Up Link */}
      <Text className="text-center text-gray-500">
        New here?{" "}
        <Text
          className="text-[#76C893] font-semibold"
          onPress={() => router.push("/register")}
        >
          Click Here to Sign Up
        </Text>
      </Text>
    </View>
  );
}