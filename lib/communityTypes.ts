export type PostCategory = "workout" | "meal" | "weight" | "general";

export type PostEditSnapshot = {
  content: string;
  imageUrl: string | null;
  tags: string[];
  editedAt: number;
};

export type CommunityPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorProfileImage: string | null;
  content: string;
  category: PostCategory;
  imageUrl: string | null;
  tags: string[];
  /** Shared unlocked achievement ids (optional). */
  achievementIds: string[];
  editHistory: PostEditSnapshot[];
  updatedAt: number;
  likeCount: number;
  commentCount: number;
  likedBy: string[];
  blocked: boolean;
  /** Author hid this post from the community; only the author (and admin) can see it. */
  authorHidden: boolean;
  underReview: boolean;
  createdAt: number;
};

export type CommunityComment = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorProfileImage: string | null;
  text: string;
  parentCommentId: string | null;
  replyToAuthorName: string | null;
  createdAt: number;
  blocked: boolean;
};

export type ReportTargetType = "post" | "comment";

export type CommunityReport = {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  postId: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  status: "pending" | "resolved" | "dismissed";
  createdAt: number;
  targetContent: string;
  targetAuthorId: string;
  targetAuthorName: string;
  read: boolean;
  /** Origin of this queue item. */
  source?: "report" | "re_review" | "admin_direct";
  /** Author's original request-review reason when source is re_review. */
  requestReason?: string;
};

/** Author asked Support Admin to check a blocked post again. */
export type PendingReReviewRequest = {
  postId: string;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  authorId: string;
  authorName: string;
  content: string;
  requestedAt: number;
};

export type FriendRequest = {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserProfileImage: string | null;
  toUserId: string;
  toUserName: string;
  toUserProfileImage: string | null;
  status: "pending" | "accepted" | "rejected";
  createdAt: number;
};

export type CommunityNotificationType =
  | "friend_request"
  | "friend_accepted"
  | "post_like"
  | "post_comment"
  | "post_reported"
  | "comment_reported";

export type FriendRequestNotificationStatus = "pending" | "accepted" | "rejected";

export type CommunityNotification = {
  id: string;
  userId: string;
  type: CommunityNotificationType;
  fromUserId: string;
  fromUserName: string;
  fromUserProfileImage: string | null;
  friendRequestId?: string;
  friendRequestStatus?: FriendRequestNotificationStatus;
  postId?: string;
  commentId?: string;
  postPreview?: string;
  read: boolean;
  createdAt: number;
};

export type ChatConversation = {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  participantImages: Record<string, string | null>;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: Record<string, number>;
  clearedAt: Record<string, number>;
  isSupportChat?: boolean;
};

export type ChatMessageType = "text" | "image" | "voice" | "sticker" | "post";

export type ChatMessageQuote = {
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  messageType: ChatMessageType;
  stickerId: string | null;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  text: string;
  messageType: ChatMessageType;
  stickerId: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  audioDurationMs: number | null;
  sharedPostId: string | null;
  sharedPostAuthorName: string | null;
  sharedPostAuthorImage: string | null;
  sharedPostContent: string | null;
  sharedPostTags: string[];
  sharedPostLikeCount: number;
  sharedPostCommentCount: number;
  sharedPostCreatedAt: number | null;
  quote: ChatMessageQuote | null;
  editedAt: number | null;
  recalled: boolean;
  recalledAt: number | null;
  recalledByName: string | null;
  createdAt: number;
  isAutoReply?: boolean;
};

export type FriendListEntry = {
  id: string;
  name: string;
  email: string;
  profileImage: string | null;
};

export type RegisteredUser = {
  id: string;
  name: string;
  email: string;
  profileImage: string | null;
  createdAt: number;
};

export type UserInvite = {
  id: string;
  email: string;
  invitedBy: string;
  invitedByName: string;
  createdAt: number;
  status: "pending" | "registered";
};

export type FriendRelation = "none" | "pending_outgoing" | "pending_incoming" | "friends";

export const REPORT_REASONS = [
  "Spam or misleading content",
  "Harassment or bullying",
  "Inappropriate content",
  "Hate speech",
  "Other",
] as const;

export const ADMIN_BLOCK_POST_REASONS = [
  "Inappropriate content",
  "Spam or misleading content",
  "Harassment or bullying",
  "Hate speech",
  "Violates community guidelines",
  "Other",
] as const;

export const ADMIN_AUTO_REPLY =
  "We received your message and will respond as soon as possible. Thank you for reaching out!";

export const SUPPORT_CHAT_WELCOME_MESSAGE =
  "Welcome! We're glad you joined. If you have any questions, feel free to message Support Admin anytime — we're here to help.";

export const DEFAULT_POST_TAGS = [
  "Fitness",
  "Workout",
  "Nutrition",
  "Meal",
  "Weight",
  "Progress",
  "Motivation",
  "Achievement",
] as const;

export type PublicUserProfile = {
  id: string;
  name: string;
  profileImage: string | null;
  bio: string;
  goal: string;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  gender: string | null;
};
