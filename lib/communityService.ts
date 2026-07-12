import type { User } from "firebase/auth";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "../firebaseConfig";
import { canModifyOwnChatMessage } from "./chatMessageUtils";
import { getChatSticker } from "./chatStickers";
import type {
  ChatConversation,
  ChatMessage,
  ChatMessageQuote,
  CommunityComment,
  CommunityNotification,
  CommunityPost,
  CommunityReport,
  FriendListEntry,
  FriendRelation,
  FriendRequest,
  PendingReReviewRequest,
  PostCategory,
  PostEditSnapshot,
  PublicUserProfile,
  RegisteredUser,
  ReportTargetType,
} from "./communityTypes";
import { ADMIN_AUTO_REPLY, SUPPORT_CHAT_WELCOME_MESSAGE } from "./communityTypes";
import { calcBmi } from "./workoutPlan";

const PENDING_POSTS_COLLECTION = "communityPendingPosts";
const PENDING_COMMENTS_COLLECTION = "communityPendingComments";

async function localUriToBlob(uri: string): Promise<Blob> {
  if (uri.startsWith("file://") || uri.startsWith("content://")) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
          resolve(xhr.response as Blob);
          return;
        }
        reject(new Error("Could not read file"));
      };
      xhr.onerror = () => reject(new Error("Could not read file"));
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  }

  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read file");
  return response.blob();
}

type UserProfile = {
  name: string;
  profileImage: string | null;
  isAdmin?: boolean;
};

function firestoreWriteError(e: unknown, action: string): Error {
  const code = (e as { code?: string })?.code;
  if (code === "permission-denied") {
    return new Error(
      `Could not ${action}. Sign in again, or publish the latest Firestore rules in Firebase Console.`
    );
  }
  if (code === "unavailable" || code === "network-request-failed") {
    return new Error("Network unavailable. Check your connection and try again.");
  }
  if (e instanceof Error && e.message.length > 0) return e;
  return new Error(`Could not ${action}. Please try again.`);
}

async function getCurrentUserProfile(): Promise<{ uid: string; profile: UserProfile }> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.data() as Record<string, unknown> | undefined;
  return {
    uid: user.uid,
    profile: {
      name: typeof data?.name === "string" ? data.name : "User",
      profileImage: typeof data?.profileImage === "string" ? data.profileImage : null,
      isAdmin: data?.isAdmin === true,
    },
  };
}

async function getUserProfile(uid: string): Promise<UserProfile> {
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.data() as Record<string, unknown> | undefined;
  return {
    name: typeof data?.name === "string" ? data.name : "User",
    profileImage: typeof data?.profileImage === "string" ? data.profileImage : null,
    isAdmin: data?.isAdmin === true,
  };
}

function mapPost(id: string, data: Record<string, unknown>): CommunityPost {
  const editHistory: PostEditSnapshot[] = Array.isArray(data.editHistory)
    ? data.editHistory.map((entry) => {
        const e = entry as Record<string, unknown>;
        return {
          content: String(e.content ?? ""),
          imageUrl: typeof e.imageUrl === "string" ? e.imageUrl : null,
          tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
          editedAt: Number(e.editedAt ?? 0),
        };
      })
    : [];

  return {
    id,
    authorId: String(data.authorId ?? ""),
    authorName: String(data.authorName ?? "User"),
    authorProfileImage:
      typeof data.authorProfileImage === "string" ? data.authorProfileImage : null,
    content: String(data.content ?? ""),
    category: (data.category as PostCategory) ?? "general",
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : null,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    achievementIds: Array.isArray(data.achievementIds) ? data.achievementIds.map(String) : [],
    editHistory,
    updatedAt: Number(data.updatedAt ?? data.createdAt ?? 0),
    likeCount: Number(data.likeCount ?? 0) || 0,
    commentCount: Number(data.commentCount ?? 0) || 0,
    likedBy: Array.isArray(data.likedBy) ? data.likedBy.map(String) : [],
    blocked: data.blocked === true,
    underReview: data.underReview === true,
    createdAt: Number(data.createdAt ?? 0),
  };
}

async function mergePendingPosts(
  posts: CommunityPost[],
  pendingIds: string[]
): Promise<CommunityPost[]> {
  const merged = new Map(posts.map((post) => [post.id, post]));

  for (const id of pendingIds) {
    const existing = merged.get(id);
    if (existing && !existing.blocked) {
      merged.set(id, { ...existing, underReview: true });
    }
  }

  const missing = pendingIds.filter((id) => !merged.has(id));
  if (missing.length === 0) {
    return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  const extras = await Promise.all(
    missing.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, "communityPosts", id));
        if (!snap.exists()) return null;
        const post = mapPost(snap.id, snap.data() as Record<string, unknown>);
        return post.blocked ? null : post;
      } catch {
        return null;
      }
    })
  );

  for (const post of extras) {
    if (post) merged.set(post.id, { ...post, underReview: true });
  }

  return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
}

async function markPostPendingReview(postId: string, authorId?: string): Promise<void> {
  let resolvedAuthorId = (authorId ?? "").trim();
  if (!resolvedAuthorId) {
    try {
      const snap = await getDoc(doc(db, "communityPosts", postId));
      if (snap.exists()) {
        resolvedAuthorId = String((snap.data() as Record<string, unknown>).authorId ?? "");
      }
    } catch {
      // Best-effort — pending flag still works without authorId.
    }
  }
  await setDoc(
    doc(db, PENDING_POSTS_COLLECTION, postId),
    {
      postId,
      ...(resolvedAuthorId ? { authorId: resolvedAuthorId } : {}),
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  // Rules only allow flipping `underReview` (flagPostUnderReviewOnly). Do not touch `blocked`.
  await updateDoc(doc(db, "communityPosts", postId), {
    underReview: true,
  });
}

async function clearPostPendingReview(postId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, PENDING_POSTS_COLLECTION, postId));
  } catch {
    // Ignore missing flag docs.
  }
}

async function markCommentPendingReview(commentId: string, postId: string): Promise<void> {
  await setDoc(doc(db, PENDING_COMMENTS_COLLECTION, commentId), {
    commentId,
    postId,
    updatedAt: Date.now(),
  });
}

async function clearCommentPendingReview(commentId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, PENDING_COMMENTS_COLLECTION, commentId));
  } catch {
    // Ignore missing flag docs.
  }
}

function mapComment(id: string, postId: string, data: Record<string, unknown>): CommunityComment {
  return {
    id,
    postId,
    authorId: String(data.authorId ?? ""),
    authorName: String(data.authorName ?? "User"),
    authorProfileImage:
      typeof data.authorProfileImage === "string" ? data.authorProfileImage : null,
    text: String(data.text ?? ""),
    parentCommentId:
      typeof data.parentCommentId === "string" && data.parentCommentId.length > 0
        ? data.parentCommentId
        : null,
    replyToAuthorName:
      typeof data.replyToAuthorName === "string" ? data.replyToAuthorName : null,
    createdAt: Number(data.createdAt ?? 0),
    blocked: data.blocked === true,
  };
}

export function threadedComments(comments: CommunityComment[]): CommunityComment[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));

  const rootOf = (comment: CommunityComment): string => {
    let node = comment;
    while (node.parentCommentId) {
      const parent = byId.get(node.parentCommentId);
      if (!parent) break;
      node = parent;
    }
    return node.id;
  };

  const topLevel = comments
    .filter((comment) => !comment.parentCommentId)
    .sort((a, b) => a.createdAt - b.createdAt);

  return topLevel.flatMap((top) => [
    top,
    ...comments
      .filter((comment) => comment.id !== top.id && rootOf(comment) === top.id)
      .sort((a, b) => a.createdAt - b.createdAt),
  ]);
}

function mapReport(id: string, data: Record<string, unknown>): CommunityReport {
  return {
    id,
    targetType: data.targetType === "comment" ? "comment" : "post",
    targetId: String(data.targetId ?? ""),
    postId: String(data.postId ?? ""),
    reporterId: String(data.reporterId ?? ""),
    reporterName: String(data.reporterName ?? "User"),
    reason: String(data.reason ?? ""),
    status: data.status === "resolved" || data.status === "dismissed" ? data.status : "pending",
    createdAt: Number(data.createdAt ?? 0),
    targetContent: String(data.targetContent ?? ""),
    targetAuthorId: String(data.targetAuthorId ?? ""),
    targetAuthorName: String(data.targetAuthorName ?? "User"),
    read: data.read === true,
    source:
      data.source === "re_review"
        ? "re_review"
        : data.source === "admin_direct"
          ? "admin_direct"
          : "report",
    requestReason:
      typeof data.requestReason === "string" && data.requestReason.length > 0
        ? data.requestReason
        : undefined,
  };
}

function mapFriendRequest(id: string, data: Record<string, unknown>): FriendRequest {
  return {
    id,
    fromUserId: String(data.fromUserId ?? ""),
    fromUserName: String(data.fromUserName ?? "User"),
    fromUserProfileImage:
      typeof data.fromUserProfileImage === "string" ? data.fromUserProfileImage : null,
    toUserId: String(data.toUserId ?? ""),
    toUserName: String(data.toUserName ?? "User"),
    toUserProfileImage:
      typeof data.toUserProfileImage === "string" ? data.toUserProfileImage : null,
    status:
      data.status === "accepted" || data.status === "rejected" ? data.status : "pending",
    createdAt: Number(data.createdAt ?? 0),
  };
}

function mapNotificationType(value: unknown): CommunityNotification["type"] {
  if (value === "friend_accepted") return "friend_accepted";
  if (value === "post_like") return "post_like";
  if (value === "post_comment") return "post_comment";
  if (value === "post_reported") return "post_reported";
  if (value === "comment_reported") return "comment_reported";
  return "friend_request";
}

function mapNotification(id: string, data: Record<string, unknown>): CommunityNotification {
  return {
    id,
    userId: String(data.userId ?? ""),
    type: mapNotificationType(data.type),
    fromUserId: String(data.fromUserId ?? ""),
    fromUserName: String(data.fromUserName ?? "User"),
    fromUserProfileImage:
      typeof data.fromUserProfileImage === "string" ? data.fromUserProfileImage : null,
    friendRequestId:
      typeof data.friendRequestId === "string" ? data.friendRequestId : undefined,
    friendRequestStatus:
      data.friendRequestStatus === "accepted" || data.friendRequestStatus === "rejected"
        ? data.friendRequestStatus
        : data.type === "friend_request"
          ? "pending"
          : undefined,
    postId: typeof data.postId === "string" ? data.postId : undefined,
    commentId: typeof data.commentId === "string" ? data.commentId : undefined,
    postPreview: typeof data.postPreview === "string" ? data.postPreview : undefined,
    read: data.read === true,
    createdAt: Number(data.createdAt ?? 0),
  };
}

async function createCommunityNotification(input: {
  userId: string;
  type: CommunityNotification["type"];
  fromUserId: string;
  fromUserName: string;
  fromUserProfileImage: string | null;
  friendRequestId?: string;
  postId?: string;
  commentId?: string;
  postPreview?: string;
}): Promise<void> {
  if (input.userId === input.fromUserId) return;

  await addDoc(collection(db, "communityNotifications"), {
    userId: input.userId,
    type: input.type,
    fromUserId: input.fromUserId,
    fromUserName: input.fromUserName,
    fromUserProfileImage: input.fromUserProfileImage,
    friendRequestId: input.friendRequestId ?? null,
    friendRequestStatus: input.type === "friend_request" ? "pending" : null,
    postId: input.postId ?? null,
    commentId: input.commentId ?? null,
    postPreview: input.postPreview ?? null,
    read: false,
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
  });
}

async function assertCanMessageInChat(
  chat: ChatConversation,
  senderUid: string,
  senderIsAdmin: boolean
): Promise<void> {
  if (chat.isSupportChat) return;

  const otherUid = chat.participants.find((p) => p !== senderUid);
  if (!otherUid) throw new Error("Invalid chat");

  if (senderIsAdmin) return;

  const adminUid = await resolveAdminUid();
  if (adminUid && otherUid === adminUid) return;

  const relation = await getFriendRelation(otherUid);
  if (relation !== "friends") {
    throw new Error("You can only message friends. Add them as a friend first.");
  }
}

function mapChat(id: string, data: Record<string, unknown>): ChatConversation {
  return {
    id,
    participants: Array.isArray(data.participants) ? data.participants.map(String) : [],
    participantNames:
      data.participantNames && typeof data.participantNames === "object"
        ? (data.participantNames as Record<string, string>)
        : {},
    participantImages:
      data.participantImages && typeof data.participantImages === "object"
        ? (data.participantImages as Record<string, string | null>)
        : {},
    lastMessage: String(data.lastMessage ?? ""),
    lastMessageAt: Number(data.lastMessageAt ?? 0),
    unreadCount:
      data.unreadCount && typeof data.unreadCount === "object"
        ? (data.unreadCount as Record<string, number>)
        : {},
    clearedAt:
      data.clearedAt && typeof data.clearedAt === "object"
        ? Object.fromEntries(
            Object.entries(data.clearedAt as Record<string, unknown>).map(([key, value]) => [
              key,
              Number(value ?? 0),
            ])
          )
        : {},
    isSupportChat: data.isSupportChat === true,
  };
}

