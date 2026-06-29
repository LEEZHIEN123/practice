import type { User } from "firebase/auth";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
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
  PostCategory,
  PostEditSnapshot,
  PublicUserProfile,
  RegisteredUser,
  ReportTargetType,
} from "./communityTypes";
import { ADMIN_AUTO_REPLY, SUPPORT_CHAT_WELCOME_MESSAGE } from "./communityTypes";
import { calcBmi } from "./workoutPlan";

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
    editHistory,
    updatedAt: Number(data.updatedAt ?? data.createdAt ?? 0),
    likeCount: Number(data.likeCount ?? 0),
    commentCount: Number(data.commentCount ?? 0),
    likedBy: Array.isArray(data.likedBy) ? data.likedBy.map(String) : [],
    blocked: data.blocked === true,
    createdAt: Number(data.createdAt ?? 0),
  };
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
    data.messageType === "sticker"
      ? data.messageType
      : "text";

  const rawQuote = data.quote;
  let quote: ChatMessage["quote"] = null;
  if (rawQuote && typeof rawQuote === "object") {
    const q = rawQuote as Record<string, unknown>;
    const quoteType =
      q.messageType === "image" ||
      q.messageType === "voice" ||
      q.messageType === "sticker"
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
  // Single-field filter only — no composite index required. Sort client-side.
  const q = query(collection(db, "communityPosts"), where("blocked", "==", false));
  return onSnapshot(
    q,
    (snap) => {
      const posts = snap.docs
        .map((d) => mapPost(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAt - a.createdAt);
      onData(posts);
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
}): Promise<void> {
  const { uid, profile } = await getCurrentUserProfile();
  const trimmed = params.content.trim();
  if (!trimmed) throw new Error("Add text to post");

  const tags = (params.tags ?? []).map((t) => t.trim()).filter(Boolean);
  const now = Date.now();

  await addDoc(collection(db, "communityPosts"), {
    authorId: uid,
    authorName: profile.name,
    authorProfileImage: profile.profileImage,
    content: trimmed,
    category: "general",
    imageUrl: null,
    tags,
    editHistory: [],
    updatedAt: now,
    likeCount: 0,
    commentCount: 0,
    likedBy: [],
    blocked: false,
    createdAt: now,
    createdAtServer: serverTimestamp(),
  });
}

export async function updatePost(
  post: CommunityPost,
  params: { content: string; imageUrl?: string | null; tags?: string[] }
): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.uid !== post.authorId) throw new Error("Not allowed");

  const trimmed = params.content.trim();
  if (!trimmed) {
    throw new Error("Add text to post");
  }

  const tags = (params.tags ?? post.tags).map((t) => t.trim()).filter(Boolean);
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
    editHistory: [...post.editHistory, snapshot],
    updatedAt: Date.now(),
  });
}

export async function fetchPostById(postId: string): Promise<CommunityPost | null> {
  const snap = await getDoc(doc(db, "communityPosts", postId));
  if (!snap.exists()) return null;
  return mapPost(snap.id, snap.data() as Record<string, unknown>);
}

export async function deletePost(postId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const snap = await getDoc(doc(db, "communityPosts", postId));
  if (!snap.exists()) throw new Error("Post not found");
  const data = snap.data() as Record<string, unknown>;
  if (data.authorId !== user.uid && !(await checkIsAdmin())) {
    throw new Error("Not allowed");
  }
  await deleteDoc(doc(db, "communityPosts", postId));
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

  const postRef = doc(db, "communityPosts", post.id);
  const liked = post.likedBy.includes(user.uid);

  await updateDoc(postRef, {
    likedBy: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
    likeCount: increment(liked ? -1 : 1),
  });

  if (!liked) {
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
  }
}

export function subscribeComments(
  postId: string,
  onData: (comments: CommunityComment[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "communityPosts", postId, "comments"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snap) => {
    onData(
      snap.docs.map((d) => mapComment(d.id, postId, d.data() as Record<string, unknown>))
    );
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
    text: trimmed,
    parentCommentId,
    replyToAuthorName,
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
  });
  batch.update(doc(db, "communityPosts", postId), { commentCount: increment(1) });
  await batch.commit();

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
  });

  if (params.targetType === "post") {
    await sendAdminDirectMessage(
      uid,
      buildReportReceivedReporterMessage(params.targetAuthorName, params.targetContent)
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

export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, "communityNotifications", notificationId), { read: true });
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
      quote?: ChatMessageQuote;
    };

function chatMessagePreview(input: {
  text: string;
  messageType: "text" | "image" | "voice" | "sticker";
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
          quote: null as ChatMessageQuote | null,
        }
      : (() => {
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

  const preview = chatMessagePreview(normalized);
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

async function sendAdminDirectMessage(recipientUserId: string, messageText: string): Promise<void> {
  const adminUid = await resolveAdminUid();
  if (!adminUid) return;
  if (recipientUserId === adminUid) return;

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

export async function blockReportedPost(
  report: CommunityReport,
  reason: string
): Promise<void> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Reason is required");

  const batch = writeBatch(db);
  batch.update(doc(db, "communityPosts", report.postId), { blocked: true });
  batch.update(doc(db, "communityReports", report.id), { status: "resolved" });
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
  await sendAdminDirectMessage(
    report.reporterId,
    buildReportDismissedReporterMessage(report.targetAuthorName, report.targetContent)
  );
}

export async function adminBlockPost(post: CommunityPost, reason: string): Promise<void> {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Admin only");

  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Reason is required");

  await updateDoc(doc(db, "communityPosts", post.id), { blocked: true });

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

  await deleteComment(postId, comment.id);

  const message = `Your comment has been removed from the community after a review.\n\nReason: **${trimmedReason}**\n\nIf you have questions, please message Support Admin here.`;
  await sendAdminDirectMessage(comment.authorId, message);
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

export async function inviteUserByEmail(email: string): Promise<void> {
  const { uid, profile } = await getCurrentUserProfile();
  if (!(await checkIsAdmin())) throw new Error("Admin only");

  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("Please enter a valid email address.");
  }

  await addDoc(collection(db, "communityInvites"), {
    email: cleanEmail,
    invitedBy: uid,
    invitedByName: profile.name,
    status: "pending",
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
  });
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
