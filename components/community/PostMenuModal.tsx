import { Pressable } from "@/components/Pressable";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import type { CommunityPost } from "@/lib/communityTypes";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MenuOption = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
};

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

  const options: MenuOption[] = isOwnPost
    ? [
        { label: "Edit Post", icon: "create-outline", onPress: onEdit },
        { label: "Delete Post", icon: "trash-outline", onPress: onDelete, danger: true },
      ]
    : isAdmin
      ? [
          { label: "View Edit History", icon: "time-outline", onPress: onEditHistory },
          ...(onBlock
            ? [{ label: "Block Post", icon: "ban-outline" as const, onPress: onBlock, danger: true as const }]
            : []),
        ]
      : [
          { label: "View Edit History", icon: "time-outline", onPress: onEditHistory },
          ...(canReport
            ? [{ label: "Report Post", icon: "flag-outline" as const, onPress: onReport, danger: true as const }]
            : []),
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
              className="px-5 py-4 border-b flex-row items-center justify-center gap-2"
              style={{ borderBottomColor: theme.cardBorder }}
            >
              <Ionicons
                name={opt.icon}
                size={20}
                color={opt.danger ? theme.danger : theme.textPrimary}
              />
              <Text
                className="text-base font-bold"
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
