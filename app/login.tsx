import { Pressable } from "@/components/Pressable";
import { firebaseAuthErrorMessage } from "@/lib/firebaseAuthErrors";
import { isAdminEmail, syncAdminConfig } from "@/lib/communityService";
import { resolvePostAuthRoute } from "@/lib/onboardingRoute";
import { useScrollFieldAboveKeyboard } from "@/lib/useScrollFieldAboveKeyboard";
import { useLightScreen } from "@/lib/useLightScreen";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    theme,
    cardStyle,
    inputStyle,
    modalCardStyle,
    placeholderColor,
    screenStyle,
    textPrimary,
    textSecondary,
    textAccent,
  } = useLightScreen();
  const { scrollRef, scrollFieldIntoView, scrollBottomPad, onScroll } =
    useScrollFieldAboveKeyboard(8, {
      withKeyboardAvoidingView: true,
      gapAboveKeyboard: 8,
    });
  const emailWrapRef = useRef<View>(null);
  const passwordWrapRef = useRef<View>(null);
  const forgotEmailWrapRef = useRef<View>(null);

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

  const isValidEmailFormat = (v: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  };

  const validateLoginFields = () => {
    const cleanEmail = email.trim().toLowerCase();
    let ok = true;
    if (!cleanEmail) {
      setEmailError("Email is required.");
      ok = false;
    } else if (!isValidEmailFormat(cleanEmail)) {
      setEmailError("Please enter a valid email format (abc@gmail.com).");
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

  const login = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!validateLoginFields()) return;

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      if (isAdminEmail(cleanEmail)) {
        void syncAdminConfig().catch(() => {});
        router.replace("/admin" as any);
      } else {
        const uid = auth.currentUser?.uid;
        const next = uid ? await resolvePostAuthRoute(uid) : "/home";
        router.replace(next as any);
      }
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "auth/invalid-email") {
        Alert.alert("Invalid email", "Please enter a valid email format (abc@gmail.com).");
      } else if (code === "auth/network-request-failed") {
        Alert.alert("Connection error", firebaseAuthErrorMessage(e));
      } else if (code === "auth/user-not-found") {
        Alert.alert(
          "Account not found",
          "This email is not registered yet. Tap Register to create an account first."
        );
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        Alert.alert(
          "Wrong password",
          "The password is incorrect. Use Forgot Password to reset it, or register if you have not created this account yet."
        );
      } else if (code === "auth/too-many-requests") {
        Alert.alert("Too many attempts", "Please wait a few minutes and try again.");
      } else {
        Alert.alert("Login failed", firebaseAuthErrorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  };

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
        `We sent a password reset link to ${cleanEmail}. Please check Inbox, Spam, and Promotions.`
      );
    } catch (error: any) {
      const code = error?.code;

      if (code === "auth/user-not-found") {
        Alert.alert("No account found", "This email is not registered yet.");
      } else if (code === "auth/invalid-email") {
        Alert.alert("Invalid email", "Please enter a valid email address.");
      } else if (code === "auth/too-many-requests") {
        Alert.alert("Too many requests", "Please try again later.");
      } else if (code === "auth/network-request-failed") {
        Alert.alert("Connection error", firebaseAuthErrorMessage(error));
      } else {
        Alert.alert("Error", firebaseAuthErrorMessage(error));
      }
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      style={screenStyle}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <ScrollView
        ref={scrollRef}
        className="flex-1 px-3"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
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

        <Text className="text-3xl font-bold text-center mb-2" style={textPrimary}>
          Login
        </Text>

        <Text className="text-center text-lg mb-8" style={textSecondary}>
          Welcome back!{"\n"}Please enter your email and password to login.
        </Text>

        <View ref={emailWrapRef} className="mb-5">
          <Text className="mb-2 ml-2" style={textPrimary}>
            Email Address
          </Text>
          <TextInput
            placeholder="hello123@gmail.com"
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

        <View ref={passwordWrapRef} className="mb-6">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="ml-2" style={textPrimary}>
              Password
            </Text>

            <Pressable onPress={openForgotPassword} hitSlop={10}>
              <Text className="font-semibold" style={textAccent}>
                Forgot Password?
              </Text>
            </Pressable>
          </View>

          <View className="relative">
            <TextInput
              placeholder="Enter your password here"
              placeholderTextColor={placeholderColor}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (passwordError) setPasswordError("");
              }}
              onFocus={() => scrollFieldIntoView(passwordWrapRef)}
              secureTextEntry={!showPassword}
              className="rounded-xl px-4 py-4 pr-12"
              style={inputStyle}
            />

            <Pressable
              onPress={() => setShowPassword((prev) => !prev)}
              style={{ position: "absolute", right: 15, top: 18 }}
              hitSlop={10}
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

        <Pressable
          onPress={login}
          className={`rounded-full overflow-hidden mb-6 ${loading ? "opacity-60" : "opacity-100"}`}
          disabled={loading}
        >
          <LinearGradient
            colors={[theme.accent, theme.accentText]}
            className="py-4 items-center rounded-2xl"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-lg font-semibold">Login</Text>
            )}
          </LinearGradient>
        </Pressable>

        <Text className="text-center" style={textSecondary}>
          New here?{" "}
          <Text className="font-semibold" style={textAccent} onPress={() => router.push("/register")}>
            Click Here to Register
          </Text>
        </Text>
      </ScrollView>

      <Modal
        visible={forgotVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotVisible(false)}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior="padding"
          style={{ backgroundColor: theme.modalOverlay }}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: 24,
              paddingVertical: 32,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View className="w-full rounded-3xl p-5" style={modalCardStyle}>
              <Text className="text-xl font-extrabold" style={textPrimary}>
                Reset password
              </Text>
              <Text className="mt-2" style={textSecondary}>
                Enter your email and we will send you a reset link.
              </Text>

              <View ref={forgotEmailWrapRef}>
                <TextInput
                  placeholder="hello123@gmail.com"
                  placeholderTextColor={placeholderColor}
                  value={forgotEmail}
                  onChangeText={(v) => {
                    setForgotEmail(v);
                    if (forgotEmailError) setForgotEmailError("");
                  }}
                  onFocus={() => scrollFieldIntoView(forgotEmailWrapRef)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="mt-4 rounded-xl px-4 py-4"
                  style={inputStyle}
                />
                {!!forgotEmailError && (
                  <Text className="text-red-500 text-xs mt-2 ml-2">{forgotEmailError}</Text>
                )}
              </View>

              <Pressable
                onPress={handleForgotPassword}
                disabled={sendingReset}
                className={`mt-4 rounded-full overflow-hidden ${sendingReset ? "opacity-60" : "opacity-100"}`}
              >
                <LinearGradient
                  colors={[theme.accent, theme.accentText]}
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
                className="mt-3 rounded-full py-3.5 items-center border"
                style={cardStyle}
              >
                <Text className="font-semibold" style={textPrimary}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}
