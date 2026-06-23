import { Pressable } from "@/components/Pressable";
import { AddFriendModal } from "@/components/community/AddFriendModal";
import { CommentMenuModal } from "@/components/community/CommentMenuModal";
import { CommunitySearchBar } from "@/components/community/CommunitySearchBar";
import { FriendsSection } from "@/components/community/FriendsSection";
import { PostCommentsPreview } from "@/components/community/PostCommentsPreview";
import { PostComposerModal } from "@/components/community/PostComposerModal";
import { PostEditHistoryModal } from "@/components/community/PostEditHistoryModal";
import { PostLikesModal } from "@/components/community/PostLikesModal";
import { PostMenuModal } from "@/components/community/PostMenuModal";
import { UserProfileModal } from "@/components/community/UserProfileModal";
import { formatChatMessageTime, formatPostDisplayTime } from "@/lib/chatMessageUtils";
import {
  REPORT_REASONS,
  SUPPORT_CHAT_WELCOME_MESSAGE,
  type ChatConversation,
  type CommunityComment,
  type CommunityPost,
  type FriendRelation,
  type PublicUserProfile,
  type ReportTargetType,
} from "@/lib/communityTypes";
import { useAdminRedirect } from "@/lib/useAdminRedirect";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";
import {
  addComment,
  buildChatListWithSupportAdmin,
  chatDisplayName,
  chatIdForUsers,
  chatPreviewForUser,
  createPost,
  deleteComment,
  deletePost,
  displayCommunityUserName,
  ensureChatsForFriends,
  ensureDirectChat,
  ensureSupportChatWithAdmin,
  filterPostsByKeyword,
  filterPostsByTag,
  getCurrentUserProfile,
  getPostsByAuthor,
  getPublicUserProfile,
  getUserProfile,
  isSupportAdminPlaceholder,
  loadFriendRelations,
  loadLikerProfiles,
  markAllNotificationsRead,
  resolveAdminUid,
  sendFriendRequest,
  submitReport,
  subscribeChats,
  subscribeComments,
  subscribeNotifications,
  subscribePosts,
  SUPPORT_ADMIN_NAME,
  threadedComments,
  togglePostLike,
  updatePost,
  type LikerProfile,
} from "../lib/communityService";

function ProfileAvatar({
  uri,
  size = 48,
}: {
  uri: string | null;
  size?: number;
}) {
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

function friendLabel(relation: FriendRelation): string {
  if (relation === "friends") return "Friends";
  if (relation === "pending_outgoing") return "Pending";
  if (relation === "pending_incoming") return "Respond in notifications";
  return "Add friend";
}

type ReportModalProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
};

