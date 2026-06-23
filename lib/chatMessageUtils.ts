import { getChatSticker } from "./chatStickers";
import type { ChatMessage, ChatMessageQuote } from "./communityTypes";

export const CHAT_MESSAGE_ACTION_WINDOW_MS = 5 * 60 * 1000;

export function canModifyOwnChatMessage(message: ChatMessage, now = Date.now()): boolean {
  if (message.recalled) return false;
  if (!message.createdAt) return false;
  return now - message.createdAt <= CHAT_MESSAGE_ACTION_WINDOW_MS;
}

export function formatRecallNotice(
  message: ChatMessage,
  currentUserId: string | null,
  senderName: string
): string {
  if (message.senderId === currentUserId) return "You recalled a message";
  const name = message.recalledByName || senderName;
  return `${name} recalled a message`;
}

export function messageSummary(message: ChatMessage): string {
  if (message.recalled) return "";
  if (message.messageType === "sticker") {
    return getChatSticker(message.stickerId ?? "")?.label ?? "Sticker";
  }
  if (message.text.trim()) return message.text;
  if (message.messageType === "image") return "Photo";
  if (message.messageType === "voice") return "Voice message";
  return "";
}

export function buildMessageQuote(message: ChatMessage, senderName: string): ChatMessageQuote {
  return {
    messageId: message.id,
    senderId: message.senderId,
    senderName,
    text: messageSummary(message),
    messageType: message.messageType,
    stickerId: message.stickerId,
  };
}

export function quotePreviewText(quote: ChatMessageQuote): string {
  if (quote.messageType === "sticker") {
    return getChatSticker(quote.stickerId ?? "")?.label ?? (quote.text || "Sticker");
  }
  return quote.text;
}

export function formatChatMessageTime(timestamp: number): string {
  if (!timestamp || timestamp < 1) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (date.toDateString() === now.toDateString()) return time;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;

  const dateLabel = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateLabel} ${time}`;
}

/** Post feed timestamps — prefixes same-day posts with "Today". */
export function formatPostDisplayTime(timestamp: number): string {
  if (!timestamp || timestamp < 1) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (date.toDateString() === now.toDateString()) return `Today ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;

  const dateLabel = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateLabel} ${time}`;
}