export function chatPreviewForUser(chat: ChatConversation, userId: string): string {
  const clearedAt = chat.clearedAt[userId] ?? 0;
  if (!chat.lastMessage || chat.lastMessageAt <= clearedAt) return "";
  return chat.lastMessage;
}

export function chatClearedBefore(chat: ChatConversation, userId: string): number {
  return chat.clearedAt[userId] ?? 0;
}

function mapMessage(id: string, data: Record<string, unknown>): ChatMessage {
  const messageType =
    data.messageType === "image" ||
    data.messageType === "voice" ||
    data.messageType === "sticker" ||
    data.messageType === "post"
      ? data.messageType
      : "text";

  const rawQuote = data.quote;
  let quote: ChatMessage["quote"] = null;
  if (rawQuote && typeof rawQuote === "object") {
    const q = rawQuote as Record<string, unknown>;
    const quoteType =
      q.messageType === "image" ||
      q.messageType === "voice" ||
      q.messageType === "sticker" ||
      q.messageType === "post"
        ? q.messageType
        : "text";
    quote = {
      messageId: String(q.messageId ?? ""),
      senderId: String(q.senderId ?? ""),
      senderName: String(q.senderName ?? "User"),
      text: String(q.text ?? ""),
      messageType: quoteType,
      stickerId: typeof q.stickerId === "string" ? q.stickerId : null,
    };
  }

  return {
    id,
    senderId: String(data.senderId ?? ""),
    text: String(data.text ?? ""),
    messageType,
    stickerId: typeof data.stickerId === "string" ? data.stickerId : null,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : null,
    audioUrl: typeof data.audioUrl === "string" ? data.audioUrl : null,
    audioDurationMs:
      typeof data.audioDurationMs === "number" ? data.audioDurationMs : null,
    sharedPostId: typeof data.sharedPostId === "string" ? data.sharedPostId : null,
    sharedPostAuthorName:
      typeof data.sharedPostAuthorName === "string" ? data.sharedPostAuthorName : null,
    sharedPostAuthorImage:
      typeof data.sharedPostAuthorImage === "string" ? data.sharedPostAuthorImage : null,
    sharedPostContent: typeof data.sharedPostContent === "string" ? data.sharedPostContent : null,
    sharedPostTags: Array.isArray(data.sharedPostTags)
      ? data.sharedPostTags.filter((tag): tag is string => typeof tag === "string")
      : [],
    sharedPostLikeCount:
      typeof data.sharedPostLikeCount === "number" ? data.sharedPostLikeCount : 0,
    sharedPostCommentCount:
      typeof data.sharedPostCommentCount === "number" ? data.sharedPostCommentCount : 0,
    sharedPostCreatedAt:
      typeof data.sharedPostCreatedAt === "number" ? data.sharedPostCreatedAt : null,
    quote,
    editedAt: typeof data.editedAt === "number" ? data.editedAt : null,
    recalled: data.recalled === true,
    recalledAt: typeof data.recalledAt === "number" ? data.recalledAt : null,
    recalledByName: typeof data.recalledByName === "string" ? data.recalledByName : null,
    createdAt: Number(data.createdAt ?? 0),
    isAutoReply: data.isAutoReply === true,
  };
}

function mapRegisteredUser(id: string, data: Record<string, unknown>): RegisteredUser {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "User",
    email: typeof data.email === "string" ? data.email : "",
    profileImage: typeof data.profileImage === "string" ? data.profileImage : null,
    createdAt: Number(data.createdAt ?? 0),
  };
}

export function chatIdForUsers(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}

export function subscribePosts(
  onData: (posts: CommunityPost[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let currentPosts: CommunityPost[] = [];
  let pendingIds: string[] = [];

  const publish = () => {
    void mergePendingPosts(currentPosts, pendingIds)
      .then(onData)
      .catch((error: unknown) => {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      });
  };

  const unsubPosts = onSnapshot(
    collection(db, "communityPosts"),
    (snap) => {
      currentPosts = snap.docs
        .map((d) => mapPost(d.id, d.data() as Record<string, unknown>))
        .filter((post) => !post.blocked)
        .sort((a, b) => b.createdAt - a.createdAt);
      publish();
    },
    (error) => onError?.(error)
  );

  const unsubPending = onSnapshot(
    collection(db, PENDING_POSTS_COLLECTION),
    (snap) => {
      pendingIds = snap.docs.map((d) => d.id);
      publish();
    },
    (error) => onError?.(error)
  );

  return () => {
    unsubPosts();
    unsubPending();
  };
}

/** Author feed including posts hidden by admin (blocked). Public feed still excludes blocked. */
export function subscribeMyAuthoredPosts(
  authorId: string,
  onData: (posts: CommunityPost[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "communityPosts"), where("authorId", "==", authorId)),
    (snap) => {
      const posts = snap.docs
        .map((d) => mapPost(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAt - a.createdAt);
      onData(posts);
    },
    (error) => onError?.(error)
  );
}

/** Author asks Support Admin to review a hidden (blocked) post again. */
export async function requestBlockedPostReReview(
  postId: string,
  reason: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required");

  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Please provide a reason");

  const postRef = doc(db, "communityPosts", postId);
  const snap = await getDoc(postRef);
  if (!snap.exists()) throw new Error("Post not found");
  const data = snap.data() as Record<string, unknown>;
  if (String(data.authorId ?? "") !== user.uid) throw new Error("Not allowed");
  if (data.blocked !== true) throw new Error("This post is not hidden");
  if (data.underReview === true) throw new Error("A review request is already pending");

  const profile = await getUserProfile(user.uid);
  const content = String(data.content ?? "");
  const authorName = String(data.authorName ?? profile.name ?? "User");
  const now = Date.now();

  const reopenedCount = await reopenResolvedReportsForAuthorReReview({
    postId,
    authorId: user.uid,
    authorName: profile.name,
    requestReason: trimmedReason,
  });

  if (reopenedCount === 0) {
    await addDoc(collection(db, "communityReports"), {
      targetType: "post",
      targetId: postId,
      postId,
      reporterId: user.uid,
      reporterName: profile.name,
      reason: trimmedReason,
      requestReason: trimmedReason,
      source: "re_review",
      status: "pending",
      createdAt: now,
      createdAtServer: serverTimestamp(),
      targetContent: content,
      targetAuthorId: user.uid,
      targetAuthorName: authorName,
      read: false,
    });
  }

  await updateDoc(postRef, { underReview: true });
  await setDoc(
    doc(db, PENDING_POSTS_COLLECTION, postId),
    {
      postId,
      updatedAt: now,
    },
    { merge: true }
  );

  await sendAdminDirectMessage(
    user.uid,
    buildReReviewRequestReceivedMessage(content, trimmedReason)
  );
}

async function reopenResolvedReportsForAuthorReReview(params: {
  postId: string;
  authorId: string;
  authorName: string;
  requestReason: string;
}): Promise<number> {
  const { postId, authorId, authorName, requestReason } = params;
  const now = Date.now();

  const snap = await getDocs(query(collection(db, "communityReports"), where("postId", "==", postId)));
  const resolved = snap.docs.filter(
    (reportDoc) => (reportDoc.data() as Record<string, unknown>).status === "resolved"
  );
  if (resolved.length === 0) return 0;

  const batch = writeBatch(db);
  for (const reportDoc of resolved) {
    batch.update(reportDoc.ref, {
      status: "pending",
      read: false,
      source: "re_review",
      requestReason,
      reporterId: authorId,
      reporterName: authorName,
      createdAt: now,
    });
  }
  await batch.commit();
  return resolved.length;
}

async function closePendingReportsForPost(
  postId: string,
  status: "resolved" | "dismissed",
  reason?: string
): Promise<void> {
  const snap = await getDocs(query(collection(db, "communityReports"), where("postId", "==", postId)));
  const pending = snap.docs.filter(
    (reportDoc) => (reportDoc.data() as Record<string, unknown>).status === "pending"
  );
  if (pending.length === 0) return;

  const batch = writeBatch(db);
  for (const reportDoc of pending) {
    const update: Record<string, unknown> = { status, read: true };
    if (reason && status === "resolved") update.reason = reason;
    batch.update(reportDoc.ref, update);
  }
  await batch.commit();
}

export function subscribePendingReReviewRequests(
  onData: (requests: PendingReReviewRequest[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, PENDING_POSTS_COLLECTION),
    (snap) => {
      void (async () => {
        const requests: PendingReReviewRequest[] = [];
        for (const d of snap.docs) {
          const data = d.data() as Record<string, unknown>;
          if (data.reReviewRequested !== true) continue;

          const requestedBy = String(data.reReviewRequestedBy ?? "");
          let requestedByName =
            typeof data.reReviewRequestedByName === "string" ? data.reReviewRequestedByName : "";
          if (!requestedByName && requestedBy) {
            try {
              const profile = await getUserProfile(requestedBy);
              requestedByName = profile.name;
            } catch {
              requestedByName = "User";
            }
          }

          let content =
            typeof data.reReviewContent === "string" ? data.reReviewContent : "";
          let authorId =
            typeof data.reReviewAuthorId === "string" ? data.reReviewAuthorId : requestedBy;
          let authorName =
            typeof data.reReviewAuthorName === "string" ? data.reReviewAuthorName : requestedByName;

          if (!content) {
            try {
              const postSnap = await getDoc(doc(db, "communityPosts", d.id));
              if (postSnap.exists()) {
                const postData = postSnap.data() as Record<string, unknown>;
                content = String(postData.content ?? "");
                authorId = String(postData.authorId ?? authorId);
                authorName = String(postData.authorName ?? authorName);
              }
            } catch {
              // Keep fallbacks
            }
          }

          requests.push({
            postId: d.id,
            reason: String(data.reReviewReason ?? ""),
            requestedBy,
            requestedByName: requestedByName || "User",
            authorId,
            authorName: authorName || "User",
            content,
            requestedAt: Number(data.reReviewRequestedAt ?? data.updatedAt ?? 0),
          });
        }
        requests.sort((a, b) => b.requestedAt - a.requestedAt);
        onData(requests);
      })();
    },
    (error) => onError?.(error)
  );
}

/** Unhide a blocked post after the author requested another check. */
export async function approveReReviewRequest(postId: string): Promise<void> {
  if (!(await checkIsAdmin())) throw new Error("Admin only");

  const postRef = doc(db, "communityPosts", postId);
  const snap = await getDoc(postRef);
  if (!snap.exists()) throw new Error("Post not found");
  const data = snap.data() as Record<string, unknown>;
  const authorId = String(data.authorId ?? "");
  const content = String(data.content ?? "");

  await updateDoc(postRef, { blocked: false, underReview: false });
  await clearPostPendingReview(postId);
  await closePendingReportsForPost(postId, "dismissed");

  if (authorId) {
    await sendAdminDirectMessage(
      authorId,
      `Your request to check this post again has been reviewed.\n\n**Your post:**\n"${formatPostContentSnippet(content)}"\n\nThe post has been **restored to the community**.`
    );
  }
}

/** Keep the post hidden after the author requested another check. */
export async function dismissReReviewRequest(postId: string, reason: string): Promise<void> {
  if (!(await checkIsAdmin())) throw new Error("Admin only");

  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Reason is required");

  const postRef = doc(db, "communityPosts", postId);
  const snap = await getDoc(postRef);
  if (!snap.exists()) throw new Error("Post not found");
  const data = snap.data() as Record<string, unknown>;
  const authorId = String(data.authorId ?? "");
  const authorName = String(data.authorName ?? "User");
  const content = String(data.content ?? "");

  const reportsSnap = await getDocs(
    query(collection(db, "communityReports"), where("postId", "==", postId))
  );
  const pendingReports = reportsSnap.docs.filter(
    (reportDoc) => (reportDoc.data() as Record<string, unknown>).status === "pending"
  );
  const latestPending = pendingReports.sort(
    (a, b) =>
      Number((b.data() as Record<string, unknown>).createdAt ?? 0) -
      Number((a.data() as Record<string, unknown>).createdAt ?? 0)
  )[0];
  const latestPendingData = latestPending
    ? (latestPending.data() as Record<string, unknown>)
    : null;
  const requestedBy = String(latestPendingData?.reporterId ?? authorId);
  const requestedByName = String(latestPendingData?.reporterName ?? authorName);
  const requestReason = String(latestPendingData?.requestReason ?? latestPendingData?.reason ?? "");

  await updateDoc(postRef, { blocked: true, underReview: false });
  await clearPostPendingReview(postId);

  if (pendingReports.length > 0) {
    await closePendingReportsForPost(postId, "resolved", trimmedReason);
  } else {
    // Fallback for older re-review queue entries without a report card.
    await addDoc(collection(db, "communityReports"), {
      targetType: "post",
      targetId: postId,
      postId,
      reporterId: requestedBy,
      reporterName: requestedByName,
      reason: trimmedReason,
      requestReason,
      source: "re_review",
      status: "resolved",
      createdAt: Date.now(),
      createdAtServer: serverTimestamp(),
      targetContent: content,
      targetAuthorId: authorId,
      targetAuthorName: authorName,
      read: true,
    });
  }

  if (authorId) {
    await sendAdminDirectMessage(
      authorId,
      `Your request to check this post again has been reviewed.\n\n**Your post:**\n"${formatPostContentSnippet(content)}"\n\nThe post remains **hidden from the community**.\n\nReason: **${trimmedReason}**`
    );
  }
}

const COMMENTED_POSTS_SUBCOLLECTION = "commentedPosts";

async function recordUserCommentedPost(uid: string, postId: string): Promise<void> {
  if (!uid || !postId) return;
  await setDoc(
    doc(db, "users", uid, COMMENTED_POSTS_SUBCOLLECTION, postId),
    { postId, updatedAt: Date.now() },
    { merge: true }
  );
}

async function clearUserCommentedPostIfNeeded(uid: string, postId: string): Promise<void> {
  if (!uid || !postId) return;
  try {
    const remaining = await getDocs(
      query(collection(db, "communityPosts", postId, "comments"), where("authorId", "==", uid))
    );
    if (!remaining.empty) return;
    await deleteDoc(doc(db, "users", uid, COMMENTED_POSTS_SUBCOLLECTION, postId));
  } catch {
    // Best-effort index cleanup.
  }
}

async function fetchCommentedPostIdsFromCollectionGroup(uid: string): Promise<string[]> {
  const snap = await getDocs(
    query(collectionGroup(db, "comments"), where("authorId", "==", uid))
  );
  const ids = new Set<string>();
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    // Include blocked comments — the user still commented on that post.
    const fromField = typeof data.postId === "string" ? data.postId : "";
    const fromPath = d.ref.parent.parent?.id ?? "";
    const postId = fromField || fromPath;
    if (postId) ids.add(postId);
  }
  return [...ids];
}

async function backfillCommentedPostsIndex(uid: string, postIds: string[]): Promise<void> {
  await Promise.all(postIds.map((postId) => recordUserCommentedPost(uid, postId).catch(() => {})));
}

/** Post IDs the user has commented on (user index, with collection-group backfill). */
export async function fetchPostIdsCommentedByUser(uid: string): Promise<string[]> {
  if (!uid) return [];

  const ids = new Set<string>();

  try {
    const indexSnap = await getDocs(collection(db, "users", uid, COMMENTED_POSTS_SUBCOLLECTION));
    for (const d of indexSnap.docs) ids.add(d.id);
  } catch {
    // Continue with collection-group scan.
  }

  try {
    const fromGroup = await fetchCommentedPostIdsFromCollectionGroup(uid);
    for (const id of fromGroup) ids.add(id);
    void backfillCommentedPostsIndex(uid, fromGroup);
  } catch {
    // Index-only result is still useful when collection-group is unavailable.
  }

  return [...ids];
}

/** Live list of post IDs the signed-in user has commented on. */
export function subscribePostIdsCommentedByUser(
  uid: string,
  onData: (postIds: string[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!uid) {
    onData([]);
    return () => {};
  }

  let indexIds: string[] = [];
  let groupIds: string[] = [];
  let unsubscribed = false;

  const emit = () => {
    if (!unsubscribed) onData([...new Set([...indexIds, ...groupIds])]);
  };

  // One-time scan so older comments appear before the denormalized index exists.
  void fetchCommentedPostIdsFromCollectionGroup(uid)
    .then((ids) => {
      if (unsubscribed) return;
      groupIds = ids;
      emit();
      return backfillCommentedPostsIndex(uid, ids);
    })
    .catch((error: unknown) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    });

  const unsub = onSnapshot(
    collection(db, "users", uid, COMMENTED_POSTS_SUBCOLLECTION),
    (snap) => {
      indexIds = snap.docs.map((d) => d.id);
      emit();
    },
    (error) => {
      onError?.(error);
      if (indexIds.length === 0 && groupIds.length === 0) {
        void fetchCommentedPostIdsFromCollectionGroup(uid)
          .then((ids) => {
            groupIds = ids;
            emit();
          })
          .catch(() => emit());
      }
    }
  );

  return () => {
    unsubscribed = true;
    unsub();
  };
}

export function subscribePendingCommunityPostIds(
  onData: (postIds: string[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, PENDING_POSTS_COLLECTION),
    (snap) => {
      onData(snap.docs.map((d) => d.id));
    },
    (error) => onError?.(error)
  );
}

export function subscribePendingCommunityCommentIds(
  postId: string,
  onData: (commentIds: string[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, PENDING_COMMENTS_COLLECTION),
    (snap) => {
      const commentIds = snap.docs
        .filter((d) => String(d.data().postId ?? "") === postId)
        .map((d) => d.id);
      onData(commentIds);
    },
    (error) => onError?.(error)
  );
}

export async function uploadChatImage(localUri: string, chatId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const blob = await localUriToBlob(localUri);
  const objectRef = ref(storage, `communityChats/${chatId}/${user.uid}/${Date.now()}.jpg`);
  await uploadBytes(objectRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(objectRef);
}

export async function uploadChatAudio(localUri: string, chatId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const blob = await localUriToBlob(localUri);
  if (blob.size < 1) throw new Error("Recording is empty");
  const objectRef = ref(storage, `communityChats/${chatId}/${user.uid}/${Date.now()}.m4a`);
  await uploadBytes(objectRef, blob, { contentType: "audio/mp4" });
  return getDownloadURL(objectRef);
}

export async function createPost(params: {
  content: string;
  tags?: string[];
  achievementIds?: string[];
}): Promise<CommunityPost> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await user.getIdToken(true).catch(() => {});

  const { uid, profile } = await getCurrentUserProfile();
  const trimmed = params.content.trim();
  if (!trimmed) throw new Error("Add text to post");

  const tags = (params.tags ?? []).map((t) => t.trim()).filter(Boolean);
  const achievementIds = [...new Set((params.achievementIds ?? []).map((id) => id.trim()).filter(Boolean))];
  const now = Date.now();

  const payload = {
    authorId: uid,
    authorName: profile.name,
    authorProfileImage: profile.profileImage ?? null,
    content: trimmed,
    category: "general" as PostCategory,
    imageUrl: null,
    tags,
    achievementIds,
    editHistory: [] as PostEditSnapshot[],
    updatedAt: now,
    likeCount: 0,
    commentCount: 0,
    likedBy: [] as string[],
    blocked: false,
    underReview: false,
    createdAt: now,
    createdAtServer: serverTimestamp(),
  };

  try {
    const docRef = await addDoc(collection(db, "communityPosts"), payload);
    return {
      id: docRef.id,
      authorId: uid,
      authorName: profile.name,
      authorProfileImage: profile.profileImage ?? null,
      content: trimmed,
      category: "general",
      imageUrl: null,
      tags,
      achievementIds,
      editHistory: [],
      updatedAt: now,
      likeCount: 0,
      commentCount: 0,
      likedBy: [],
      blocked: false,
      underReview: false,
      createdAt: now,
    };
  } catch (e) {
    throw firestoreWriteError(e, "create post");
  }
}

export async function updatePost(
  post: CommunityPost,
  params: { content: string; imageUrl?: string | null; tags?: string[]; achievementIds?: string[] }
): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.uid !== post.authorId) throw new Error("Not allowed");

  const trimmed = params.content.trim();
  if (!trimmed) {
    throw new Error("Add text to post");
  }

  const tags = (params.tags ?? post.tags).map((t) => t.trim()).filter(Boolean);
  const achievementIds =
    params.achievementIds !== undefined
      ? [...new Set(params.achievementIds.map((id) => id.trim()).filter(Boolean))]
      : post.achievementIds ?? [];
  const snapshot: PostEditSnapshot = {
    content: post.content,
    imageUrl: post.imageUrl,
    tags: post.tags,
    editedAt: Date.now(),
  };

  await updateDoc(doc(db, "communityPosts", post.id), {
    content: trimmed,
    imageUrl: params.imageUrl !== undefined ? params.imageUrl : post.imageUrl,
    tags,
    achievementIds,
    editHistory: [...post.editHistory, snapshot],
    updatedAt: Date.now(),
  });
}

