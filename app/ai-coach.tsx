import { Pressable } from "@/components/Pressable";
import {
  ProfileScreenHeader,
  ThemedText,
  useProfileCardStyles
} from "@/components/themed/ThemedUi";
import { fetchCoachUserContext } from "@/lib/aiCoachContext";
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
import { isGeminiConfigured, sendCoachMessage, type CoachChatTurn } from "@/lib/geminiCoach";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  "How do remaining calories work on Home?",
  "Tips to hit my water and step goals",
];

type ChatMessage = StoredChatMessage;

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatSessionDate(ms: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const { cardStyle, textSecondary } = useThemedScreen();
  const timeLabel =
    typeof message.createdAt === "number" && message.createdAt > 0
      ? formatChatMessageTime(message.createdAt)
      : "";

  if (message.role === "assistant") {
    return (
      <View className="w-full flex-row items-start pr-1">
        <View className="w-9 h-9 rounded-full bg-[#76C893] items-center justify-center mr-2 mt-0.5 shrink-0">
          <MaterialCommunityIcons name="robot-happy-outline" size={18} color="white" />
        </View>
        <View className="flex-1 shrink" style={{ maxWidth: "88%" }}>
          <View className="rounded-2xl px-4 py-3" style={cardStyle}>
            <ChatFormattedText
              text={message.text}
              className="text-base leading-6 text-left"
              style={textSecondary}
              boldClassName="font-extrabold"
              selectable
            />
          </View>
          {timeLabel ? (
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
      <View className="max-w-[88%] bg-[#76C893] rounded-2xl px-4 py-3">
        <ChatFormattedText
          text={message.text}
          className="text-base text-white leading-6 text-left"
          boldClassName="font-extrabold text-white"
          selectable
        />
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
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const coachContextRef = useRef<Awaited<ReturnType<typeof fetchCoachUserContext>> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingArchiveRef = useRef<StoredChatMessage[] | null>(null);
  const pendingSessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const sessionIdStateRef = useRef<string | null>(null);
  messagesRef.current = messages;

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
        const archives = await loadArchivedChats(id);
        sessionIdRef.current = active.sessionId;
        sessionIdStateRef.current = active.sessionId;

        if (hasUserMessages(active.messages) && !active.sessionId) {
          const newId = makeChatSessionId();
          sessionIdRef.current = newId;
          sessionIdStateRef.current = newId;
          const synced = await upsertHistorySession(id, newId, active.messages);
          setArchivedSessions(synced);
          await saveActiveChat(id, newId, active.messages);
        } else {
          setArchivedSessions(archives);
        }

        setMessages(active.messages);
        setHydrated(true);
      })();
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated || !uid) return;
    const current = messagesRef.current;
    const sessionId = sessionIdStateRef.current;

    if (!hasUserMessages(current) && pendingArchiveRef.current) {
      void saveActiveChat(uid, pendingSessionIdRef.current, pendingArchiveRef.current);
      return;
    }
    void saveActiveChat(uid, sessionId, current);
  }, [messages, hydrated, uid]);

  useEffect(() => {
    return () => {
      if (!uid) return;
      const current = messagesRef.current;
      if (!hasUserMessages(current) && pendingArchiveRef.current) {
        void saveActiveChat(uid, pendingSessionIdRef.current, pendingArchiveRef.current);
      }
    };
  }, [uid]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const historyForApi = useCallback((): CoachChatTurn[] => {
    return messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, text: m.text }));
  }, [messages]);

  const openHistory = useCallback(async () => {
    if (!uid) return;
    const archives = await loadArchivedChats(uid);
    setArchivedSessions(archives);
    setHistoryVisible(true);
  }, [uid]);

  const resumeSession = useCallback(
    (session: ArchivedChatSession) => {
      if (!uid) return;
      pendingArchiveRef.current = null;
      pendingSessionIdRef.current = null;
      sessionIdRef.current = session.id;
      sessionIdStateRef.current = session.id;
      setMessages(session.messages);
      void saveActiveChat(uid, session.id, session.messages);
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
            void deleteArchivedChat(uid, sessionId).then((archives) => {
              setArchivedSessions(archives);
              if (sessionIdRef.current === sessionId) {
                sessionIdRef.current = null;
                sessionIdStateRef.current = null;
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
    if (hasUserMessages(messages)) {
      pendingArchiveRef.current = messages;
      pendingSessionIdRef.current = sessionIdRef.current;
    }
    sessionIdRef.current = null;
    sessionIdStateRef.current = null;
    const fresh = defaultWelcomeMessages();
    setMessages(fresh);
    setInput("");
    if (pendingArchiveRef.current) {
      await saveActiveChat(uid, pendingSessionIdRef.current, pendingArchiveRef.current);
    } else {
      await saveActiveChat(uid, null, fresh);
    }
    scrollToBottom();
  }, [uid, sending, messages, scrollToBottom]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      if (!isGeminiConfigured()) {
        Alert.alert(
          "API key required",
          "Open .env in the project root (next to package.json), set EXPO_PUBLIC_GEMINI_API_KEY=your_key from https://aistudio.google.com/apikey, then stop Expo and run: npx expo start --clear"
        );
        return;
      }

      const userMsg: ChatMessage = {
        id: makeId(),
        role: "user",
        text: trimmed,
        createdAt: Date.now(),
      };

      if (!sessionIdRef.current) {
        sessionIdRef.current = makeChatSessionId();
        sessionIdStateRef.current = sessionIdRef.current;
      }

      if (pendingArchiveRef.current) {
        pendingArchiveRef.current = null;
        pendingSessionIdRef.current = null;
      }

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSending(true);
      scrollToBottom();

      try {
        let context = coachContextRef.current;
        if (uid && uid !== "guest") {
          context = await fetchCoachUserContext(uid, calendarTz);
          coachContextRef.current = context;
        }
        const reply = await sendCoachMessage(historyForApi(), trimmed, context);
        const assistantMsg: ChatMessage = {
          id: makeId(),
          role: "assistant",
          text: reply,
          createdAt: Date.now(),
        };
        const fullMessages = [...messages, userMsg, assistantMsg];
        setMessages(fullMessages);
        if (uid && sessionIdRef.current) {
          const archives = await upsertHistorySession(uid, sessionIdRef.current, fullMessages);
          setArchivedSessions(archives);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not reach Gemini. Please try again.";
        Alert.alert("Chat error", msg);
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setInput(trimmed);
      } finally {
        setSending(false);
        scrollToBottom();
      }
    },
    [calendarTz, historyForApi, messages, scrollToBottom, sending, uid]
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
      scrollToBottom();
    };
    const onHide = () => {
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToBottom]);

  const inputBarBottomPad = keyboardHeight > 0 ? keyboardHeight + 8 : insets.bottom + 12;

  return (
    <View style={screenStyle}>
      <View className="flex-1" style={{ paddingTop: insets.top + 12 }}>
        <View className="px-3">
          <ProfileScreenHeader
            title="AI Chatbot"
            onBack={() => router.back()}
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
              <MessageBubble message={message} />
            </View>
          ))}

          {sending ? (
            <View className="mb-3 w-full flex-row items-start pr-1">
              <View className="w-9 h-9 rounded-full bg-[#76C893] items-center justify-center mr-2 shrink-0">
                <MaterialCommunityIcons name="robot-happy-outline" size={18} color="white" />
              </View>
              <View
                className="flex-1 shrink rounded-2xl px-4 py-3 flex-row items-center"
                style={[{ maxWidth: "88%" }, cardStyle]}
              >
                <ActivityIndicator size="small" color={theme.accent} />
                <ThemedText variant="muted" className="text-sm ml-2 text-left">
                  Thinking...
                </ThemedText>
              </View>
            </View>
          ) : null}
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
                onPress={() => void sendText(prompt)}
                disabled={sending}
                className="rounded-full px-3 py-2 active:opacity-80"
                style={{
                  backgroundColor: theme.cardBg,
                  borderWidth: 1,
                  borderColor: theme.navBorder,
                  opacity: sending ? 0.5 : 1,
                }}
              >
                <ThemedText variant="secondary" className="text-xs font-semibold" numberOfLines={1}>
                  {prompt}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
          <View className="flex-row items-end gap-2">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask something..."
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
              disabled={sending || !input.trim()}
              className="w-12 h-12 rounded-full items-center justify-center active:opacity-90"
              style={{
                backgroundColor: sending || !input.trim() ? theme.iconMuted : theme.accent,
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
