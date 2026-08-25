import { auth, db } from "../firebaseConfig";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import type { ActiveChatState, ArchivedChatSession, StoredChatMessage } from "./aiCoachStorage";
import { buildSessionTitle, defaultWelcomeMessages, hasUserMessages } from "./aiCoachStorage";

function activeCloudRef(uid: string) {
  return doc(db, "users", uid, "aiCoach", "active");
}

function sessionsCollection(uid: string) {
  return collection(db, "users", uid, "aiCoachSessions");
}

function sessionDoc(uid: string, sessionId: string) {
  return doc(db, "users", uid, "aiCoachSessions", sessionId);
}

function normalizeMessages(raw: unknown): StoredChatMessage[] {
  if (!Array.isArray(raw)) return defaultWelcomeMessages();
  return raw
    .filter((item): item is StoredChatMessage => item != null && typeof item === "object")
    .map((message) => ({
      id: typeof message.id === "string" ? message.id : `${Date.now()}`,
      role: message.role === "assistant" ? "assistant" : "user",
      text: typeof message.text === "string" ? message.text : "",
      imageUri:
        typeof message.imageUri === "string" && message.imageUri.trim().length > 0
          ? message.imageUri.trim()
          : undefined,
      createdAt:
        typeof message.createdAt === "number" && Number.isFinite(message.createdAt) && message.createdAt > 0
          ? message.createdAt
          : undefined,
    }));
}

export function canSyncAiCoachCloud(uid: string | null | undefined): uid is string {
  return Boolean(uid && uid !== "guest" && auth.currentUser?.uid === uid);
}

export async function loadActiveChatCloud(uid: string): Promise<ActiveChatState | null> {
  if (!canSyncAiCoachCloud(uid)) return null;
  const snap = await getDoc(activeCloudRef(uid));
  if (!snap.exists()) return null;

  const data = snap.data() as Record<string, unknown>;
  const messages = normalizeMessages(data.messages);
  return {
    sessionId: typeof data.sessionId === "string" ? data.sessionId : null,
    messages: messages.length > 0 ? messages : defaultWelcomeMessages(),
  };
}

export async function saveActiveChatCloud(
  uid: string,
  sessionId: string | null,
  messages: StoredChatMessage[]
): Promise<void> {
  if (!canSyncAiCoachCloud(uid)) return;
  await setDoc(activeCloudRef(uid), {
    sessionId,
    messages,
    updatedAt: Date.now(),
  });
}

export async function loadArchivedChatsCloud(uid: string): Promise<ArchivedChatSession[] | null> {
  if (!canSyncAiCoachCloud(uid)) return null;
  const snap = await getDocs(sessionsCollection(uid));
  if (snap.empty) return [];

  const sessions = snap.docs
    .map((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const messages = normalizeMessages(data.messages);
      const updatedAt =
        typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
          ? data.updatedAt
          : Date.now();
      return {
        id: docSnap.id,
        messages,
        updatedAt,
        preview:
          typeof data.preview === "string" && data.preview.trim().length > 0
            ? data.preview.trim()
            : buildSessionTitle(messages),
      } satisfies ArchivedChatSession;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return sessions;
}

export async function upsertHistorySessionCloud(
  uid: string,
  sessionId: string,
  messages: StoredChatMessage[]
): Promise<void> {
  if (!canSyncAiCoachCloud(uid) || !hasUserMessages(messages)) return;
  await setDoc(sessionDoc(uid, sessionId), {
    messages,
    updatedAt: Date.now(),
    preview: buildSessionTitle(messages),
  });
}

export async function deleteArchivedChatCloud(uid: string, sessionId: string): Promise<void> {
  if (!canSyncAiCoachCloud(uid)) return;
  await deleteDoc(sessionDoc(uid, sessionId)).catch(() => {});
}

export async function replaceArchivedChatsCloud(
  uid: string,
  sessions: ArchivedChatSession[]
): Promise<void> {
  if (!canSyncAiCoachCloud(uid)) return;

  const snap = await getDocs(sessionsCollection(uid));
  const batch = writeBatch(db);
  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
  }
  for (const session of sessions) {
    batch.set(sessionDoc(uid, session.id), {
      messages: session.messages,
      updatedAt: session.updatedAt,
      preview: session.preview,
    });
  }
  await batch.commit();
}