function ReportModal({ visible, title, onClose, onSubmit }: ReportModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedReason, setSelectedReason] = useState<string>(REPORT_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSelectedReason(REPORT_REASONS[0]);
    setCustomReason("");
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const reason =
      selectedReason === "Other" ? customReason.trim() : selectedReason;
    if (!reason) {
      Alert.alert("Report", "Please provide a reason.");
      return;
    }
    try {
      setSubmitting(true);
      await onSubmit(reason);
      Alert.alert("Report submitted", "Thank you. The Support Admin will review this as soon as possible.");
      handleClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View className="flex-1 bg-black/40 justify-end">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View
            className="bg-white rounded-t-[28px] px-5 pt-5 border border-gray-200"
            style={{ paddingBottom: insets.bottom + 20 }}
          >
            <Text className="text-xl font-extrabold text-gray-900 mb-1">{title}</Text>
            <Text className="text-sm text-gray-500 mb-4">Choose a reason or type your own.</Text>

            {REPORT_REASONS.map((reason) => (
              <Pressable
                key={reason}
                onPress={() => setSelectedReason(reason)}
                className={`flex-row items-center rounded-2xl px-4 py-3 mb-2 border ${
                  selectedReason === reason
                    ? "bg-[#eaf7f0] border-[#52B69A]"
                    : "bg-[#f9fafb] border-gray-200"
                }`}
              >
                <Ionicons
                  name={selectedReason === reason ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={selectedReason === reason ? "#52B69A" : "#9ca3af"}
                />
                <Text className="ml-3 text-sm font-bold text-gray-800">{reason}</Text>
              </Pressable>
            ))}

            {selectedReason === "Other" ? (
              <TextInput
                value={customReason}
                onChangeText={setCustomReason}
                placeholder="Describe the issue..."
                multiline
                className="bg-[#f9fafb] rounded-2xl px-4 py-3 border border-gray-200 text-sm text-gray-800 min-h-[90px]"
                placeholderTextColor="#9ca3af"
              />
            ) : null}

            <View className="flex-row gap-3 mt-4">
              <Pressable
                onPress={handleClose}
                className="flex-1 rounded-full py-3.5 items-center bg-[#f3f4f3] border border-gray-200"
              >
                <Text className="text-sm font-extrabold text-gray-600">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSubmit()}
                disabled={submitting}
                className="flex-1 rounded-full py-3.5 items-center bg-[#52B69A]"
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-sm font-extrabold text-white">Submit</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

type CommentsModalProps = {
  visible: boolean;
  post: CommunityPost | null;
  currentUserId: string | null;
  adminUid: string | null;
  onClose: () => void;
  onReportComment: (comment: CommunityComment) => void;
  onOpenProfile: (userId: string) => void;
};

function CommentsModal({
  visible,
  post,
  currentUserId,
  adminUid,
  onClose,
  onReportComment,
  onOpenProfile,
}: CommentsModalProps) {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuComment, setMenuComment] = useState<CommunityComment | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const displayComments = useMemo(() => threadedComments(comments), [comments]);

  useEffect(() => {
    if (!visible || !post) return;
    const unsub = subscribeComments(post.id, setComments);
    return unsub;
  }, [visible, post]);

  useEffect(() => {
    if (!visible) {
      setReplyingTo(null);
      setMenuComment(null);
      setText("");
    }
  }, [visible]);

  const handleSend = async () => {
    if (!post || !text.trim()) return;
    try {
      setSending(true);
      await addComment(post.id, text, {
        parentCommentId: replyingTo?.id,
        replyToAuthorName: replyingTo?.authorName,
      });
      setText("");
      setReplyingTo(null);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not add comment.");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = (comment: CommunityComment) => {
    if (!post) return;
    Alert.alert("Delete comment", "Delete your comment?", [
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
                setText("");
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

  const startReply = (comment: CommunityComment) => {
    setReplyingTo(comment);
    setMenuComment(null);
  };

  const menuCommentBusy = menuComment != null && deletingCommentId === menuComment.id;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-black/40 justify-end"
      >
        <Pressable className="flex-1" onPress={onClose} />
        <View
          className="bg-[#f3f4f3] rounded-t-[28px] border-t border-gray-200 overflow-hidden flex-col"
          style={{ height: "50%" }}
        >
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
            <Text className="text-xl font-extrabold text-gray-900">Comments</Text>
            <Pressable
              onPress={onClose}
              className="w-10 h-10 rounded-full bg-white items-center justify-center border border-gray-200"
            >
              <Ionicons name="close" size={22} color="#6b7280" />
            </Pressable>
          </View>

          <ScrollView
            className="flex-1 px-4"
            contentContainerStyle={{ paddingVertical: 12 }}
            keyboardShouldPersistTaps="handled"
          >
          {displayComments.length === 0 ? (
            <Text className="text-sm text-gray-500 text-center py-8">No comments yet.</Text>
          ) : null}

          {displayComments.map((comment) => {
            const isReply = Boolean(comment.parentCommentId);
            const isReplyingToThis = replyingTo?.id === comment.id;

            return (
            <View
              key={comment.id}
              className={`bg-white rounded-2xl p-4 border mb-2 ${
                isReply ? "ml-6 border-l-4 border-l-[#52B69A]" : ""
              } ${
                isReplyingToThis
                  ? "border-[#52B69A] border-2"
                  : "border-gray-200"
              }`}
            >
              <View className="flex-row items-center">
                <Pressable onPress={() => onOpenProfile(comment.authorId)}>
                  <ProfileAvatar uri={comment.authorProfileImage} size={36} />
                </Pressable>
                <View className="flex-1 ml-3">
                  <View className="flex-row items-start justify-between gap-2">
                    <Pressable onPress={() => onOpenProfile(comment.authorId)} className="flex-1">
                      <Text className="text-sm font-extrabold text-gray-900">
                        {comment.authorName}
                      </Text>
                    </Pressable>
                    <Text className="text-[10px] text-gray-400">
                      {formatChatMessageTime(comment.createdAt)}
                    </Text>
                  </View>
                </View>
                {currentUserId &&
                (comment.authorId === currentUserId ||
                  (comment.authorId !== currentUserId && comment.authorId !== adminUid)) ? (
                  <Pressable
                    onPress={() => setMenuComment(comment)}
                    className="w-8 h-8 rounded-full items-center justify-center"
                  >
                    <Ionicons name="ellipsis-vertical" size={18} color="#6b7280" />
                  </Pressable>
                ) : null}
              </View>
              {comment.replyToAuthorName ? (
                <Text className="text-xs font-bold text-[#52B69A] mt-2">
                  Replying to {comment.replyToAuthorName}
                </Text>
              ) : null}
              <Pressable onPress={() => startReply(comment)}>
                <Text className="text-sm text-gray-700 mt-2 leading-6">{comment.text}</Text>
                <Text className="text-xs font-bold text-[#2563eb] mt-2">Reply</Text>
              </Pressable>
            </View>
            );
          })}
        </ScrollView>

        <CommentMenuModal
          visible={menuComment !== null}
          comment={menuComment}
          canDelete={menuComment != null && menuComment.authorId === currentUserId}
          canReport={
            menuComment != null &&
            menuComment.authorId !== currentUserId &&
            menuComment.authorId !== adminUid
          }
          deleting={menuCommentBusy}
          onClose={() => setMenuComment(null)}
          onDelete={() => {
            if (menuComment) handleDeleteComment(menuComment);
          }}
          onReport={() => {
            if (menuComment) {
              const target = menuComment;
              setMenuComment(null);
              onReportComment(target);
            }
          }}
        />

        <View
          className="px-4 border-t border-gray-200 bg-white"
          style={{ paddingBottom: insets.bottom + 8, paddingTop: 12 }}
        >
          {replyingTo ? (
            <View className="flex-row items-center justify-between bg-[#eaf7f0] rounded-xl px-3 py-2 mb-2 border border-[#b7e4c7]">
              <Text className="text-xs font-extrabold text-[#52B69A]">
                Replying to {replyingTo.authorName}
              </Text>
              <Pressable
                onPress={() => {
                  setReplyingTo(null);
                }}
              >
                <Text className="text-xs font-bold text-gray-500">Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          <View className="flex-row items-end gap-2">
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={
                replyingTo ? `Reply to ${replyingTo.authorName}...` : "Write a comment..."
              }
              multiline
              className="flex-1 bg-[#f3f4f3] rounded-2xl px-4 py-3 border border-gray-200 text-sm text-gray-800 max-h-28"
              placeholderTextColor="#9ca3af"
            />
            <Pressable
              onPress={() => void handleSend()}
              disabled={sending || !text.trim()}
              className={`w-11 h-11 rounded-full items-center justify-center ${
                text.trim() ? "bg-[#52B69A]" : "bg-gray-200"
              }`}
            >
              {sending ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="white" />
              )}
            </Pressable>
          </View>
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function CommunityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openPostId?: string; openComments?: string }>();
  const insets = useSafeAreaInsets();
  useAdminRedirect();

  const [activeTab, setActiveTab] = useState<"feed" | "friends" | "chat">("feed");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myProfileImage, setMyProfileImage] = useState<string | null>(null);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [adminProfileImage, setAdminProfileImage] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [friendRelations, setFriendRelations] = useState<Record<string, FriendRelation>>({});
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const [composerVisible, setComposerVisible] = useState(false);
  const [addFriendVisible, setAddFriendVisible] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [posting, setPosting] = useState(false);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [tagFilterView, setTagFilterView] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<PublicUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [historyPost, setHistoryPost] = useState<CommunityPost | null>(null);

  const [commentsPost, setCommentsPost] = useState<CommunityPost | null>(null);
  const [menuPost, setMenuPost] = useState<CommunityPost | null>(null);
  const [likesPost, setLikesPost] = useState<CommunityPost | null>(null);
  const [likers, setLikers] = useState<LikerProfile[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: ReportTargetType;
    postId: string;
    targetId: string;
    targetContent: string;
    targetAuthorId: string;
    targetAuthorName: string;
    title: string;
  } | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const handleFirestoreError = useCallback((error: Error) => {
    const code = (error as { code?: string }).code ?? "";
    if (code === "permission-denied") {
      setFirestoreError(
        "Community data is blocked by Firestore rules. Publish firestore.rules in Firebase Console, then reload the app."
      );
      return;
    }
    if (code === "failed-precondition" || error.message.includes("index")) {
      setFirestoreError(
        "Firestore index is still building. Reload the app in a minute, or tap the index link in the Metro console."
      );
      return;
    }
    setFirestoreError(error.message || "Could not load community data.");
  }, []);

  const displayChats = useMemo(
    () =>
      currentUserId
        ? buildChatListWithSupportAdmin(chats, currentUserId, adminUid, adminProfileImage)
        : chats,
    [chats, currentUserId, adminUid, adminProfileImage]
  );

  const filteredPosts = useMemo(() => {
    let list = filterPostsByTag(posts, tagFilterView ? activeTagFilter : null);
    list = filterPostsByKeyword(list, searchQuery);
    return list;
  }, [posts, activeTagFilter, tagFilterView, searchQuery]);

  const profilePosts = useMemo(
    () => (profileUserId ? getPostsByAuthor(posts, profileUserId) : []),
    [posts, profileUserId]
  );

  const totalUnreadChats = useMemo(
    () =>
      chats.reduce((sum, chat) => {
        if (!currentUserId) return sum;
        return sum + (chat.unreadCount[currentUserId] ?? 0);
      }, 0),
    [chats, currentUserId]
  );

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUserId(user?.uid ?? null);
      if (user) {
        try {
          const uid = await resolveAdminUid();
          setAdminUid(uid);
          if (uid) {
            try {
              const adminProfile = await getUserProfile(uid);
              setAdminProfileImage(adminProfile.profileImage);
            } catch {
              setAdminProfileImage(null);
            }
          } else {
            setAdminProfileImage(null);
          }
          await ensureSupportChatWithAdmin().catch(() => null);
        } catch {
          setAdminUid(null);
          setAdminProfileImage(null);
        }
        try {
          const { profile } = await getCurrentUserProfile();
          setMyProfileImage(profile.profileImage);
        } catch {
          setMyProfileImage(null);
        }
      } else {
        setMyProfileImage(null);
        setAdminUid(null);
        setAdminProfileImage(null);
      }
      setLoadingAuth(false);
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    setFirestoreError(null);
    const unsub = subscribePosts(setPosts, handleFirestoreError);
    return unsub;
  }, [currentUserId, handleFirestoreError]);

  useEffect(() => {
    const openPostId = params.openPostId ? String(params.openPostId) : "";
    if (!openPostId || posts.length === 0) return;

    const post = posts.find((item) => item.id === openPostId);
    if (!post) return;

    setActiveTab("feed");
    if (params.openComments === "1") {
      setCommentsPost(post);
    }
    router.setParams({ openPostId: undefined, openComments: undefined });
  }, [params.openPostId, params.openComments, posts, router]);

  useEffect(() => {
    if (!currentUserId) return;
    const authorIds = posts.map((p) => p.authorId);
    void loadFriendRelations(authorIds).then(setFriendRelations).catch(() => {});
  }, [posts, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    const unsub = subscribeChats(setChats, handleFirestoreError);
    return unsub;
  }, [currentUserId, handleFirestoreError]);

  useEffect(() => {
    if (!currentUserId) return;
    const unsub = subscribeNotifications(
      (items) => {
        setUnreadNotifications(items.filter((n) => !n.read).length);
      },
      handleFirestoreError
    );
    return unsub;
  }, [currentUserId, handleFirestoreError]);

  useEffect(() => {
    if (!currentUserId || !adminUid) return;
    void ensureSupportChatWithAdmin().catch(() => {});
  }, [currentUserId, adminUid]);

  useEffect(() => {
    if (!currentUserId || (activeTab !== "chat" && activeTab !== "friends")) return;
    void ensureChatsForFriends().catch(() => {});
  }, [currentUserId, activeTab]);

  const openChat = (chat: ChatConversation) => {
    if (!currentUserId) return;

    const otherUid = chat.participants.find((p) => p !== currentUserId) ?? "";
    const name = chatDisplayName(chat, currentUserId, adminUid);
    const image = chat.participantImages[otherUid] ?? null;
    const isSupport = adminUid != null && otherUid === adminUid;

    let chatId = chat.id;
    if (isSupport && adminUid) {
      chatId = chatIdForUsers(currentUserId, adminUid);
      void ensureSupportChatWithAdmin().catch(() => {});
    } else if (isSupportAdminPlaceholder(chatId) && adminUid) {
      chatId = chatIdForUsers(currentUserId, adminUid);
      void ensureSupportChatWithAdmin().catch(() => {});
    }

    router.push({
      pathname: "/community-chat" as any,
      params: {
        chatId,
        name,
        image: image ?? "",
        isSupport: isSupport ? "1" : "0",
        otherUserId: otherUid,
      },
    });
  };

  const handleCreateOrUpdatePost = async (values: {
    content: string;
    tags: string[];
  }) => {
    try {
      setPosting(true);
      if (editingPost) {
        await updatePost(editingPost, {
          content: values.content,
          imageUrl: editingPost.imageUrl,
          tags: values.tags,
        });
        setEditingPost(null);
      } else {
        await createPost({
          content: values.content,
          tags: values.tags,
        });
      }
      setComposerVisible(false);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save post.");
    } finally {
      setPosting(false);
    }
  };

  const handleDeletePost = (post: CommunityPost) => {
    Alert.alert("Delete post", "Are you sure you want to delete this post? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deletePost(post.id);
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not delete post.");
            }
          })();
        },
      },
    ]);
  };

  const openUserProfile = async (userId: string) => {
    setProfileUserId(userId);
    setProfileLoading(true);
    setProfileData(null);
    try {
      const profile = await getPublicUserProfile(userId);
      setProfileData(profile);
      if (userId !== currentUserId) {
        const relation = await loadFriendRelations([userId]);
        setFriendRelations((prev) => ({ ...prev, ...relation }));
      }
    } catch {
      Alert.alert("Error", "Could not load profile.");
      setProfileUserId(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const openTagFromPost = (tag: string) => {
    setActiveTagFilter(tag);
    setTagFilterView(true);
    setSearchQuery("");
  };

  const exitTagView = () => {
    setTagFilterView(false);
    setActiveTagFilter(null);
  };

  const openLikesModal = async (post: CommunityPost) => {
    if (post.likeCount === 0) return;
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

  const handleOpenSupportChat = () => {
    if (!currentUserId || !adminUid) {
      Alert.alert("Chat unavailable", "Support chat is not available right now. Please try again later.");
      return;
    }
    setProfileUserId(null);
    setProfileData(null);
    const chatId = chatIdForUsers(currentUserId, adminUid);
    void ensureSupportChatWithAdmin().catch(() => {});
    router.push({
      pathname: "/community-chat" as any,
      params: {
        chatId,
        name: SUPPORT_ADMIN_NAME,
        image: adminProfileImage ?? "",
        isSupport: "1",
        otherUserId: adminUid,
      },
    });
  };

  const handleChatFromProfile = async () => {
    if (!profileUserId || profileUserId === currentUserId) return;
    const relation = friendRelations[profileUserId] ?? "none";
    if (relation !== "friends") {
      Alert.alert("Add friend first", "You can chat after becoming friends.");
      return;
    }
    try {
      const chatId = await ensureDirectChat(profileUserId);
      const name = profileData?.name ?? "Friend";
      const image = profileData?.profileImage ?? "";
      setProfileUserId(null);
      setProfileData(null);
      router.push({
        pathname: "/community-chat" as any,
        params: {
          chatId,
          name,
          image,
          isSupport: "0",
          otherUserId: profileUserId,
        },
      });
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not open chat.");
    }
  };

  const openFriendChat = async (friend: { id: string; name: string; profileImage: string | null }) => {
    try {
      const chatId = await ensureDirectChat(friend.id);
      router.push({
        pathname: "/community-chat" as any,
        params: {
          chatId,
          name: friend.name,
          image: friend.profileImage ?? "",
          isSupport: "0",
          otherUserId: friend.id,
        },
      });
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not open chat.");
    }
  };

  const handleLike = useCallback(async (post: CommunityPost) => {
    try {
      await togglePostLike(post);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not update like.");
    }
  }, []);

  const handleFriendRequest = async (authorId: string) => {
    if (authorId === adminUid) return;
    try {
      await sendFriendRequest(authorId);
      setFriendRelations((prev) => ({ ...prev, [authorId]: "pending_outgoing" }));
      Alert.alert("Friend request sent", "They will be notified.");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not send request.");
    }
  };

  const openReportPost = (post: CommunityPost) => {
    setMenuPost(null);
    setReportTarget({
      type: "post",
      postId: post.id,
      targetId: post.id,
      targetContent: post.content,
      targetAuthorId: post.authorId,
      targetAuthorName: post.authorName,
      title: "Report Post",
    });
  };

  const openReportComment = (comment: CommunityComment) => {
    setCommentsPost(null);
    setReportTarget({
      type: "comment",
      postId: comment.postId,
      targetId: comment.id,
      targetContent: comment.text,
      targetAuthorId: comment.authorId,
      targetAuthorName: comment.authorName,
      title: "Report comment",
    });
  };

  if (loadingAuth) {
    return (
      <View className="flex-1 bg-[#f3f4f3] items-center justify-center">
        <ActivityIndicator size="large" color="#52B69A" />
      </View>
    );
  }

  if (!currentUserId) {
    return (
      <View className="flex-1 bg-[#f3f4f3] items-center justify-center px-8">
        <Text className="text-lg font-extrabold text-gray-900 text-center">Sign in required</Text>
        <Text className="text-sm text-gray-500 text-center mt-2">
          Please log in to use the community features.
        </Text>
        <Pressable
          onPress={() => router.replace("/login")}
          className="mt-6 rounded-full bg-[#52B69A] px-8 py-3"
        >
          <Text className="text-sm font-extrabold text-white">Go to Login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f3f4f3]">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
          paddingTop: insets.top + 12,
        }}
      >
        <View className="flex-row items-center mb-5 px-4">
          <Pressable
            onPress={() => router.back()}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <Text className="text-2xl font-extrabold text-gray-900 flex-1">Community</Text>
          <Pressable
            onPress={() => {
              void markAllNotificationsRead().catch(() => {});
              router.push("/community-notifications" as any);
            }}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 relative"
          >
            <Ionicons name="notifications-outline" size={22} color="#111827" />
            {unreadNotifications > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 4,
                  borderRadius: 9,
                  backgroundColor: "#ef4444",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text className="text-[10px] font-extrabold text-white">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {firestoreError ? (
          <View className="mx-4 mb-4 rounded-2xl bg-[#fef2f2] border border-[#fecaca] px-4 py-3">
            <Text className="text-sm font-bold text-[#b91c1c]">{firestoreError}</Text>
          </View>
        ) : null}

        <View className="flex-row mb-4 px-4 gap-2">
            <Pressable
              onPress={() => setActiveTab("feed")}
              className={`flex-1 rounded-full py-3.5 items-center justify-center ${
                activeTab === "feed"
                  ? "bg-[#52B69A] border-2 border-[#52B69A]"
                  : "bg-white border-2 border-gray-200"
              }`}
            >
              <Text
                className={`font-extrabold ${
                  activeTab === "feed" ? "text-base text-white" : "text-sm text-gray-600"
                }`}
              >
                Community
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab("friends")}
              className={`flex-1 rounded-full py-3.5 items-center justify-center ${
                activeTab === "friends"
                  ? "bg-[#52B69A] border-2 border-[#52B69A]"
                  : "bg-white border-2 border-gray-200"
              }`}
            >
              <Text
                className={`font-extrabold ${
                  activeTab === "friends" ? "text-base text-white" : "text-sm text-gray-600"
                }`}
              >
                Friends
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab("chat")}
              className={`flex-1 rounded-full py-3.5 items-center justify-center flex-row ${
                activeTab === "chat"
                  ? "bg-[#52B69A] border-2 border-[#52B69A]"
                  : "bg-white border-2 border-gray-200"
              }`}
            >
              <Text
                className={`font-extrabold ${
                  activeTab === "chat" ? "text-base text-white" : "text-sm text-gray-600"
                }`}
              >
                Chat
              </Text>
              {totalUnreadChats > 0 ? (
                <View
                  className={`ml-1.5 min-w-[20px] h-5 px-1 rounded-full items-center justify-center ${
                    activeTab === "chat" ? "bg-white" : "bg-[#ef4444]"
                  }`}
                >
                  <Text
                    className={`text-[10px] font-extrabold ${
                      activeTab === "chat" ? "text-[#52B69A]" : "text-white"
                    }`}
                  >
                    {totalUnreadChats > 9 ? "9+" : totalUnreadChats}
                  </Text>
                </View>
              ) : null}
            </Pressable>
        </View>

        {activeTab === "feed" ? (
            <>
              {tagFilterView && activeTagFilter ? (
                <View className="flex-row items-center mb-4 px-4">
                  <Pressable
                    onPress={exitTagView}
                    className="w-10 h-10 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
                  >
                    <Ionicons name="chevron-back" size={22} color="#111827" />
                  </Pressable>
                  <Text className="text-lg font-extrabold text-gray-900">#{activeTagFilter}</Text>
                </View>
              ) : (
                <CommunitySearchBar
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search posts, tags, or people..."
                />
              )}

              <View className="gap-3 px-4 pb-4">
                {filteredPosts.length === 0 ? (
                  <View className="bg-white px-4 py-8 rounded-2xl border border-gray-200 items-center">
                    <Text className="text-sm text-gray-500">
                      {tagFilterView && activeTagFilter
                        ? `No posts with #${activeTagFilter}`
                        : searchQuery
                          ? "No posts match your search."
                          : "No posts yet. Be the first to share!"}
                    </Text>
                  </View>
                ) : null}
                {filteredPosts.map((post) => {
                  const liked = currentUserId ? post.likedBy.includes(currentUserId) : false;
                  const relation = friendRelations[post.authorId] ?? "none";
                  const isOwnPost = post.authorId === currentUserId;

                  return (
                    <View
                      key={post.id}
                      className="bg-white px-4 py-4 rounded-2xl border border-gray-200"
                    >
                      <View className="flex-row items-center">
                        <Pressable onPress={() => void openUserProfile(post.authorId)}>
                          <ProfileAvatar uri={post.authorProfileImage} />
                        </Pressable>
                        <Pressable
                          onPress={() => void openUserProfile(post.authorId)}
                          className="flex-1 ml-3"
                        >
                          <Text className="text-base font-extrabold text-gray-900">
                            {displayCommunityUserName(post.authorId, post.authorName, adminUid)}
                            {isOwnPost ? (
                              <Text className="text-sm font-bold text-[#52B69A]"> · me</Text>
                            ) : null}
                          </Text>
                          <Text className="text-[10px] text-gray-400 mt-0.5">
                            {formatPostDisplayTime(post.createdAt)}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setMenuPost(post)}
                          className="w-9 h-9 rounded-full items-center justify-center"
                        >
                          <Ionicons name="ellipsis-vertical" size={20} color="#6b7280" />
                        </Pressable>
                      </View>

                      {post.content ? (
                        <Text className="text-base text-gray-800 mt-3 leading-7">{post.content}</Text>
                      ) : null}

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
                            <Pressable
                              key={tag}
                              onPress={() => openTagFromPost(tag)}
                              className="rounded-full px-2.5 py-1 bg-white border border-[#52B69A]"
                            >
                              <Text className="text-[10px] font-bold text-[#52B69A]">#{tag}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}

                      <View className="flex-row items-center mt-4 flex-wrap gap-y-2">
                        <View className="flex-row items-center mr-4">
                          <Pressable onPress={() => void handleLike(post)} className="flex-row items-center">
                            <Ionicons
                              name={liked ? "heart" : "heart-outline"}
                              size={20}
                              color={liked ? "#ef4444" : "#52B69A"}
                            />
                          </Pressable>
                          <Pressable onPress={() => void openLikesModal(post)}>
                            <Text className="text-xs text-[#52B69A] font-bold ml-1.5">
                              {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
                            </Text>
                          </Pressable>
                        </View>

                        <Pressable
                          onPress={() => setCommentsPost(post)}
                          className="flex-row items-center mr-4"
                        >
                          <Ionicons name="chatbubble-outline" size={18} color="#52B69A" />
                          <Text className="text-xs text-[#52B69A] font-bold ml-1.5">
                            {post.commentCount}{" "}
                            {post.commentCount === 1 ? "comment" : "comments"}
                          </Text>
                        </Pressable>

                        {!isOwnPost && post.authorId !== adminUid ? (
                          <Pressable
                            onPress={() => {
                              if (relation === "none") void handleFriendRequest(post.authorId);
                            }}
                            disabled={relation !== "none"}
                            className="flex-row items-center"
                          >
                            <Ionicons
                              name={
                                relation === "friends"
                                  ? "people"
                                  : relation === "pending_outgoing"
                                    ? "time-outline"
                                    : "person-add-outline"
                              }
                              size={18}
                              color="#52B69A"
                            />
                            <Text className="text-xs text-[#52B69A] font-bold ml-1.5">
                              {friendLabel(relation)}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>

                      <PostCommentsPreview
                        postId={post.id}
                        commentCount={post.commentCount}
                        onSeeMore={() => setCommentsPost(post)}
                      />
                    </View>
                  );
                })}
              </View>
            </>
          ) : activeTab === "friends" ? (
            <View className="px-4">
              <FriendsSection
                onOpenProfile={(userId) => void openUserProfile(userId)}
                onOpenChat={(friend) => openFriendChat(friend)}
              />
            </View>
          ) : (
            <View className="gap-0">
              {displayChats.length === 0 ? (
                <View className="bg-white px-4 py-8 border-y border-gray-200 items-center">
                  <Text className="text-sm text-gray-500 text-center">
                    Add friends from the feed to start chatting.
                  </Text>
                </View>
              ) : null}
              {displayChats.map((chat) => {
                const otherUid = chat.participants.find((p) => p !== currentUserId) ?? "";
                const name = chatDisplayName(chat, currentUserId ?? "", adminUid);
                const image = chat.participantImages[otherUid] ?? null;
                const unread = currentUserId ? (chat.unreadCount[currentUserId] ?? 0) : 0;
                const isSupport = adminUid != null && otherUid === adminUid;

                return (
                  <View
                    key={chat.id}
                    className="flex-row items-center bg-white px-4 py-4 border-b border-gray-200"
                  >
                    <Pressable onPress={() => void openUserProfile(otherUid)}>
                      <ProfileAvatar uri={image} />
                    </Pressable>
                    <Pressable
                      onPress={() => openChat(chat)}
                      className="flex-1 ml-3 flex-row items-center"
                    >
                      <View className="flex-1">
                        <View className="flex-row items-center">
                          <Text className="text-base font-extrabold text-gray-900">{name}</Text>
                          {isSupport ? (
                            <View className="ml-2 w-6 h-6 rounded-full bg-[#dbeafe] items-center justify-center">
                              <Ionicons name="shield-checkmark" size={14} color="#2563eb" />
                            </View>
                          ) : null}
                          {unread > 0 ? (
                            <View className="ml-2 min-w-[20px] h-5 px-1 rounded-full bg-[#ef4444] items-center justify-center">
                              <Text className="text-[10px] font-extrabold text-white">{unread}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-sm text-gray-500 mt-1" numberOfLines={1}>
                          {chatPreviewForUser(chat, currentUserId ?? "") ||
                            (isSupport ? SUPPORT_CHAT_WELCOME_MESSAGE : "Start your conversation")}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#76C893" />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
      </ScrollView>

      {activeTab === "feed" ? (
        <Pressable
          onPress={() => {
            setEditingPost(null);
            setComposerVisible(true);
          }}
          className="absolute right-5 flex-row items-center rounded-full bg-[#52B69A] px-6 py-4 shadow-lg"
          style={{ bottom: insets.bottom + 44 }}
        >
          <Ionicons name="add" size={28} color="white" />
          <Text className="text-base font-extrabold text-white ml-1.5">New post</Text>
        </Pressable>
      ) : null}

      {activeTab === "friends" ? (
        <Pressable
          onPress={() => setAddFriendVisible(true)}
          className="absolute right-5 flex-row items-center rounded-full bg-[#52B69A] px-6 py-4 shadow-lg"
          style={{ bottom: insets.bottom + 44 }}
        >
          <Ionicons name="person-add" size={24} color="white" />
          <Text className="text-base font-extrabold text-white ml-1.5">Add friend</Text>
        </Pressable>
      ) : null}

      <AddFriendModal
        visible={addFriendVisible}
        onClose={() => setAddFriendVisible(false)}
        onOpenProfile={(userId) => {
          setAddFriendVisible(false);
          void openUserProfile(userId);
        }}
      />

      <PostComposerModal
        visible={composerVisible}
        title={editingPost ? "Edit post" : "New post"}
        submitting={posting}
        initial={
          editingPost
            ? {
                content: editingPost.content,
                tags: editingPost.tags,
              }
            : undefined
        }
        onClose={() => {
          setComposerVisible(false);
          setEditingPost(null);
        }}
        onSubmit={handleCreateOrUpdatePost}
      />

      <UserProfileModal
        visible={profileUserId !== null}
        profile={profileData}
        posts={profilePosts}
        relation={
          profileUserId && profileUserId !== currentUserId
            ? friendRelations[profileUserId] ?? "none"
            : "none"
        }
        loading={profileLoading}
        isSelf={profileUserId === currentUserId}
        isSupportAdmin={profileUserId === adminUid}
        canAddFriend={profileUserId !== adminUid && profileUserId !== currentUserId}
        onClose={() => {
          setProfileUserId(null);
          setProfileData(null);
        }}
        onAddFriend={() => {
          if (profileUserId) void handleFriendRequest(profileUserId);
        }}
        onChat={
          profileUserId === adminUid
            ? () => void handleOpenSupportChat()
            : profileUserId &&
                profileUserId !== currentUserId &&
                friendRelations[profileUserId] === "friends"
              ? () => void handleChatFromProfile()
              : undefined
        }
      />

      <PostMenuModal
        visible={menuPost !== null}
        post={menuPost}
        isOwnPost={menuPost?.authorId === currentUserId}
        canReport={menuPost != null && menuPost.authorId !== adminUid}
        onClose={() => setMenuPost(null)}
        onEdit={() => {
          if (!menuPost) return;
          setEditingPost(menuPost);
          setComposerVisible(true);
        }}
        onDelete={() => {
          if (menuPost) handleDeletePost(menuPost);
        }}
        onEditHistory={() => {
          if (menuPost) setHistoryPost(menuPost);
        }}
        onReport={() => {
          if (menuPost) openReportPost(menuPost);
        }}
      />

      <PostLikesModal
        visible={likesPost !== null}
        likers={likers}
        loading={likersLoading}
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

      <PostEditHistoryModal
        visible={historyPost !== null}
        authorName={historyPost?.authorName ?? ""}
        history={historyPost?.editHistory ?? []}
        onClose={() => setHistoryPost(null)}
      />

      <CommentsModal
        visible={commentsPost !== null}
        post={commentsPost}
        currentUserId={currentUserId}
        adminUid={adminUid}
        onClose={() => setCommentsPost(null)}
        onReportComment={openReportComment}
        onOpenProfile={(userId) => void openUserProfile(userId)}
      />

      <ReportModal
        visible={reportTarget !== null}
        title={reportTarget?.title ?? "Report"}
        onClose={() => setReportTarget(null)}
        onSubmit={async (reason) => {
          if (!reportTarget) return;
          await submitReport({
            targetType: reportTarget.type,
            targetId: reportTarget.targetId,
            postId: reportTarget.postId,
            reason,
            targetContent: reportTarget.targetContent,
            targetAuthorId: reportTarget.targetAuthorId,
            targetAuthorName: reportTarget.targetAuthorName,
          });
        }}
      />
    </View>
  );
}
