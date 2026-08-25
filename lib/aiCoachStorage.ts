import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadActiveChatCloud,
  loadArchivedChatsCloud,
  replaceArchivedChatsCloud,
  saveActiveChatCloud,
  upsertHistorySessionCloud,
} from "./aiCoachCloudStorage";

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Firebase Storage download URL or legacy local URI for older chats. */
  imageUri?: string;
  /** Unix ms when the message was sent. */
  createdAt?: number;
};

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
  "Hi! I'm your workout and nutrition assistant. Ask me about exercise, meals, calories, or how to find features in the app — I'm happy to help!";

function activeKey(uid: string) {
  return `aiCoach:active:${uid}`;
}

function archiveKey(uid: string) {
  return `aiCoach:archive:${uid}`;
}

export function defaultWelcomeMessages(): StoredChatMessage[] {
  return [{ id: "welcome", role: "assistant", text: WELCOME_TEXT, createdAt: Date.now() }];
}

function normalizeStoredMessage(message: StoredChatMessage): StoredChatMessage {
  return {
    ...message,
    imageUri:
      typeof message.imageUri === "string" && message.imageUri.trim().length > 0
        ? message.imageUri.trim()
        : undefined,
    createdAt:
      typeof message.createdAt === "number" && Number.isFinite(message.createdAt) && message.createdAt > 0
        ? message.createdAt
        : undefined,
  };
}

function normalizeStoredMessages(messages: StoredChatMessage[]): StoredChatMessage[] {
  return messages.map(normalizeStoredMessage);
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
  const questionSource =
    firstUser.text.trim() || (firstUser.imageUri ? "Photo question" : "Chat");
  const question = truncate(stripMarkdown(questionSource), 40);

  if (!firstAssistant) return question;

  const answer = truncate(stripMarkdown(firstAssistant.text), 32);
  return truncate(`${question} — ${answer}`, 72);
}

export async function loadActiveChat(uid: string): Promise<ActiveChatState> {
  const local = await loadActiveChatLocal(uid);

  if (uid !== "guest") {
    try {
      const cloud = await loadActiveChatCloud(uid);
      if (cloud) {
        await saveActiveChatLocal(uid, cloud.sessionId, cloud.messages);
        return cloud;
      }
      if (hasUserMessages(local.messages) || local.sessionId) {
        await saveActiveChatCloud(uid, local.sessionId, local.messages).catch(() => {});
      }
    } catch {
      // Fall back to device cache when offline or rules not deployed.
    }
  }

  return local;
}

async function loadActiveChatLocal(uid: string): Promise<ActiveChatState> {
  try {
    const raw = await AsyncStorage.getItem(activeKey(uid));
    if (!raw) return { sessionId: null, messages: defaultWelcomeMessages() };

    const parsed = JSON.parse(raw) as ActiveChatState | StoredChatMessage[];
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return { sessionId: null, messages: defaultWelcomeMessages() };
      return { sessionId: null, messages: normalizeStoredMessages(parsed) };
    }

    if (parsed?.messages && Array.isArray(parsed.messages)) {
      if (parsed.messages.length === 0) {
        return { sessionId: parsed.sessionId ?? null, messages: defaultWelcomeMessages() };
      }
      return {
        sessionId: parsed.sessionId ?? null,
        messages: normalizeStoredMessages(parsed.messages),
      };
    }

    return { sessionId: null, messages: defaultWelcomeMessages() };
  } catch {
    return { sessionId: null, messages: defaultWelcomeMessages() };
  }
}

async function saveActiveChatLocal(
  uid: string,
  sessionId: string | null,
  messages: StoredChatMessage[]
): Promise<void> {
  const payload: ActiveChatState = { sessionId, messages };
  await AsyncStorage.setItem(activeKey(uid), JSON.stringify(payload));
}

export async function saveActiveChat(
  uid: string,
  sessionId: string | null,
  messages: StoredChatMessage[]
): Promise<void> {
  await saveActiveChatLocal(uid, sessionId, messages);
  if (uid !== "guest") {
    await saveActiveChatCloud(uid, sessionId, messages).catch(() => {});
  }
}

export async function loadArchivedChats(uid: string): Promise<ArchivedChatSession[]> {
  const local = await loadArchivedChatsLocal(uid);

  if (uid !== "guest") {
    try {
      const cloud = await loadArchivedChatsCloud(uid);
      if (cloud && cloud.length > 0) {
        await saveArchivedChatsLocal(uid, cloud);
        return cloud;
      }
      if (local.length > 0) {
        await replaceArchivedChatsCloud(uid, local).catch(() => {});
      }
    } catch {
      // Fall back to device cache.
    }
  }

  return local;
}

async function loadArchivedChatsLocal(uid: string): Promise<ArchivedChatSession[]> {
  try {
    const raw = await AsyncStorage.getItem(archiveKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ArchivedChatSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((session) => ({
      ...session,
      messages: Array.isArray(session.messages)
        ? normalizeStoredMessages(session.messages)
        : [],
    }));
  } catch {
    return [];
  }
}

async function saveArchivedChatsLocal(uid: string, sessions: ArchivedChatSession[]): Promise<void> {
  await AsyncStorage.setItem(archiveKey(uid), JSON.stringify(sessions));
}

export async function saveArchivedChats(uid: string, sessions: ArchivedChatSession[]): Promise<void> {
  await saveArchivedChatsLocal(uid, sessions);
  if (uid !== "guest") {
    await replaceArchivedChatsCloud(uid, sessions).catch(() => {});
  }
}

export async function deleteArchivedChat(uid: string, sessionId: string): Promise<ArchivedChatSession[]> {
  const sessions = await loadArchivedChatsLocal(uid);
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
  if (uid !== "guest") {
    await upsertHistorySessionCloud(uid, sessionId, messages).catch(() => {});
  }
  return next;
}
