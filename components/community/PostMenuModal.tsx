import { Pressable } from "@/components/Pressable";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import type { CommunityPost } from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
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
  onShare?: () => void;
  onBlock?: () => void;
  onRequestReReview?: () => void;
  onToggleAuthorHidden?: () => void;
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
  onShare,
  onBlock,
  onRequestReReview,
  onToggleAuthorHidden,
}: PostMenuModalProps) {
  const insets = useSafeAreaInsets();
  const { textMuted, theme } = useThemedScreen();
  const { modalCardStyle } = useProfileCardStyles();
  if (!post) return null;

  const options: MenuOption[] = isOwnPost
    ? [
        ...(post.blocked && onRequestReReview && !post.underReview
          ? [
              {
                label: "Request check again",
                icon: "alert-circle-outline" as const,
                onPress: onRequestReReview,
              },
            ]
          : []),
        // Pending review / blocked: author may still delete, but not edit or share.
        ...(!post.blocked && !post.underReview
          ? [{ label: "Edit Post", icon: "create-outline" as const, onPress: onEdit }]
          : []),
        ...(!post.blocked && onToggleAuthorHidden
          ? [
              {
                label: post.authorHidden
                  ? "Show to community"
                  : "Hide from everyone",
                icon: post.authorHidden
                  ? ("eye-outline" as const)
                  : ("eye-off-outline" as const),
                onPress: onToggleAuthorHidden,
              },
            ]
          : []),
        ...(onShare && !post.blocked && !post.underReview && !post.authorHidden
          ? [{ label: "Share Post", icon: "share-social-outline" as const, onPress: onShare }]
          : []),
        { label: "Delete Post", icon: "trash-outline", onPress: onDelete, danger: true },
      ]
    : isAdmin
      ? [
          { label: "View Edit History", icon: "time-outline", onPress: onEditHistory },
          ...(onShare ? [{ label: "Share Post", icon: "share-social-outline" as const, onPress: onShare }] : []),
          ...(onBlock
            ? [{ label: "Block Post", icon: "ban-outline" as const, onPress: onBlock, danger: true as const }]
            : []),
        ]
      : [
          { label: "View Edit History", icon: "time-outline", onPress: onEditHistory },
          ...(onShare ? [{ label: "Share Post", icon: "share-social-outline" as const, onPress: onShare }] : []),
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