export async function fetchPostById(postId: string): Promise<CommunityPost | null> {
  const snap = await getDoc(doc(db, "communityPosts", postId));
  if (!snap.exists()) return null;
  return mapPost(snap.id, snap.data() as Record<string, unknown>);
}

export function subscribePostById(
  postId: string,
  onData: (post: CommunityPost | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (!postId) {
    onData(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, "communityPosts", postId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(mapPost(snap.id, snap.data() as Record<string, unknown>));
    },
    (error) => {
      onData(null);
      onError?.(error);
    }
  );
}

export async function deletePost(postId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const snap = await getDoc(doc(db, "communityPosts", postId));
  if (!snap.exists()) throw new Error("Post not found");
  const data = snap.data() as Record<string, unknown>;

  let isAdminUser = false;
  try {
    isAdminUser = await checkIsAdmin();
  } catch {
    isAdminUser = false;
  }

  if (data.authorId !== user.uid && !isAdminUser) {
    throw new Error("Not allowed");
  }

  const authorId = String(data.authorId ?? user.uid);

  // Authors may delete even while the post is pending admin review / blocked.
  // Remove related data so the post is gone from Community, profile, and admin queues.

  try {
    await deleteAllPostComments(postId);
  } catch {
    // Continue — post delete should still proceed.
  }

  // Delete the post document first so it disappears for everyone immediately.
  await deleteDoc(doc(db, "communityPosts", postId));

  try {
    await clearPostPendingReview(postId);
  } catch {
    // Ignore pending-flag cleanup failures.
  }

  try {
    const pendingComments = await getDocs(
      query(collection(db, PENDING_COMMENTS_COLLECTION), where("postId", "==", postId))
    );
    await Promise.all(pendingComments.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  } catch {
    // Ignore pending-comment cleanup failures.
  }

  try {
    await deleteReportsForPost(postId, { asAdmin: isAdminUser, authorId });
  } catch {
    // Report cleanup is best-effort.
  }

  try {
    await deleteNotificationsForPost(postId, authorId);
  } catch {
    // Notification cleanup is best-effort.
  }
}

async function deleteNotificationsForPost(postId: string, authorId: string): Promise<void> {
  // Authors can only delete their own notification docs under current rules.
  const snap = await getDocs(
    query(
      collection(db, "communityNotifications"),
      where("userId", "==", authorId),
      where("postId", "==", postId)
    )
  );
  let batch = writeBatch(db);
  let ops = 0;
  for (const notificationDoc of snap.docs) {
    batch.delete(notificationDoc.ref);
    ops += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

/** Remove admin pending/reviewed report cards tied to a post. */
async function deleteReportsForPost(
  postId: string,
  opts: { asAdmin: boolean; authorId: string }
): Promise<void> {
  try {
    const reportsQuery = opts.asAdmin
      ? query(collection(db, "communityReports"), where("postId", "==", postId))
      : query(
          collection(db, "communityReports"),
          where("targetAuthorId", "==", opts.authorId)
        );

    const snap = await getDocs(reportsQuery);
    const docs = opts.asAdmin
      ? snap.docs
      : snap.docs.filter((d) => String((d.data() as Record<string, unknown>).postId ?? "") === postId);

    let batch = writeBatch(db);
    let ops = 0;
    for (const reportDoc of docs) {
      batch.delete(reportDoc.ref);
      ops += 1;
      if (ops >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  } catch {
    // Report cleanup is best-effort; post deletion should not fail because of it.
  }
}

export function filterPostsByTag(posts: CommunityPost[], tag: string | null): CommunityPost[] {
  if (!tag) return posts;
  const needle = tag.trim().toLowerCase();
  return posts.filter((p) => p.tags.some((t) => t.toLowerCase() === needle));
}

export function filterPostsByKeyword(posts: CommunityPost[], query: string): CommunityPost[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return posts;
  return posts.filter(
    (p) =>
      p.content.toLowerCase().includes(needle) ||
      p.authorName.toLowerCase().includes(needle) ||
      p.tags.some((t) => t.toLowerCase().includes(needle))
  );
}

export type LikerProfile = {
  id: string;
  name: string;
  profileImage: string | null;
};

export async function loadLikerProfiles(userIds: string[]): Promise<LikerProfile[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const results = await Promise.all(
    unique.map(async (id) => {
      try {
        const profile = await getUserProfile(id);
        return { id, name: profile.name, profileImage: profile.profileImage };
      } catch {
        return { id, name: "User", profileImage: null };
      }
    })
  );
  return results;
}

export async function ensureChatsForFriends(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const snap = await getDocs(collection(db, "users", user.uid, "friends"));
    await Promise.all(
      snap.docs.map((friendDoc) => ensureChat(user.uid, friendDoc.id).catch(() => {}))
    );
  } catch {
    // Friends subcollection may be empty or rules not deployed
  }
}

export function subscribeFriendsList(
  onData: (friends: FriendListEntry[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) return () => {};

  return onSnapshot(
    collection(db, "users", user.uid, "friends"),
    (snap) => {
      void (async () => {
        const friends = await Promise.all(
          snap.docs.map(async (friendDoc) => {
            const data = friendDoc.data() as Record<string, unknown>;
            let email = "";
            try {
              const userSnap = await getDoc(doc(db, "users", friendDoc.id));
              const userData = userSnap.data() as Record<string, unknown> | undefined;
              email = typeof userData?.email === "string" ? userData.email : "";
            } catch {
              // Omit email if profile read fails
            }
            return {
              id: friendDoc.id,
              name: typeof data.friendName === "string" ? data.friendName : "User",
              profileImage:
                typeof data.friendProfileImage === "string" ? data.friendProfileImage : null,
              email,
            } satisfies FriendListEntry;
          })
        );
        friends.sort((a, b) => a.name.localeCompare(b.name));
        onData(friends);
      })();
    },
    (error) => onError?.(error)
  );
}

/** Incoming friend requests waiting for accept / reject. */
export function subscribePendingIncomingFriendRequests(
  onData: (requests: FriendRequest[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) return () => {};

  return onSnapshot(
    query(collection(db, "friendRequests"), where("toUserId", "==", user.uid)),
    (snap) => {
      const requests = snap.docs
        .map((d) => mapFriendRequest(d.id, d.data() as Record<string, unknown>))
        .filter((r) => r.status === "pending")
        .sort((a, b) => b.createdAt - a.createdAt);
      onData(requests);
    },
    (error) => onError?.(error)
  );
}

export async function removeFriend(friendId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  if (user.uid === friendId) throw new Error("Invalid friend");

  const batch = writeBatch(db);
  batch.delete(doc(db, "users", user.uid, "friends", friendId));
  batch.delete(doc(db, "users", friendId, "friends", user.uid));
  await batch.commit();
}

export async function searchUsersForAdding(searchText: string): Promise<RegisteredUser[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const needle = searchText.trim().toLowerCase();
  if (needle.length < 1) return [];

  const [usersSnap, friendsSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "users", user.uid, "friends")),
  ]);
  const friendIds = new Set(friendsSnap.docs.map((d) => d.id));

  return usersSnap.docs
    .map((d) => mapRegisteredUser(d.id, d.data() as Record<string, unknown>))
    .filter((u) => u.id !== user.uid)
    .filter((u) => !friendIds.has(u.id))
    .filter((u) => u.email.toLowerCase() !== COMMUNITY_ADMIN_EMAIL)
    .filter(
      (u) =>
        u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 15);
}

export async function getPublicUserProfile(userId: string): Promise<PublicUserProfile> {
  const snap = await getDoc(doc(db, "users", userId));
  const data = snap.data() as Record<string, unknown> | undefined;
  const weight = typeof data?.weight === "number" ? data.weight : null;
  const height = typeof data?.height === "number" ? data.height : null;
  const bmiStored = typeof data?.bmi === "number" ? data.bmi : null;
  const bmi =
    bmiStored ??
    (weight != null && height != null ? calcBmi(weight, height) : null);

  const goalKey = data?.goal ?? data?.recommendedPlan;
  const goalLabel =
    goalKey === "gain"
      ? "Gain Weight"
      : goalKey === "maintain"
        ? "Maintain Weight"
        : goalKey === "lose"
          ? "Lose Weight"
          : typeof data?.goalLabel === "string"
            ? data.goalLabel
            : "";

  return {
    id: userId,
    name: typeof data?.name === "string" ? data.name : "User",
    profileImage: typeof data?.profileImage === "string" ? data.profileImage : null,
    bio: typeof data?.bio === "string" ? data.bio : "",
    goal: goalLabel,
    weight,
    height,
    bmi: typeof bmi === "number" && Number.isFinite(bmi) ? bmi : null,
    gender:
      data?.gender === "male" || data?.gender === "female" ? data.gender : null,
  };
}

export function getPostsByAuthor(posts: CommunityPost[], authorId: string): CommunityPost[] {
  return posts.filter((p) => p.authorId === authorId).sort((a, b) => b.createdAt - a.createdAt);
}

export function subscribeChatMeta(
  chatId: string,
  onData: (chat: ChatConversation | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "communityChats", chatId),
    (snap) => {
      onData(snap.exists() ? mapChat(snap.id, snap.data() as Record<string, unknown>) : null);
    },
    () => onData(null)
  );
}

export async function togglePostLike(post: CommunityPost): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await user.getIdToken(true).catch(() => {});

  const postRef = doc(db, "communityPosts", post.id);
  const snap = await getDoc(postRef);
  if (!snap.exists()) throw new Error("Post not found");

  const data = snap.data() as Record<string, unknown>;
  const likedBy = Array.isArray(data.likedBy) ? data.likedBy.map(String) : [];
  const liked = likedBy.includes(user.uid);
  const nextLikedBy = liked
    ? likedBy.filter((id) => id !== user.uid)
    : [...likedBy, user.uid];

  try {
    await updateDoc(postRef, {
      likedBy: nextLikedBy,
      likeCount: nextLikedBy.length,
    });
  } catch (e) {
    throw firestoreWriteError(e, "update like");
  }

  if (!liked && post.authorId !== user.uid) {
    try {
      const { profile } = await getCurrentUserProfile();
      await createCommunityNotification({
        userId: post.authorId,
        type: "post_like",
        fromUserId: user.uid,
        fromUserName: profile.name,
        fromUserProfileImage: profile.profileImage,
        postId: post.id,
        postPreview: post.content.slice(0, 80),
      });
    } catch {
      // Like saved even if notifying the author fails.
    }
  }
}

export function subscribeComments(
  postId: string,
  onData: (comments: CommunityComment[]) => void,
  options?: { includeBlocked?: boolean }
): Unsubscribe {
  const q = query(
    collection(db, "communityPosts", postId, "comments"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snap) => {
    const comments = snap.docs.map((d) =>
      mapComment(d.id, postId, d.data() as Record<string, unknown>)
    );
    onData(options?.includeBlocked ? comments : comments.filter((comment) => !comment.blocked));
  });
}

export async function addComment(
  postId: string,
  text: string,
  options?: { parentCommentId?: string; replyToAuthorName?: string }
): Promise<void> {
  const { uid, profile } = await getCurrentUserProfile();
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Comment is required");

  const postSnap = await getDoc(doc(db, "communityPosts", postId));
  const postData = postSnap.data() as Record<string, unknown> | undefined;
  const postAuthorId = typeof postData?.authorId === "string" ? postData.authorId : "";
  const postPreview =
    typeof postData?.content === "string" ? postData.content.slice(0, 80) : "";

  const parentCommentId = options?.parentCommentId?.trim() || null;
  const replyToAuthorName = options?.replyToAuthorName?.trim() || null;

  if (parentCommentId) {
    const parentSnap = await getDoc(
      doc(db, "communityPosts", postId, "comments", parentCommentId)
    );
    if (!parentSnap.exists()) throw new Error("Comment not found");
  }

  const batch = writeBatch(db);
  const commentRef = doc(collection(db, "communityPosts", postId, "comments"));
  batch.set(commentRef, {
    authorId: uid,
    authorName: profile.name,
    authorProfileImage: profile.profileImage,
    postId,
    text: trimmed,
    parentCommentId,
    replyToAuthorName,
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
    blocked: false,
  });
  batch.update(doc(db, "communityPosts", postId), { commentCount: increment(1) });
  await batch.commit();

  void recordUserCommentedPost(uid, postId).catch(() => {});

  // Repair denormalized count from the real comments subcollection.
  // Fixes posts stuck at 0 when older writes skipped the counter.
  try {
    const commentsSnap = await getDocs(collection(db, "communityPosts", postId, "comments"));
    const visibleCount = commentsSnap.docs.filter((d) => d.data()?.blocked !== true).length;
    await updateDoc(doc(db, "communityPosts", postId), { commentCount: visibleCount });
  } catch {
    // Comment is already saved; feed can still show a live count from the subcollection.
  }

  if (!parentCommentId) {
    await createCommunityNotification({
      userId: postAuthorId,
      type: "post_comment",
      fromUserId: uid,
      fromUserName: profile.name,
      fromUserProfileImage: profile.profileImage,
      postId,
      commentId: commentRef.id,
      postPreview,
    });
  }
}

export async function deleteComment(postId: string, commentId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const postSnap = await getDoc(doc(db, "communityPosts", postId));
  if (!postSnap.exists()) throw new Error("Post not found");

  const postAuthorId = String(postSnap.data()?.authorId ?? "");
  const commentSnap = await getDoc(doc(db, "communityPosts", postId, "comments", commentId));
  if (!commentSnap.exists()) throw new Error("Comment not found");

  const commentAuthorId = String(commentSnap.data()?.authorId ?? "");
  const isAdmin = await checkIsAdmin(user);
  if (postAuthorId !== user.uid && commentAuthorId !== user.uid && !isAdmin) {
    throw new Error("Not allowed to delete this comment");
  }

  const commentsSnap = await getDocs(collection(db, "communityPosts", postId, "comments"));
  const toDelete = new Set<string>([commentId]);

  let foundNew = true;
  while (foundNew) {
    foundNew = false;
    for (const commentDoc of commentsSnap.docs) {
      const parentId = commentDoc.data().parentCommentId;
      if (
        typeof parentId === "string" &&
        toDelete.has(parentId) &&
        !toDelete.has(commentDoc.id)
      ) {
        toDelete.add(commentDoc.id);
        foundNew = true;
      }
    }
  }

  if (toDelete.size === 0) throw new Error("Comment not found");

  const batch = writeBatch(db);
  toDelete.forEach((id) => {
    batch.delete(doc(db, "communityPosts", postId, "comments", id));
  });
  batch.update(doc(db, "communityPosts", postId), {
    commentCount: increment(-toDelete.size),
  });
  await batch.commit();

  try {
    const remainingSnap = await getDocs(collection(db, "communityPosts", postId, "comments"));
    const visibleCount = remainingSnap.docs.filter((d) => d.data()?.blocked !== true).length;
    await updateDoc(doc(db, "communityPosts", postId), { commentCount: visibleCount });
  } catch {
    // Deletes already applied.
  }

  const affectedAuthors = new Set<string>();
  for (const commentDoc of commentsSnap.docs) {
    if (!toDelete.has(commentDoc.id)) continue;
    const authorId = String((commentDoc.data() as Record<string, unknown>).authorId ?? "");
    if (authorId) affectedAuthors.add(authorId);
  }
  await Promise.all(
    [...affectedAuthors].map((authorId) => clearUserCommentedPostIfNeeded(authorId, postId))
  );
}

/** Soft-hide a comment so admin can restore it later. */
async function softBlockComment(postId: string, commentId: string): Promise<void> {
  const commentRef = doc(db, "communityPosts", postId, "comments", commentId);
  const commentSnap = await getDoc(commentRef);
  if (!commentSnap.exists()) throw new Error("Comment not found");
  if (commentSnap.data()?.blocked === true) return;

  const batch = writeBatch(db);
  batch.update(commentRef, { blocked: true });
  batch.update(doc(db, "communityPosts", postId), {
    commentCount: increment(-1),
  });
  await batch.commit();
}

export async function submitReport(params: {
  targetType: ReportTargetType;
  targetId: string;
  postId: string;
  reason: string;
  targetContent: string;
  targetAuthorId: string;
  targetAuthorName: string;
}): Promise<void> {
  const { uid, profile } = await getCurrentUserProfile();
  const reason = params.reason.trim();
  if (!reason) throw new Error("Report reason is required");

  const adminUid = await resolveAdminUid();
  if (adminUid && params.targetAuthorId === adminUid) {
    throw new Error("This content cannot be reported");
  }

  // Already reported / under review — do not allow another report.
  if (params.targetType === "post") {
    const postSnap = await getDoc(doc(db, "communityPosts", params.postId));
    if (!postSnap.exists()) throw new Error("Post not found");
    const postData = postSnap.data() as Record<string, unknown>;
    if (postData.underReview === true || postData.blocked === true) {
      throw new Error("This post has already been reported and is under review.");
    }
    const pendingPost = await getDoc(doc(db, PENDING_POSTS_COLLECTION, params.postId));
    if (pendingPost.exists()) {
      throw new Error("This post has already been reported and is under review.");
    }
  } else {
    const pendingComment = await getDoc(doc(db, PENDING_COMMENTS_COLLECTION, params.targetId));
    if (pendingComment.exists()) {
      throw new Error("This comment has already been reported and is under review.");
    }
    const postSnap = await getDoc(doc(db, "communityPosts", params.postId));
    if (postSnap.exists()) {
      const postData = postSnap.data() as Record<string, unknown>;
      if (postData.blocked === true) {
        throw new Error("This comment cannot be reported right now.");
      }
    }
  }

  await addDoc(collection(db, "communityReports"), {
    targetType: params.targetType,
    targetId: params.targetId,
    postId: params.postId,
    reporterId: uid,
    reporterName: profile.name,
    reason,
    status: "pending",
    targetContent: params.targetContent,
    targetAuthorId: params.targetAuthorId,
    targetAuthorName: params.targetAuthorName,
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
    read: false,
  });

  await markPostPendingReview(params.postId, params.targetAuthorId);
  if (params.targetType === "comment") {
    await markCommentPendingReview(params.targetId, params.postId);
  }

  const notifyAuthor = params.targetAuthorId && params.targetAuthorId !== uid;

  if (notifyAuthor) {
    let adminProfileImage: string | null = null;
    if (adminUid) {
      try {
        const adminProfile = await getUserProfile(adminUid);
        adminProfileImage = adminProfile.profileImage;
      } catch {
        adminProfileImage = null;
      }
    }

    // Never attach the reporter's identity — author must not learn who reported them.
    await createCommunityNotification({
      userId: params.targetAuthorId,
      type: params.targetType === "comment" ? "comment_reported" : "post_reported",
      fromUserId: adminUid ?? "support_admin",
      fromUserName: SUPPORT_ADMIN_NAME,
      fromUserProfileImage: adminProfileImage,
      postId: params.postId,
      commentId: params.targetType === "comment" ? params.targetId : undefined,
      postPreview: params.targetContent.slice(0, 80),
    });
  }

  if (params.targetType === "post") {
    await sendAdminDirectMessage(
      uid,
      buildReportReceivedReporterMessage(params.targetAuthorName, params.targetContent)
    );

    if (notifyAuthor) {
      await sendAdminDirectMessage(
        params.targetAuthorId,
        buildReportReceivedAuthorMessage(params.targetContent)
      );
    }
  } else if (params.targetType === "comment" && notifyAuthor) {
    await sendAdminDirectMessage(
      params.targetAuthorId,
      buildCommentReportReceivedAuthorMessage(params.targetContent)
    );
  }
}

export async function getFriendRelation(otherUserId: string): Promise<FriendRelation> {
  const user = auth.currentUser;
  if (!user || user.uid === otherUserId) return "none";

  try {
    const friendSnap = await getDoc(doc(db, "users", user.uid, "friends", otherUserId));
    if (friendSnap.exists()) return "friends";

    const outgoingQ = query(
      collection(db, "friendRequests"),
      where("fromUserId", "==", user.uid),
      where("toUserId", "==", otherUserId),
      where("status", "==", "pending")
    );
    const outgoing = await getDocs(outgoingQ);
    if (!outgoing.empty) return "pending_outgoing";

    const incomingQ = query(
      collection(db, "friendRequests"),
      where("fromUserId", "==", otherUserId),
      where("toUserId", "==", user.uid),
      where("status", "==", "pending")
    );
    const incoming = await getDocs(incomingQ);
    if (!incoming.empty) return "pending_incoming";
  } catch {
    return "none";
  }

  return "none";
}

export async function sendFriendRequest(toUserId: string): Promise<void> {
  const { uid, profile } = await getCurrentUserProfile();
  if (uid === toUserId) throw new Error("Cannot add yourself");
  if (await isCommunityAdminUserId(toUserId)) {
    throw new Error("You cannot add Support Admin as a friend");
  }

  const relation = await getFriendRelation(toUserId);
  if (relation !== "none") throw new Error("Friend request already exists");

  const toProfile = await getUserProfile(toUserId);
  const requestRef = await addDoc(collection(db, "friendRequests"), {
    fromUserId: uid,
    fromUserName: profile.name,
    fromUserProfileImage: profile.profileImage,
    toUserId,
    toUserName: toProfile.name,
    toUserProfileImage: toProfile.profileImage,
    status: "pending",
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
  });

  await addDoc(collection(db, "communityNotifications"), {
    userId: toUserId,
    type: "friend_request",
    fromUserId: uid,
    fromUserName: profile.name,
    fromUserProfileImage: profile.profileImage,
    friendRequestId: requestRef.id,
    friendRequestStatus: "pending",
    read: false,
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
  });
}

async function ensureChat(uidA: string, uidB: string, options?: { isSupportChat?: boolean }): Promise<string> {
  const chatId = chatIdForUsers(uidA, uidB);
  const chatRef = doc(db, "communityChats", chatId);
  try {
    const chatSnap = await getDoc(chatRef);
    if (chatSnap.exists()) {
      if (options?.isSupportChat === true && chatSnap.data()?.isSupportChat !== true) {
        await updateDoc(chatRef, { isSupportChat: true });
      }
      return chatId;
    }
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (code !== "permission-denied") throw e;
    // Missing doc can surface as permission-denied with older rules; try create below.
  }

  const [profileA, profileB] = await Promise.all([getUserProfile(uidA), getUserProfile(uidB)]);
  const adminUid = await resolveAdminUid();
  const nameA =
    adminUid === uidA ? SUPPORT_ADMIN_NAME : displayCommunityUserName(uidA, profileA.name, adminUid);
  const nameB =
    adminUid === uidB ? SUPPORT_ADMIN_NAME : displayCommunityUserName(uidB, profileB.name, adminUid);
  await setDoc(chatRef, {
    participants: [uidA, uidB].sort(),
    participantNames: { [uidA]: nameA, [uidB]: nameB },
    participantImages: { [uidA]: profileA.profileImage, [uidB]: profileB.profileImage },
    lastMessage: "",
    lastMessageAt: Date.now(),
    unreadCount: { [uidA]: 0, [uidB]: 0 },
    clearedAt: {},
    isSupportChat: options?.isSupportChat === true,
    createdAt: Date.now(),
  });
  return chatId;
}

async function seedSupportWelcomeMessage(chatId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const adminUid = await resolveAdminUid();
  if (!adminUid) return;

  const chatSnap = await getDoc(doc(db, "communityChats", chatId));
  if (!chatSnap.exists()) return;
  const chat = mapChat(chatId, chatSnap.data() as Record<string, unknown>);

  const isSupportConversation =
    chat.isSupportChat ||
    (chat.participants.includes(adminUid) && chat.participants.includes(user.uid));
  if (!isSupportConversation) return;

  if (!chat.isSupportChat) {
    await updateDoc(doc(db, "communityChats", chatId), { isSupportChat: true });
  }

  const messagesRef = collection(db, "communityChats", chatId, "messages");
  const existing = await getDocs(query(messagesRef, orderBy("createdAt", "asc"), limit(1)));
  if (!existing.empty) return;

  const batch = writeBatch(db);
  const msgRef = doc(messagesRef);
  const createdAt = Date.now();
  batch.set(msgRef, {
    senderId: adminUid,
    text: SUPPORT_CHAT_WELCOME_MESSAGE,
    messageType: "text",
    stickerId: null,
    imageUrl: null,
    audioUrl: null,
    audioDurationMs: null,
    quote: null,
    editedAt: null,
    recalled: false,
    recalledAt: null,
    recalledByName: null,
    isAutoReply: true,
    isWelcomeMessage: true,
    createdAt,
    createdAtServer: serverTimestamp(),
  });
  batch.update(doc(db, "communityChats", chatId), {
    lastMessage: SUPPORT_CHAT_WELCOME_MESSAGE,
    lastMessageAt: createdAt,
    [`unreadCount.${user.uid}`]: increment(1),
  });
  await batch.commit();
}

export async function prepareSupportChat(chatId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || (await checkIsAdmin())) return;
  try {
    await seedSupportWelcomeMessage(chatId);
  } catch (e) {
    console.warn("prepareSupportChat failed:", e);
  }
}

export async function ensureDirectChat(otherUserId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  if (user.uid === otherUserId) throw new Error("Cannot chat with yourself");
  return ensureChat(user.uid, otherUserId);
}

export async function acceptFriendRequest(request: FriendRequest): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.uid !== request.toUserId) throw new Error("Not allowed");

  const batch = writeBatch(db);
  batch.update(doc(db, "friendRequests", request.id), { status: "accepted" });
  batch.set(doc(db, "users", request.fromUserId, "friends", request.toUserId), {
    friendId: request.toUserId,
    friendName: request.toUserName,
    friendProfileImage: request.toUserProfileImage,
    createdAt: Date.now(),
  });
  batch.set(doc(db, "users", request.toUserId, "friends", request.fromUserId), {
    friendId: request.fromUserId,
    friendName: request.fromUserName,
    friendProfileImage: request.fromUserProfileImage,
    createdAt: Date.now(),
  });
  await batch.commit();

  await ensureChat(request.fromUserId, request.toUserId);

  const { profile } = await getCurrentUserProfile();
  await addDoc(collection(db, "communityNotifications"), {
    userId: request.fromUserId,
    type: "friend_accepted",
    fromUserId: user.uid,
    fromUserName: profile.name,
    fromUserProfileImage: profile.profileImage,
    read: false,
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
  });
}

