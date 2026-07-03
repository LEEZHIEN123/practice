import { ProfileScreenHeader, ThemedCard, ThemedScreen, ThemedText } from "@/components/themed/ThemedUi";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export default function ComingSoonScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ title?: string }>();
  const title = typeof params.title === "string" && params.title.trim() ? params.title : "Coming Soon";

  return (
    <ThemedScreen>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12 }}>
        <ProfileScreenHeader title={title} onBack={() => router.back()} titleClassName="text-3xl" />
      </View>

      <View className="flex-1 items-center justify-center px-8">
        <ThemedCard className="w-20 h-20 items-center justify-center" rounded="2xl">
          <Ionicons name="time-outline" size={34} color="#76C893" />
        </ThemedCard>
        <ThemedText className="text-2xl font-extrabold mt-5 text-center">Coming soon</ThemedText>
        <ThemedText variant="muted" className="mt-2 text-center leading-6">
          {"We're working on this feature. Check back in a future update."}
        </ThemedText>
      </View>
    </ThemedScreen>
  );
}
