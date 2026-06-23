import { Pressable } from "@/components/Pressable";
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
