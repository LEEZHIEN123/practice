import { Stack } from "expo-router";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RegistrationProvider } from "@/context/registrationContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RegistrationProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            // Instant screen change on native (no slide animation delay)
            animation: Platform.OS === "web" ? "default" : "none",
          }}
        />
      </RegistrationProvider>
    </SafeAreaProvider>
  );
}