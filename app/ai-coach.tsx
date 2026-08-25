import { Pressable } from "@/components/Pressable";
import {
    ProfileScreenHeader,
    ThemedText,
    useProfileCardStyles
} from "@/components/themed/ThemedUi";
import { ZoomableImageModal } from "@/components/ZoomableImageModal";
import { fetchCoachUserContext } from "@/lib/aiCoachContext";
import { isRemoteImageUri, uploadAiCoachImage } from "@/lib/aiCoachImageStorage";
import {
    defaultWelcomeMessages,
    deleteArchivedChat,
    hasUserMessages,
    loadActiveChat,
    loadArchivedChats,
    makeChatSessionId,
    saveActiveChat,
    upsertHistorySession,
    type ArchivedChatSession,
    type StoredChatMessage,
} from "@/lib/aiCoachStorage";
import { ChatFormattedText } from "@/lib/chatFormattedText";
import { formatChatMessageTime } from "@/lib/chatMessageUtils";
import {
    isGeminiConfigured,
    sendCoachMessage,
    warmupGeminiConnection,
    type CoachChatTurn,
} from "@/lib/geminiCoach";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Keyboard,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    View,
    type KeyboardEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";

const PROMPTS = [
  "What should I eat today for my fitness goal?",
  "Explain my workout plan schedule",
  "How do I log a meal in the app?",
  "Tips for hitting my calorie target",
  "How can I recover better after workouts?",
];

