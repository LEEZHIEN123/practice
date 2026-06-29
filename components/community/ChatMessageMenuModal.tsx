import { Pressable } from "@/components/Pressable";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import type { ChatMessage } from "@/lib/communityTypes";
import { Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ChatMessageMenuModalProps = {
  visible: boolean;
  message: ChatMessage | null;
  canEdit: boolean;
  canRecall: boolean;
  canQuote: boolean;
  onClose: () => void;
  onQuote: () => void;
  onEdit: () => void;
  onRecall: () => void;
};

export function ChatMessageMenuModal({
  visible,
  message,
  canEdit,
  canRecall,
  canQuote,
  onClose,
  onQuote,
  onEdit,
  onRecall,
}: ChatMessageMenuModalProps) {
  const insets = useSafeAreaInsets();
  const { textMuted, theme } = useThemedScreen();
  const { modalCardStyle } = useProfileCardStyles();
  if (!message) return null;

  const options: { label: string; onPress: () => void; danger?: boolean }[] = [];
  if (canEdit) {
    options.push({ label: "Edit message", onPress: onEdit });
  }
  if (canQuote) {
    options.push({ label: "Quote message", onPress: onQuote });
  }
  if (canRecall) {
    options.push({ label: "Recall message", onPress: onRecall, danger: true });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center px-8" style={{ backgroundColor: theme.modalOverlay }}>
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View
          className="rounded-[24px] overflow-hidden"
          style={[modalCardStyle, { marginBottom: insets.bottom }]}
        >
          {options.map((opt) => (
            <Pressable
              key={opt.label}
              onPress={() => {
                onClose();
                opt.onPress();
              }}
              className="px-5 py-4 border-b"
              style={{ borderBottomColor: theme.cardBorder }}
            >
              <Text
                className="text-center text-base font-bold"
                style={{ color: opt.danger ? theme.danger : theme.textPrimary }}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} className="px-5 py-4">
            <Text className="text-center text-base font-bold" style={textMuted}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
