import { Pressable } from "@/components/Pressable";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import type { CommunityComment } from "@/lib/communityTypes";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const { textMuted, theme } = useThemedScreen();
  const { modalCardStyle } = useProfileCardStyles();
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
                if (deleting) return;
                onClose();
                opt.onPress();
              }}
              disabled={deleting && opt.danger}
              className="px-5 py-4 border-b"
              style={{ borderBottomColor: theme.cardBorder }}
            >
              {deleting && opt.danger ? (
                <ActivityIndicator color={theme.danger} />
              ) : (
                <Text
                  className="text-center text-base font-bold"
                  style={{ color: opt.danger ? theme.danger : theme.textPrimary }}
                >
                  {opt.label}
                </Text>
              )}
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