type ChatMessage = StoredChatMessage & {
  /** Transient UI-only row while waiting for Gemini (never persisted). */
  pending?: boolean;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function withoutPending(messages: ChatMessage[]): StoredChatMessage[] {
  return messages
    .filter((m) => !m.pending)
    .map(({ pending: _pending, ...rest }) => rest);
}

function formatSessionDate(ms: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function MessageBubble({
  message,
  onOpenImage,
  accentColor,
}: {
  message: ChatMessage;
  onOpenImage?: (uri: string) => void;
  accentColor?: string;
}) {
  const { cardStyle, textSecondary } = useThemedScreen();
  const timeLabel =
    typeof message.createdAt === "number" && message.createdAt > 0
      ? formatChatMessageTime(message.createdAt)
      : "";
  const hasText = message.text.trim().length > 0;
  const imageUri = message.imageUri?.trim() || "";

  if (message.role === "assistant") {
    return (
      <View className="w-full flex-row items-start pr-1">
        <View className="w-9 h-9 rounded-full bg-[#76C893] items-center justify-center mr-2 mt-0.5 shrink-0">
          <MaterialCommunityIcons name="robot-happy-outline" size={18} color="white" />
        </View>
        <View className="flex-1 shrink" style={{ maxWidth: "88%" }}>
          <View className="rounded-2xl px-4 py-3" style={cardStyle}>
            {message.pending ? (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color={accentColor} />
                <ThemedText variant="muted" className="text-sm ml-2 text-left">
                  Thinking...
                </ThemedText>
              </View>
            ) : (
              <ChatFormattedText
                text={message.text}
                className="text-base leading-6 text-left"
                style={textSecondary}
                boldClassName="font-extrabold"
                selectable
              />
            )}
          </View>
          {timeLabel && !message.pending ? (
            <ThemedText variant="muted" className="text-[10px] mt-1 ml-1">
              {timeLabel}
            </ThemedText>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View className="w-full items-end">
      <View className="max-w-[88%] bg-[#76C893] rounded-2xl px-3 py-3 overflow-hidden">
        {imageUri ? (
          <Pressable onPress={() => onOpenImage?.(imageUri)} className="mb-2 active:opacity-90">
            <Image
              source={{ uri: imageUri }}
              style={{ width: 220, height: 160, borderRadius: 12 }}
              contentFit="cover"
            />
          </Pressable>
        ) : null}
        {hasText ? (
          <ChatFormattedText
            text={message.text}
            className="text-base text-white leading-6 text-left px-1"
            boldClassName="font-extrabold text-white"
            selectable
          />
        ) : null}
      </View>
      {timeLabel ? (
        <ThemedText variant="muted" className="text-[10px] mt-1 mr-1">
          {timeLabel}
        </ThemedText>
      ) : null}
    </View>
  );
}

export default function AICoachScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const calendarTz = useUserCalendarTimezone();
  const { screenStyle, cardStyle, iconButtonStyle, textSecondary, theme } = useThemedScreen();
  const { inputStyle, modalCardStyle, placeholderColor, rowBorderStyle } = useProfileCardStyles();
  const scrollRef = useRef<ScrollView>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(defaultWelcomeMessages());
  const [archivedSessions, setArchivedSessions] = useState<ArchivedChatSession[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [input, setInput] = useState("");
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [viewerImageUri, setViewerImageUri] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [windowHeight, setWindowHeight] = useState(() => Dimensions.get("window").height);
  const coachContextRef = useRef<Awaited<ReturnType<typeof fetchCoachUserContext>> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const hydratedRef = useRef(false);
  const uidRef = useRef<string | null>(null);
  messagesRef.current = messages;
  uidRef.current = uid;
  hydratedRef.current = hydrated;

  const persistActive = useCallback(async (nextUid?: string | null) => {
    const id = nextUid ?? uidRef.current;
    if (!id) return;
    await saveActiveChat(id, sessionIdRef.current, withoutPending(messagesRef.current));
  }, []);

  useEffect(() => {
    warmupGeminiConnection();
  }, []);

  useEffect(() => {
    if (!uid || uid === "guest") {
      coachContextRef.current = null;
      return;
    }
    void fetchCoachUserContext(uid, calendarTz).then((ctx) => {
      coachContextRef.current = ctx;
    });
  }, [uid, calendarTz]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      const id = user?.uid ?? "guest";
      setUid(id);
      void (async () => {
        const active = await loadActiveChat(id);
        let archives = await loadArchivedChats(id);
        let sessionId = active.sessionId;
        let nextMessages = active.messages;

        // Legacy active chats without a session id still belong in History.
        if (hasUserMessages(nextMessages) && !sessionId) {
          sessionId = makeChatSessionId();
          archives = await upsertHistorySession(id, sessionId, nextMessages);
          await saveActiveChat(id, sessionId, nextMessages);
        }

        sessionIdRef.current = sessionId;
        setArchivedSessions(archives);
        setMessages(nextMessages);
        messagesRef.current = nextMessages;
        setHydrated(true);
      })();
    });
    return unsub;
  }, []);

  // Keep AsyncStorage in sync while chatting.
  useEffect(() => {
    if (!hydrated || !uid) return;
    void saveActiveChat(uid, sessionIdRef.current, withoutPending(messages));
  }, [messages, hydrated, uid]);

  // Persist the exact on-screen chat when leaving (back / blur / unmount).
  useFocusEffect(
    useCallback(() => {
      return () => {
        const id = uidRef.current;
        if (!id || !hydratedRef.current) return;
        const current = withoutPending(messagesRef.current);
        const sessionId = sessionIdRef.current;
        void saveActiveChat(id, sessionId, current);
        if (sessionId && hasUserMessages(current)) {
          void upsertHistorySession(id, sessionId, current);
        }
      };
    }, [])
  );

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const historyForApi = useCallback((chat: ChatMessage[]): CoachChatTurn[] => {
    return chat
      .filter((m) => m.id !== "welcome" && !m.pending)
      .map((m) => ({
        role: m.role,
        text:
          m.text.trim() ||
          (m.imageUri ? "[User sent a photo]" : m.role === "user" ? "" : m.text),
      }));
  }, []);

  const pickChatImage = useCallback(async (useCamera: boolean) => {
    if (sending) return;
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        useCamera
          ? "Allow camera access to take a photo for the chat."
          : "Allow photo library access to attach an image."
      );
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.8,
          allowsMultipleSelection: false,
        });
    if (result.canceled || !result.assets[0]?.uri) return;
    setPendingImageUri(result.assets[0].uri);
    scrollToBottom();
  }, [scrollToBottom, sending]);

  const openImagePicker = useCallback(() => {
    if (sending) return;
    Alert.alert("Add photo", "Attach an image to ask about food, meals, or workouts.", [
      { text: "Cancel", style: "cancel" },
      { text: "Take Photo", onPress: () => void pickChatImage(true) },
      { text: "Choose from Gallery", onPress: () => void pickChatImage(false) },
    ]);
  }, [pickChatImage, sending]);

  const openHistory = useCallback(async () => {
    if (!uid) return;
    // Flush current chat into history first so the list stays complete.
    const current = withoutPending(messagesRef.current);
    if (sessionIdRef.current && hasUserMessages(current)) {
      const archives = await upsertHistorySession(
        uid,
        sessionIdRef.current,
        current
      );
      setArchivedSessions(archives);
    } else {
      setArchivedSessions(await loadArchivedChats(uid));
    }
    setHistoryVisible(true);
  }, [uid]);

  const resumeSession = useCallback(
    async (session: ArchivedChatSession) => {
      if (!uid) return;
      // Archive whatever is on screen before switching.
      const current = withoutPending(messagesRef.current);
      if (
        sessionIdRef.current &&
        sessionIdRef.current !== session.id &&
        hasUserMessages(current)
      ) {
        await upsertHistorySession(uid, sessionIdRef.current, current);
      }
      sessionIdRef.current = session.id;
      messagesRef.current = session.messages;
      setMessages(session.messages);
      await saveActiveChat(uid, session.id, session.messages);
      setArchivedSessions(await loadArchivedChats(uid));
      setHistoryVisible(false);
      scrollToBottom();
    },
    [uid, scrollToBottom]
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      if (!uid) return;
      Alert.alert("Delete chat", "Remove this chat from history?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteArchivedChat(uid, sessionId).then(async (archives) => {
              setArchivedSessions(archives);
              if (sessionIdRef.current === sessionId) {
                sessionIdRef.current = null;
                const fresh = defaultWelcomeMessages();
                messagesRef.current = fresh;
                setMessages(fresh);
                await saveActiveChat(uid, null, fresh);
              }
            });
          },
        },
      ]);
    },
    [uid]
  );

  const handleNewChat = useCallback(async () => {
    if (!uid || sending) return;
    const current = withoutPending(messagesRef.current);
    if (sessionIdRef.current && hasUserMessages(current)) {
      const archives = await upsertHistorySession(
        uid,
        sessionIdRef.current,
        current
      );
      setArchivedSessions(archives);
    }
    sessionIdRef.current = null;
    const fresh = defaultWelcomeMessages();
    messagesRef.current = fresh;
    setMessages(fresh);
    setInput("");
    setPendingImageUri(null);
    await saveActiveChat(uid, null, fresh);
    scrollToBottom();
  }, [uid, sending, scrollToBottom]);

  const sendText = useCallback(
    async (text: string, imageUri?: string | null) => {
      const trimmed = text.trim();
      const attachmentUri =
        imageUri === undefined
          ? pendingImageUri?.trim() || null
          : imageUri?.trim() || null;
      if ((!trimmed && !attachmentUri) || sending) return;

      if (!isGeminiConfigured()) {
        Alert.alert(
          "API key required",
          "Open .env in the project root (next to package.json), set EXPO_PUBLIC_GEMINI_API_KEY=your_key from https://aistudio.google.com/apikey, then stop Expo and run: npx expo start --clear"
        );
        return;
      }

      if (attachmentUri && !isRemoteImageUri(attachmentUri) && (!uid || uid === "guest")) {
        Alert.alert("Sign in required", "Sign in to attach photos to your AI chat.");
        return;
      }

      const userMsgId = makeId();
      setSending(true);
      setInput("");
      setPendingImageUri(null);

      let storedImageUri = attachmentUri;
      if (attachmentUri && !isRemoteImageUri(attachmentUri)) {
        try {
          storedImageUri = await uploadAiCoachImage(attachmentUri, userMsgId);
        } catch (e) {
          setSending(false);
          setInput(trimmed);
          setPendingImageUri(attachmentUri);
          Alert.alert(
            "Upload failed",
            e instanceof Error ? e.message : "Could not upload the photo. Please try again."
          );
          return;
        }
      }

      const userMsg: ChatMessage = {
        id: userMsgId,
        role: "user",
        text: trimmed,
        imageUri: storedImageUri || undefined,
        createdAt: Date.now(),
      };

      if (!sessionIdRef.current) {
        sessionIdRef.current = makeChatSessionId();
      }

      const assistantId = makeId();
      const pendingAssistant: ChatMessage = {
        id: assistantId,
        role: "assistant",
        text: "",
        pending: true,
        createdAt: Date.now(),
      };

      const withUser = [...messagesRef.current, userMsg];
      const withPending = [...withUser, pendingAssistant];
      messagesRef.current = withPending;
      setMessages(withPending);
      scrollToBottom();
      if (uid) {
        await saveActiveChat(uid, sessionIdRef.current, withoutPending(withPending));
      }

      try {
        let context = coachContextRef.current;
        if (uid && uid !== "guest" && !context) {
          try {
            context = await Promise.race([
              fetchCoachUserContext(uid, calendarTz),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
            ]);
            if (context) coachContextRef.current = context;
          } catch {
            context = null;
          }
        } else if (uid && uid !== "guest") {
          void fetchCoachUserContext(uid, calendarTz)
            .then((ctx) => {
              coachContextRef.current = ctx;
            })
            .catch(() => {});
        }

        // Prior turns only — sendCoachMessage appends the new user message itself.
        const priorTurns = historyForApi(withUser.slice(0, -1));
        const reply = await sendCoachMessage(
          priorTurns,
          trimmed,
          context,
          (partial) => {
            const streamingMsg: ChatMessage = {
              id: assistantId,
              role: "assistant",
              text: partial,
              createdAt: Date.now(),
            };
            const live = [...withUser, streamingMsg];
            messagesRef.current = live;
            setMessages(live);
            scrollToBottom();
          },
          attachmentUri ? { uri: attachmentUri } : null
        );
        const assistantMsg: ChatMessage = {
          id: assistantId,
          role: "assistant",
          text: reply,
          createdAt: Date.now(),
        };
        const fullMessages = [...withUser, assistantMsg];
        messagesRef.current = fullMessages;
        setMessages(fullMessages);
        setSending(false);
        if (uid && sessionIdRef.current) {
          const toSave = withoutPending(fullMessages);
          await saveActiveChat(uid, sessionIdRef.current, toSave);
          const archives = await upsertHistorySession(
            uid,
            sessionIdRef.current,
            toSave
          );
          setArchivedSessions(archives);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not reach Gemini. Please try again.";
        Alert.alert("Chat error", msg);
        const rolledBack = withoutPending(
          messagesRef.current.filter((m) => m.id !== userMsg.id && m.id !== assistantId)
        );
        messagesRef.current = rolledBack;
        setMessages(rolledBack);
        setInput(trimmed);
        setPendingImageUri(attachmentUri);
        if (uid) {
          await saveActiveChat(uid, sessionIdRef.current, rolledBack);
        }
      } finally {
        setSending(false);
        scrollToBottom();
      }
    },
    [calendarTz, historyForApi, pendingImageUri, scrollToBottom, sending, uid]
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
      setWindowHeight(Dimensions.get("window").height);
      scrollToBottom();
    };
    const onHide = () => {
      setKeyboardHeight(0);
      setWindowHeight(Dimensions.get("window").height);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    const dimSub = Dimensions.addEventListener("change", ({ window }) => {
      setWindowHeight(window.height);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      dimSub.remove();
    };
  }, [scrollToBottom]);

  // Keep the composer just above the keyboard (no covered textbox, no large empty gap).
  const inputBarBottomPad =
    keyboardHeight <= 0
      ? insets.bottom + 12
      : Platform.OS === "android" &&
          Dimensions.get("screen").height - windowHeight > keyboardHeight * 0.45
        ? 8
        : keyboardHeight + 8;

  return (
    <View style={screenStyle}>
      <View className="flex-1" style={{ paddingTop: insets.top + 12 }}>
        <View className="px-3">
          <ProfileScreenHeader
            title="AI Chatbot"
            onBack={() => {
              void persistActive().finally(() => router.back());
            }}
            rightSlot={
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => void openHistory()}
                  hitSlop={8}
                  className="w-12 h-12 rounded-full items-center justify-center mr-2 shrink-0 active:opacity-90"
                  style={iconButtonStyle}
                >
                  <Ionicons name="time-outline" size={20} color={theme.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={() => void handleNewChat()}
                  disabled={sending}
                  className="px-3 py-2 rounded-full bg-[#76C893] border border-[#5fb07d] shrink-0 active:opacity-90"
                >
                  <Text className="text-xs font-extrabold text-white">New chat</Text>
                </Pressable>
              </View>
            }
          />
        
        </View>

        <ScrollView
          ref={scrollRef}
          className="flex-1 px-3"
          contentContainerStyle={{ paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToBottom}
        >
          {messages.map((message) => (
            <View key={message.id} className="mb-3 w-full">
              <MessageBubble
                message={message}
                accentColor={theme.accent}
                onOpenImage={(uri) => setViewerImageUri(uri)}
              />
            </View>
          ))}
        </ScrollView>

        <View
          className="px-3 pt-3 border-t"
          style={[
            { paddingBottom: inputBarBottomPad, backgroundColor: theme.navBg, borderTopColor: theme.navBorder },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            className="mb-2"
            contentContainerStyle={{ gap: 8, paddingRight: 4 }}
          >
            {PROMPTS.map((prompt) => (
              <Pressable
                key={prompt}
                onPress={() => void sendText(prompt, null)}
                disabled={sending || Boolean(pendingImageUri)}
                className="rounded-full px-3 py-2 active:opacity-80"
                style={{
                  backgroundColor: theme.cardBg,
                  borderWidth: 1,
                  borderColor: theme.navBorder,
                  opacity: sending || pendingImageUri ? 0.5 : 1,
                }}
              >
                <ThemedText variant="secondary" className="text-xs font-semibold" numberOfLines={1}>
                  {prompt}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>

          {pendingImageUri ? (
            <View className="mb-2 flex-row items-start">
              <View className="relative">
                <Image
                  source={{ uri: pendingImageUri }}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.navBorder,
                  }}
                  contentFit="cover"
                />
                <Pressable
                  onPress={() => setPendingImageUri(null)}
                  disabled={sending}
                  hitSlop={8}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full items-center justify-center"
                  style={{ backgroundColor: theme.danger }}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
              <ThemedText variant="muted" className="text-xs ml-3 mt-1 flex-1">
                Photo attached. Add a caption (optional), then send.
              </ThemedText>
            </View>
          ) : null}

          <View className="flex-row items-end gap-2">
            <Pressable
              onPress={openImagePicker}
              disabled={sending}
              className="w-12 h-12 rounded-full items-center justify-center active:opacity-90"
              style={iconButtonStyle}
            >
              <Ionicons name="image-outline" size={22} color={theme.textSecondary} />
            </Pressable>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={pendingImageUri ? "Add a caption (optional)..." : "Ask something..."}
              placeholderTextColor={placeholderColor}
              multiline
              maxLength={2000}
              editable={!sending}
              className="flex-1 min-h-[44px] max-h-28 rounded-2xl px-4 py-3 text-base"
              style={inputStyle}
              onSubmitEditing={() => void sendText(input)}
              blurOnSubmit={false}
              onFocus={scrollToBottom}
            />
            <Pressable
              onPress={() => void sendText(input)}
              disabled={sending || (!input.trim() && !pendingImageUri)}
              className="w-12 h-12 rounded-full items-center justify-center active:opacity-90"
              style={{
                backgroundColor:
                  sending || (!input.trim() && !pendingImageUri) ? theme.iconMuted : theme.accent,
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="send" size={20} color="white" />
              )}
            </Pressable>
          </View>
        </View>
      </View>

      <ZoomableImageModal
        visible={Boolean(viewerImageUri)}
        uri={viewerImageUri ?? undefined}
        onClose={() => setViewerImageUri(null)}
      />

      <Modal visible={historyVisible} transparent animationType="fade" onRequestClose={() => setHistoryVisible(false)}>
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: theme.modalOverlay }}
          onPress={() => setHistoryVisible(false)}
        >
          <Pressable
            className="rounded-t-3xl px-4 pt-5"
            style={[
              modalCardStyle,
              { paddingBottom: insets.bottom + 16, maxHeight: "70%", borderBottomWidth: 0 },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-4">
              <ThemedText className="text-xl font-extrabold text-left">Chat history</ThemedText>
              <Pressable onPress={() => setHistoryVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={26} color={theme.textSecondary} />
              </Pressable>
            </View>
            {archivedSessions.length === 0 ? (
              <ThemedText variant="muted" className="text-sm leading-6 pb-4 text-left">
                Your chat title appears here after you ask a question and get a reply. Follow-up questions stay in the
                same chat until you tap New chat.
              </ThemedText>
            ) : (
              <ScrollView className="max-h-96" keyboardShouldPersistTaps="handled">
                {archivedSessions.map((session) => (
                  <View
                    key={session.id}
                    className="mb-2 flex-row items-start gap-2 rounded-2xl px-3 py-3"
                    style={rowBorderStyle}
                  >
                    <Pressable
                      onPress={() => resumeSession(session)}
                      className="flex-1 min-w-0 active:opacity-90"
                    >
                      <ThemedText className="text-sm font-bold text-left" numberOfLines={2}>
                        {session.preview}
                      </ThemedText>
                      <ThemedText variant="muted" className="text-xs mt-1 text-left">
                        {formatSessionDate(session.updatedAt)}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDeleteSession(session.id)}
                      hitSlop={8}
                      className="w-9 h-9 rounded-full items-center justify-center shrink-0 active:opacity-70"
                    >
                      <Ionicons name="trash-outline" size={20} color="#dc2626" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
