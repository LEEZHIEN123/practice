import { Pressable } from "@/components/Pressable";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import type { CommunityPost } from "@/lib/communityTypes";
import { Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const { textMuted, theme } = useThemedScreen();
  const { modalCardStyle } = useProfileCardStyles();
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
