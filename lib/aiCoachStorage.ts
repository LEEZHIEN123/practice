import AsyncStorage from "@react-native-async-storage/async-storage";

export type StoredChatMessage = { id: string; role: "user" | "assistant"; text: string };

export type ArchivedChatSession = {
  id: string;
  messages: StoredChatMessage[];
  updatedAt: number;
  preview: string;
};

export type ActiveChatState = {
  sessionId: string | null;
  messages: StoredChatMessage[];
};

const WELCOME_TEXT =
  "Hi! I'm your fitness assistant. Ask me about workouts, meals, calories, water, steps, your fitness goal, or how to use features in this app.";

function activeKey(uid: string) {
  return `aiCoach:active:${uid}`;
}

function archiveKey(uid: string) {
  return `aiCoach:archive:${uid}`;
}

export function defaultWelcomeMessages(): StoredChatMessage[] {
  return [{ id: "welcome", role: "assistant", text: WELCOME_TEXT }];
}

export function hasUserMessages(messages: StoredChatMessage[]): boolean {
  return messages.some((m) => m.role === "user");
}

export function makeChatSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function stripMarkdown(text: string): string {
  return text.replace(/\*\*|__|\*|_/g, "").replace(/\s+/g, " ").trim();
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Title from the first user question and first assistant reply in the session. */
export function buildSessionTitle(messages: StoredChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "Chat";

  const firstAssistant = messages.find((m) => m.role === "assistant" && m.id !== "welcome");
  const question = truncate(stripMarkdown(firstUser.text), 40);

  if (!firstAssistant) return question;

  const answer = truncate(stripMarkdown(firstAssistant.text), 32);
  return truncate(`${question} — ${answer}`, 72);
}

export async function loadActiveChat(uid: string): Promise<ActiveChatState> {
  try {
    const raw = await AsyncStorage.getItem(activeKey(uid));
    if (!raw) return { sessionId: null, messages: defaultWelcomeMessages() };

    const parsed = JSON.parse(raw) as ActiveChatState | StoredChatMessage[];
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return { sessionId: null, messages: defaultWelcomeMessages() };
      return { sessionId: null, messages: parsed };
    }

    if (parsed?.messages && Array.isArray(parsed.messages)) {
      if (parsed.messages.length === 0) {
        return { sessionId: parsed.sessionId ?? null, messages: defaultWelcomeMessages() };
      }
      return { sessionId: parsed.sessionId ?? null, messages: parsed.messages };
    }

    return { sessionId: null, messages: defaultWelcomeMessages() };
  } catch {
    return { sessionId: null, messages: defaultWelcomeMessages() };
  }
}

export async function saveActiveChat(
  uid: string,
  sessionId: string | null,
  messages: StoredChatMessage[]
): Promise<void> {
  const payload: ActiveChatState = { sessionId, messages };
  await AsyncStorage.setItem(activeKey(uid), JSON.stringify(payload));
}

export async function loadArchivedChats(uid: string): Promise<ArchivedChatSession[]> {
  try {
    const raw = await AsyncStorage.getItem(archiveKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ArchivedChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveArchivedChats(uid: string, sessions: ArchivedChatSession[]): Promise<void> {
  await AsyncStorage.setItem(archiveKey(uid), JSON.stringify(sessions));
}

export async function deleteArchivedChat(uid: string, sessionId: string): Promise<ArchivedChatSession[]> {
  const sessions = await loadArchivedChats(uid);
  const next = sessions.filter((s) => s.id !== sessionId);
  await saveArchivedChats(uid, next);
  return next;
}

/** Create or update one history row for the current chat session. */
export async function upsertHistorySession(
  uid: string,
  sessionId: string,
  messages: StoredChatMessage[]
): Promise<ArchivedChatSession[]> {
  if (!hasUserMessages(messages)) return loadArchivedChats(uid);

  const sessions = await loadArchivedChats(uid);
  const session: ArchivedChatSession = {
    id: sessionId,
    messages,
    updatedAt: Date.now(),
    preview: buildSessionTitle(messages),
  };

  const next = [session, ...sessions.filter((s) => s.id !== sessionId)];
  await saveArchivedChats(uid, next);
  return next;
}
