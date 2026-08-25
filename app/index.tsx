import { Pressable } from "@/components/Pressable";
import { checkIsAdmin } from "@/lib/communityService";
import { warmHomeUserCacheFromUserDataSync } from "@/lib/homeUserCache";
import { isOnboardingGate } from "@/lib/onboardingGate";
import { isOnboardingPath, resolvePostAuthRouteFromData } from "@/lib/onboardingRoute";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { auth, db } from "../firebaseConfig";

export default function WelcomeScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const [checkingSession, setCheckingSession] = useState(true);

  pathnameRef.current = pathname;

  const handleGetStarted = () => {
    router.push("/login");
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setCheckingSession(false);
        return;
      }

      // Sync gate — do not race React state during register → profile details.
      if (isOnboardingGate()) {
        setCheckingSession(false);
        return;
      }

      const currentPath = pathnameRef.current;
      // Only auto-route from the welcome screen itself — never while onboarding.
      if (currentPath !== "/" && currentPath !== "/index") {
        setCheckingSession(false);
        return;
      }
      if (isOnboardingPath(currentPath)) {
        setCheckingSession(false);
        return;
      }

      void (async () => {
        try {
          let admin = false;
          try {
            admin = await checkIsAdmin(user);
          } catch {
            admin = false;
          }
          if (isOnboardingGate()) return;
          if (admin) {
            router.replace("/admin" as any);
            return;
          }
          try {
            const snap = await getDoc(doc(db, "users", user.uid));
            const userData = snap.exists()
              ? (snap.data() as Record<string, unknown>)
              : {};
            warmHomeUserCacheFromUserDataSync(user.uid, userData);
            const next = resolvePostAuthRouteFromData(userData);
            if (isOnboardingGate()) return;
            // Never land on Home while registration is incomplete.
            if (next === "/home" && isOnboardingGate()) return;
            router.replace(next as any);
            return;
          } catch {
            // Home still loads from Firestore / disk cache.
          }
          if (isOnboardingGate()) return;
          router.replace("/profiledetails");
        } catch {
          if (isOnboardingGate()) return;
          router.replace("/profiledetails");
        }
      })();
    });
    return unsub;
  }, [router]);

  if (checkingSession) {
    return (
      <LinearGradient
        colors={["#f4fcf7", "#e3f6eb"]}
        className="flex-1 items-center justify-center px-3"
      >
        <ActivityIndicator size="large" color="#76C893" />
        <Text className="text-gray-500 text-base mt-4">Loading…</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={["#f4fcf7", "#e3f6eb"]}
      className="flex-1 items-center justify-center px-3"
    >
      <View className="w-full max-w-md items-center">
        <Image
          source={require("../assets/images/fitness logo.jpg")}
          className="w-40 h-40 mb-6 rounded-2xl"
          resizeMode="contain"
        />
        <Text className="text-2xl font-extrabold text-green-700 text-center leading-10">
          Personalised Workout and {"\n"} Nutrition Guidance Application
        </Text>
        <Text className="text-lg text-gray-600 text-center mt-4 mb-10">
          Track your journey to achieve your fitness goals.
        </Text>

        <Pressable onPress={handleGetStarted} className="rounded-full overflow-hidden">
          <LinearGradient colors={["#76C893", "#52B69A"]} className="px-12 py-4 items-center rounded-2xl">
            <Text className="text-white text-lg font-semibold">Get Started</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </LinearGradient>
  );
}
