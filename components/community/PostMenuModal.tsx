import { Pressable } from "@/components/Pressable";
import type { CommunityPost } from "@/lib/communityTypes";
import { Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DANGER_COLOR = "#dc2626";
const DEFAULT_COLOR = "#1f2937";

type PostMenuModalProps = {
  visible: boolean;
  post: CommunityPost | null;
  isOwnPost: boolean;
  isAdmin?: boolean;
  canReport?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onEditHistory: () => void;
  onReport: () => void;
  onBlock?: () => void;
};

export function PostMenuModal({
  visible,
  post,
  isOwnPost,
  isAdmin = false,
  canReport = true,
  onClose,
  onEdit,
  onDelete,
  onEditHistory,
  onReport,
  onBlock,
}: PostMenuModalProps) {
  const insets = useSafeAreaInsets();
  if (!post) return null;

  const options = isOwnPost
    ? [
        { label: "Edit Post", onPress: onEdit, danger: false },
        { label: "Delete Post", onPress: onDelete, danger: true },
      ]
    : isAdmin
      ? [
          { label: "View Edit History", onPress: onEditHistory, danger: false },
          ...(onBlock ? [{ label: "Block Post", onPress: onBlock, danger: true as const }] : []),
        ]
      : [
          { label: "View Edit History", onPress: onEditHistory, danger: false },
          ...(canReport ? [{ label: "Report Post", onPress: onReport, danger: true as const }] : []),
        ];

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
                className="text-center text-base font-bold"
                style={{ color: opt.danger ? DANGER_COLOR : DEFAULT_COLOR }}
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
