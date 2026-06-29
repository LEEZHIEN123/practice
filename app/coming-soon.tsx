import { ThemedBackButton, ThemedCard, ThemedScreen, ThemedText } from "@/components/themed/ThemedUi";
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
      <View style={{ paddingTop: insets.top + 8 }} className="px-3 pb-4 flex-row items-center">
        <ThemedBackButton onPress={() => router.back()} className="w-11 h-11 mr-3" />
        <ThemedText className="text-3xl font-extrabold">{title}</ThemedText>
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