export async function rejectFriendRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, "friendRequests", requestId), { status: "rejected" });
}

export async function getPendingIncomingFriendRequest(
  fromUserId: string
): Promise<FriendRequest | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const snap = await getDocs(
    query(
      collection(db, "friendRequests"),
      where("fromUserId", "==", fromUserId),
      where("toUserId", "==", user.uid),
      where("status", "==", "pending")
    )
  );
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return mapFriendRequest(docSnap.id, docSnap.data() as Record<string, unknown>);
}

export async function resolveFriendRequestNotificationByRequestId(
  friendRequestId: string,
  status: "accepted" | "rejected"
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const snap = await getDocs(
    query(
      collection(db, "communityNotifications"),
      where("userId", "==", user.uid),
      where("friendRequestId", "==", friendRequestId)
    )
  );
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.update(d.ref, { friendRequestStatus: status, read: true });
  });
  await batch.commit();
}

export function subscribeNotifications(
  onData: (items: CommunityNotification[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) return () => {};

  const q = query(
    collection(db, "communityNotifications"),
    where("userId", "==", user.uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => mapNotification(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAt - a.createdAt);
      onData(items);
    },
    (error) => onError?.(error)
  );
}

async function assertOwnNotification(notificationId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const snap = await getDoc(doc(db, "communityNotifications", notificationId));
  if (!snap.exists()) throw new Error("Notification not found");
  const data = snap.data() as Record<string, unknown>;
  if (data.userId !== user.uid) throw new Error("Not allowed");
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await assertOwnNotification(notificationId);
  await updateDoc(doc(db, "communityNotifications", notificationId), { read: true });
}

export async function markNotificationUnread(notificationId: string): Promise<void> {
  await assertOwnNotification(notificationId);
  await updateDoc(doc(db, "communityNotifications", notificationId), { read: false });
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await assertOwnNotification(notificationId);
  await deleteDoc(doc(db, "communityNotifications", notificationId));
}

export async function markNotificationsRead(notificationIds: string[]): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  if (notificationIds.length === 0) return;

  for (let i = 0; i < notificationIds.length; i += 500) {
    const batch = writeBatch(db);
    notificationIds.slice(i, i + 500).forEach((notificationId) => {
      batch.update(doc(db, "communityNotifications", notificationId), { read: true });
    });
    await batch.commit();
  }
}

