import { MusicMiniPlayer } from "@/components/MusicMiniPlayer";
import { AppearanceProvider, useAppearance } from "@/context/AppearanceContext";
import { MusicPlayerProvider } from "@/context/MusicPlayerContext";
import { RegistrationProvider } from "@/context/registrationContext";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "./global.css";

function RootStack() {
  const { isDark, theme } = useAppearance();

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
          <RegistrationProvider>
            <RootStack />
          </RegistrationProvider>
          <MusicMiniPlayer />
        </MusicPlayerProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}