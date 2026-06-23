import { Pressable } from "@/components/Pressable";
import type { CommunityComment } from "@/lib/communityTypes";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DANGER_COLOR = "#dc2626";
const DEFAULT_COLOR = "#1f2937";

type CommentMenuModalProps = {
  visible: boolean;
  comment: CommunityComment | null;
  canDelete: boolean;
  canReport: boolean;
  isAdmin?: boolean;
  canBlock?: boolean;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
  onReport: () => void;
  onBlock?: () => void;
};

export function CommentMenuModal({
  visible,
  comment,
  canDelete,
  canReport,
  isAdmin = false,
  canBlock = false,
  deleting,
  onClose,
  onDelete,
  onReport,
  onBlock,
}: CommentMenuModalProps) {
  const insets = useSafeAreaInsets();
  if (!comment) return null;

  const options: { label: string; onPress: () => void; danger?: boolean }[] = [];
  if (canDelete) {
    options.push({ label: "Delete Comment", onPress: onDelete, danger: true });
  }
  if (canReport && !isAdmin) {
    options.push({ label: "Report Comment", onPress: onReport, danger: true });
  }
  if (isAdmin && canBlock && onBlock) {
    options.push({ label: "Block Comment", onPress: onBlock, danger: true });
  }

  if (options.length === 0) return null;

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
                if (deleting) return;
                onClose();
                opt.onPress();
              }}
              disabled={deleting && opt.danger}
              className="px-5 py-4 border-b border-gray-100 active:bg-gray-50"
            >
              {deleting && opt.danger ? (
                <ActivityIndicator color={DANGER_COLOR} />
              ) : (
                <Text
                  className="text-center text-base font-bold"
                  style={{ color: opt.danger ? DANGER_COLOR : DEFAULT_COLOR }}
                >
                  {opt.label}
                </Text>
              )}
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
