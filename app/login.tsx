import { Pressable } from "@/components/Pressable";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Text, TextInput, View } from "react-native";
import { auth } from "../firebaseConfig";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [forgotEmailError, setForgotEmailError] = useState("");

  const validateLoginFields = () => {
    const cleanEmail = email.trim().toLowerCase();
    let ok = true;
    if (!cleanEmail) {
      setEmailError("Email is required.");
      ok = false;
    } else {
      setEmailError("");
    }
    if (!password) {
      setPasswordError("Password is required.");
      ok = false;
    } else {
      setPasswordError("");
    }
    return ok;
  };

  // ✅ Login
  const login = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!validateLoginFields()) return;

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
  const openForgotPassword = () => {
    setForgotEmail(email.trim().toLowerCase());
    setForgotEmailError("");
    setForgotVisible(true);
  };

  const handleForgotPassword = async () => {
    const cleanEmail = forgotEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setForgotEmailError("Please enter your email.");
      return;
    }
    setForgotEmailError("");

    try {
      setSendingReset(true);
      await sendPasswordResetEmail(auth, cleanEmail);
      setForgotVisible(false);
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
      setSendingReset(false);
    }
  };

  return (
    <View className="flex-1 bg-[#f4fcf7] justify-center px-3">
      {/* Profile Icon */}
      <View className="items-center mb-6">
        <View className="w-28 h-28 bg-white rounded-full items-center justify-center shadow-lg">
          <Ionicons name="person" size={50} color="#76C893" />
        </View>
      </View>

      {/* Title */}
      <Text className="text-3xl font-bold text-center text-gray-800 mb-2">
        Login
      </Text>

      <Text className="text-center text-gray-500 mb-8">
        Welcome back!{"\n"}Enter your email and password to login.
      </Text>
    
      {/* Email */}
      <Text className="text-gray-800 mb-2">Email</Text>
      <View className="mb-5">
        <TextInput
          placeholder="hello123@gmail.com"
          placeholderTextColor="#b8c4bd"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (emailError) setEmailError("");
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          className="rounded-xl bg-white px-4 py-4 text-gray-700"
        />
        {!!emailError && <Text className="text-red-500 text-xs mt-1">{emailError}</Text>}
      </View>

      {/* Password Label + Forgot */}
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-gray-800">Password</Text>

        <Pressable onPress={openForgotPassword} hitSlop={10}>
          <Text className="text-[#76C893] font-semibold">
            Forgot Password?
          </Text>
        </Pressable>
      </View>

      {/* Password Input + Eye Toggle */}
      <View className="mb-6">
        <View className="relative">
          <TextInput
            placeholder="Enter your password here"
            placeholderTextColor="#b8c4bd"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (passwordError) setPasswordError("");
            }}
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
        {!!passwordError && <Text className="text-red-500 text-xs mt-1">{passwordError}</Text>}
      </View>

      {/* Login Button */}
      <Pressable
        onPress={login}
        className={`rounded-full overflow-hidden mb-6 ${loading ? "opacity-60" : "opacity-100"}`}
        disabled={loading}
      >
        <LinearGradient
          colors={["#76C893", "#52B69A"]}
          className="py-4 items-center rounded-2xl"
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
          Click Here to Register
        </Text>
      </Text>

      <Modal
        visible={forgotVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotVisible(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/35 px-6">
          <View className="w-full rounded-3xl bg-white p-5 border border-gray-100">
            <Text className="text-xl font-extrabold text-gray-900">Reset password</Text>
            <Text className="text-gray-500 mt-2">
              Enter your email and we will send you a reset link.
            </Text>

            <TextInput
              placeholder="hello123@gmail.com"
              placeholderTextColor="#b8c4bd"
              value={forgotEmail}
              onChangeText={(v) => {
                setForgotEmail(v);
                if (forgotEmailError) setForgotEmailError("");
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              className="mt-4 rounded-xl bg-[#f7faf8] px-4 py-4 text-gray-700 border border-gray-200"
            />
            {!!forgotEmailError && <Text className="text-red-500 text-xs mt-2">{forgotEmailError}</Text>}

            <Pressable
              onPress={handleForgotPassword}
              disabled={sendingReset}
              className={`mt-4 rounded-full overflow-hidden ${sendingReset ? "opacity-60" : "opacity-100"}`}
            >
              <LinearGradient
                colors={["#76C893", "#52B69A"]}
                className="py-4 items-center rounded-2xl"
              >
                {sendingReset ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white text-lg font-semibold">Send Reset Link</Text>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={() => setForgotVisible(false)}
              disabled={sendingReset}
              className="mt-3 rounded-full py-3.5 items-center border border-gray-200 bg-white"
            >
              <Text className="text-gray-700 font-semibold">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}