import { Pressable } from "@/components/Pressable";
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
import { fetchCoachUserContext } from "@/lib/aiCoachContext";
import { ChatFormattedText } from "@/lib/chatFormattedText";
import { isGeminiConfigured, sendCoachMessage, type CoachChatTurn } from "@/lib/geminiCoach";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
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

async function copyMessageText(text: string) {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    Alert.alert("Copied", "Message copied to clipboard.");
    return;
  }
  try {
    const Clipboard = await import("expo-clipboard");
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", "Message copied to clipboard.");
  } catch {
    Alert.alert("Copy", "Select the message text, then use your device copy action.");
  }
}

function MessageBubble({
  message,
  onCopy,
}: {
  message: ChatMessage;
  onCopy: (text: string) => void;
}) {
  const copyBtnColor = message.role === "user" ? "#ffffff" : "#6b7280";

  if (message.role === "assistant") {
    return (
      <View className="w-full flex-row items-start pr-1">
        <View className="w-9 h-9 rounded-full bg-[#76C893] items-center justify-center mr-2 mt-0.5 shrink-0">
          <MaterialCommunityIcons name="robot-happy-outline" size={18} color="white" />
        </View>
        <View
          className="flex-1 shrink bg-white rounded-2xl px-4 py-3 border border-gray-200"
          style={{ maxWidth: "88%" }}
        >
          <ChatFormattedText
            text={message.text}
            className="text-base text-gray-800 leading-6 text-left"
            boldClassName="font-extrabold text-gray-900"
            selectable
          />
          <Pressable
            onPress={() => onCopy(message.text)}
            onLongPress={() => onCopy(message.text)}
            hitSlop={8}
            className="flex-row items-center self-end mt-2 active:opacity-70"
          >
            <Ionicons name="copy-outline" size={15} color={copyBtnColor} />
            <Text className="text-xs text-gray-500 ml-1 font-semibold text-left">Copy</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="w-full flex-row justify-end">
      <View className="max-w-[88%] bg-[#76C893] rounded-2xl px-4 py-3">
        <ChatFormattedText
          text={message.text}
          className="text-base text-white leading-6 text-left"
          boldClassName="font-extrabold text-white"
          selectable
        />
        <Pressable
          onPress={() => onCopy(message.text)}
          onLongPress={() => onCopy(message.text)}
          hitSlop={8}
          className="flex-row items-center self-end mt-2 active:opacity-70"
        >
          <Ionicons name="copy-outline" size={15} color="white" />
          <Text className="text-xs text-white/90 ml-1 font-semibold text-left">Copy</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AICoachScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const calendarTz = useUserCalendarTimezone();
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

  const handleCopy = useCallback((text: string) => {
    void copyMessageText(text);
  }, []);

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

      const userMsg: ChatMessage = { id: makeId(), role: "user", text: trimmed };

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
        const assistantMsg: ChatMessage = { id: makeId(), role: "assistant", text: reply };
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
      if (Platform.OS === "android") {
        setKeyboardHeight(e.endCoordinates.height);
      }
      scrollToBottom();
    };
    const onHide = () => {
      if (Platform.OS === "android") {
        setKeyboardHeight(0);
      }
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToBottom]);

  const inputBarBottomPad =
    Platform.OS === "android" && keyboardHeight > 0 ? keyboardHeight : insets.bottom + 12;
  const showSuggestedPrompts = messages.length <= 1 && !sending;
  const headerOffset = insets.top + 12 + 56;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#f3f4f3]"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerOffset : 0}
    >
      <View className="flex-1" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center px-3 mb-4">
          <Pressable
            onPress={() => router.back()}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-2 shrink-0"
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <View className="flex-1 min-w-0 mr-2">
            <Text className="text-2xl font-extrabold text-gray-900 text-left">AI Chatbot</Text>
            <Text className="text-xs font-semibold text-[#52B69A] mt-0.5 text-left">Powered by Gemini</Text>
          </View>
          <Pressable
            onPress={() => void openHistory()}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-white items-center justify-center border border-gray-200 mr-2 shrink-0 active:opacity-90"
          >
            <Ionicons name="time-outline" size={22} color="#374151" />
          </Pressable>
          <Pressable
            onPress={() => void handleNewChat()}
            disabled={sending}
            className="px-3 py-2 rounded-full bg-[#76C893] border border-[#5fb07d] shrink-0 active:opacity-90"
          >
            <Text className="text-xs font-extrabold text-white">New chat</Text>
          </Pressable>
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
              <MessageBubble message={message} onCopy={handleCopy} />
            </View>
          ))}

          {sending ? (
            <View className="mb-3 w-full flex-row items-start pr-1">
              <View className="w-9 h-9 rounded-full bg-[#76C893] items-center justify-center mr-2 shrink-0">
                <MaterialCommunityIcons name="robot-happy-outline" size={18} color="white" />
              </View>
              <View
                className="flex-1 shrink bg-white rounded-2xl px-4 py-3 border border-gray-200 flex-row items-center"
                style={{ maxWidth: "88%" }}
              >
                <ActivityIndicator size="small" color="#76C893" />
                <Text className="text-sm text-gray-500 ml-2 text-left">Thinking...</Text>
              </View>
            </View>
          ) : null}

          {showSuggestedPrompts ? (
            <View className="mt-2">
              <Text className="text-sm font-extrabold text-gray-900 mb-3 text-left">Suggested prompts</Text>
              <View className="gap-2">
                {PROMPTS.map((prompt) => (
                  <Pressable
                    key={prompt}
                    onPress={() => void sendText(prompt)}
                    className="bg-white rounded-2xl px-4 py-3 border border-gray-200 active:opacity-90"
                  >
                    <Text className="text-sm font-semibold text-gray-700 text-left">{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View
          className="px-3 pt-3 border-t border-gray-200 bg-white"
          style={{ paddingBottom: inputBarBottomPad }}
        >
          <View className="flex-row items-end gap-2">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask something..."
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={2000}
              editable={!sending}
              className="flex-1 min-h-[44px] max-h-28 bg-[#f3f4f3] rounded-2xl px-4 py-3 text-base text-gray-900 border border-gray-200"
              onSubmitEditing={() => void sendText(input)}
              blurOnSubmit={false}
              onFocus={scrollToBottom}
            />
            <Pressable
              onPress={() => void sendText(input)}
              disabled={sending || !input.trim()}
              className={`w-12 h-12 rounded-full items-center justify-center ${
                sending || !input.trim() ? "bg-gray-300" : "bg-[#76C893] active:opacity-90"
              }`}
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
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setHistoryVisible(false)}>
          <Pressable
            className="bg-white rounded-t-3xl px-4 pt-5 border border-gray-100"
            style={{ paddingBottom: insets.bottom + 16, maxHeight: "70%" }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-extrabold text-gray-900 text-left">Chat history</Text>
              <Pressable onPress={() => setHistoryVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={26} color="#374151" />
              </Pressable>
            </View>
            {archivedSessions.length === 0 ? (
              <Text className="text-sm text-gray-500 leading-6 pb-4 text-left">
                Your chat title appears here after you ask a question and get a reply. Follow-up questions stay in the
                same chat until you tap New chat.
              </Text>
            ) : (
              <ScrollView className="max-h-96" keyboardShouldPersistTaps="handled">
                {archivedSessions.map((session) => (
                  <View
                    key={session.id}
                    className="mb-2 flex-row items-start gap-2 rounded-2xl border border-gray-200 bg-[#f9fafb] px-3 py-3"
                  >
                    <Pressable
                      onPress={() => resumeSession(session)}
                      className="flex-1 min-w-0 active:opacity-90"
                    >
                      <Text className="text-sm font-bold text-gray-900 text-left" numberOfLines={2}>
                        {session.preview}
                      </Text>
                      <Text className="text-xs text-gray-500 mt-1 text-left">
                        {formatSessionDate(session.updatedAt)}
                      </Text>
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
    </KeyboardAvoidingView>
  );
}
