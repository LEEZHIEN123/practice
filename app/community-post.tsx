import { BlockReasonModal } from "@/components/community/BlockReasonModal";
import { CommentMenuModal } from "@/components/community/CommentMenuModal";
import { CommentReviewTip } from "@/components/community/CommentReviewTip";
import { PostPendingReviewTip } from "@/components/community/PostPendingReviewTip";
import { CommunityAuthorName } from "@/components/community/CommunityAuthorName";
import { PersonNameSuffix } from "@/components/community/PersonNameSuffix";
import { PostAchievementChips } from "@/components/community/PostAchievementChips";
import { PostComposerModal } from "@/components/community/PostComposerModal";
import { PostEditHistoryModal } from "@/components/community/PostEditHistoryModal";
import { PostLikesModal } from "@/components/community/PostLikesModal";
import { PostMenuModal } from "@/components/community/PostMenuModal";
import { ReportReasonModal } from "@/components/community/ReportReasonModal";
import { ReReviewReasonModal } from "@/components/community/ReReviewReasonModal";
import { SharePostToChatModal } from "@/components/community/SharePostToChatModal";
import { UserProfileModal } from "@/components/community/UserProfileModal";
import { Pressable } from "@/components/Pressable";
import { ProfileScreenHeader, ThemedText } from "@/components/themed/ThemedUi";
import { formatChatMessageTime, formatPostDisplayTime } from "@/lib/chatMessageUtils";
import {
  addComment,
  adminBlockComment,
  deleteComment,
  deletePost,
  getPostsByAuthor,
  getPublicUserProfile,
  isCommunityAdminUserId,
  loadLikerProfiles,
  requestBlockedPostReReview,
  resolveAdminUid,
  submitReport,
  subscribeChats,
  subscribeComments,
  subscribeFriendsList,
  subscribePendingCommunityCommentIds,
  subscribePendingCommunityPostIds,
  subscribePostById,
  subscribePosts,
  threadedComments,
  togglePostLike,
  updatePost,
  type LikerProfile,
} from "@/lib/communityService";
import type {
  ChatConversation,
  CommunityComment,
  CommunityPost,
  FriendListEntry,
} from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";
import { removeCommunityPost } from "@/lib/communityBootstrap";

function ProfileAvatar({ uri, size = 48 }: { uri: string | null; size?: number }) {
  return (
    <View
      className="rounded-full bg-[#9fdfb6] items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Ionicons name="person" size={size * 0.42} color="white" />
      )}
    </View>
  );
}

