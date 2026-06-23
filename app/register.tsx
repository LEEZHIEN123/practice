// Register.tsx
import { Pressable } from "@/components/Pressable";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { firebaseAuthErrorMessage } from "@/lib/firebaseAuthErrors";
import { useRegistration } from "../context/registrationContext";
import { auth, db } from "../firebaseConfig";

export default function Register() {
  const router = useRouter();
  const { setAccount, reset } = useRegistration();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [policyError, setPolicyError] = useState("");

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const passwordRule = "At least 6 characters";
  const passwordMeetsRule = password.length >= 6;

  const validateFields = () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    let ok = true;

    if (!cleanName) {
      setNameError("Full name is required.");
      ok = false;
    } else {
      setNameError("");
    }

    if (!cleanEmail) {
      setEmailError("Email is required.");
      ok = false;
    } else if (!isValidEmail(cleanEmail)) {
      setEmailError("Please enter a valid email format (abc@gmail.com).");
      ok = false;
    } else {
      setEmailError("");
    }

    if (!password) {
      setPasswordError("Password is required.");
      ok = false;
    } else if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      ok = false;
    } else {
      setPasswordError("");
    }

    if (!confirmPassword) {
      setConfirmPasswordError("Please confirm your password.");
      ok = false;
    } else if (confirmPassword !== password) {
      setConfirmPasswordError("Passwords do not match.");
      ok = false;
    } else {
      setConfirmPasswordError("");
    }

    if (!acceptedPolicy) {
      setPolicyError("You must accept the Terms of Service.");
      ok = false;
    } else {
      setPolicyError("");
    }

    return ok;
  };

  const register = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!validateFields()) return;

    try {
      setLoading(true);

      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await cred.user.getIdToken(true);

      try {
        await setDoc(
          doc(db, "users", cred.user.uid),
          {
            name: name.trim(),
            email: cred.user.email ?? cleanEmail,
            createdAt: Date.now(),
          },
          { merge: true }
        );
      } catch (e) {
        try {
          await deleteUser(cred.user);
        } catch {}
        throw e;
      }

      reset();
      setAccount({
        name: name.trim(),
        email: cleanEmail,
        password,
      });

      router.push("/profiledetails");
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === "permission-denied") {
        Alert.alert(
          "Firestore: permission denied",
          "Your account was created but your profile data could not be saved. Please check your Firestore rules."
        );
      } else if ((e as { code?: string })?.code === "auth/email-already-in-use") {
        Alert.alert("Email Exists", firebaseAuthErrorMessage(e));
      } else {
        Alert.alert("Error", firebaseAuthErrorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#f4fcf7]"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
         <View className="items-center mb-6">
                <View className="w-28 h-28 bg-white rounded-full items-center justify-center shadow-lg">
                  <Ionicons name="person" size={50} color="#76C893" />
                </View>
              </View>

        <Text className="text-3xl font-bold text-center text-gray-800">Create Account</Text>
        <Text className="text-center text-lg text-gray-500 mb-8">Join us to start your fitness journey!</Text>

        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-gray-800 ml-2">Full Name</Text>
          <Text className="text-sm text-gray-500 font-semibold mr-2">
            {Math.min(name.length, 14)}/14
          </Text>
        </View>
        <TextInput
          placeholder="Jane Doe"
          value={name}
          onChangeText={(v) => {
            setName(v.slice(0, 14));
            if (nameError) setNameError("");
          }}
          maxLength={14}
          className="mb-4 rounded-xl bg-white px-4 py-4 text-gray-700"
        />
        {!!nameError && <Text className="text-red-500 text-xs -mt-3 mb-3 ml-2">{nameError}</Text>}

        <Text className="text-gray-800 mb-2 ml-2">Email Address</Text>
        <TextInput
          placeholder="jane@gmail.com"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (emailError) setEmailError("");
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          className="mb-4 rounded-xl bg-white px-4 py-4 text-gray-700"
        />
        {!!emailError && <Text className="text-red-500 text-xs -mt-3 mb-3 ml-2">{emailError}</Text>}

        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-gray-800 ml-2">Password</Text>
          <View className="flex-row items-center flex-1 justify-end ml-2">
            <Text className="text-xs text-gray-600 mr-1.5 text-right">{passwordRule}</Text>
            {passwordMeetsRule ? <Ionicons name="checkmark-circle" size={18} color="#76C893" /> : null}
          </View>
        </View>
        <View className="relative mb-4">
          <TextInput
            placeholder="abc123"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (passwordError) setPasswordError("");
              if (confirmPassword.length > 0) {
                setConfirmPasswordError(v === confirmPassword ? "" : "Passwords do not match.");
              }
            }}
            secureTextEntry={!showPassword}
            className="rounded-xl bg-white px-4 py-4 pr-12 text-gray-700"
          />
          <Pressable onPress={() => setShowPassword((p) => !p)} style={{ position: "absolute", right: 15, top: 18 }}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="gray" />
          </Pressable>
        </View>
        {!!passwordError && <Text className="text-red-500 text-xs -mt-3 mb-3 ml-2">{passwordError}</Text>}

        <Text className="text-gray-800 mb-2 ml-2">Confirm Password</Text>
        <View className="relative mb-4">
          <TextInput
            placeholder="abc123"
            value={confirmPassword}
            onChangeText={(v) => {
              setConfirmPassword(v);
              if (!v) {
                setConfirmPasswordError("");
                return;
              }
              setConfirmPasswordError(v === password ? "" : "Passwords do not match.");
            }}
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
        {!!confirmPasswordError && <Text className="text-red-500 text-xs -mt-3 mb-4 ml-2">{confirmPasswordError}</Text>}

        <View className="flex-row items-start mb-2">
          <Pressable
            onPress={() => {
              setAcceptedPolicy((v) => !v);
              if (policyError) setPolicyError("");
            }}
            hitSlop={8}
            className="mr-3 mt-0.5"
          >
            <View
              className={`w-6 h-6 ml-1 rounded-md border-2 items-center justify-center ${
                acceptedPolicy ? "bg-[#76C893] border-[#76C893]" : "border-gray-400 bg-white"
              }`}
            >
              {acceptedPolicy ? <Ionicons name="checkmark" size={16} color="white" /> : null}
            </View>
          </Pressable>
          <Text className="flex-1 text-gray-600 text-sm leading-5">
            By continuing, I accept the{" "}
            <Text
              className="text-[#76C893] font-semibold"
              onPress={() => {
                setAcceptedPolicy(true);
                if (policyError) setPolicyError("");
                router.push("/terms-of-service" as any);
              }}
            >
              Terms of Service
            </Text>{" "}
            of the Personalised Workout and Nutrition Guidance System.
             
          </Text>
        </View>
        {!!policyError && <Text className="text-red-500 text-xs mb-4 ml-2">{policyError}</Text>}

        <Pressable
          onPress={register}
          disabled={loading}
          className={`rounded-full overflow-hidden mt-2 mb-6 ${loading ? "opacity-60" : "opacity-100"}`}
        >
          <LinearGradient colors={["#76C893", "#52B69A"]} className="py-4 items-center rounded-2xl">
            {loading ? <ActivityIndicator color="white" /> : <Text className="text-white text-lg font-semibold">Register</Text>}
          </LinearGradient>
        </Pressable>

        <Text className="text-center text-gray-500">
          Already have an account?{" "}
          <Text className="text-[#76C893] font-semibold" onPress={() => router.replace("/login")}>
            Click Here to Login
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}