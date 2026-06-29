import { Pressable } from "@/components/Pressable";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ChatInboxMenuModalProps = {
  visible: boolean;
  chatName: string;
  showDeleteFriend: boolean;
  showAddFriend: boolean;
  onClose: () => void;
  onViewProfile: () => void;
  onClearHistory: () => void;
  onDeleteFriend: () => void;
  onAddFriend: () => void;
};

export function ChatInboxMenuModal({
  visible,
  chatName,
  showDeleteFriend,
  showAddFriend,
  onClose,
  onViewProfile,
  onClearHistory,
  onDeleteFriend,
  onAddFriend,
}: ChatInboxMenuModalProps) {
  const insets = useSafeAreaInsets();
  const { textMuted, theme } = useThemedScreen();
  const { modalCardStyle } = useProfileCardStyles();

  const options: { label: string; onPress: () => void; danger?: boolean }[] = [
    { label: "View Profile", onPress: onViewProfile },
    { label: "Clear Chat History", onPress: onClearHistory, danger: true },
  ];
  if (showAddFriend) {
    options.push({ label: "Add Friend", onPress: onAddFriend });
  }
  if (showDeleteFriend) {
    options.push({ label: "Delete Friend", onPress: onDeleteFriend, danger: true });
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
