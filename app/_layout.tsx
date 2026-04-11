import { MusicMiniPlayer } from "@/components/MusicMiniPlayer";
import { MusicPlayerProvider } from "@/context/MusicPlayerContext";
import { RegistrationProvider } from "@/context/registrationContext";
import { Stack } from "expo-router";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MusicPlayerProvider>
        <RegistrationProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              // Instant screen change on native (no slide animation delay)
              animation: Platform.OS === "web" ? "default" : "none",
            }}
          />
        </RegistrationProvider>
        <MusicMiniPlayer />
      </MusicPlayerProvider>
    </SafeAreaProvider>
  );
}