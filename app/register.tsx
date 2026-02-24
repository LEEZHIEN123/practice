// Register.tsx
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { auth, db } from "../firebaseConfig";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

export default function Register() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const register = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!name.trim()) return Alert.alert("Name required", "Please enter your name.");
    if (!cleanEmail) return Alert.alert("Email required", "Please enter your email.");
    if (!isValidEmail(cleanEmail))
      return Alert.alert("Invalid Email", "Please enter a valid email format (example: name@gmail.com).");
    if (!password) return Alert.alert("Password required", "Please enter your password.");
    if (password.length < 6) return Alert.alert("Weak Password", "Password must be at least 6 characters.");
    if (password !== confirmPassword) return Alert.alert("Password mismatch", "Passwords do not match.");

    try {
      setLoading(true);

      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);

      await setDoc(doc(db, "users", cred.user.uid), {
        name: name.trim(),
        email: cred.user.email,
        createdAt: Date.now(),
        // profile fields will be added in /profile-details
      });

      // ✅ Go to profile details page after sign up
      router.push("/profiledetails");
      
    } catch (e: any) {
      if (e?.code === "auth/email-already-in-use") {
        Alert.alert("Email Exists", "This email is already registered.");
      } else {
        Alert.alert("Error", e?.message ?? "Registration failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#eef2f1]"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="flex-1 justify-center px-6">
         <View className="items-center mb-6">
                <View className="w-28 h-28 bg-white rounded-full items-center justify-center shadow-lg">
                  <Ionicons name="person" size={50} color="#76C893" />
                </View>
              </View>

        <Text className="text-3xl font-bold text-center text-gray-800">Create Account</Text>
        <Text className="text-center text-gray-500 mb-8">Join us to start your fitness journey</Text>

        <Text className="text-gray-600 mb-2">FULL NAME</Text>
        <TextInput
          placeholder="Jane Doe"
          value={name}
          onChangeText={setName}
          className="mb-4 rounded-xl bg-white px-4 py-4 text-gray-700"
        />

        <Text className="text-gray-600 mb-2">EMAIL ADDRESS</Text>
        <TextInput
          placeholder="jane@gmail.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          className="mb-4 rounded-xl bg-white px-4 py-4 text-gray-700"
        />

        <Text className="text-gray-600 mb-2">PASSWORD</Text>
        <View className="relative mb-4">
          <TextInput
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            className="rounded-xl bg-white px-4 py-4 pr-12 text-gray-700"
          />
          <Pressable onPress={() => setShowPassword((p) => !p)} style={{ position: "absolute", right: 15, top: 18 }}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="gray" />
          </Pressable>
        </View>

        <Text className="text-gray-600 mb-2">CONFIRM PASSWORD</Text>
        <View className="relative mb-6">
          <TextInput
            placeholder="••••••••"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
            className="rounded-xl bg-white px-4 py-4 pr-12 text-gray-700"
          />
          <Pressable
            onPress={() => setShowConfirmPassword((p) => !p)}
            style={{ position: "absolute", right: 15, top: 18 }}
          >
            <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={22} color="gray" />
          </Pressable>
        </View>

        <Pressable onPress={register} disabled={loading} className="rounded-xl overflow-hidden mb-6">
          <LinearGradient colors={["#76C893", "#52B69A"]} className="py-4 items-center rounded-xl">
            {loading ? <ActivityIndicator color="white" /> : <Text className="text-white text-lg font-semibold">Sign Up</Text>}
          </LinearGradient>
        </Pressable>

        <Text className="text-center text-gray-500">
          Already have an account?{" "}
          <Text className="text-[#76C893] font-semibold" onPress={() => router.replace("/login")}>
            Click Here to Log In
          </Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}