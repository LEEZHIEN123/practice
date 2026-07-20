import { ThemedCard, ThemedText } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { ActivityIndicator, View } from "react-native";

type PlanGeneratingCardProps = {
  /** Short subtitle under the Generating label. */
  subtitle?: string;
};

export function PlanGeneratingCard({
  subtitle = "Building your personalised plan…",
}: PlanGeneratingCardProps) {
  const { theme } = useThemedScreen();

  return (
    <ThemedCard className="p-8 items-center">
      <ActivityIndicator color={theme.accent} size="large" />
      <View className="flex-row items-center mt-4">
        <ThemedText className="text-lg font-extrabold">Generating</ThemedText>
      </View>
      <ThemedText variant="muted" className="mt-2 text-center leading-6">
        {subtitle}
      </ThemedText>
    </ThemedCard>
  );
}
