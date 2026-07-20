import { ThemedText, useProfileCardStyles } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { ActivityIndicator, Modal, View } from "react-native";

type PlanGeneratingModalProps = {
  visible: boolean;
  subtitle?: string;
};

export function PlanGeneratingModal({
  visible,
  subtitle = "Building your personalised plan…",
}: PlanGeneratingModalProps) {
  const { theme } = useThemedScreen();
  const { modalCardStyle } = useProfileCardStyles();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: theme.modalOverlay }}
      >
        <View className="w-full rounded-3xl p-8 items-center" style={modalCardStyle}>
          <ActivityIndicator color={theme.accent} size="large" />
          <ThemedText className="text-lg font-extrabold mt-4">Generating</ThemedText>
          <ThemedText variant="muted" className="mt-2 text-center leading-6">
            {subtitle}
          </ThemedText>
        </View>
      </View>
    </Modal>
  );
}
