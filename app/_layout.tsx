import { MusicMiniPlayer } from "@/components/MusicMiniPlayer";
import { WorkoutMiniPlayer } from "@/components/WorkoutMiniPlayer";
import { AppearanceProvider, useAppearance } from "@/context/AppearanceContext";
import { MusicPlayerProvider } from "@/context/MusicPlayerContext";
import { WorkoutSessionProvider } from "@/context/WorkoutSessionContext";
import { RegistrationProvider } from "@/context/registrationContext";
import { auth } from "@/firebaseConfig";
import { loadAndSyncAchievements } from "@/lib/achievements";
import { onAuthStateChanged } from "firebase/auth";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "./global.css";

function RootStack() {
  const { isDark, theme } = useAppearance();

  useEffect(() => {
    const syncedUsers = new Set<string>();
    return onAuthStateChanged(auth, (user) => {
      if (!user || syncedUsers.has(user.uid)) return;
      syncedUsers.add(user.uid);
      void loadAndSyncAchievements().catch((error) => {
        syncedUsers.delete(user.uid);
        console.log("Achievement ranking startup sync unavailable:", error);
      });
    });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: Platform.OS === "web" ? "default" : "none",
          contentStyle: { backgroundColor: theme.screenBg },
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <MusicPlayerProvider>
          <WorkoutSessionProvider>
            <RegistrationProvider>
              <RootStack />
            </RegistrationProvider>
            <MusicMiniPlayer />
            <WorkoutMiniPlayer />
          </WorkoutSessionProvider>
        </MusicPlayerProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}