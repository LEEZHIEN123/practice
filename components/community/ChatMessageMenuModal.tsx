import { Pressable } from "@/components/Pressable";
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
      <View className="flex-1 bg-black/40 justify-center px-8">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View
          className="bg-white rounded-[24px] overflow-hidden border border-gray-200"
          style={{ marginBottom: insets.bottom }}
        >
          {options.map((opt) => (
            <Pressable
              key={opt.label}
              onPress={() => {
                onClose();
                opt.onPress();
              }}
              className="px-5 py-4 border-b border-gray-100 active:bg-gray-50"
            >
              <Text
                className={`text-center text-base font-bold ${
                  opt.danger ? "text-[#dc2626]" : "text-gray-800"
                }`}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} className="px-5 py-4 active:bg-gray-50">
            <Text className="text-center text-base font-bold text-gray-500">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
