import { Pressable } from "@/components/Pressable";
import { registerAccountEmail } from "@/lib/accountEmailRegistry";
import { firebaseAuthErrorMessage } from "@/lib/firebaseAuthErrors";
import { setOnboardingGate } from "@/lib/onboardingGate";
import { useLightScreen } from "@/lib/useLightScreen";
import { useScrollFieldAboveKeyboard } from "@/lib/useScrollFieldAboveKeyboard";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, deleteUser, type User } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegistration } from "../context/registrationContext";
import { auth, db } from "../firebaseConfig";

export default function Register() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setAccount, setOnboardingInProgress } = useRegistration();
  const {
    theme,
    screenStyle,
    cardStyle,
    inputStyle,
    placeholderColor,
    textPrimary,
    textSecondary,
    textMuted,
    textAccent,
  } = useLightScreen();
  const { scrollRef, scrollFieldIntoView, scrollBottomPad, onScroll } =
    useScrollFieldAboveKeyboard();
  const nameWrapRef = useRef<View>(null);
  const emailWrapRef = useRef<View>(null);
  const passwordWrapRef = useRef<View>(null);
  const confirmPasswordWrapRef = useRef<View>(null);

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

  const persistNewUserProfile = (user: User, trimmedName: string, cleanEmail: string) => {
    const email = user.email ?? cleanEmail;
    void Promise.all([
      setDoc(
        doc(db, "users", user.uid),
        {
          name: trimmedName,
          email,
          createdAt: Date.now(),
          onboardingComplete: false,
        },
        { merge: true }
      ),
      registerAccountEmail(user.uid, email),
    ]).catch(async (e: unknown) => {
      setOnboardingGate(false);
      setOnboardingInProgress(false);
      try {
        await deleteUser(user);
      } catch {}
      if ((e as { code?: string })?.code === "permission-denied") {
        Alert.alert(
          "Firestore: permission denied",
          "Your Firestore security rules are blocking saving the new profile. In Firebase Console → Firestore Database → Rules, publish the rules from the firestore.rules file in this project (or run: npx firebase deploy --only firestore:rules)."
        );
      } else {
        Alert.alert("Error", firebaseAuthErrorMessage(e));
      }
      router.replace("/register");
    });
  };

  const register = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!validateFields()) return;

    try {
      setLoading(true);

      // Sync gate first so auth listeners cannot send the user to Home
      // (React state alone is too late — createUser fires listeners before re-render).
      setOnboardingGate(true);
      setOnboardingInProgress(true);
      setAccount({
        name: name.trim(),
        email: cleanEmail,
        password,
      });

      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const trimmedName = name.trim();

      router.replace("/profiledetails");
      setLoading(false);
      persistNewUserProfile(cred.user, trimmedName, cleanEmail);
    } catch (e: unknown) {
      setOnboardingGate(false);
      setOnboardingInProgress(false);
      if ((e as { code?: string })?.code === "permission-denied") {
        Alert.alert(
          "Firestore: permission denied",
          "Your Firestore security rules are blocking saving the new profile. In Firebase Console → Firestore Database → Rules, publish the rules from the firestore.rules file in this project (or run: npx firebase deploy --only firestore:rules)."
        );
      } else if ((e as { code?: string })?.code === "auth/email-already-in-use") {
        Alert.alert("Email Exists", firebaseAuthErrorMessage(e));
      } else {
        Alert.alert("Error", firebaseAuthErrorMessage(e));
      }
      router.replace("/register");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      style={screenStyle}
      behavior="padding"
    >
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
          paddingBottom: scrollBottomPad,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={(event) => onScroll(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center mb-6">
          <View
            className="w-28 h-28 rounded-full items-center justify-center shadow-lg"
            style={cardStyle}
          >
            <Ionicons name="person" size={50} color={theme.accent} />
          </View>
        </View>

        <Text className="text-3xl font-bold text-center" style={textPrimary}>
          Create Account
        </Text>
        <Text className="text-center text-lg mb-8" style={textSecondary}>
          Join us to start your fitness journey!
        </Text>

        <View ref={nameWrapRef} className="mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="ml-2" style={textPrimary}>
              Full Name
            </Text>
            <Text className="text-sm font-semibold mr-2" style={textMuted}>
              {Math.min(name.length, 14)}/14
            </Text>
          </View>
          <TextInput
            placeholder="Jane Doe"
            placeholderTextColor={placeholderColor}
            value={name}
            onChangeText={(v) => {
              setName(v.slice(0, 14));
              if (nameError) setNameError("");
            }}
            onFocus={() => scrollFieldIntoView(nameWrapRef)}
            maxLength={14}
            className="rounded-xl px-4 py-4"
            style={inputStyle}
          />
          {!!nameError && (
            <Text className="text-red-500 text-xs mt-1 ml-2">{nameError}</Text>
          )}
        </View>

        <View ref={emailWrapRef} className="mb-4">
          <Text className="mb-2 ml-2" style={textPrimary}>
            Email Address
          </Text>
          <TextInput
            placeholder="jane@gmail.com"
            placeholderTextColor={placeholderColor}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (emailError) setEmailError("");
            }}
            onFocus={() => scrollFieldIntoView(emailWrapRef)}
            autoCapitalize="none"
            keyboardType="email-address"
            className="rounded-xl px-4 py-4"
            style={inputStyle}
          />
          {!!emailError && (
            <Text className="text-red-500 text-xs mt-1 ml-2">{emailError}</Text>
          )}
        </View>

        <View ref={passwordWrapRef} className="mb-4">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="ml-2" style={textPrimary}>
              Password
            </Text>
            <View className="flex-row items-center flex-1 justify-end ml-2">
              <Text className="text-xs mr-1.5 text-right" style={textSecondary}>
                {passwordRule}
              </Text>
              {passwordMeetsRule ? (
                <Ionicons name="checkmark-circle" size={18} color={theme.accent} />
              ) : null}
            </View>
          </View>
          <View className="relative">
            <TextInput
              placeholder="abc123"
              placeholderTextColor={placeholderColor}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (passwordError) setPasswordError("");
                if (confirmPassword.length > 0) {
                  setConfirmPasswordError(v === confirmPassword ? "" : "Passwords do not match.");
                }
              }}
              onFocus={() => scrollFieldIntoView(passwordWrapRef)}
              secureTextEntry={!showPassword}
              className="rounded-xl px-4 py-4 pr-12"
              style={inputStyle}
            />
            <Pressable
              onPress={() => setShowPassword((p) => !p)}
              style={{ position: "absolute", right: 15, top: 18 }}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={22}
                color={theme.iconMuted}
              />
            </Pressable>
          </View>
          {!!passwordError && (
            <Text className="text-red-500 text-xs mt-1 ml-2">{passwordError}</Text>
          )}
        </View>

        <View ref={confirmPasswordWrapRef} className="mb-4">
          <Text className="mb-2 ml-2" style={textPrimary}>
            Confirm Password
          </Text>
          <View className="relative">
            <TextInput
              placeholder="abc123"
              placeholderTextColor={placeholderColor}
              value={confirmPassword}
              onChangeText={(v) => {
                setConfirmPassword(v);
                if (!v) {
                  setConfirmPasswordError("");
                  return;
                }
                setConfirmPasswordError(v === password ? "" : "Passwords do not match.");
              }}
              onFocus={() => scrollFieldIntoView(confirmPasswordWrapRef)}
              secureTextEntry={!showConfirmPassword}
              className="rounded-xl px-4 py-4 pr-12"
              style={inputStyle}
            />
            <Pressable
              onPress={() => setShowConfirmPassword((p) => !p)}
              style={{ position: "absolute", right: 15, top: 18 }}
            >
              <Ionicons
                name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                size={22}
                color={theme.iconMuted}
              />
            </Pressable>
          </View>
          {!!confirmPasswordError && (
            <Text className="text-red-500 text-xs mt-1 ml-2">{confirmPasswordError}</Text>
          )}
        </View>

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
              className="w-6 h-6 ml-1 rounded-md border-2 items-center justify-center"
              style={
                acceptedPolicy
                  ? { backgroundColor: theme.accent, borderColor: theme.accent }
                  : cardStyle
              }
            >
              {acceptedPolicy ? <Ionicons name="checkmark" size={16} color="white" /> : null}
            </View>
          </Pressable>
          <Text className="flex-1 text-sm leading-5" style={textSecondary}>
            By continuing, I accept the{" "}
            <Text
              className="font-semibold"
              style={textAccent}
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
        {!!policyError && (
          <Text className="text-red-500 text-xs mb-4 ml-2">{policyError}</Text>
        )}

        <Pressable
          onPress={register}
          disabled={loading}
          className={`rounded-full overflow-hidden mt-2 mb-6 ${loading ? "opacity-60" : "opacity-100"}`}
        >
          <LinearGradient
            colors={[theme.accent, theme.accentText]}
            className="py-4 items-center rounded-2xl"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-lg font-semibold">Register</Text>
            )}
          </LinearGradient>
        </Pressable>

        <Text className="text-center" style={textSecondary}>
          Already have an account?{" "}
          <Text className="font-semibold" style={textAccent} onPress={() => router.replace("/login")}>
            Click Here to Login
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