export async function deleteNotifications(notificationIds: string[]): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  if (notificationIds.length === 0) return;

  for (let i = 0; i < notificationIds.length; i += 500) {
    const batch = writeBatch(db);
    notificationIds.slice(i, i + 500).forEach((notificationId) => {
      batch.delete(doc(db, "communityNotifications", notificationId));
    });
    await batch.commit();
  }
}

export async function resolveFriendRequestNotification(
  notificationId: string,
  status: "accepted" | "rejected"
): Promise<void> {
  await updateDoc(doc(db, "communityNotifications", notificationId), {
    friendRequestStatus: status,
    read: true,
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const snap = await getDocs(
    query(collection(db, "communityNotifications"), where("userId", "==", user.uid))
  );
  const unreadDocs = snap.docs.filter((d) => d.data().read !== true);
  if (unreadDocs.length === 0) return;

  for (let i = 0; i < unreadDocs.length; i += 500) {
    const batch = writeBatch(db);
    unreadDocs.slice(i, i + 500).forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  }
}

export function subscribeChats(
  onData: (chats: ChatConversation[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) return () => {};

  const q = query(
    collection(db, "communityChats"),
    where("participants", "array-contains", user.uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const chats = snap.docs
        .map((d) => mapChat(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
      onData(chats);
    },
    (error) => onError?.(error)
  );
}

export function subscribeMessages(
  chatId: string,
  onData: (messages: ChatMessage[]) => void,
  userId?: string | null
): Unsubscribe {
  const q = query(
    collection(db, "communityChats", chatId, "messages"),
    orderBy("createdAt", "asc")
  );

  let clearedBefore = 0;
  let latestMessages: ChatMessage[] = [];

  const emit = () => {
    onData(latestMessages.filter((message) => message.createdAt > clearedBefore));
  };

  const unsubChat =
    userId != null
      ? onSnapshot(
          doc(db, "communityChats", chatId),
          (snap) => {
            const data = snap.data() as Record<string, unknown> | undefined;
            const clearedAt = data?.clearedAt;
            clearedBefore =
              clearedAt &&
              typeof clearedAt === "object" &&
              typeof (clearedAt as Record<string, unknown>)[userId] === "number"
                ? Number((clearedAt as Record<string, unknown>)[userId])
                : 0;
            emit();
          },
          () => {
            clearedBefore = 0;
            emit();
          }
        )
      : () => {};

  const unsubMessages = onSnapshot(q, (snap) => {
    latestMessages = snap.docs.map((d) => mapMessage(d.id, d.data() as Record<string, unknown>));
    emit();
  });

  return () => {
    unsubChat();
    unsubMessages();
  };
}

export type SendChatMessageInput =
  | string
  | {
      text?: string;
      stickerId?: string;
      imageUrl?: string;
      audioUrl?: string;
      audioDurationMs?: number;
      sharedPostId?: string;
      sharedPostAuthorName?: string;
      sharedPostAuthorImage?: string | null;
      sharedPostContent?: string;
      sharedPostTags?: string[];
      sharedPostLikeCount?: number;
      sharedPostCommentCount?: number;
      sharedPostCreatedAt?: number;
      quote?: ChatMessageQuote;
    };

function chatMessagePreview(input: {
  text: string;
  messageType: "text" | "image" | "voice" | "sticker" | "post";
  sharedPostAuthorName?: string | null;
  quote?: ChatMessageQuote | null;
  recalled?: boolean;
  recalledByName?: string | null;
}): string {
  if (input.recalled) {
    const name = input.recalledByName?.trim() || "Someone";
    return `${name} recalled a message`;
  }
  const body =
    input.messageType === "image"
      ? "Photo"
      : input.messageType === "voice"
        ? "Voice message"
        : input.messageType === "sticker"
          ? "Sticker"
          : input.messageType === "post"
            ? `Shared ${input.sharedPostAuthorName?.trim() || "a"} post`
            : input.text;
  if (input.quote?.text) {
    const quoted = input.quote.text.slice(0, 40);
    return `↩ ${quoted}${input.quote.text.length > 40 ? "…" : ""}: ${body}`;
  }
  return body;
}

export async function sendChatMessage(
  chatId: string,
  input: SendChatMessageInput
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const normalized =
    typeof input === "string"
      ? {
          text: input.trim(),
          messageType: "text" as const,
          stickerId: null as string | null,
          imageUrl: null as string | null,
          audioUrl: null as string | null,
          audioDurationMs: null as number | null,
          sharedPostId: null as string | null,
          sharedPostAuthorName: null as string | null,
          sharedPostAuthorImage: null as string | null,
          sharedPostContent: null as string | null,
          sharedPostTags: [] as string[],
          sharedPostLikeCount: 0,
          sharedPostCommentCount: 0,
          sharedPostCreatedAt: null as number | null,
          quote: null as ChatMessageQuote | null,
        }
      : (() => {
          if (input.sharedPostId) {
            return {
              text: input.text?.trim() || "Community post",
              messageType: "post" as const,
              stickerId: null as string | null,
              imageUrl: input.imageUrl ?? null,
              audioUrl: null as string | null,
              audioDurationMs: null as number | null,
              sharedPostId: input.sharedPostId,
              sharedPostAuthorName: input.sharedPostAuthorName?.trim() || "User",
              sharedPostAuthorImage: input.sharedPostAuthorImage ?? null,
              sharedPostContent: input.sharedPostContent?.trim() || input.text?.trim() || "",
              sharedPostTags: input.sharedPostTags ?? [],
              sharedPostLikeCount: input.sharedPostLikeCount ?? 0,
              sharedPostCommentCount: input.sharedPostCommentCount ?? 0,
              sharedPostCreatedAt: input.sharedPostCreatedAt ?? null,
              quote: input.quote ?? null,
            };
          }
          const sticker = input.stickerId ? getChatSticker(input.stickerId) : undefined;
          return {
            text: sticker?.label ?? input.text?.trim() ?? "",
            messageType: input.stickerId
              ? ("sticker" as const)
              : input.imageUrl
                ? ("image" as const)
                : input.audioUrl
                  ? ("voice" as const)
                  : ("text" as const),
            stickerId: sticker?.id ?? null,
            imageUrl: input.imageUrl ?? null,
            audioUrl: input.audioUrl ?? null,
            audioDurationMs: input.audioDurationMs ?? null,
            sharedPostId: null as string | null,
            sharedPostAuthorName: null as string | null,
            sharedPostAuthorImage: null as string | null,
            sharedPostContent: null as string | null,
            sharedPostTags: [] as string[],
            sharedPostLikeCount: 0,
            sharedPostCommentCount: 0,
            sharedPostCreatedAt: null as number | null,
            quote: input.quote ?? null,
          };
        })();

  if (normalized.messageType === "text" && !normalized.text) {
    throw new Error("Message is required");
  }
  if (normalized.messageType === "sticker" && !normalized.stickerId) {
    throw new Error("Sticker is required");
  }
  if (normalized.messageType === "image" && !normalized.imageUrl) {
    throw new Error("Image is required");
  }
  if (normalized.messageType === "voice" && !normalized.audioUrl) {
    throw new Error("Voice message is required");
  }
  if (normalized.messageType === "post" && !normalized.sharedPostId) {
    throw new Error("Post is required");
  }

  const chatRef = doc(db, "communityChats", chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) throw new Error("Chat not found");

  const chat = mapChat(chatId, chatSnap.data() as Record<string, unknown>);
  const otherUid = chat.participants.find((p) => p !== user.uid);
  if (!otherUid) throw new Error("Invalid chat");

  const senderIsAdmin =
    user.uid === (await resolveAdminUid()) ||
    user.email?.toLowerCase() === COMMUNITY_ADMIN_EMAIL ||
    (await checkIsAdmin(user));
  await assertCanMessageInChat(chat, user.uid, senderIsAdmin);

  const preview = chatMessagePreview({
    text: normalized.text,
    messageType: normalized.messageType,
    sharedPostAuthorName: normalized.sharedPostAuthorName,
    quote: normalized.quote,
  });
  const batch = writeBatch(db);
  const msgRef = doc(collection(db, "communityChats", chatId, "messages"));
  batch.set(msgRef, {
    senderId: user.uid,
    text: normalized.text,
    messageType: normalized.messageType,
    stickerId: normalized.stickerId,
    imageUrl: normalized.imageUrl,
    audioUrl: normalized.audioUrl,
    audioDurationMs: normalized.audioDurationMs,
    sharedPostId: normalized.sharedPostId,
    sharedPostAuthorName: normalized.sharedPostAuthorName,
    sharedPostAuthorImage: normalized.sharedPostAuthorImage,
    sharedPostContent: normalized.sharedPostContent,
    sharedPostTags: normalized.sharedPostTags,
    sharedPostLikeCount: normalized.sharedPostLikeCount,
    sharedPostCommentCount: normalized.sharedPostCommentCount,
    sharedPostCreatedAt: normalized.sharedPostCreatedAt,
    quote: normalized.quote,
    editedAt: null,
    recalled: false,
    recalledAt: null,
    recalledByName: null,
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
  });
  batch.update(chatRef, {
    lastMessage: preview,
    lastMessageAt: Date.now(),
    [`unreadCount.${otherUid}`]: increment(1),
  });
  await batch.commit();

  const adminUid = await resolveAdminUid();
  if (!senderIsAdmin && adminUid && otherUid === adminUid && normalized.messageType === "text") {
    try {
      await sendAdminAutoReply(chatId, adminUid);
    } catch (e) {
      console.warn("Admin auto-reply failed:", e);
    }
  }
}

export async function sharePostToChat(chatId: string, post: CommunityPost): Promise<void> {
  const snippet = formatPostContentSnippet(
    post.content.trim() || (post.imageUrl ? "Photo post" : "Community post")
  );
  await sendChatMessage(chatId, {
    text: snippet,
    sharedPostId: post.id,
    sharedPostAuthorName: post.authorName,
    sharedPostAuthorImage: post.authorProfileImage,
    sharedPostContent: post.content,
    sharedPostTags: post.tags,
    sharedPostLikeCount: post.likeCount,
    sharedPostCommentCount: post.commentCount,
    sharedPostCreatedAt: post.createdAt,
    imageUrl: post.imageUrl ?? undefined,
  });
}

export async function editChatMessage(
  chatId: string,
  messageId: string,
  text: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const trimmed = text.trim();
  if (!trimmed) throw new Error("Message is required");

  const msgRef = doc(db, "communityChats", chatId, "messages", messageId);
  const msgSnap = await getDoc(msgRef);
  if (!msgSnap.exists()) throw new Error("Message not found");

  const message = mapMessage(messageId, msgSnap.data() as Record<string, unknown>);
  if (message.senderId !== user.uid) throw new Error("Not allowed");
  if (message.messageType !== "text") throw new Error("Only text messages can be edited");
  if (message.isAutoReply) throw new Error("This message cannot be edited");
  if (message.recalled) throw new Error("This message was recalled");
  if (!canModifyOwnChatMessage(message)) {
    throw new Error("Messages can only be edited within 5 minutes");
  }

  const chatSnap = await getDoc(doc(db, "communityChats", chatId));
  if (!chatSnap.exists()) throw new Error("Chat not found");
  const chat = mapChat(chatId, chatSnap.data() as Record<string, unknown>);
  const senderIsAdmin =
    user.uid === (await resolveAdminUid()) ||
    user.email?.toLowerCase() === COMMUNITY_ADMIN_EMAIL ||
    (await checkIsAdmin(user));
  await assertCanMessageInChat(chat, user.uid, senderIsAdmin);

  await updateDoc(msgRef, {
    text: trimmed,
    editedAt: Date.now(),
  });

  try {
    const latestQuery = query(
      collection(db, "communityChats", chatId, "messages"),
      orderBy("createdAt", "desc")
    );
    const latestSnap = await getDocs(latestQuery);
    const latestDoc = latestSnap.docs[0];
    if (latestDoc?.id === messageId) {
      await updateDoc(doc(db, "communityChats", chatId), {
        lastMessage: trimmed,
      });
    }
  } catch (e) {
    console.warn("Could not update chat preview after edit:", e);
  }
}

function messagePreviewFromChatMessage(message: ChatMessage): string {
  return chatMessagePreview({
    text: message.text,
    messageType: message.messageType,
    sharedPostAuthorName: message.sharedPostAuthorName,
    quote: message.quote,
    recalled: message.recalled,
    recalledByName: message.recalledByName,
  });
}

export async function recallChatMessage(chatId: string, messageId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const msgRef = doc(db, "communityChats", chatId, "messages", messageId);
  const msgSnap = await getDoc(msgRef);
  if (!msgSnap.exists()) throw new Error("Message not found");

  const message = mapMessage(messageId, msgSnap.data() as Record<string, unknown>);
  if (message.senderId !== user.uid) throw new Error("Not allowed");
  if (message.isAutoReply) throw new Error("This message cannot be recalled");
  if (message.recalled) throw new Error("This message was already recalled");
  if (!canModifyOwnChatMessage(message)) {
    throw new Error("Messages can only be recalled within 5 minutes");
  }

  const chatSnap = await getDoc(doc(db, "communityChats", chatId));
  if (!chatSnap.exists()) throw new Error("Chat not found");
  const chat = mapChat(chatId, chatSnap.data() as Record<string, unknown>);
  const senderIsAdmin =
    user.uid === (await resolveAdminUid()) ||
    user.email?.toLowerCase() === COMMUNITY_ADMIN_EMAIL ||
    (await checkIsAdmin(user));
  await assertCanMessageInChat(chat, user.uid, senderIsAdmin);

  const { profile } = await getCurrentUserProfile();
  const recalledAt = Date.now();

  await updateDoc(msgRef, {
    recalled: true,
    recalledAt,
    recalledByName: profile.name,
    text: "",
    stickerId: null,
    imageUrl: null,
    audioUrl: null,
    audioDurationMs: null,
    quote: null,
  });

  try {
    const chatRef = doc(db, "communityChats", chatId);
    await updateDoc(chatRef, {
      lastMessage: `${profile.name} recalled a message`,
      lastMessageAt: recalledAt,
    });
  } catch (e) {
    console.warn("Could not update chat preview after recall:", e);
  }
}

async function sendAdminAutoReply(chatId: string, adminUid: string): Promise<void> {
  const chatRef = doc(db, "communityChats", chatId);
  const user = auth.currentUser;
  if (!user) return;

  const batch = writeBatch(db);
  const msgRef = doc(collection(db, "communityChats", chatId, "messages"));
  batch.set(msgRef, {
    senderId: adminUid,
    text: ADMIN_AUTO_REPLY,
    messageType: "text",
    stickerId: null,
    imageUrl: null,
    audioUrl: null,
    audioDurationMs: null,
    isAutoReply: true,
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
  });
  batch.update(chatRef, {
    lastMessage: ADMIN_AUTO_REPLY,
    lastMessageAt: Date.now(),
    [`unreadCount.${user.uid}`]: increment(1),
  });
  await batch.commit();
}

export async function markChatRead(chatId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await updateDoc(doc(db, "communityChats", chatId), {
      [`unreadCount.${user.uid}`]: 0,
    });
  } catch (e) {
    console.warn("markChatRead failed:", e);
  }
}

export async function clearChatHistory(chatId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const chatRef = doc(db, "communityChats", chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) throw new Error("Chat not found");

  const chat = mapChat(chatId, chatSnap.data() as Record<string, unknown>);
  if (!chat.participants.includes(user.uid)) throw new Error("Not allowed");

  await updateDoc(chatRef, {
    [`clearedAt.${user.uid}`]: Date.now(),
    [`unreadCount.${user.uid}`]: 0,
  });
}

export function subscribePendingReports(
  onData: (reports: CommunityReport[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, "communityReports"), where("status", "==", "pending"));
  return onSnapshot(
    q,
    (snap) => {
      const reports = snap.docs
        .map((d) => mapReport(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAt - a.createdAt);
      onData(reports);
    },
    (error) => onError?.(error)
  );
}

export function subscribeReports(
  onData: (reports: CommunityReport[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "communityReports"),
    (snap) => {
      const reports = snap.docs
        .map((d) => mapReport(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAt - a.createdAt);
      onData(reports);
    },
    (error) => onError?.(error)
  );
}

export async function markReportRead(reportId: string): Promise<void> {
  await updateDoc(doc(db, "communityReports", reportId), { read: true });
}

async function sendAdminDirectMessage(recipientUserId: string, messageText: string): Promise<void> {
  const adminUid = await resolveAdminUid();
  if (!adminUid) return;
  if (recipientUserId === adminUid) return;

  try {
    const chatId = await ensureChat(adminUid, recipientUserId, { isSupportChat: true });
    const chatRef = doc(db, "communityChats", chatId);
    const createdAt = Date.now();

    const batch = writeBatch(db);
    const msgRef = doc(collection(db, "communityChats", chatId, "messages"));
    batch.set(msgRef, {
      senderId: adminUid,
      text: messageText,
      messageType: "text",
      stickerId: null,
      imageUrl: null,
      audioUrl: null,
      audioDurationMs: null,
      quote: null,
      editedAt: null,
      recalled: false,
      recalledAt: null,
      recalledByName: null,
      isAutoReply: true,
      createdAt,
      createdAtServer: serverTimestamp(),
    });
    batch.update(chatRef, {
      lastMessage: messageText,
      lastMessageAt: createdAt,
      [`unreadCount.${recipientUserId}`]: increment(1),
    });
    await batch.commit();
  } catch (e) {
    // Report / moderation flows must not fail if the Support Admin chat write is blocked.
    console.warn("sendAdminDirectMessage failed:", e);
  }
}

const POST_SNIPPET_MAX = 120;

export function formatPostContentSnippet(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "(No text)";
  if (trimmed.length <= POST_SNIPPET_MAX) return trimmed;
  return `${trimmed.slice(0, POST_SNIPPET_MAX)}...`;
}

export function buildReportReceivedReporterMessage(authorName: string, content: string): string {
  const snippet = formatPostContentSnippet(content);
  return `Thank you for your report. We received your report about the following post and will **review it as soon as possible**.\n\n**Post by ${authorName}:**\n"${snippet}"\n\nWe will update you once the review is complete.`;
}

export function buildReportReceivedAuthorMessage(content: string): string {
  const snippet = formatPostContentSnippet(content);
  return `Your post has been **hidden** and is **pending review** by Support Admin.\n\n**Your post:**\n"${snippet}"\n\nPlease follow community guidelines while we review it. We will update you here once the review is complete.`;
}

export function buildCommentReportReceivedAuthorMessage(content: string): string {
  const snippet = formatPostContentSnippet(content);
  return `Your comment has been **hidden** and is **pending review** by Support Admin.\n\n**Your comment:**\n"${snippet}"\n\nPlease follow community guidelines while we review it. We will update you here once the review is complete.`;
}

export function buildReportDismissedReporterMessage(authorName: string, content: string): string {
  const snippet = formatPostContentSnippet(content);
  return `Your report has been reviewed for the following post:\n\n**Post by ${authorName}:**\n"${snippet}"\n\nAfter verification, we **dismissed the report and no action was taken on the content**. Thank you for helping keep our community safe.`;
}

export function buildReportBlockedReporterMessage(authorName: string, content: string): string {
  const snippet = formatPostContentSnippet(content);
  return `Your report has been reviewed for the following post:\n\n**Post by ${authorName}:**\n"${snippet}"\n\nThe reported post has been **removed from the community**. Thank you for helping keep our community safe.`;
}

export function buildAdminBlockPostAuthorMessage(reason: string, content: string): string {
  const trimmedReason = reason.trim();
  const snippet = formatPostContentSnippet(content);
  return `Your post has been removed from the community after a review.\n\n**Your post:**\n"${snippet}"\n\nReason: **${trimmedReason}**\n\nIf you have questions, please message Support Admin here.`;
}

export function buildReReviewRequestReceivedMessage(content: string, reason: string): string {
  const snippet = formatPostContentSnippet(content);
  const trimmedReason = reason.trim();
  return `We received your request to check this post again.\n\n**Your post:**\n"${snippet}"\n\n**Your reason:**\n${trimmedReason}\n\nSupport Admin will **review it as soon as possible**. We will update you here once the review is complete.`;
}

export function buildReportBlockedCommentReporterMessage(
  authorName: string,
  content: string
): string {
  const snippet = formatPostContentSnippet(content);
  return `Your report has been reviewed for the following comment:\n\n**Comment by ${authorName}:**\n"${snippet}"\n\nThe reported comment has been **removed from the community**. Thank you for helping keep our community safe.`;
}

export function buildAdminBlockCommentAuthorMessage(reason: string, content: string): string {
  const trimmedReason = reason.trim();
  const snippet = formatPostContentSnippet(content);
  return `Your comment has been removed from the community after a review.\n\n**Your comment:**\n"${snippet}"\n\nReason: **${trimmedReason}**\n\nIf you have questions, please message Support Admin here.`;
}

export async function blockReportedComment(
  report: CommunityReport,
  reason: string
): Promise<void> {
  if (report.targetType !== "comment") throw new Error("Not a comment report");
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Reason is required");

  await softBlockComment(report.postId, report.targetId);
  await clearCommentPendingReview(report.targetId);
  await updateDoc(doc(db, "communityReports", report.id), { status: "resolved" });

  const authorMessage = buildAdminBlockCommentAuthorMessage(trimmedReason, report.targetContent);
  const reporterMessage = buildReportBlockedCommentReporterMessage(
    report.targetAuthorName,
    report.targetContent
  );

  if (report.targetAuthorId === report.reporterId) {
    await sendAdminDirectMessage(report.reporterId, authorMessage);
    return;
  }

  await Promise.all([
    sendAdminDirectMessage(report.reporterId, reporterMessage),
    sendAdminDirectMessage(report.targetAuthorId, authorMessage),
  ]);
}

export async function blockReportedPost(
  report: CommunityReport,
  reason: string
): Promise<void> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Reason is required");

  const batch = writeBatch(db);
  batch.update(doc(db, "communityPosts", report.postId), { blocked: true, underReview: false });
  batch.update(doc(db, "communityReports", report.id), { status: "resolved" });
  batch.delete(doc(db, PENDING_POSTS_COLLECTION, report.postId));
  if (report.targetType === "comment") {
    batch.delete(doc(db, PENDING_COMMENTS_COLLECTION, report.targetId));
  }
  await batch.commit();

  const authorMessage = buildAdminBlockPostAuthorMessage(
    trimmedReason,
    report.targetContent
  );
  const reporterMessage = buildReportBlockedReporterMessage(
    report.targetAuthorName,
    report.targetContent
  );

  if (report.targetAuthorId === report.reporterId) {
    await sendAdminDirectMessage(report.reporterId, authorMessage);
    return;
  }

  await Promise.all([
    sendAdminDirectMessage(report.reporterId, reporterMessage),
    sendAdminDirectMessage(report.targetAuthorId, authorMessage),
  ]);
}

export async function dismissReport(report: CommunityReport): Promise<void> {
  await updateDoc(doc(db, "communityReports", report.id), { status: "dismissed" });
  await clearPostPendingReview(report.postId);
  await updateDoc(doc(db, "communityPosts", report.postId), { underReview: false });
  if (report.targetType === "comment") {
    await clearCommentPendingReview(report.targetId);
  }
  await sendAdminDirectMessage(
    report.reporterId,
    buildReportDismissedReporterMessage(report.targetAuthorName, report.targetContent)
  );
}

export async function reopenReport(report: CommunityReport): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, "communityReports", report.id), { status: "pending", read: false });
  batch.update(doc(db, "communityPosts", report.postId), {
    blocked: false,
    underReview: true,
  });
  batch.set(doc(db, PENDING_POSTS_COLLECTION, report.postId), {
    postId: report.postId,
    updatedAt: Date.now(),
  });
  if (report.targetType === "comment") {
    batch.set(doc(db, PENDING_COMMENTS_COLLECTION, report.targetId), {
      commentId: report.targetId,
      postId: report.postId,
      updatedAt: Date.now(),
    });
  }
  await batch.commit();
}

export async function syncPendingReviewFlags(reports: CommunityReport[]): Promise<void> {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) return;

  const pendingPostIds = [
    ...new Set(reports.filter((report) => report.status === "pending").map((report) => report.postId)),
  ];
  const pendingCommentReports = reports.filter(
    (report) => report.status === "pending" && report.targetType === "comment"
  );

  await Promise.all(
    pendingPostIds.map(async (postId) => {
      await setDoc(
        doc(db, PENDING_POSTS_COLLECTION, postId),
        {
          postId,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      const postSnap = await getDoc(doc(db, "communityPosts", postId));
      if (postSnap.exists() && postSnap.data()?.blocked === true) {
        // Keep blocked posts that are awaiting author re-review as-is.
        return;
      }
      await updateDoc(doc(db, "communityPosts", postId), {
        blocked: false,
        underReview: true,
      });
    })
  );

  await Promise.all(
    pendingCommentReports.map(async (report) => {
      await setDoc(doc(db, PENDING_COMMENTS_COLLECTION, report.targetId), {
        commentId: report.targetId,
        postId: report.postId,
        updatedAt: Date.now(),
      });
    })
  );
}

export async function restoreReportedPost(report: CommunityReport): Promise<void> {
  if (report.targetType !== "post") throw new Error("Only post reports can be restored");
  await clearPostPendingReview(report.postId);
  await updateDoc(doc(db, "communityPosts", report.postId), {
    blocked: false,
    underReview: false,
  });
  await sendAdminDirectMessage(
    report.targetAuthorId,
    `Your post has been restored after an additional review.\n\nIf you need help, please message Support Admin here.`
  );
}

export async function restoreReportedComment(report: CommunityReport): Promise<void> {
  if (report.targetType !== "comment") throw new Error("Only comment reports can be restored");
  if (!(await checkIsAdmin())) throw new Error("Admin only");

  const postRef = doc(db, "communityPosts", report.postId);
  const postSnap = await getDoc(postRef);
  if (!postSnap.exists()) throw new Error("Post not found. Restore the post first if it was removed.");

  const commentRef = doc(db, "communityPosts", report.postId, "comments", report.targetId);
  const commentSnap = await getDoc(commentRef);

  if (commentSnap.exists()) {
    if (commentSnap.data()?.blocked === true) {
      const batch = writeBatch(db);
      batch.update(commentRef, { blocked: false });
      batch.update(postRef, { commentCount: increment(1) });
      await batch.commit();
    }
  } else {
    // Older blocks hard-deleted the comment — recreate from the report snapshot.
    let authorProfileImage: string | null = null;
    try {
      const profile = await getUserProfile(report.targetAuthorId);
      authorProfileImage = profile.profileImage;
    } catch {
      // Profile may be gone; restore text with report metadata.
    }
    const batch = writeBatch(db);
    batch.set(commentRef, {
      authorId: report.targetAuthorId,
      authorName: report.targetAuthorName,
      authorProfileImage,
      text: report.targetContent,
      parentCommentId: null,
      replyToAuthorName: null,
      createdAt: report.createdAt || Date.now(),
      blocked: false,
    });
    batch.update(postRef, { commentCount: increment(1) });
    await batch.commit();
  }

  await clearCommentPendingReview(report.targetId);
  await sendAdminDirectMessage(
    report.targetAuthorId,
    `Your comment has been restored after an additional review.\n\nIf you need help, please message Support Admin here.`
  );
}

async function deleteAllPostComments(postId: string): Promise<void> {
  const commentsSnap = await getDocs(collection(db, "communityPosts", postId, "comments"));
  let batch = writeBatch(db);
  let count = 0;
  for (const commentDoc of commentsSnap.docs) {
    batch.delete(commentDoc.ref);
    count++;
    if (count >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

export async function adminPermanentlyDeletePost(postId: string): Promise<void> {
  if (!(await checkIsAdmin())) throw new Error("Admin only");

  const postSnap = await getDoc(doc(db, "communityPosts", postId));
  const authorId = postSnap.exists()
    ? String((postSnap.data() as Record<string, unknown>).authorId ?? "")
    : "";
  if (postSnap.exists()) {
    await deleteAllPostComments(postId);
    await deleteDoc(doc(db, "communityPosts", postId));
  }
  await clearPostPendingReview(postId);
  try {
    const pendingComments = await getDocs(
      query(collection(db, PENDING_COMMENTS_COLLECTION), where("postId", "==", postId))
    );
    await Promise.all(pendingComments.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  } catch {
    // Ignore.
  }
  await deleteReportsForPost(postId, { asAdmin: true, authorId });
}

/**
 * Admin safety net: drop pending/reviewed queue items whose post was already deleted
 * (e.g. author deleted a reported post before cleanup rules were deployed).
 */
export async function purgeAdminQueueForMissingPosts(postIds: string[]): Promise<string[]> {
  if (!(await checkIsAdmin())) return [];
  const unique = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const missing: string[] = [];
  await Promise.all(
    unique.map(async (postId) => {
      try {
        const snap = await getDoc(doc(db, "communityPosts", postId));
        if (snap.exists()) return;
        missing.push(postId);
        await clearPostPendingReview(postId);
        try {
          const pendingComments = await getDocs(
            query(collection(db, PENDING_COMMENTS_COLLECTION), where("postId", "==", postId))
          );
          await Promise.all(pendingComments.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
        } catch {
          // Ignore.
        }
        await deleteReportsForPost(postId, { asAdmin: true, authorId: "" });
      } catch {
        // Best-effort cleanup.
      }
    })
  );
  return missing;
}

/**
 * Remove a report/review from the admin queue only.
 * Does not delete the author's post or comment — they keep it on their profile
 * (and can request another check if it is still blocked).
 */
export async function adminPermanentlyDeleteReportTarget(
  report: CommunityReport
): Promise<void> {
  if (!(await checkIsAdmin())) throw new Error("Admin only");

  if (report.targetType === "comment") {
    await clearCommentPendingReview(report.targetId);
    await clearPostPendingReview(report.postId);
    try {
      const postSnap = await getDoc(doc(db, "communityPosts", report.postId));
      if (postSnap.exists()) {
        // Drop admin queue flags; keep the post/comment for the author.
        await updateDoc(doc(db, "communityPosts", report.postId), { underReview: false });
      }
    } catch {
      // Post may already be gone.
    }
  } else {
    await clearPostPendingReview(report.postId);
    try {
      const postRef = doc(db, "communityPosts", report.postId);
      const postSnap = await getDoc(postRef);
      if (postSnap.exists()) {
        // Keep blocked posts visible to the author so they can request another check.
        await updateDoc(postRef, { underReview: false });
      }
    } catch {
      // Post may already be gone.
    }
  }

  // Remove every admin report card for this same post/comment.
  try {
    const siblingSnap = await getDocs(
      query(
        collection(db, "communityReports"),
        where("targetType", "==", report.targetType),
        where("targetId", "==", report.targetId)
      )
    );
    let batch = writeBatch(db);
    let ops = 0;
    for (const sibling of siblingSnap.docs) {
      batch.delete(sibling.ref);
      ops += 1;
      if (ops >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  } catch {
    // Fallback if the compound query fails (missing index, etc.).
    await deleteDoc(doc(db, "communityReports", report.id));
  }
}

export async function adminBlockPost(post: CommunityPost, reason: string): Promise<void> {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Admin only");

  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Reason is required");

  const adminUid = auth.currentUser?.uid;
  if (!adminUid) throw new Error("Not signed in");

  await updateDoc(doc(db, "communityPosts", post.id), { blocked: true, underReview: false });
  await clearPostPendingReview(post.id);

  // Record in Reviewed so direct admin blocks appear in report management history.
  await addDoc(collection(db, "communityReports"), {
    targetType: "post",
    targetId: post.id,
    postId: post.id,
    reporterId: adminUid,
    reporterName: SUPPORT_ADMIN_NAME,
    reason: trimmedReason,
    source: "admin_direct",
    status: "resolved",
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
    targetContent: post.content,
    targetAuthorId: post.authorId,
    targetAuthorName: post.authorName,
    read: true,
  });

  await sendAdminDirectMessage(
    post.authorId,
    buildAdminBlockPostAuthorMessage(trimmedReason, post.content)
  );
}

export async function adminBlockComment(
  postId: string,
  comment: CommunityComment,
  reason: string
): Promise<void> {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Admin only");

  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Reason is required");

  const adminUid = auth.currentUser?.uid;
  if (!adminUid) throw new Error("Not signed in");

  await softBlockComment(postId, comment.id);
  await clearCommentPendingReview(comment.id);

  await addDoc(collection(db, "communityReports"), {
    targetType: "comment",
    targetId: comment.id,
    postId,
    reporterId: adminUid,
    reporterName: SUPPORT_ADMIN_NAME,
    reason: trimmedReason,
    source: "admin_direct",
    status: "resolved",
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
    targetContent: comment.text,
    targetAuthorId: comment.authorId,
    targetAuthorName: comment.authorName,
    read: true,
  });

  await sendAdminDirectMessage(
    comment.authorId,
    buildAdminBlockCommentAuthorMessage(trimmedReason, comment.text)
  );
}

export const COMMUNITY_ADMIN_EMAIL = "leezhien12345@gmail.com";
export const SUPPORT_ADMIN_NAME = "Support Admin";

export function isAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === COMMUNITY_ADMIN_EMAIL;
}

export async function isCommunityAdminUserId(userId: string): Promise<boolean> {
  const adminUid = await resolveAdminUid();
  if (adminUid && userId === adminUid) return true;

  try {
    const snap = await getDoc(doc(db, "users", userId));
    const data = snap.data();
    if (data?.role === "admin") return true;
    if (data?.isAdmin === true) return true;
    if (isAdminEmail(typeof data?.email === "string" ? data.email : null)) return true;
  } catch {
    // Fall through
  }

  return false;
}

export function displayCommunityUserName(
  userId: string,
  name: string,
  adminUid: string | null
): string {
  if (adminUid && userId === adminUid) return SUPPORT_ADMIN_NAME;
  if (name === "Community Admin") return SUPPORT_ADMIN_NAME;
  return name;
}

export async function checkIsAdmin(
  userParam?: User | null,
  options?: { skipReload?: boolean }
): Promise<boolean> {
  const user = userParam ?? auth.currentUser;
  if (!user) return false;

  if (isAdminEmail(user.email)) return true;

  if (!options?.skipReload) {
    try {
      await user.reload();
      if (isAdminEmail(user.email)) return true;
    } catch {
      // Continue with cached auth profile if reload fails (offline, etc.)
    }
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const data = snap.data();
    if (data?.isAdmin === true) return true;
    if (data?.role === "admin") return true;
    if (isAdminEmail(typeof data?.email === "string" ? data.email : null)) return true;
  } catch {
    // Fall through
  }

  return false;
}

export async function loadFriendRelations(
  userIds: string[]
): Promise<Record<string, FriendRelation>> {
  const user = auth.currentUser;
  if (!user) return {};

  const unique = [...new Set(userIds.filter((id) => id && id !== user.uid))];
  const result: Record<string, FriendRelation> = {};
  await Promise.all(
    unique.map(async (id) => {
      result[id] = await getFriendRelation(id);
    })
  );
  return result;
}

export async function syncAdminConfig(): Promise<void> {
  const user = auth.currentUser;
  if (!user || !(await checkIsAdmin(user))) return;

  const adminEmail = user.email?.trim().toLowerCase() ?? COMMUNITY_ADMIN_EMAIL;

  // User doc first — always allowed for owner; enables isUserDocAdmin() in rules.
  try {
    await setDoc(
      doc(db, "users", user.uid),
      {
        email: adminEmail,
        role: "admin",
        name: SUPPORT_ADMIN_NAME,
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("syncAdminConfig: user profile update failed:", e);
  }

  try {
    await setDoc(
      doc(db, "communityConfig", "main"),
      { adminUserId: user.uid, adminEmail: COMMUNITY_ADMIN_EMAIL, updatedAt: Date.now() },
      { merge: true }
    );
  } catch (e) {
    console.warn(
      "syncAdminConfig: communityConfig write failed (publish firestore.rules in Firebase Console):",
      e
    );
  }
}

let resolvedAdminUidCache: string | null | undefined;
let resolveAdminUidInFlight: Promise<string | null> | null = null;

export async function resolveAdminUid(): Promise<string | null> {
  if (resolvedAdminUidCache !== undefined) return resolvedAdminUidCache;
  if (resolveAdminUidInFlight) return resolveAdminUidInFlight;

  resolveAdminUidInFlight = (async () => {
    try {
      const configSnap = await getDoc(doc(db, "communityConfig", "main"));
      const configUid = configSnap.data()?.adminUserId;
      if (typeof configUid === "string" && configUid.length > 0) {
        resolvedAdminUidCache = configUid;
        return configUid;
      }
    } catch {
      // Config may not exist yet or rules not deployed
    }

    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("email", "==", COMMUNITY_ADMIN_EMAIL))
      );
      if (!snap.empty) {
        resolvedAdminUidCache = snap.docs[0].id;
        return snap.docs[0].id;
      }
    } catch {
      // Fall through
    }

    resolvedAdminUidCache = null;
    return null;
  })().finally(() => {
    resolveAdminUidInFlight = null;
  });

  return resolveAdminUidInFlight;
}

export async function ensureSupportChatWithAdmin(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  if (await checkIsAdmin()) return null;

  try {
    const adminUid = await resolveAdminUid();
    if (!adminUid || adminUid === user.uid) return null;
    const chatId = await ensureChat(user.uid, adminUid, { isSupportChat: true });
    await seedSupportWelcomeMessage(chatId);
    return chatId;
  } catch (e) {
    console.warn("ensureSupportChatWithAdmin failed:", e);
    return null;
  }
}

export function subscribeRegisteredUsers(
  onData: (users: RegisteredUser[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "users"),
    (snap) => {
      const users = snap.docs
        .map((d) => mapRegisteredUser(d.id, d.data() as Record<string, unknown>))
        .filter((u) => u.email.toLowerCase() !== COMMUNITY_ADMIN_EMAIL)
        .sort((a, b) => a.name.localeCompare(b.name));
      onData(users);
    },
    (error) => {
      console.warn("subscribeRegisteredUsers failed:", error);
      onError?.(error);
      onData([]);
    }
  );
}

export function sortChatsForUser(
  chats: ChatConversation[],
  currentUserId: string,
  adminUid: string | null
): ChatConversation[] {
  return [...chats].sort((a, b) => {
    const aIsAdmin =
      adminUid != null && a.participants.includes(adminUid) && a.participants.includes(currentUserId);
    const bIsAdmin =
      adminUid != null && b.participants.includes(adminUid) && b.participants.includes(currentUserId);
    if (aIsAdmin && !bIsAdmin) return -1;
    if (!aIsAdmin && bIsAdmin) return 1;
    return b.lastMessageAt - a.lastMessageAt;
  });
}

export const SUPPORT_ADMIN_PLACEHOLDER_ID = "__support_admin__";

export function isSupportAdminPlaceholder(chatId: string): boolean {
  return chatId === SUPPORT_ADMIN_PLACEHOLDER_ID;
}

export function buildChatListWithSupportAdmin(
  chats: ChatConversation[],
  currentUserId: string,
  adminUid: string | null,
  adminProfileImage: string | null = null
): ChatConversation[] {
  if (!adminUid || !currentUserId) return sortChatsForUser(chats, currentUserId, adminUid);

  const hasAdminChat = chats.some(
    (c) => c.participants.includes(adminUid) && c.participants.includes(currentUserId)
  );
  if (hasAdminChat) return sortChatsForUser(chats, currentUserId, adminUid);

  const placeholder: ChatConversation = {
    id: SUPPORT_ADMIN_PLACEHOLDER_ID,
    participants: [currentUserId, adminUid],
    participantNames: { [adminUid]: SUPPORT_ADMIN_NAME },
    participantImages: { [adminUid]: adminProfileImage },
    lastMessage: SUPPORT_CHAT_WELCOME_MESSAGE,
    lastMessageAt: Date.now(),
    unreadCount: {},
    clearedAt: {},
    isSupportChat: true,
  };

  return sortChatsForUser([placeholder, ...chats], currentUserId, adminUid);
}

export function chatDisplayName(
  chat: ChatConversation,
  currentUserId: string,
  adminUid: string | null
): string {
  const otherUid = chat.participants.find((p) => p !== currentUserId) ?? "";
  if (adminUid && otherUid === adminUid) return SUPPORT_ADMIN_NAME;
  return chat.participantNames[otherUid] ?? "Friend";
}

export { getCurrentUserProfile, getUserProfile };
