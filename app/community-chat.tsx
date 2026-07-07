import { Pressable } from "@/components/Pressable";
import { ChatInboxMenuModal } from "@/components/community/ChatInboxMenuModal";
import { ChatMessageMenuModal } from "@/components/community/ChatMessageMenuModal";
import { ChatStickerPicker } from "@/components/community/ChatStickerPicker";
import { UserProfileModal } from "@/components/community/UserProfileModal";
import {
  ThemedBackButton,
  ThemedScreen,
  ThemedText,
  useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import { SharedPostMessageCard, getSharedPostCardData } from "@/components/community/SharedPostMessageCard";
import { ChatFormattedText } from "@/lib/chatFormattedText";
import type { ChatMessage, CommunityPost } from "@/lib/communityTypes";
import { getChatSticker, CHAT_STICKER_MESSAGE_SIZE, CHAT_STICKER_QUOTE_SIZE, type ChatSticker } from "@/lib/chatStickers";
import {
  buildMessageQuote,
  canModifyOwnChatMessage,
  formatChatMessageTime,
  formatRecallNotice,
  messageSummary,
  quotePreviewText,
} from "@/lib/chatMessageUtils";
import {
  markChatRead,
  sendChatMessage,
  editChatMessage,
  recallChatMessage,
  subscribeChatMeta,
  subscribeMessages,
  checkIsAdmin,
  clearChatHistory,
  getCurrentUserProfile,
  getPostsByAuthor,
  getPublicUserProfile,
  loadFriendRelations,
  removeFriend,
  resolveAdminUid,
  displayCommunityUserName,
  sendFriendRequest,
  prepareSupportChat,
  subscribeFriendsList,
  subscribePosts,
} from "@/lib/communityService";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";
import { SUPPORT_CHAT_WELCOME_MESSAGE } from "@/lib/communityTypes";

function ProfileAvatar({ uri, size = 32 }: { uri: string | null; size?: number }) {
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

function QuoteBlock({
  quote,
  isMe,
}: {
  quote: NonNullable<ChatMessage["quote"]>;
  isMe: boolean;
}) {
  const { theme, textMuted } = useThemedScreen();
  const quotedSticker =
    quote.messageType === "sticker" && quote.stickerId
      ? getChatSticker(quote.stickerId)
      : undefined;

  return (
    <View
      className="border-l-2 pl-2 mb-2"
      style={{ borderLeftColor: isMe ? "rgba(255,255,255,0.7)" : theme.accentText }}
    >
      <Text
        className="text-[10px] font-bold"
        style={{ color: isMe ? "rgba(255,255,255,0.9)" : theme.accentText }}
      >
        {quote.senderName}
      </Text>
      {quotedSticker ? (
        <Image
          source={quotedSticker.source}
          style={{ width: CHAT_STICKER_QUOTE_SIZE, height: CHAT_STICKER_QUOTE_SIZE, marginTop: 4 }}
          contentFit="contain"
        />
      ) : (
        <Text
          className="text-xs"
          style={isMe ? { color: "rgba(255,255,255,0.8)" } : textMuted}
          numberOfLines={2}
        >
          {quotePreviewText(quote)}
        </Text>
      )}
    </View>
  );
}

function SupportWelcomeMessage({
  avatar,
}: {
  avatar: string | null;
}) {
  const { cardStyle } = useThemedScreen();

  return (
    <View className="flex-row items-end gap-2 justify-start">
      <ProfileAvatar uri={avatar} size={32} />
      <View className="max-w-[78%] items-start">
        <View className="rounded-2xl px-4 py-3" style={cardStyle}>
          <Text className="text-[10px] font-bold mb-1" style={{ color: "#2563eb" }}>
            Support Admin
          </Text>
          <ThemedText variant="secondary" className="text-sm leading-6">
            {SUPPORT_CHAT_WELCOME_MESSAGE}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

export default function CommunityChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cardStyle, textSecondary, theme } = useThemedScreen();
  const { inputStyle, placeholderColor, rowBorderStyle } = useProfileCardStyles();
  const scrollRef = useRef<ScrollView>(null);
  const params = useLocalSearchParams<{
    chatId?: string;
    name?: string;
    image?: string;
    isSupport?: string;
    otherUserId?: string;
  }>();

  const chatId = params.chatId ?? "";
  const chatName = params.name ?? "Friend";
  const chatImage = params.image ? String(params.image) : null;
  const isSupport = params.isSupport === "1";
  const otherUserId = params.otherUserId ? String(params.otherUserId) : "";

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState("You");
  const [myProfileImage, setMyProfileImage] = useState<string | null>(null);
  const [participantImages, setParticipantImages] = useState<Record<string, string | null>>({});
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [stickerPickerVisible, setStickerPickerVisible] = useState(false);
  const [menuMessage, setMenuMessage] = useState<ChatMessage | null>(null);
  const [quotingMessage, setQuotingMessage] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [canSendMessages, setCanSendMessages] = useState(true);

  const [profileVisible, setProfileVisible] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<Awaited<ReturnType<typeof getPublicUserProfile>> | null>(null);
  const [profileRelation, setProfileRelation] = useState<"none" | "friends" | "pending_outgoing" | "pending_incoming">("none");
  const [allPosts, setAllPosts] = useState<CommunityPost[]>([]);

  const displayChatName = useMemo(
    () => displayCommunityUserName(otherUserId, chatName, adminUid),
    [otherUserId, chatName, adminUid]
  );
  const isSupportAdminUser = isSupport || (adminUid != null && otherUserId === adminUid);
  const hasPersistedWelcome = useMemo(
    () => messages.some((message) => message.text === SUPPORT_CHAT_WELCOME_MESSAGE),
    [messages]
  );
  const showSupportWelcome = isSupportAdminUser && !hasPersistedWelcome;

  const profilePosts = useMemo(
    () => (otherUserId ? getPostsByAuthor(allPosts, otherUserId) : []),
    [allPosts, otherUserId]
  );

  const resolveSenderName = useCallback(
    (senderId: string) => {
      if (senderId === currentUserId) return myDisplayName;
      return participantNames[senderId] ?? chatName;
    },
    [currentUserId, myDisplayName, participantNames, chatName]
  );

  useEffect(() => {
    void resolveAdminUid().then(setAdminUid).catch(() => setAdminUid(null));
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid ?? null);
      if (user) {
        void checkIsAdmin(user).then(setIsAdminUser);
        void getCurrentUserProfile()
          .then(({ profile }) => {
            setMyProfileImage(profile.profileImage);
            setMyDisplayName(profile.name || "You");
          })
          .catch(() => {
            setMyProfileImage(null);
            setMyDisplayName("You");
          });
      } else {
        setIsAdminUser(false);
        setMyProfileImage(null);
        setMyDisplayName("You");
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (keyboardHeight > 0) setStickerPickerVisible(false);
  }, [keyboardHeight]);

  useEffect(() => {
    if (!chatId) return;
    const unsub = subscribeMessages(chatId, setMessages, currentUserId);
    void markChatRead(chatId).catch(() => {});
    return unsub;
  }, [chatId, currentUserId]);

  useEffect(() => {
    if (!isSupportAdminUser || !chatId || isAdminUser) return;
    void prepareSupportChat(chatId);
  }, [isSupportAdminUser, chatId, isAdminUser]);

  useEffect(() => {
    if (!chatId) return;
    const unsub = subscribeChatMeta(chatId, (chat) => {
      if (!chat) return;
      setParticipantImages(chat.participantImages);
      setParticipantNames(chat.participantNames);
    });
    return unsub;
  }, [chatId]);

  useEffect(() => {
    if (!currentUserId) return;
    const unsub = subscribePosts(setAllPosts);
    return unsub;
  }, [currentUserId]);

  useEffect(() => {
    if (isSupport || isAdminUser) {
      setCanSendMessages(true);
      return;
    }
    if (!otherUserId || !currentUserId) {
      setCanSendMessages(false);
      return;
    }

    const unsub = subscribeFriendsList(
      (friends) => {
        setCanSendMessages(friends.some((friend) => friend.id === otherUserId));
      },
      () => setCanSendMessages(false)
    );
    return unsub;
  }, [currentUserId, otherUserId, isSupport, isAdminUser]);

  useEffect(() => {
    if (!otherUserId || !currentUserId || isSupport) return;
    void loadFriendRelations([otherUserId]).then((relations) => {
      setProfileRelation(relations[otherUserId] ?? "none");
    });
  }, [canSendMessages, otherUserId, currentUserId, isSupport]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const senderImage = (senderId: string) => {
    if (senderId === currentUserId) return myProfileImage;
    return participantImages[senderId] ?? (senderId !== currentUserId ? chatImage : null);
  };

  const cancelComposerModes = () => {
    setQuotingMessage(null);
    setEditingMessage(null);
  };

  const openOtherProfile = async () => {
    if (!otherUserId || otherUserId === currentUserId) return;
    setProfileVisible(true);
    setProfileLoading(true);
    setProfileData(null);
    try {
      const profile = await getPublicUserProfile(otherUserId);
      setProfileData(profile);
      const relations = await loadFriendRelations([otherUserId]);
      setProfileRelation(relations[otherUserId] ?? "none");
    } catch {
      Alert.alert("Error", "Could not load profile.");
      setProfileVisible(false);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleClearChatHistory = () => {
    Alert.alert(
      "Clear chat history",
      `Clear messages from your view of this chat with ${displayChatName}? The other person will still see the full history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await clearChatHistory(chatId);
                cancelComposerModes();
                setText("");
              } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Could not clear chat.");
              }
            })();
          },
        },
      ]
    );
  };

  const handleDeleteFriend = () => {
    if (!otherUserId || isSupport) return;
    Alert.alert(
      "Delete friend",
      `Remove ${chatName} from your friends? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await removeFriend(otherUserId);
                setProfileRelation("none");
                cancelComposerModes();
                setText("");
              } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Could not remove friend.");
              }
            })();
          },
        },
      ]
    );
  };

  const handleAddFriend = () => {
    if (!otherUserId || isSupportAdminUser) return;
    Alert.alert("Add friend", `Send a friend request to ${chatName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Add friend",
        onPress: () => {
          void (async () => {
            try {
              await sendFriendRequest(otherUserId);
              setProfileRelation("pending_outgoing");
              Alert.alert("Friend request sent", "They will be notified.");
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not send friend request.");
            }
          })();
        },
      },
    ]);
  };

  const handleSend = async () => {
    if (!chatId || !text.trim() || !canSendMessages) return;
    try {
      setSending(true);
      if (editingMessage) {
        await editChatMessage(chatId, editingMessage.id, text);
        setEditingMessage(null);
        setText("");
        return;
      }

      if (quotingMessage) {
        await sendChatMessage(chatId, {
          text,
          quote: buildMessageQuote(quotingMessage, resolveSenderName(quotingMessage.senderId)),
        });
        setQuotingMessage(null);
      } else {
        await sendChatMessage(chatId, text);
      }
      setText("");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const handleSendSticker = async (sticker: ChatSticker) => {
    if (!chatId || !canSendMessages) return;
    try {
      setSending(true);
      const quote = quotingMessage
        ? buildMessageQuote(quotingMessage, resolveSenderName(quotingMessage.senderId))
        : undefined;
      await sendChatMessage(chatId, { stickerId: sticker.id, quote });
      setQuotingMessage(null);
      setStickerPickerVisible(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not send sticker.");
    } finally {
      setSending(false);
    }
  };

  const toggleStickerPicker = () => {
    if (editingMessage) return;
    if (stickerPickerVisible) {
      setStickerPickerVisible(false);
      return;
    }
    Keyboard.dismiss();
    setStickerPickerVisible(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const startQuote = (message: ChatMessage) => {
    setQuotingMessage(message);
    setEditingMessage(null);
    setStickerPickerVisible(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const startEdit = (message: ChatMessage) => {
    if (!canModifyOwnChatMessage(message)) {
      Alert.alert("Cannot edit", "Messages can only be edited within 5 minutes of sending.");
      return;
    }
    setEditingMessage(message);
    setText(message.text);
    setQuotingMessage(null);
    setStickerPickerVisible(false);
  };

  const handleRecall = (message: ChatMessage) => {
    if (!canModifyOwnChatMessage(message)) {
      Alert.alert("Cannot recall", "Messages can only be recalled within 5 minutes of sending.");
      return;
    }
    Alert.alert("Recall message", "Remove this message for everyone in the chat?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Recall",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await recallChatMessage(chatId, message.id);
              if (editingMessage?.id === message.id) {
                setEditingMessage(null);
                setText("");
              }
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not recall message.");
            }
          })();
        },
      },
    ]);
  };

  const inputBottomPadding =
    keyboardHeight > 0
      ? Math.max(8, keyboardHeight - insets.bottom)
      : insets.bottom + 8;

  if (!chatId) {
    return (
      <ThemedScreen className="items-center justify-center px-8">
        <ThemedText variant="muted" className="text-sm text-center">
          Invalid chat.
        </ThemedText>
        <Pressable onPress={() => router.back()} className="mt-4 rounded-full bg-[#52B69A] px-6 py-3">
          <Text className="text-sm font-extrabold text-white">Go Back</Text>
        </Pressable>
      </ThemedScreen>
    );
  }

  return (
    <ThemedScreen>
      <View className="flex-1">
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16 }} className="mb-2">
          <View className="h-12 flex-row items-center">
            <ThemedBackButton
              onPress={() => (isAdminUser ? router.replace("/admin" as any) : router.back())}
              className="w-12 h-12 shrink-0"
            />
            <Pressable
              onPress={() => void openOtherProfile()}
              disabled={!otherUserId || otherUserId === currentUserId}
              className="flex-1 flex-row items-center ml-2 mr-2 min-w-0"
            >
              <ProfileAvatar uri={chatImage} size={40} />
              <ThemedText className="text-xl font-extrabold flex-1 ml-3" numberOfLines={1}>
                {displayChatName}
              </ThemedText>
            </Pressable>
            <View className="flex-row items-center shrink-0">
              {isSupport ? (
                <View className="w-8 h-8 rounded-full bg-[#dbeafe] items-center justify-center mr-1">
                  <Ionicons name="shield-checkmark" size={18} color="#2563eb" />
                </View>
              ) : null}
              <Pressable
                onPress={() => setMenuVisible(true)}
                className="w-12 h-12 rounded-full items-center justify-center active:opacity-70"
              >
                <Ionicons name="ellipsis-vertical" size={22} color={theme.iconMuted} />
              </Pressable>
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          className="flex-1 px-3"
          contentContainerStyle={{ paddingVertical: 12, gap: 12, paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {showSupportWelcome ? (
            <SupportWelcomeMessage avatar={senderImage(otherUserId || "")} />
          ) : null}
          {messages.length === 0 && !showSupportWelcome ? (
            <ThemedText variant="muted" className="text-sm text-center py-8">
              No messages yet. Say hello!
            </ThemedText>
          ) : null}
          {messages.map((message) => {
            const isMe = message.senderId === currentUserId;
            const isAuto = message.isAutoReply === true;
            const avatar = senderImage(message.senderId);
            const displayText = messageSummary(message);
            const isSticker = message.messageType === "sticker" && !message.recalled;
            const isSharedPost =
              message.messageType === "post" && Boolean(message.sharedPostId) && !message.recalled;
            const sharedPostData = isSharedPost
              ? getSharedPostCardData(
                  message,
                  message.sharedPostId
                    ? allPosts.find((post) => post.id === message.sharedPostId) ?? null
                    : null
                )
              : null;
            const sticker =
              isSticker && message.stickerId ? getChatSticker(message.stickerId) : undefined;

            return (
              <View
                key={message.id}
                className={`flex-row items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}
              >
                {!isMe ? <ProfileAvatar uri={avatar} size={32} /> : null}
                <View className={`max-w-[78%] ${isMe ? "items-end" : "items-start"}`}>
                  <Pressable
                    onLongPress={() => {
                      if (!message.recalled) setMenuMessage(message);
                    }}
                    delayLongPress={280}
                    disabled={message.recalled}
                  >
                    {message.recalled ? (
                      <View className="rounded-2xl px-4 py-3" style={rowBorderStyle}>
                        <ThemedText variant="muted" className="text-xs italic leading-5">
                          {formatRecallNotice(
                            message,
                            currentUserId,
                            resolveSenderName(message.senderId)
                          )}
                        </ThemedText>
                      </View>
                    ) : isSticker && sticker ? (
                      <View className="px-1 py-1">
                        {message.quote ? <QuoteBlock quote={message.quote} isMe={isMe} /> : null}
                        <Image
                          source={sticker.source}
                          style={{
                            width: CHAT_STICKER_MESSAGE_SIZE,
                            height: CHAT_STICKER_MESSAGE_SIZE,
                          }}
                          contentFit="contain"
                        />
                      </View>
                    ) : isSharedPost && sharedPostData ? (
                      <View>
                        {message.quote ? <QuoteBlock quote={message.quote} isMe={isMe} /> : null}
                        <SharedPostMessageCard
                          data={sharedPostData}
                          onPress={() => {
                            router.push({
                              pathname: "/community-post" as any,
                              params: { postId: sharedPostData.postId },
                            });
                          }}
                        />
                      </View>
                    ) : (
                      <View
                        className={`rounded-2xl px-4 py-3 ${isMe ? "bg-[#76C893]" : ""}`}
                        style={isMe ? undefined : cardStyle}
                      >
                        {isAuto ? (
                          <Text className="text-[10px] font-bold mb-1" style={{ color: "#2563eb" }}>
                            Support Admin
                </Text>
                        ) : null}
                        {message.quote ? <QuoteBlock quote={message.quote} isMe={isMe} /> : null}
                        {displayText ? (
                          <ChatFormattedText
                            text={displayText}
                            className={isMe ? "text-white text-sm leading-6" : "text-sm leading-6"}
                            style={isMe ? undefined : textSecondary}
                            boldClassName={isMe ? "font-extrabold text-white" : "font-extrabold"}
                          />
                        ) : null}
                      </View>
                    )}
                  </Pressable>
                  <ThemedText variant="muted" className="text-[10px] mt-1">
                    {formatChatMessageTime(message.recalledAt ?? message.createdAt)}
                    {message.editedAt && !message.recalled ? " · Edited" : ""}
                  </ThemedText>
                </View>
                {isMe ? <ProfileAvatar uri={avatar} size={32} /> : null}
              </View>
            );
          })}
        </ScrollView>

        {canSendMessages || isSupport ? (
        <View
          className="px-3 border-t"
          style={{
            paddingBottom: inputBottomPadding,
            paddingTop: 10,
            backgroundColor: theme.navBg,
            borderTopColor: theme.navBorder,
          }}
        >
          {editingMessage ? (
            <View
              className="flex-row items-center justify-between rounded-xl px-3 py-2 mb-2 border"
              style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
            >
              <ThemedText variant="accent" className="text-xs font-extrabold">
                Editing message
              </ThemedText>
              <Pressable
                onPress={() => {
                  setEditingMessage(null);
                  setText("");
                }}
              >
                <ThemedText variant="muted" className="text-xs font-bold">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          {quotingMessage ? (
            <View
              className="flex-row items-center rounded-xl px-3 py-2 mb-2 border"
              style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
            >
              <View className="flex-1 border-l-2 pl-2" style={{ borderLeftColor: theme.accentText }}>
                <ThemedText variant="accent" className="text-xs font-extrabold">
                  {resolveSenderName(quotingMessage.senderId)}
                </ThemedText>
                <ThemedText variant="secondary" className="text-xs mt-0.5" numberOfLines={1}>
                  {messageSummary(quotingMessage)}
                </ThemedText>
              </View>
              <Pressable onPress={() => setQuotingMessage(null)} className="p-1 ml-2">
                <Ionicons name="close" size={18} color={theme.iconMuted} />
              </Pressable>
          </View>
          ) : null}

          <View className="flex-row items-end gap-2">
            <Pressable
              onPress={toggleStickerPicker}
              disabled={sending || Boolean(editingMessage)}
              className={`w-10 h-10 rounded-full items-center justify-center border ${
                editingMessage ? "opacity-40" : ""
              }`}
              style={
                stickerPickerVisible
                  ? { backgroundColor: theme.accent, borderColor: theme.accent }
                  : { backgroundColor: theme.accentSoft, borderColor: theme.accent }
              }
            >
              <Ionicons
                name="happy-outline"
                size={20}
                color={stickerPickerVisible ? "white" : theme.accentText}
              />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={editingMessage ? "Edit your message..." : "Type a message..."}
              multiline
              onFocus={() => {
                setStickerPickerVisible(false);
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
              }}
              className="flex-1 rounded-2xl px-4 py-3 text-sm max-h-28"
              style={inputStyle}
              placeholderTextColor={placeholderColor}
            />
            <Pressable
              onPress={() => void handleSend()}
              disabled={sending || !text.trim()}
              className="w-11 h-11 rounded-full items-center justify-center"
              style={{ backgroundColor: text.trim() ? theme.accent : theme.iconMuted }}
            >
              {sending ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Ionicons
                  name={editingMessage ? "checkmark" : "send"}
                  size={18}
                  color="white"
                />
              )}
            </Pressable>
          </View>

          {stickerPickerVisible && !editingMessage ? (
            <ChatStickerPicker onSelect={(sticker) => void handleSendSticker(sticker)} />
          ) : null}
        </View>
        ) : (
          <View
            className="px-3 border-t"
            style={{
              paddingBottom: insets.bottom + 12,
              paddingTop: 12,
              backgroundColor: theme.navBg,
              borderTopColor: theme.navBorder,
            }}
          >
            <ThemedText variant="muted" className="text-xs text-center">
              Add {displayChatName} as a friend to send messages.
            </ThemedText>
          </View>
        )}
    </View>

      <ChatMessageMenuModal
        visible={menuMessage !== null}
        message={menuMessage}
        canEdit={
          menuMessage != null &&
          !menuMessage.recalled &&
          menuMessage.senderId === currentUserId &&
          menuMessage.messageType === "text" &&
          menuMessage.isAutoReply !== true &&
          canModifyOwnChatMessage(menuMessage)
        }
        canRecall={
          menuMessage != null &&
          !menuMessage.recalled &&
          menuMessage.senderId === currentUserId &&
          menuMessage.isAutoReply !== true &&
          canModifyOwnChatMessage(menuMessage)
        }
        canQuote={menuMessage != null && !menuMessage.recalled}
        onClose={() => setMenuMessage(null)}
        onQuote={() => {
          if (menuMessage && !menuMessage.recalled) startQuote(menuMessage);
        }}
        onEdit={() => {
          if (menuMessage) startEdit(menuMessage);
        }}
        onRecall={() => {
          if (menuMessage) handleRecall(menuMessage);
        }}
      />

      <ChatInboxMenuModal
        visible={menuVisible}
        chatName={displayChatName}
        showDeleteFriend={Boolean(otherUserId && !isSupportAdminUser && canSendMessages)}
        showAddFriend={Boolean(
          otherUserId &&
            !isSupportAdminUser &&
            !canSendMessages &&
            profileRelation === "none"
        )}
        onClose={() => setMenuVisible(false)}
        onViewProfile={() => void openOtherProfile()}
        onClearHistory={handleClearChatHistory}
        onDeleteFriend={handleDeleteFriend}
        onAddFriend={handleAddFriend}
      />

      <UserProfileModal
        visible={profileVisible}
        profile={profileData}
        posts={profilePosts}
        relation={profileRelation}
        loading={profileLoading}
        isSelf={otherUserId === currentUserId}
        isSupportAdmin={isSupportAdminUser}
        canAddFriend={!isSupportAdminUser}
        onClose={() => {
          setProfileVisible(false);
          setProfileData(null);
        }}
        onAddFriend={handleAddFriend}
        onChat={isSupportAdminUser ? () => setProfileVisible(false) : undefined}
      />
    </ThemedScreen>
  );
}
