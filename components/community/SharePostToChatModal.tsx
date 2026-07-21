import { Pressable } from "@/components/Pressable";
import { CommunitySearchBar } from "@/components/community/CommunitySearchBar";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import {
  chatDisplayName,
  chatIdForUsers,
  ensureSupportChatWithAdmin,
  isSupportAdminPlaceholder,
  sharePostToChat,
} from "@/lib/communityService";
import type { ChatConversation, CommunityPost } from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function ProfileAvatar({ uri, size = 44 }: { uri: string | null; size?: number }) {
  return (
    <View
      className="rounded-full bg-[#9fdfb6] items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Ionicons name="person" size={size * 0.42} color="white" />
      )}
    </View>
  );
}

type SharePostToChatModalProps = {
  visible: boolean;
  post: CommunityPost | null;
  chats: ChatConversation[];
  currentUserId: string | null;
  adminUid: string | null;
  onClose: () => void;
};

export function SharePostToChatModal({
  visible,
  post,
  chats,
  currentUserId,
  adminUid,
  onClose,
}: SharePostToChatModalProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cardStyle, textMuted, textPrimary, theme } = useThemedScreen();
  const { modalCardStyle } = useProfileCardStyles();
  const [search, setSearch] = useState("");
  const [sharingChatId, setSharingChatId] = useState<string | null>(null);

  const filteredChats = useMemo(() => {
    if (!currentUserId) return [];
    const needle = search.trim().toLowerCase();
    return chats.filter((chat) => {
      const name = chatDisplayName(chat, currentUserId, adminUid).toLowerCase();
      const preview = chat.lastMessage.toLowerCase();
      return !needle || name.includes(needle) || preview.includes(needle);
    });
  }, [adminUid, chats, currentUserId, search]);

  const handleShare = async (chat: ChatConversation) => {
    if (!post || !currentUserId) return;

    const otherUid = chat.participants.find((participant) => participant !== currentUserId) ?? "";
    const isSupport = adminUid != null && otherUid === adminUid;
    let chatId = chat.id;

    if (isSupport && adminUid) {
      chatId = chatIdForUsers(currentUserId, adminUid);
      await ensureSupportChatWithAdmin().catch(() => {});
    } else if (isSupportAdminPlaceholder(chatId) && adminUid) {
      chatId = chatIdForUsers(currentUserId, adminUid);
      await ensureSupportChatWithAdmin().catch(() => {});
    }

    try {
      setSharingChatId(chat.id);
      await sharePostToChat(chatId, post);
      onClose();
      setSearch("");
      router.push({
        pathname: "/community-chat" as any,
        params: {
          chatId,
          name: chatDisplayName(chat, currentUserId, adminUid),
          image: chat.participantImages[otherUid] ?? "",
          isSupport: isSupport ? "1" : "0",
          otherUserId: otherUid,
        },
      });
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Could not share post.");
    } finally {
      setSharingChatId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: theme.modalOverlay }}>
        <Pressable className="absolute inset-0" onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ maxHeight: "82%" }}
        >
          <View
            className="rounded-t-[28px] px-5 pt-5"
            style={[
              modalCardStyle,
              { paddingBottom: insets.bottom + 20, borderBottomWidth: 0, maxHeight: "100%" },
            ]}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-extrabold" style={textPrimary}>
                Share to chat
              </Text>
              <Pressable onPress={onClose} className="w-10 h-10 rounded-full items-center justify-center">
                <Ionicons name="close" size={22} color={theme.iconMuted} />
              </Pressable>
            </View>

            {post ? (
              <View className="rounded-2xl px-4 py-3 mb-4 border" style={cardStyle}>
                <Text className="text-xs font-extrabold uppercase mb-1" style={{ color: theme.accentText }}>
                  Post preview
                </Text>
                <Text className="text-sm font-bold" style={textPrimary}>
                  {post.authorName}
                </Text>
                <Text className="text-sm mt-1" style={textMuted} numberOfLines={2}>
                  {post.content || (post.imageUrls.length > 0 ? "Photo post" : "Community post")}
                </Text>
              </View>
            ) : null}

            <CommunitySearchBar
              className="mb-3"
              value={search}
              onChangeText={setSearch}
              placeholder="Search chats..."
            />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 12 }}
              style={{ maxHeight: 360 }}
            >
              {filteredChats.length === 0 ? (
                <Text className="text-sm text-center py-8" style={textMuted}>
                  {chats.length === 0 ? "No chats yet." : "No chats match your search."}
                </Text>
              ) : (
                filteredChats.map((chat) => {
                  const otherUid =
                    chat.participants.find((participant) => participant !== currentUserId) ?? "";
                  const name = currentUserId
                    ? chatDisplayName(chat, currentUserId, adminUid)
                    : "Friend";
                  const image = chat.participantImages[otherUid] ?? null;
                  const busy = sharingChatId === chat.id;

                  return (
                    <Pressable
                      key={chat.id}
                      onPress={() => void handleShare(chat)}
                      disabled={busy}
                      className="flex-row items-center rounded-2xl px-4 py-3 mb-2 border"
                      style={[cardStyle, busy ? { opacity: 0.6 } : undefined]}
                    >
                      <ProfileAvatar uri={image} />
                      <View className="flex-1 ml-3">
                        <Text className="text-sm font-extrabold" style={textPrimary}>
                          {name}
                        </Text>
                        <Text className="text-xs mt-0.5" style={textMuted} numberOfLines={1}>
                          {chat.lastMessage || "No messages yet"}
                        </Text>
                      </View>
                      {busy ? (
                        <ActivityIndicator size="small" color={theme.accentText} />
                      ) : (
                        <Ionicons name="paper-plane-outline" size={18} color={theme.accentText} />
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