export default function CommunityPostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ postId?: string }>();
  const postId = params.postId ? String(params.postId) : "";

  const { screenStyle, cardStyle, textPrimary, textSecondary, textMuted, theme } = useThemedScreen();

  const [post, setPost] = useState<CommunityPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [adminUid, setAdminUid] = useState<string | null>(null);

  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [pendingReviewCommentIds, setPendingReviewCommentIds] = useState<string[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null);
  const [menuComment, setMenuComment] = useState<CommunityComment | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [blockComment, setBlockComment] = useState<CommunityComment | null>(null);

  const [likesPost, setLikesPost] = useState<CommunityPost | null>(null);
  const [likers, setLikers] = useState<LikerProfile[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);
  const [friends, setFriends] = useState<FriendListEntry[]>([]);
  const [menuPostVisible, setMenuPostVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);
  const [posting, setPosting] = useState(false);
  const [reReviewVisible, setReReviewVisible] = useState(false);
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [pendingReviewPostIds, setPendingReviewPostIds] = useState<string[]>([]);

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<Awaited<ReturnType<typeof getPublicUserProfile>> | null>(
    null
  );
  const [allPosts, setAllPosts] = useState<CommunityPost[]>([]);

  const displayComments = useMemo(() => threadedComments(comments), [comments]);
  const profilePosts = useMemo(
    () => (profileUserId ? getPostsByAuthor(allPosts, profileUserId) : []),
    [profileUserId, allPosts]
  );

  useEffect(() => {
    if (!currentUserId) {
      setFriends([]);
      return;
    }
    const unsub = subscribeFriendsList(setFriends);
    return unsub;
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setChats([]);
      return;
    }
    const unsub = subscribeChats(setChats);
    return unsub;
  }, [currentUserId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUserId(user?.uid ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    void resolveAdminUid().then(setAdminUid).catch(() => setAdminUid(null));
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setIsAdmin(false);
      return;
    }
    void isCommunityAdminUserId(currentUserId)
      .then(setIsAdmin)
      .catch(() => setIsAdmin(false));
  }, [currentUserId]);

  useEffect(() => {
    const unsub = subscribePosts(setAllPosts);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribePendingCommunityPostIds(setPendingReviewPostIds);
    return unsub;
  }, []);

  useEffect(() => {
    if (!postId) {
      setPost(null);
      setLoading(false);
      setUnavailable(true);
      return;
    }

    setLoading(true);
    setUnavailable(false);
    const unsub = subscribePostById(
      postId,
      (nextPost) => {
        setPost(nextPost);
        setUnavailable(!nextPost);
        setLoading(false);
      },
      () => {
        setPost(null);
        setUnavailable(true);
        setLoading(false);
      }
    );
    return unsub;
  }, [postId]);

  useEffect(() => {
    if (!post) return;
    const unsub = subscribeComments(post.id, setComments);
    return unsub;
  }, [post]);

  useEffect(() => {
    if (!post) return;
    const unsub = subscribePendingCommunityCommentIds(post.id, setPendingReviewCommentIds);
    return unsub;
  }, [post]);

  const openUserProfile = async (userId: string) => {
    setProfileUserId(userId);
    setProfileLoading(true);
    setProfileData(null);
    try {
      const profile = await getPublicUserProfile(userId);
      setProfileData(profile);
    } catch {
      Alert.alert("Error", "Could not load profile.");
      setProfileUserId(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleLike = useCallback(async () => {
    if (!post) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert("Sign in required", "Please sign in to like posts.");
      return;
    }

    const liked = post.likedBy.includes(uid);
    const optimistic: CommunityPost = {
      ...post,
      likedBy: liked ? post.likedBy.filter((id) => id !== uid) : [...post.likedBy, uid],
      likeCount: Math.max(0, liked ? post.likeCount - 1 : post.likeCount + 1),
    };

    setPost(optimistic);
    try {
      await togglePostLike(post);
    } catch (e: unknown) {
      setPost(post);
      Alert.alert("Error", e instanceof Error ? e.message : "Could not update like.");
    }
  }, [post]);

  const openLikesModal = async () => {
    if (!post || post.likeCount === 0) return;
    setLikesPost(post);
    setLikersLoading(true);
    setLikers([]);
    try {
      const profiles = await loadLikerProfiles(post.likedBy);
      setLikers(profiles);
    } catch {
      Alert.alert("Error", "Could not load likes.");
      setLikesPost(null);
    } finally {
      setLikersLoading(false);
    }
  };

  const handleSendComment = async () => {
    if (!post || !commentText.trim()) return;
    try {
      setCommentSending(true);
      await addComment(post.id, commentText, {
        parentCommentId: replyingTo?.id,
        replyToAuthorName: replyingTo?.authorName,
      });
      setCommentText("");
      setReplyingTo(null);
      Keyboard.dismiss();
      Alert.alert("Comment sent", "Your comment has been posted.");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not add comment.");
    } finally {
      setCommentSending(false);
    }
  };

  const handleDeleteComment = (comment: CommunityComment) => {
    if (!post) return;
    const isOwnComment = comment.authorId === currentUserId;
    const message = isOwnComment
      ? "Delete your comment?"
      : isAdmin
        ? "Delete this comment? It will be removed for everyone."
        : "Delete this comment from your post?";
    Alert.alert("Delete comment", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              setDeletingCommentId(comment.id);
              setMenuComment(null);
              await deleteComment(post.id, comment.id);
              if (replyingTo?.id === comment.id) {
                setReplyingTo(null);
                setCommentText("");
              }
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not delete comment.");
            } finally {
              setDeletingCommentId(null);
            }
          })();
        },
      },
    ]);
  };

  const requestBlockComment = (comment: CommunityComment) => {
    setMenuComment(null);
    Alert.alert(
      "Block Comment",
      "This comment will be removed and the author will be notified via Support Admin chat. It will also appear under Reviewed in report management.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => setBlockComment(comment),
        },
      ]
    );
  };

  const handleConfirmBlockComment = async (reason: string) => {
    if (!post || !blockComment) return;
    const target = blockComment;
    await adminBlockComment(post.id, target, reason);
    setBlockComment(null);
    if (replyingTo?.id === target.id) {
      setReplyingTo(null);
      setCommentText("");
    }
    Alert.alert(
      "Comment blocked",
      "The author has been notified. This action is listed under Reviewed."
    );
  };

  const handleDeletePost = () => {
    if (!post) return;
    const pendingReview = post.underReview || post.blocked;
    Alert.alert(
      "Delete post",
      pendingReview
        ? "This post is under Support Admin review. Delete it permanently? It will be removed for everyone and cleared from the admin review queue."
        : "Are you sure you want to delete this post? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                removeCommunityPost(post.id);
                await deletePost(post.id);
                router.back();
              } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Could not delete post.");
              }
            })();
          },
        },
      ]
    );
  };

  const handleUpdatePost = async (values: {
    content: string;
    tags: string[];
    achievementIds: string[];
  }) => {
    if (!post) return;
    try {
      setPosting(true);
      await updatePost(post, {
        content: values.content,
        imageUrl: post.imageUrl,
        tags: values.tags,
        achievementIds: values.achievementIds,
      });
      setComposerVisible(false);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save post.");
    } finally {
      setPosting(false);
    }
  };

  const liked = currentUserId && post ? post.likedBy.includes(currentUserId) : false;
  const isOwnPost = post?.authorId === currentUserId;
  const menuCommentBusy = menuComment != null && deletingCommentId === menuComment.id;
  const isUnderReview =
    post != null &&
    !post.blocked &&
    (post.underReview || pendingReviewPostIds.includes(post.id));
  const canReportPost =
    post != null &&
    !isOwnPost &&
    post.authorId !== adminUid &&
    !isUnderReview &&
    !post.blocked;

  return (
    <View className="flex-1" style={screenStyle}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12, paddingBottom: 8 }}>
        <ProfileScreenHeader title="Post" onBack={() => router.back()} titleClassName="text-xl" />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : unavailable || !post ? (
        <View className="flex-1 items-center justify-center px-6">
          <ThemedText variant="muted" className="text-center text-base">
            This post is no longer available.
          </ThemedText>
        </View>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="px-4 py-4 rounded-2xl" style={cardStyle}>
              <View className="flex-row items-center">
                <Pressable onPress={() => void openUserProfile(post.authorId)}>
                  <ProfileAvatar uri={post.authorProfileImage} />
                </Pressable>
                <Pressable
                  onPress={() => void openUserProfile(post.authorId)}
                  className="flex-1 ml-3"
                >
                  <CommunityAuthorName
                    authorId={post.authorId}
                    authorName={post.authorName}
                    adminUid={adminUid}
                    textStyle={textPrimary}
                    ownSuffix={
                      isOwnPost ? (
                        <Text className="text-sm font-bold" style={{ color: theme.accentText }}>
                          {" "}
                          · me
                        </Text>
                      ) : null
                    }
                  />
                  <Text className="text-[10px] mt-0.5" style={textMuted}>
                    {formatPostDisplayTime(post.createdAt)}
                  </Text>
                </Pressable>
                {currentUserId ? (
                  <Pressable
                    onPress={() => setMenuPostVisible(true)}
                    className="w-9 h-9 rounded-full items-center justify-center"
                  >
                    <Ionicons name="ellipsis-vertical" size={20} color={theme.iconMuted} />
                  </Pressable>
                ) : null}
              </View>

              {post.blocked ? (
                <View
                  className="mt-3 rounded-xl px-3 py-2 border"
                  style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}
                >
                  <Text className="text-xs font-semibold text-[#b91c1c]">
                    {post.underReview
                      ? "This post is still hidden while Support Admin reviews your request to check it again."
                      : "This post was reported and has been hidden by Support Admin. Only you can see it here."}
                  </Text>
                </View>
              ) : isUnderReview ? (
                <View className="mt-2">
                  <PostPendingReviewTip variant={isOwnPost ? "author" : "public"} />
                </View>
              ) : null}

              {post.content ? (
                <Text className="text-base mt-3 leading-7" style={textSecondary}>
                  {post.content}
                </Text>
              ) : null}

              <PostAchievementChips achievementIds={post.achievementIds ?? []} />

              {post.imageUrl ? (
                <Image
                  source={{ uri: post.imageUrl }}
                  style={{ width: "100%", height: 220, borderRadius: 16, marginTop: 10 }}
                  contentFit="cover"
                />
              ) : null}

              {post.tags.length > 0 ? (
                <View className="flex-row flex-wrap gap-2 mt-3">
                  {post.tags.map((tag) => (
                    <View
                      key={tag}
                      className="rounded-full px-2.5 py-1 border"
                      style={{ backgroundColor: theme.cardBg, borderColor: theme.accent }}
                    >
                      <Text className="text-[10px] font-bold text-[#52B69A]">#{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View className="flex-row items-center mt-4">
                <View className="flex-row items-center mr-4">
                  <Pressable onPress={() => void handleLike()} hitSlop={10} className="flex-row items-center">
                    <Ionicons
                      name={liked ? "heart" : "heart-outline"}
                      size={20}
                      color={liked ? "#ef4444" : "#52B69A"}
                    />
                  </Pressable>
                  <Pressable onPress={() => void openLikesModal()}>
                    <Text className="text-xs text-[#52B69A] font-bold ml-1.5">
                      {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
                    </Text>
                  </Pressable>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="chatbubble-outline" size={18} color="#52B69A" />
                  <Text className="text-xs text-[#52B69A] font-bold ml-1.5">
                    {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
                  </Text>
                </View>
              </View>
            </View>

            <Text className="text-lg font-extrabold mt-5 mb-3" style={textPrimary}>
              Comments
            </Text>

            {displayComments.length === 0 ? (
              <ThemedText variant="muted" className="text-sm text-center py-6">
                No comments yet.
              </ThemedText>
            ) : null}

            {displayComments.map((comment) => {
              const isReply = Boolean(comment.parentCommentId);
              const isReplyingToThis = replyingTo?.id === comment.id;
              const hasCommentReviewTip = pendingReviewCommentIds.includes(comment.id);

              return (
                <View
                  key={comment.id}
                  className={`rounded-2xl p-4 border mb-2 ${isReply ? "ml-6 border-l-4 border-l-[#52B69A]" : ""}`}
                  style={[
                    cardStyle,
                    isReplyingToThis ? { borderColor: theme.accent, borderWidth: 2 } : undefined,
                  ]}
                >
                  {hasCommentReviewTip ? <CommentReviewTip /> : null}
                  <View className="flex-row items-center">
                    <Pressable onPress={() => void openUserProfile(comment.authorId)}>
                      <ProfileAvatar uri={comment.authorProfileImage} size={36} />
                    </Pressable>
                    <View className="flex-1 ml-3">
                      <View className="flex-row items-start justify-between gap-2">
                        <Pressable
                          onPress={() => void openUserProfile(comment.authorId)}
                          className="flex-1"
                        >
                          <Text className="text-sm font-extrabold" style={textPrimary}>
                            {comment.authorName}
                            <PersonNameSuffix
                              isMe={comment.authorId === currentUserId}
                              isFriend={
                                comment.authorId !== currentUserId &&
                                friendIds.has(comment.authorId)
                              }
                              accentColor={theme.accentText}
                              textClassName="text-sm font-bold"
                            />
                          </Text>
                        </Pressable>
                        <Text className="text-[10px]" style={textMuted}>
                          {formatChatMessageTime(comment.createdAt)}
                        </Text>
                      </View>
                    </View>
                    {currentUserId &&
                    (isAdmin ||
                      comment.authorId === currentUserId ||
                      post.authorId === currentUserId) ? (
                      <Pressable
                        onPress={() => setMenuComment(comment)}
                        className="w-8 h-8 rounded-full items-center justify-center"
                      >
                        <Ionicons name="ellipsis-vertical" size={18} color={theme.iconMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                  {comment.replyToAuthorName ? (
                    <Text className="text-xs font-bold text-[#52B69A] mt-2">
                      Replying to {comment.replyToAuthorName}
                    </Text>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      setReplyingTo(comment);
                      setMenuComment(null);
                    }}
                  >
                    <Text className="text-sm mt-2 leading-6" style={textSecondary}>
                      {comment.text}
                    </Text>
                    <Text className="text-xs font-bold text-[#2563eb] mt-2">Reply</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          <View
            className="px-4 border-t"
            style={{
              paddingBottom: insets.bottom + 8,
              paddingTop: 12,
              borderTopColor: theme.cardBorder,
              backgroundColor: theme.cardBg,
            }}
          >
            {replyingTo ? (
              <View
                className="flex-row items-center justify-between rounded-xl px-3 py-2 mb-2 border"
                style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
              >
                <Text className="text-xs font-extrabold" style={{ color: theme.accentText }}>
                  Replying to {replyingTo.authorName}
                </Text>
                <Pressable
                  onPress={() => {
                    setReplyingTo(null);
                  }}
                >
                  <Text className="text-xs font-bold" style={textMuted}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <View className="flex-row items-end gap-2">
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder={
                  replyingTo ? `Reply to ${replyingTo.authorName}...` : "Write a comment..."
                }
                multiline
                className="flex-1 rounded-2xl px-4 py-3 text-sm max-h-28"
                style={{
                  backgroundColor: theme.rowBg,
                  borderColor: theme.cardBorder,
                  borderWidth: 1,
                  color: theme.textPrimary,
                }}
                placeholderTextColor={theme.textMuted}
              />
              <Pressable
                onPress={() => void handleSendComment()}
                disabled={commentSending || !commentText.trim()}
                className={`w-11 h-11 rounded-full items-center justify-center ${
                  commentText.trim() ? "bg-[#52B69A]" : "bg-gray-200"
                }`}
              >
                {commentSending ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Ionicons name="send" size={18} color="white" />
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <CommentMenuModal
        visible={menuComment !== null}
        comment={menuComment}
        canDelete={
          menuComment != null &&
          (isAdmin ||
            menuComment.authorId === currentUserId ||
            post?.authorId === currentUserId)
        }
        isAdmin={isAdmin}
        canBlock={
          isAdmin &&
          menuComment != null &&
          menuComment.authorId !== currentUserId
        }
        deleting={menuCommentBusy}
        onClose={() => setMenuComment(null)}
        onDelete={() => {
          if (menuComment) handleDeleteComment(menuComment);
        }}
        onBlock={() => {
          if (menuComment) requestBlockComment(menuComment);
        }}
      />

      <BlockReasonModal
        visible={blockComment !== null}
        title="Block Comment"
        description="Choose a reason for blocking this comment. The author will be notified via Support Admin chat, and this action will appear under Reviewed."
        onClose={() => setBlockComment(null)}
        onConfirm={handleConfirmBlockComment}
      />

      <PostLikesModal
        visible={likesPost !== null}
        likers={likers}
        loading={likersLoading}
        currentUserId={currentUserId}
        friendIds={friendIds}
        onClose={() => {
          setLikesPost(null);
          setLikers([]);
        }}
        onOpenProfile={(userId) => {
          setLikesPost(null);
          setLikers([]);
          void openUserProfile(userId);
        }}
      />

      <UserProfileModal
        visible={profileUserId !== null}
        profile={profileData}
        posts={profilePosts}
        relation="none"
        loading={profileLoading}
        isSelf={profileUserId === currentUserId}
        isSupportAdmin={profileUserId === adminUid}
        canAddFriend={false}
        pendingReviewPostIds={pendingReviewPostIds}
        onClose={() => {
          setProfileUserId(null);
          setProfileData(null);
        }}
        onAddFriend={() => {}}
        onOpenPost={(openedPostId) => {
          setProfileUserId(null);
          setProfileData(null);
          if (openedPostId === postId) return;
          router.push({
            pathname: "/community-post" as any,
            params: { postId: openedPostId },
          });
        }}
      />

      <PostMenuModal
        visible={menuPostVisible && post != null}
        post={post}
        isOwnPost={Boolean(isOwnPost)}
        isAdmin={isAdmin}
        canReport={canReportPost}
        onClose={() => setMenuPostVisible(false)}
        onEdit={() => setComposerVisible(true)}
        onDelete={handleDeletePost}
        onEditHistory={() => setHistoryVisible(true)}
        onReport={() => setReportVisible(true)}
        onShare={() => setShareVisible(true)}
        onRequestReReview={
          post?.blocked && !post.underReview ? () => setReReviewVisible(true) : undefined
        }
      />

      <PostComposerModal
        visible={composerVisible}
        title="Edit post"
        submitting={posting}
        initial={
          post
            ? {
                content: post.content,
                tags: post.tags,
                achievementIds: post.achievementIds ?? [],
              }
            : undefined
        }
        onClose={() => setComposerVisible(false)}
        onSubmit={handleUpdatePost}
      />

      <PostEditHistoryModal
        visible={historyVisible}
        authorName={post?.authorName ?? ""}
        history={post?.editHistory ?? []}
        onClose={() => setHistoryVisible(false)}
      />

      <ReportReasonModal
        visible={reportVisible}
        title="Report Post"
        onClose={() => setReportVisible(false)}
        onSubmit={async (reason) => {
          if (!post) return;
          await submitReport({
            targetType: "post",
            targetId: post.id,
            postId: post.id,
            reason,
            targetContent: post.content,
            targetAuthorId: post.authorId,
            targetAuthorName: post.authorName,
          });
        }}
      />

      <SharePostToChatModal
        visible={shareVisible}
        post={post}
        chats={chats}
        currentUserId={currentUserId}
        adminUid={adminUid}
        onClose={() => setShareVisible(false)}
      />

      <ReReviewReasonModal
        visible={reReviewVisible}
        onClose={() => setReReviewVisible(false)}
        onSubmit={async (reason) => {
          if (!post) return;
          await requestBlockedPostReReview(post.id, reason);
          setPost((prev) => (prev ? { ...prev, underReview: true } : prev));
        }}
      />
    </View>
  );
}
