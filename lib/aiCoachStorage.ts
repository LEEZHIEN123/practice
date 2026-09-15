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
  updatedAt: number;
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

const memoryActive = new Map<string, ActiveChatState>();

function lastMessageAt(messages: StoredChatMessage[]): number {
  let latest = 0;
  for (const message of messages) {
    if (typeof message.createdAt === "number" && message.createdAt > latest) {
      latest = message.createdAt;
    }
  }
  return latest;
}

function activeUpdatedAt(state: ActiveChatState): number {
  if (typeof state.updatedAt === "number" && Number.isFinite(state.updatedAt) && state.updatedAt > 0) {
    return state.updatedAt;
  }
  // Don't treat a freshly generated welcome bubble as "newer" than a real chat.
  if (!hasUserMessages(state.messages)) return 0;
  return lastMessageAt(state.messages);
}

function withUpdatedAt(state: Omit<ActiveChatState, "updatedAt"> & { updatedAt?: number }): ActiveChatState {
  return {
    sessionId: state.sessionId,
    messages: normalizeStoredMessages(state.messages),
    updatedAt: activeUpdatedAt({
      sessionId: state.sessionId,
      messages: state.messages,
      updatedAt: state.updatedAt ?? 0,
    }),
  };
}

function pickLatestActiveChat(
  ...candidates: Array<ActiveChatState | null | undefined>
): ActiveChatState {
  let best: ActiveChatState | null = null;
  let bestAt = -1;
  let bestUsers = -1;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const at = activeUpdatedAt(candidate);
    const users = candidate.messages.filter((message) => message.role === "user").length;
    if (!best || at > bestAt || (at === bestAt && users > bestUsers)) {
      best = candidate;
      bestAt = at;
      bestUsers = users;
    }
  }
  return best ?? withUpdatedAt({ sessionId: null, messages: defaultWelcomeMessages() });
}

export function peekActiveChat(uid: string): ActiveChatState | null {
  return memoryActive.get(uid) ?? null;
}

export async function loadActiveChat(uid: string): Promise<ActiveChatState> {
  const memory = memoryActive.get(uid) ?? null;
  const local = await loadActiveChatLocal(uid);

  let cloud: ActiveChatState | null = null;
  if (uid !== "guest") {
    try {
      cloud = await loadActiveChatCloud(uid);
    } catch {
      // Fall back to device cache when offline or rules not deployed.
    }
  }

  const best = pickLatestActiveChat(memory, local, cloud);
  memoryActive.set(uid, best);
  await saveActiveChatLocal(uid, best.sessionId, best.messages, best.updatedAt);

  if (uid !== "guest" && (hasUserMessages(best.messages) || best.sessionId || best.updatedAt > 0)) {
    if (!cloud || activeUpdatedAt(cloud) < best.updatedAt) {
      await saveActiveChatCloud(uid, best.sessionId, best.messages).catch(() => {});
    }
  }

  return best;
}

async function loadActiveChatLocal(uid: string): Promise<ActiveChatState> {
  try {
    const raw = await AsyncStorage.getItem(activeKey(uid));
    if (!raw) return withUpdatedAt({ sessionId: null, messages: defaultWelcomeMessages() });

    const parsed = JSON.parse(raw) as ActiveChatState | StoredChatMessage[];
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return withUpdatedAt({ sessionId: null, messages: defaultWelcomeMessages() });
      return withUpdatedAt({ sessionId: null, messages: normalizeStoredMessages(parsed) });
    }

    if (parsed?.messages && Array.isArray(parsed.messages)) {
      const messages =
        parsed.messages.length === 0
          ? defaultWelcomeMessages()
          : normalizeStoredMessages(parsed.messages);
      return withUpdatedAt({
        sessionId: parsed.sessionId ?? null,
        messages,
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined,
      });
    }

    return withUpdatedAt({ sessionId: null, messages: defaultWelcomeMessages() });
  } catch {
    return withUpdatedAt({ sessionId: null, messages: defaultWelcomeMessages() });
  }
}

async function saveActiveChatLocal(
  uid: string,
  sessionId: string | null,
  messages: StoredChatMessage[],
  updatedAt = Date.now()
): Promise<void> {
  const payload: ActiveChatState = withUpdatedAt({ sessionId, messages, updatedAt });
  memoryActive.set(uid, payload);
  await AsyncStorage.setItem(activeKey(uid), JSON.stringify(payload));
}

export async function saveActiveChat(
  uid: string,
  sessionId: string | null,
  messages: StoredChatMessage[]
): Promise<void> {
  const updatedAt = Date.now();
  await saveActiveChatLocal(uid, sessionId, messages, updatedAt);
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
