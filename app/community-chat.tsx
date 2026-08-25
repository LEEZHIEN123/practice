import { Pressable } from "@/components/Pressable";
import { ChatImageViewerModal } from "@/components/community/ChatImageViewerModal";
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
  getPostsByAuthor,
  getPublicUserProfile,
  loadFriendRelations,
  removeFriend,
  resolveAdminUid,
  displayCommunityUserName,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getPendingIncomingFriendRequest,
  resolveFriendRequestNotificationByRequestId,
  prepareSupportChat,
  subscribeFriendsList,
  subscribePosts,
  uploadChatImage,
  userAccountExists,
  ACCOUNT_UNAVAILABLE_MESSAGE,
} from "@/lib/communityService";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ImageEditor } from "expo-dynamic-image-crop";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";
import { SUPPORT_CHAT_WELCOME_MESSAGE } from "@/lib/communityTypes";

const USER_CHAT_GREEN = "#76C893";
const ADMIN_CHAT_BLUE = "#2563eb";

function ProfileAvatar({ uri, size = 32 }: { uri: string | null; size?: number }) {
  const { theme } = useThemedScreen();
  return (
    <View
      className="rounded-full items-center justify-center overflow-hidden"
      style={{ width: size, height: size, backgroundColor: theme.accent }}
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
  onColoredBubble,
}: {
  quote: NonNullable<ChatMessage["quote"]>;
  onColoredBubble: boolean;
}) {
  const { theme, textMuted } = useThemedScreen();
  const quotedSticker =
    quote.messageType === "sticker" && quote.stickerId
      ? getChatSticker(quote.stickerId)
      : undefined;

  return (
    <View
      className="border-l-2 pl-2 mb-2"
      style={{ borderLeftColor: onColoredBubble ? "rgba(255,255,255,0.7)" : theme.accentText }}
    >
      <Text
        className="text-[10px] font-bold"
        style={{ color: onColoredBubble ? "rgba(255,255,255,0.9)" : theme.accentText }}
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
          style={onColoredBubble ? { color: "rgba(255,255,255,0.8)" } : textMuted}
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
  const initialScrollDoneForChat = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);
  const scrollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [messagesHydrated, setMessagesHydrated] = useState(false);

  const clearScrollTimers = useCallback(() => {
    scrollTimersRef.current.forEach(clearTimeout);
    scrollTimersRef.current = [];
  }, []);

  const scrollToBottom = useCallback(
    (animated = false) => {
      stickToBottomRef.current = true;
      clearScrollTimers();
      const run = () => {
        scrollRef.current?.scrollToEnd({ animated });
      };
      run();
      requestAnimationFrame(run);
      // Long Support Admin auto-messages need a short follow-up after layout.
      scrollTimersRef.current.push(setTimeout(run, 100));
      scrollTimersRef.current.push(setTimeout(run, 320));
    },
    [clearScrollTimers]
  );

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
  const paramOtherUserId = params.otherUserId ? String(params.otherUserId) : "";

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState("You");
  const [myProfileImage, setMyProfileImage] = useState<string | null>(null);
  const [participantImages, setParticipantImages] = useState<Record<string, string | null>>({});
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [resolvedOtherUserId, setResolvedOtherUserId] = useState(paramOtherUserId);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [windowHeight, setWindowHeight] = useState(() => Dimensions.get("window").height);
  const [menuVisible, setMenuVisible] = useState(false);
  const [stickerPickerVisible, setStickerPickerVisible] = useState(false);
  const [menuMessage, setMenuMessage] = useState<ChatMessage | null>(null);
  /** Re-check 5-min recall/edit window while menus are open. */
  const [actionClock, setActionClock] = useState(() => Date.now());
  const [quotingMessage, setQuotingMessage] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [canSendMessages, setCanSendMessages] = useState(true);
  const [otherAccountMissing, setOtherAccountMissing] = useState(false);
  const [viewerImageUri, setViewerImageUri] = useState<string | null>(null);
  const [viewerMessage, setViewerMessage] = useState<ChatMessage | null>(null);
  const [composeImageUri, setComposeImageUri] = useState<string | null>(null);
  const [cropperVisible, setCropperVisible] = useState(false);
  const [processingComposeImage, setProcessingComposeImage] = useState(false);

  const [profileVisible, setProfileVisible] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<Awaited<ReturnType<typeof getPublicUserProfile>> | null>(null);
  const [profileRelation, setProfileRelation] = useState<"none" | "friends" | "pending_outgoing" | "pending_incoming">("none");
  const [profileFriendBusy, setProfileFriendBusy] = useState(false);
  const [allPosts, setAllPosts] = useState<CommunityPost[]>([]);
  const [headerAvatarUri, setHeaderAvatarUri] = useState<string | null>(
    params.image ? String(params.image) : null
  );
  /** Live users/{otherUserId}.profileImage — preferred over denormalized chat participantImages. */
  const [liveOtherProfileImage, setLiveOtherProfileImage] = useState<string | null>(null);
  /** Live users/{otherUserId}.name — preferred over denormalized chat participantNames. */
  const [liveOtherUserName, setLiveOtherUserName] = useState<string | null>(null);

  const otherUserId = paramOtherUserId || resolvedOtherUserId;

  const displayChatName = useMemo(
    () =>
      displayCommunityUserName(
        otherUserId,
        liveOtherUserName ?? participantNames[otherUserId] ?? chatName,
        adminUid
      ),
    [otherUserId, liveOtherUserName, participantNames, chatName, adminUid]
  );
  const isSupportAdminUser = isSupport || (adminUid != null && otherUserId === adminUid);
  const hasPersistedWelcome = useMemo(
    () => messages.some((message) => message.text === SUPPORT_CHAT_WELCOME_MESSAGE),
    [messages]
  );
  // Only show the local welcome bubble while the thread is still empty.
  // After a report auto-message exists, do not stack a fake welcome on top.
  const showSupportWelcome =
    isSupportAdminUser && messagesHydrated && messages.length === 0 && !hasPersistedWelcome;

  const profilePosts = useMemo(
    () => (otherUserId ? getPostsByAuthor(allPosts, otherUserId, currentUserId) : []),
    [allPosts, otherUserId, currentUserId]
  );

  const resolveSenderName = useCallback(
    (senderId: string) => {
      if (senderId === currentUserId) return myDisplayName;
      const raw =
        senderId === otherUserId && liveOtherUserName
          ? liveOtherUserName
          : participantNames[senderId] ?? chatName;
      return displayCommunityUserName(senderId, raw, adminUid);
    },
    [currentUserId, myDisplayName, otherUserId, liveOtherUserName, participantNames, chatName, adminUid]
  );

  useEffect(() => {
    void resolveAdminUid().then(setAdminUid).catch(() => setAdminUid(null));
  }, []);

  /** Prefer live profile photo for whoever you are chatting with (friend or Support Admin). */
  useEffect(() => {
    if (!otherUserId) {
      setLiveOtherProfileImage(null);
      setLiveOtherUserName(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "users", otherUserId),
      (snap) => {
        if (!snap.exists()) {
          setLiveOtherProfileImage(null);
          setLiveOtherUserName(null);
          return;
        }
        const data = snap.data() as { profileImage?: unknown; name?: unknown };
        const image =
          typeof data.profileImage === "string" && data.profileImage.length > 0
            ? data.profileImage
            : null;
        const name =
          typeof data.name === "string" && data.name.trim().length > 0 ? data.name.trim() : null;
        setLiveOtherProfileImage(image);
        setLiveOtherUserName(name);
        if (image) {
          setHeaderAvatarUri(image);
        } else {
          // Keep nav/chat fallback if they have no photo set yet.
          setHeaderAvatarUri((prev) => prev ?? chatImage);
        }
      },
      () => {
        setLiveOtherProfileImage(null);
        setLiveOtherUserName(null);
      }
    );
    return unsub;
  }, [otherUserId, chatImage]);

  useEffect(() => {
    if (!menuMessage && !viewerMessage) return;
    setActionClock(Date.now());
    const id = setInterval(() => setActionClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, [menuMessage, viewerMessage]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid ?? null);
      if (user) {
        void checkIsAdmin(user).then(setIsAdminUser);
      } else {
        setIsAdminUser(false);
        setMyProfileImage(null);
        setMyDisplayName("You");
      }
    });
    return unsub;
  }, []);

  /** Keep your own avatar live so message bubbles stay correct after a photo change. */
  useEffect(() => {
    if (!currentUserId) {
      setMyProfileImage(null);
      setMyDisplayName("You");
      return;
    }
    const unsub = onSnapshot(
      doc(db, "users", currentUserId),
      (snap) => {
        if (!snap.exists()) {
          setMyProfileImage(null);
          setMyDisplayName("You");
          return;
        }
        const data = snap.data() as { profileImage?: unknown; name?: unknown };
        setMyProfileImage(
          typeof data.profileImage === "string" && data.profileImage.length > 0
            ? data.profileImage
            : null
        );
        setMyDisplayName(typeof data.name === "string" && data.name.trim() ? data.name : "You");
      },
      () => {
        setMyProfileImage(null);
        setMyDisplayName("You");
      }
    );
    return unsub;
  }, [currentUserId]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      setWindowHeight(Dimensions.get("window").height);
      scrollToBottom(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setWindowHeight(Dimensions.get("window").height);
    });
    const dimSub = Dimensions.addEventListener("change", ({ window }) => {
      setWindowHeight(window.height);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      dimSub.remove();
    };
  }, [scrollToBottom]);

  useEffect(() => {
    if (keyboardHeight > 0) setStickerPickerVisible(false);
  }, [keyboardHeight]);

  useEffect(() => {
    if (!chatId) return;
    initialScrollDoneForChat.current = null;
    stickToBottomRef.current = true;
    setMessages([]);
    setMessagesHydrated(false);
    const unsub = subscribeMessages(
      chatId,
      (next) => {
        setMessages(next);
        setMessagesHydrated(true);
      },
      currentUserId
    );
    void markChatRead(chatId).catch(() => {});
    return () => {
      clearScrollTimers();
      unsub();
    };
  }, [chatId, currentUserId, clearScrollTimers]);

  useEffect(() => {
    if (!isSupportAdminUser || !chatId || isAdminUser) return;
    void prepareSupportChat(chatId);
  }, [isSupportAdminUser, chatId, isAdminUser]);

  useEffect(() => {
    setResolvedOtherUserId(paramOtherUserId);
  }, [paramOtherUserId, chatId]);

  useEffect(() => {
    setHeaderAvatarUri(chatImage);
  }, [chatImage, chatId]);

  useEffect(() => {
    if (!chatId) return;
    const unsub = subscribeChatMeta(chatId, (chat) => {
      if (!chat) return;
      setParticipantImages(chat.participantImages);
      setParticipantNames(chat.participantNames);
      if (!paramOtherUserId && currentUserId) {
        const other =
          chat.participants.find((id) => id !== currentUserId) ??
          Object.keys(chat.participantNames).find((id) => id !== currentUserId) ??
          "";
        if (other) setResolvedOtherUserId(other);
      }
      if (currentUserId) {
        const other =
          (paramOtherUserId ||
            chat.participants.find((id) => id !== currentUserId) ||
            "") as string;
        // Live users/{uid}.profileImage wins over stale chat.participantImages.
        if (liveOtherProfileImage) {
          setHeaderAvatarUri(liveOtherProfileImage);
          return;
        }
        const metaImage = other ? chat.participantImages[other] : null;
        if (metaImage) setHeaderAvatarUri(metaImage);
      }
    });
    return unsub;
  }, [chatId, currentUserId, paramOtherUserId, liveOtherProfileImage]);

  useEffect(() => {
    if (!currentUserId) return;
    const unsub = subscribePosts(setAllPosts);
    return unsub;
  }, [currentUserId]);

  useEffect(() => {
    if (isSupportAdminUser || isAdminUser) {
      setOtherAccountMissing(false);
      setCanSendMessages(true);
      return;
    }
    if (!otherUserId || !currentUserId) {
      setCanSendMessages(false);
      return;
    }

    let cancelled = false;
    let accountExists = true;
    let isFriend = false;

    const syncCanSend = () => {
      if (cancelled) return;
      setCanSendMessages(accountExists && isFriend);
    };

    void userAccountExists(otherUserId).then((exists) => {
      if (cancelled) return;
      accountExists = exists;
      setOtherAccountMissing(!exists);
      syncCanSend();
    });

    const unsub = subscribeFriendsList(
      (friends) => {
        if (cancelled) return;
        isFriend = friends.some((friend) => friend.id === otherUserId);
        syncCanSend();
      },
      () => {
        if (cancelled) return;
        isFriend = false;
        syncCanSend();
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [currentUserId, otherUserId, isSupportAdminUser, isAdminUser]);

  useEffect(() => {
    if (!otherUserId || !currentUserId || isSupportAdminUser) return;
    void loadFriendRelations([otherUserId]).then((relations) => {
      setProfileRelation(relations[otherUserId] ?? "none");
    });
  }, [canSendMessages, otherUserId, currentUserId, isSupportAdminUser]);

  useEffect(() => {
    if (!chatId || !messagesHydrated) return;
    if (messages.length === 0 && !showSupportWelcome) return;

    const isFirstPaint = initialScrollDoneForChat.current !== chatId;
    if (isFirstPaint) {
      initialScrollDoneForChat.current = chatId;
      // Jump instantly to the latest message when opening the chat (e.g. Support Admin auto-reply).
      scrollToBottom(false);
      return;
    }
    if (stickToBottomRef.current) {
      scrollToBottom(true);
    }
  }, [chatId, messages, messagesHydrated, showSupportWelcome, scrollToBottom]);

  const senderImage = (senderId: string) => {
    if (senderId === currentUserId) return myProfileImage;
    if (otherUserId && senderId === otherUserId) {
      return (
        liveOtherProfileImage ??
        participantImages[senderId] ??
        headerAvatarUri ??
        chatImage
      );
    }
    return (
      participantImages[senderId] ??
      (senderId === otherUserId ? headerAvatarUri : null) ??
      chatImage
    );
  };

  const cancelComposerModes = () => {
    setQuotingMessage(null);
    setEditingMessage(null);
  };

  const openProfileForUserId = async (userId: string) => {
    if (!userId || userId === currentUserId) return;
    setProfileVisible(true);
    setProfileLoading(true);
    setProfileData(null);
    try {
      const profile = await getPublicUserProfile(userId);
      setProfileData(profile);
      if (userId === otherUserId) {
        const relations = await loadFriendRelations([userId]);
        setProfileRelation(relations[userId] ?? "none");
      } else {
        setProfileRelation("none");
      }
    } catch {
      Alert.alert("Error", "Could not load profile.");
      setProfileVisible(false);
    } finally {
      setProfileLoading(false);
    }
  };

  const openOtherProfile = async () => {
    if (!otherUserId || otherUserId === currentUserId) return;
    await openProfileForUserId(otherUserId);
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
    Alert.alert("Add friend", `Send a friend request to ${displayChatName}?`, [
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

  const handleAcceptFriendFromProfile = async () => {
    if (!otherUserId || isSupportAdminUser) return;
    try {
      setProfileFriendBusy(true);
      const request = await getPendingIncomingFriendRequest(otherUserId);
      if (!request || request.status !== "pending") {
        Alert.alert("Unavailable", "This friend request is no longer pending.");
        const relations = await loadFriendRelations([otherUserId]);
        setProfileRelation(relations[otherUserId] ?? "none");
        return;
      }
      await acceptFriendRequest(request);
      await resolveFriendRequestNotificationByRequestId(request.id, "accepted");
      setProfileRelation("friends");
      Alert.alert("Friend added", `You are now friends with ${displayChatName}.`);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not accept request.");
    } finally {
      setProfileFriendBusy(false);
    }
  };

  const handleDeclineFriendFromProfile = async () => {
    if (!otherUserId || isSupportAdminUser) return;
    try {
      setProfileFriendBusy(true);
      const request = await getPendingIncomingFriendRequest(otherUserId);
      if (!request) {
        Alert.alert("Unavailable", "This friend request is no longer pending.");
        const relations = await loadFriendRelations([otherUserId]);
        setProfileRelation(relations[otherUserId] ?? "none");
        return;
      }
      await rejectFriendRequest(request.id);
      await resolveFriendRequestNotificationByRequestId(request.id, "rejected");
      setProfileRelation("none");
      setProfileVisible(false);
      setProfileData(null);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not decline request.");
    } finally {
      setProfileFriendBusy(false);
    }
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
      setTimeout(() => scrollToBottom(true), 100);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not send sticker.");
    } finally {
      setSending(false);
    }
  };

  const pickAndComposeImage = async (source: "camera" | "library") => {
    if (!chatId || !canSendMessages || editingMessage) return;

    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        source === "camera"
          ? "Allow camera access to take a photo."
          : "Allow photo library access to choose an image."
      );
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.8,
            allowsMultipleSelection: false,
          });

    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;

    setStickerPickerVisible(false);
    setComposeImageUri(uri);
    setCropperVisible(false);
  };

  const closeComposeImageEditor = () => {
    if (processingComposeImage) return;
    setComposeImageUri(null);
    setCropperVisible(false);
  };

  const rotateComposeImage = async (degrees: -90 | 90) => {
    if (!composeImageUri || processingComposeImage) return;
    try {
      setProcessingComposeImage(true);
      const result = await ImageManipulator.manipulateAsync(
        composeImageUri,
        [{ rotate: degrees }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      setComposeImageUri(result.uri);
    } catch {
      Alert.alert("Photo editing", "Could not rotate this photo.");
    } finally {
      setProcessingComposeImage(false);
    }
  };

  const sendComposeImage = async () => {
    if (!chatId || !composeImageUri || !canSendMessages || processingComposeImage) return;
    try {
      setSending(true);
      setProcessingComposeImage(true);
      const imageUrl = await uploadChatImage(composeImageUri, chatId);
      const quote = quotingMessage
        ? buildMessageQuote(quotingMessage, resolveSenderName(quotingMessage.senderId))
        : undefined;
      await sendChatMessage(chatId, { imageUrl, quote });
      setQuotingMessage(null);
      setComposeImageUri(null);
      setCropperVisible(false);
      setTimeout(() => scrollToBottom(true), 100);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not send image.");
    } finally {
      setProcessingComposeImage(false);
      setSending(false);
    }
  };

  const openImagePicker = () => {
    if (!canSendMessages || sending || editingMessage) return;
    Keyboard.dismiss();
    Alert.alert("Send photo", "Choose how you want to add a photo.", [
      { text: "Cancel", style: "cancel" },
      { text: "Choose from library", onPress: () => void pickAndComposeImage("library") },
      { text: "Take photo", onPress: () => void pickAndComposeImage("camera") },
    ]);
  };

  const toggleStickerPicker = () => {
    if (editingMessage) return;
    if (stickerPickerVisible) {
      setStickerPickerVisible(false);
      return;
    }
    Keyboard.dismiss();
    setStickerPickerVisible(true);
    setTimeout(() => scrollToBottom(true), 100);
  };

  const startQuote = (message: ChatMessage) => {
    setQuotingMessage(message);
    setEditingMessage(null);
    setStickerPickerVisible(false);
    setTimeout(() => scrollToBottom(true), 100);
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
              if (viewerMessage?.id === message.id) {
                setViewerMessage(null);
                setViewerImageUri(null);
              }
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not recall message.");
            }
          })();
        },
      },
    ]);
  };

  const openImageViewer = (message: ChatMessage) => {
    if (!message.imageUrl || message.recalled) return;
    setViewerMessage(message);
    setViewerImageUri(message.imageUrl);
  };

  const closeImageViewer = () => {
    setViewerMessage(null);
    setViewerImageUri(null);
  };

  const canRecallViewerPhoto =
    viewerMessage != null &&
    !viewerMessage.recalled &&
    viewerMessage.senderId === currentUserId &&
    viewerMessage.isAutoReply !== true &&
    canModifyOwnChatMessage(viewerMessage, actionClock);

  // Keep the composer just above the keyboard:
  // - If Android already resized the window, only use a small pad (avoid a large gap).
  // - Otherwise lift by the keyboard height so the textbox is not covered.
  const inputBottomPadding = useMemo(() => {
    if (keyboardHeight <= 0) return insets.bottom + 8;
    if (Platform.OS === "android") {
      const screenH = Dimensions.get("screen").height;
      const windowShrunkForKeyboard = screenH - windowHeight > keyboardHeight * 0.45;
      if (windowShrunkForKeyboard) return 8;
    }
    return keyboardHeight + 8;
  }, [insets.bottom, keyboardHeight, windowHeight]);

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
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
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
              <ProfileAvatar uri={headerAvatarUri ?? chatImage} size={40} />
              <ThemedText className="text-xl font-extrabold flex-1 ml-3" numberOfLines={1}>
                {displayChatName}
              </ThemedText>
            </Pressable>
            <View className="flex-row items-center shrink-0">
              {isSupportAdminUser ? (
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
          contentContainerStyle={{ paddingVertical: 12, gap: 12, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => {
            stickToBottomRef.current = false;
          }}
          onContentSizeChange={() => {
            if (!stickToBottomRef.current) return;
            scrollRef.current?.scrollToEnd({ animated: false });
          }}
          onLayout={() => {
            if (!stickToBottomRef.current) return;
            if (messages.length > 0 || showSupportWelcome) {
              scrollRef.current?.scrollToEnd({ animated: false });
            }
          }}
        >
          {!messagesHydrated ? (
            <View className="py-8 items-center">
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : (
            <>
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
            const isFromAdmin = Boolean(adminUid && message.senderId === adminUid);
            const isAccentBubble = isMe || isFromAdmin;
            const accentBubbleColor = isFromAdmin ? ADMIN_CHAT_BLUE : USER_CHAT_GREEN;
            const isAuto = message.isAutoReply === true;
            const avatar = senderImage(message.senderId);
            const displayText = messageSummary(message);
            const isSticker = message.messageType === "sticker" && !message.recalled;
            const isImage =
              message.messageType === "image" && Boolean(message.imageUrl) && !message.recalled;
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
            const canOpenSenderProfile =
              Boolean(message.senderId) && message.senderId !== currentUserId;

            return (
              <View
                key={message.id}
                className={`flex-row items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}
              >
                {!isMe ? (
                  <Pressable
                    onPress={() => void openProfileForUserId(message.senderId)}
                    disabled={!canOpenSenderProfile}
                  >
                    <ProfileAvatar uri={avatar} size={32} />
                  </Pressable>
                ) : null}
                <View className={`max-w-[78%] ${isMe ? "items-end" : "items-start"}`}>
                  <Pressable
                    onPress={() => {
                      if (isImage && message.imageUrl) openImageViewer(message);
                    }}
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
                        {message.quote ? (
                          <QuoteBlock quote={message.quote} onColoredBubble={isAccentBubble} />
                        ) : null}
                        <Image
                          source={sticker.source}
                          style={{
                            width: CHAT_STICKER_MESSAGE_SIZE,
                            height: CHAT_STICKER_MESSAGE_SIZE,
                          }}
                          contentFit="contain"
                        />
                      </View>
                    ) : isImage && message.imageUrl ? (
                      <View className="overflow-hidden rounded-2xl">
                        {message.quote ? (
                          <View
                            className="px-3 pt-3"
                            style={
                              isAccentBubble
                                ? { backgroundColor: accentBubbleColor }
                                : cardStyle
                            }
                          >
                            <QuoteBlock quote={message.quote} onColoredBubble={isAccentBubble} />
                          </View>
                        ) : null}
                        <Image
                          source={{ uri: message.imageUrl }}
                          style={{ width: 220, height: 220, maxWidth: "100%" }}
                          contentFit="cover"
                        />
                      </View>
                    ) : isSharedPost && sharedPostData ? (
                      <View>
                        {message.quote ? (
                          <QuoteBlock quote={message.quote} onColoredBubble={isAccentBubble} />
                        ) : null}
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
                        className="rounded-2xl px-4 py-3"
                        style={
                          isAccentBubble
                            ? { backgroundColor: accentBubbleColor }
                            : cardStyle
                        }
                      >
                        {isAuto || isFromAdmin ? (
                          <Text
                            className="text-[10px] font-bold mb-1"
                            style={{
                              color: isAccentBubble ? "rgba(255,255,255,0.95)" : ADMIN_CHAT_BLUE,
                            }}
                          >
                            Support Admin
                          </Text>
                        ) : null}
                        {message.quote ? (
                          <QuoteBlock quote={message.quote} onColoredBubble={isAccentBubble} />
                        ) : null}
                        {displayText ? (
                          <ChatFormattedText
                            text={displayText}
                            className={
                              isAccentBubble
                                ? "text-white text-sm leading-6"
                                : "text-sm leading-6"
                            }
                            style={[
                              { flexShrink: 1 },
                              isAccentBubble ? undefined : textSecondary,
                            ]}
                            boldClassName={
                              isAccentBubble ? "font-extrabold text-white" : "font-extrabold"
                            }
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
            </>
          )}
        </ScrollView>

        {canSendMessages || isSupportAdminUser ? (
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
            <View
              className="flex-1 flex-row items-end rounded-2xl border overflow-hidden"
              style={[inputStyle, { paddingRight: 4 }]}
            >
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={editingMessage ? "Edit your message..." : "Type a message..."}
                multiline
                onFocus={() => {
                  setStickerPickerVisible(false);
                  setTimeout(() => scrollToBottom(true), 300);
                }}
                className="flex-1 px-4 py-3 text-sm max-h-28"
                style={{ color: (inputStyle as { color?: string })?.color }}
                placeholderTextColor={placeholderColor}
              />
              <Pressable
                onPress={toggleStickerPicker}
                disabled={sending || Boolean(editingMessage)}
                className={`w-9 h-9 mb-1 mr-1 rounded-full items-center justify-center ${
                  editingMessage ? "opacity-40" : ""
                }`}
                style={
                  stickerPickerVisible
                    ? { backgroundColor: theme.accent }
                    : { backgroundColor: theme.accentSoft }
                }
              >
                <Ionicons
                  name="happy-outline"
                  size={18}
                  color={stickerPickerVisible ? "white" : theme.accentText}
                />
              </Pressable>
            </View>
            <Pressable
              onPress={openImagePicker}
              disabled={sending || Boolean(editingMessage)}
              className={`w-11 h-11 rounded-full items-center justify-center border ${
                editingMessage ? "opacity-40" : ""
              }`}
              style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
            >
              <Ionicons name="image-outline" size={20} color={theme.accentText} />
            </Pressable>
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
            {otherAccountMissing ? (
              <ThemedText variant="muted" className="text-xs text-center">
                {ACCOUNT_UNAVAILABLE_MESSAGE}
              </ThemedText>
            ) : profileRelation === "pending_incoming" ? (
              <View className="items-center gap-3">
                <ThemedText variant="muted" className="text-xs text-center">
                  {displayChatName} sent you a friend request
                </ThemedText>
                <View className="flex-row gap-2 w-full max-w-sm">
                  <Pressable
                    onPress={() => void handleAcceptFriendFromProfile()}
                    disabled={profileFriendBusy}
                    className="flex-1 flex-row items-center justify-center rounded-full px-5 py-3 bg-[#52B69A]"
                    style={{ opacity: profileFriendBusy ? 0.7 : 1 }}
                  >
                    {profileFriendBusy ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text className="text-sm font-extrabold text-white">Accept</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => void handleDeclineFriendFromProfile()}
                    disabled={profileFriendBusy}
                    className="flex-1 flex-row items-center justify-center rounded-full px-5 py-3"
                    style={{
                      backgroundColor: theme.danger,
                      opacity: profileFriendBusy ? 0.7 : 1,
                    }}
                  >
                    <Text className="text-sm font-extrabold text-white">Decline</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <ThemedText variant="muted" className="text-xs text-center">
                {`Add ${displayChatName} as a friend to send messages.`}
              </ThemedText>
            )}
          </View>
        )}
    </View>
      </KeyboardAvoidingView>

      <ChatMessageMenuModal
        visible={menuMessage !== null}
        message={menuMessage}
        canEdit={
          menuMessage != null &&
          !menuMessage.recalled &&
          menuMessage.senderId === currentUserId &&
          menuMessage.messageType === "text" &&
          menuMessage.isAutoReply !== true &&
          canModifyOwnChatMessage(menuMessage, actionClock)
        }
        canRecall={
          menuMessage != null &&
          !menuMessage.recalled &&
          menuMessage.senderId === currentUserId &&
          menuMessage.isAutoReply !== true &&
          (menuMessage.messageType === "text" ||
            menuMessage.messageType === "image" ||
            menuMessage.messageType === "sticker" ||
            menuMessage.messageType === "voice" ||
            menuMessage.messageType === "post") &&
          canModifyOwnChatMessage(menuMessage, actionClock)
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
        isSelf={profileData?.id === currentUserId || otherUserId === currentUserId}
        isSupportAdmin={
          isSupportAdminUser ||
          (adminUid != null && profileData?.id === adminUid)
        }
        canAddFriend={!isSupportAdminUser && !isAdminUser}
        onClose={() => {
          setProfileVisible(false);
          setProfileData(null);
        }}
        onAddFriend={handleAddFriend}
        onAcceptFriend={() => void handleAcceptFriendFromProfile()}
        onDeclineFriend={() => void handleDeclineFriendFromProfile()}
        friendActionBusy={profileFriendBusy}
        onChat={
          isSupportAdminUser || isAdminUser
            ? () => setProfileVisible(false)
            : undefined
        }
        onOpenPost={(postId) => {
          setProfileVisible(false);
          setProfileData(null);
          router.push({
            pathname: "/community-post" as any,
            params: { postId },
          });
        }}
      />

      <ChatImageViewerModal
        uri={viewerImageUri}
        onClose={closeImageViewer}
        canRecall={canRecallViewerPhoto}
        onRecall={() => {
          if (viewerMessage) handleRecall(viewerMessage);
        }}
      />

      <Modal
        visible={composeImageUri != null}
        animationType="slide"
        onRequestClose={closeComposeImageEditor}
      >
        <View className="flex-1 bg-black">
          <View
            className="flex-row items-center justify-between px-4 pb-3"
            style={{ paddingTop: insets.top + 10 }}
          >
            <Pressable
              onPress={closeComposeImageEditor}
              disabled={processingComposeImage}
              hitSlop={8}
            >
              <Ionicons name="close" size={28} color="white" />
            </Pressable>
            <Text className="text-lg font-extrabold text-white">Edit photo</Text>
            <Pressable
              onPress={() => void sendComposeImage()}
              disabled={processingComposeImage || sending || !composeImageUri}
              hitSlop={8}
            >
              <Text
                className="text-base font-extrabold"
                style={{ color: processingComposeImage || sending ? "#6b7280" : "#52B69A" }}
              >
                Send
              </Text>
            </Pressable>
          </View>

          <View className="flex-1 items-center justify-center px-3">
            {composeImageUri ? (
              <Image
                source={{ uri: composeImageUri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
              />
            ) : null}
            {processingComposeImage || sending ? (
              <View className="absolute inset-0 items-center justify-center bg-black/40">
                <ActivityIndicator color="white" size="large" />
              </View>
            ) : null}
          </View>

          <View
            className="flex-row gap-3 px-4 pt-4"
            style={{ paddingBottom: insets.bottom + 16, backgroundColor: theme.navBg }}
          >
            <Pressable
              onPress={() => void rotateComposeImage(-90)}
              disabled={processingComposeImage || !composeImageUri}
              className="flex-1 items-center rounded-2xl py-3"
              style={{ backgroundColor: theme.rowBg }}
            >
              <Ionicons name="refresh-outline" size={22} color={theme.textPrimary} />
              <Text className="mt-1 text-xs font-bold" style={{ color: theme.textPrimary }}>
                Rotate left
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setCropperVisible(true)}
              disabled={processingComposeImage || !composeImageUri}
              className="flex-1 items-center rounded-2xl py-3"
              style={{ backgroundColor: theme.rowBg }}
            >
              <Ionicons name="crop-outline" size={22} color={theme.textPrimary} />
              <Text className="mt-1 text-xs font-bold" style={{ color: theme.textPrimary }}>
                Crop
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void rotateComposeImage(90)}
              disabled={processingComposeImage || !composeImageUri}
              className="flex-1 items-center rounded-2xl py-3"
              style={{ backgroundColor: theme.rowBg }}
            >
              <Ionicons name="reload-outline" size={22} color={theme.textPrimary} />
              <Text className="mt-1 text-xs font-bold" style={{ color: theme.textPrimary }}>
                Rotate right
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {composeImageUri ? (
        <ImageEditor
          isVisible={cropperVisible}
          imageUri={composeImageUri}
          onEditingComplete={(croppedImageData) => {
            setComposeImageUri(croppedImageData.uri);
            setCropperVisible(false);
          }}
          onEditingCancel={() => setCropperVisible(false)}
          dynamicCrop
        />
      ) : null}
    </ThemedScreen>
  );
}
