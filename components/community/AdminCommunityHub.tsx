import { Pressable } from "@/components/Pressable";
import { BlockReasonModal } from "@/components/community/BlockReasonModal";
import { CommunityUnreadBadge } from "@/components/community/CommunityUnreadBadge";
import { PostCommentsSheet } from "@/components/community/PostCommentsSheet";
import { PostComposerModal } from "@/components/community/PostComposerModal";
import { PostEditHistoryModal } from "@/components/community/PostEditHistoryModal";
import { PostMenuModal } from "@/components/community/PostMenuModal";
import { AppearanceModal } from "@/components/profile/AppearanceModal";
import { ThemedBackButton, ProfileScreenHeader, useProfileCardStyles } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { formatPostDisplayTime } from "@/lib/chatMessageUtils";
import {
  adminBlockComment,
  adminBlockPost,
  blockReportedPost,
  chatDisplayName,
  createPost,
  deletePost,
  dismissReport,
  ensureDirectChat,
  fetchPostById,
  filterPostsByTag,
  getCurrentUserProfile,
  inviteUserByEmail,
  subscribeChats,
  subscribePendingReports,
  subscribePosts,
  subscribeRegisteredUsers,
  syncAdminConfig,
  togglePostLike,
  updatePost,
} from "@/lib/communityService";
import {
  ADMIN_BLOCK_POST_REASONS,
  type ChatConversation,
  type CommunityComment,
  type CommunityPost,
  type CommunityReport,
  type RegisteredUser,
} from "@/lib/communityTypes";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../../firebaseConfig";

type AdminTab = "community" | "reports" | "users" | "profile";

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

function AdminBadge({ small }: { small?: boolean }) {
  return (
    <View
      className={`rounded-full bg-[#dbeafe] items-center justify-center ${small ? "w-6 h-6 ml-1.5" : "w-8 h-8"}`}
    >
      <Ionicons name="shield-checkmark" size={small ? 14 : 18} color="#2563eb" />
    </View>
  );
}

function AdminTabHeader({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}) {
  const { textPrimary } = useThemedScreen();
  return (
    <View className="flex-row items-center mb-5">
      <Text className="text-3xl font-extrabold flex-1" style={textPrimary}>
        {title}
      </Text>
      {right}
    </View>
  );
}

export function AdminCommunityHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    mode,
    theme,
    cardStyle,
    surfaceStyle,
    textPrimary,
    textSecondary,
    textMuted,
    iconButtonStyle,
    navStyle,
    segmentActiveStyle,
    segmentTrackStyle,
  } = useThemedScreen();
  const { modalCardStyle, inputStyle, placeholderColor } = useProfileCardStyles();
  const [activeTab, setActiveTab] = useState<AdminTab>("community");
  const [communitySubTab, setCommunitySubTab] = useState<"feed" | "chat">("feed");

  const [myName, setMyName] = useState("Admin");
  const [myEmail, setMyEmail] = useState("");
  const [myProfileImage, setMyProfileImage] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [reportActionId, setReportActionId] = useState<string | null>(null);
  const [commentsPost, setCommentsPost] = useState<CommunityPost | null>(null);
  const [reportDetailReport, setReportDetailReport] = useState<CommunityReport | null>(null);
  const [reportDetailPost, setReportDetailPost] = useState<CommunityPost | null>(null);
  const [reportDetailLoading, setReportDetailLoading] = useState(false);

  const [menuPost, setMenuPost] = useState<CommunityPost | null>(null);
  const [historyPost, setHistoryPost] = useState<CommunityPost | null>(null);
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [composerVisible, setComposerVisible] = useState(false);
  const [blockTarget, setBlockTarget] = useState<{
    type: "post" | "comment" | "report";
    post?: CommunityPost;
    comment?: CommunityComment;
    report?: CommunityReport;
  } | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [tagFilterView, setTagFilterView] = useState(false);

  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);

  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const [selectedUser, setSelectedUser] = useState<RegisteredUser | null>(null);
  const [userDetailVisible, setUserDetailVisible] = useState(false);
  const [userDetailExtra, setUserDetailExtra] = useState<{
    gender?: string;
    weight?: number;
    height?: number;
  } | null>(null);
  const [openingChat, setOpeningChat] = useState(false);

  const [highlightChatId, setHighlightChatId] = useState<string | null>(null);

  const [passwordVisible, setPasswordVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [appearanceVisible, setAppearanceVisible] = useState(false);

  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    setCurrentUserId(user?.uid ?? null);
    if (user?.email) setMyEmail(user.email);
    void syncAdminConfig().catch(() => {});
    void getCurrentUserProfile()
      .then(({ profile }) => {
        setMyName(profile.name);
        setMyProfileImage(profile.profileImage);
      })
      .catch(() => {});
  }, []);

  const handleFirestoreErr = useCallback((error: Error) => {
    const code = (error as { code?: string }).code ?? "";
    if (code === "permission-denied") {
      setFirestoreError(
        "Firestore permission denied. Copy firestore.rules from your project into Firebase Console → Firestore → Rules → Publish."
      );
    } else {
      setFirestoreError(error.message);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribePosts(setPosts, handleFirestoreErr);
    return unsub;
  }, [handleFirestoreErr]);

  useEffect(() => {
    const unsub = subscribeChats(setChats, handleFirestoreErr);
    return unsub;
  }, [handleFirestoreErr]);

  useEffect(() => {
    const unsub = subscribePendingReports(setReports, handleFirestoreErr);
    return unsub;
  }, [handleFirestoreErr]);

  useEffect(() => {
    const unsub = subscribeRegisteredUsers(setUsers, handleFirestoreErr);
    return unsub;
  }, [handleFirestoreErr]);

  const totalUnreadChats = useMemo(
    () =>
      chats.reduce((sum, chat) => {
        if (!currentUserId) return sum;
        return sum + (chat.unreadCount[currentUserId] ?? 0);
      }, 0),
    [chats, currentUserId]
  );

  const displayedPosts = useMemo(
    () => filterPostsByTag(posts, tagFilterView ? activeTagFilter : null),
    [posts, activeTagFilter, tagFilterView]
  );

  const openTagFromPost = (tag: string) => {
    setActiveTagFilter(tag);
    setTagFilterView(true);
  };

  const exitTagView = () => {
    setTagFilterView(false);
    setActiveTagFilter(null);
  };

  const handleCreatePost = async () => {
    try {
      setPosting(true);
      await createPost({ content: postText, tags: [] });
      setPostText("");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not create post.");
    } finally {
      setPosting(false);
    }
  };

  const handleBlock = (report: CommunityReport) => {
    Alert.alert(
      "Block Post",
      "This post will be hidden from all users. The reporter and post author will be notified via Support Admin chat.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => setBlockTarget({ type: "report", report }),
        },
      ]
    );
  };

  const handleLike = async (post: CommunityPost) => {
    try {
      await togglePostLike(post);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not update like.");
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

  const handleSavePost = async (values: { content: string; tags: string[] }) => {
    try {
      setPosting(true);
      if (editingPost) {
        await updatePost(editingPost, values);
      } else {
        await createPost(values);
      }
      setComposerVisible(false);
      setEditingPost(null);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save post.");
    } finally {
      setPosting(false);
    }
  };

  const requestBlockPost = (post: CommunityPost) => {
    setMenuPost(null);
    Alert.alert(
      "Block Post",
      "This post will be removed and the author will be notified via Support Admin chat.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => setBlockTarget({ type: "post", post }),
        },
      ]
    );
  };

  const requestBlockComment = (comment: CommunityComment) => {
    if (!commentsPost) return;
    Alert.alert(
      "Block Comment",
      "This comment will be removed and the author will be notified via Support Admin chat.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () =>
            setBlockTarget({ type: "comment", post: commentsPost, comment }),
        },
      ]
    );
  };

  const handleConfirmBlock = async (reason: string) => {
    if (!blockTarget) return;
    try {
      if (blockTarget.type === "report" && blockTarget.report) {
        setReportActionId(blockTarget.report.id);
        await blockReportedPost(blockTarget.report, reason);
        Alert.alert("Post blocked", "The reporter and author have been notified.");
      } else if (blockTarget.type === "post" && blockTarget.post) {
        await adminBlockPost(blockTarget.post, reason);
        Alert.alert("Post blocked", "The author has been notified.");
      } else if (blockTarget.type === "comment" && blockTarget.post && blockTarget.comment) {
        await adminBlockComment(blockTarget.post.id, blockTarget.comment, reason);
        Alert.alert("Comment blocked", "The author has been notified.");
      }
      setBlockTarget(null);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not block content.");
      throw e;
    } finally {
      setReportActionId(null);
    }
  };

  const openReportPostDetail = async (report: CommunityReport) => {
    setReportDetailReport(report);
    setReportDetailPost(null);
    setReportDetailLoading(true);
    try {
      const fromFeed = posts.find((p) => p.id === report.postId);
      if (fromFeed) {
        setReportDetailPost(fromFeed);
      } else {
        const fetched = await fetchPostById(report.postId);
        setReportDetailPost(fetched);
      }
    } catch {
      Alert.alert("Error", "Could not load post details.");
      setReportDetailReport(null);
    } finally {
      setReportDetailLoading(false);
    }
  };

  const handleInvite = async () => {
    try {
      setInviting(true);
      await inviteUserByEmail(inviteEmail);
      const clean = inviteEmail.trim().toLowerCase();
      const subject = encodeURIComponent("Join our Fitness App");
      const body = encodeURIComponent(
        "You are invited to join our fitness community app. Please register using this email address."
      );
      const mailUrl = `mailto:${clean}?subject=${subject}&body=${body}`;
      const canOpen = await Linking.canOpenURL(mailUrl);
      if (canOpen) await Linking.openURL(mailUrl);
      Alert.alert("Invite sent", `Invitation recorded for ${clean}.`);
      setInviteVisible(false);
      setInviteEmail("");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not send invite.");
    } finally {
      setInviting(false);
    }
  };

  const handleChangePassword = async () => {
    const user = auth.currentUser;
    if (!user?.email) return;
    if (newPassword.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "New passwords do not match.");
      return;
    }
    try {
      setChangingPassword(true);
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      Alert.alert("Success", "Password updated successfully.");
      setPasswordVisible(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        Alert.alert("Wrong password", "Current password is incorrect.");
      } else {
        Alert.alert("Error", e instanceof Error ? e.message : "Could not change password.");
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const openUserDetail = async (user: RegisteredUser) => {
    setSelectedUser(user);
    setUserDetailExtra(null);
    setUserDetailVisible(true);
    try {
      const snap = await getDoc(doc(db, "users", user.id));
      const data = snap.data() as Record<string, unknown> | undefined;
      if (data) {
        setUserDetailExtra({
          gender: data.gender === "male" || data.gender === "female" ? data.gender : undefined,
          weight: typeof data.weight === "number" ? data.weight : undefined,
          height: typeof data.height === "number" ? data.height : undefined,
        });
      }
    } catch {
      // Show basic info only
    }
  };

  const handleChatWithUser = async (user: RegisteredUser) => {
    try {
      setOpeningChat(true);
      const chatId = await ensureDirectChat(user.id);
      setUserDetailVisible(false);
      setSelectedUser(null);
      setActiveTab("community");
      setCommunitySubTab("chat");
      setHighlightChatId(chatId);
      router.push({
        pathname: "/community-chat" as any,
        params: {
          chatId,
          name: user.name,
          image: user.profileImage ?? "",
          isAdmin: "1",
        },
      });
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not open chat.");
    } finally {
      setOpeningChat(false);
    }
  };

  const handleDismiss = useCallback((report: CommunityReport) => {
    Alert.alert(
      "Dismiss report",
      "Dismiss this report? The reporter will be notified via Support Admin chat that no action was taken.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Dismiss",
          onPress: () => {
            void (async () => {
              try {
                setReportActionId(report.id);
                await dismissReport(report);
              } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Could not dismiss report.");
              } finally {
                setReportActionId(null);
              }
            })();
          },
        },
      ]
    );
  }, []);

  const renderCommunityTab = () => (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 12, paddingTop: 12 }}
      showsVerticalScrollIndicator={false}
    >
      <AdminTabHeader title="Community" right={<AdminBadge />} />

      <View className="rounded-[28px] p-5" style={cardStyle}>
        <View className="flex-row mb-4">
          <Pressable
            onPress={() => setCommunitySubTab("feed")}
            className="flex-1 rounded-full py-3 items-center mr-2"
            style={communitySubTab === "feed" ? segmentActiveStyle : segmentTrackStyle}
          >
            <Text
              className="text-sm font-extrabold"
              style={{ color: communitySubTab === "feed" ? theme.accentText : theme.textMuted }}
            >
              Community
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setCommunitySubTab("chat")}
            className="flex-1 rounded-full py-3 items-center ml-2 flex-row justify-center"
            style={communitySubTab === "chat" ? segmentActiveStyle : segmentTrackStyle}
          >
            <Text
              className="text-sm font-extrabold"
              style={{ color: communitySubTab === "chat" ? theme.accentText : theme.textMuted }}
            >
              Chat
            </Text>
            {totalUnreadChats > 0 ? (
              <View className="ml-2 min-w-[20px] h-5 px-1 rounded-full bg-[#ef4444] items-center justify-center">
                <Text className="text-[10px] font-extrabold text-white">
                  {totalUnreadChats > 9 ? "9+" : totalUnreadChats}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {communitySubTab === "feed" ? (
          <>
            <View className="rounded-2xl px-4 py-4" style={surfaceStyle}>
              <View className="flex-row items-center">
                <ProfileAvatar uri={myProfileImage} />
                <View className="flex-1 ml-3">
                  <View className="flex-row items-center">
                    <Text className="text-base font-extrabold" style={textPrimary}>
                      Share Any Announcements
                    </Text>
                    <AdminBadge small />
                  </View>
                  <Text className="text-sm mt-1" style={textMuted}>
                    Post any announcements or updates for the community.
                  </Text>
                </View>
              </View>
              <TextInput
                value={postText}
                onChangeText={setPostText}
                placeholder="What would you like to share today?"
                multiline
                className="mt-4 rounded-2xl px-4 py-4 text-sm min-h-[80px]"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
              />
              <Pressable
                onPress={() => void handleCreatePost()}
                disabled={posting || !postText.trim()}
                className="mt-3 rounded-full py-3 items-center"
                style={{ backgroundColor: postText.trim() ? "#52B69A" : theme.iconMuted }}
              >
                {posting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-sm font-extrabold text-white">Post</Text>
                )}
              </Pressable>
            </View>
            {tagFilterView && activeTagFilter ? (
              <View className="flex-row items-center mb-3 mt-4">
                <ThemedBackButton onPress={exitTagView} className="mr-3" />
                <Text className="text-lg font-extrabold" style={textPrimary}>
                  #{activeTagFilter}
                </Text>
              </View>
            ) : null}
            <View className="mt-4 gap-3">
              {displayedPosts.length === 0 ? (
                <Text className="text-sm text-center py-8" style={textMuted}>
                  {tagFilterView && activeTagFilter
                    ? `No posts with #${activeTagFilter}`
                    : "No posts yet."}
                </Text>
              ) : null}
              {displayedPosts.map((post) => {
                const liked = currentUserId ? post.likedBy.includes(currentUserId) : false;
                const isOwnPost = post.authorId === currentUserId;
                return (
                <View key={post.id} className="rounded-2xl px-4 py-4" style={surfaceStyle}>
                  <View className="flex-row items-center">
                    <ProfileAvatar uri={post.authorProfileImage} size={40} />
                    <View className="flex-1 ml-3">
                      <Text className="text-base font-extrabold" style={textPrimary}>
                        {post.authorName}
                        {isOwnPost ? (
                          <Text style={{ color: theme.accentText }} className="text-sm font-bold">
                            {" "}
                            · me
                          </Text>
                        ) : null}
                      </Text>
                      <Text className="text-[10px] mt-0.5" style={textMuted}>
                        {formatPostDisplayTime(post.createdAt)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setMenuPost(post)}
                      className="w-9 h-9 rounded-full items-center justify-center"
                    >
                      <Ionicons name="ellipsis-vertical" size={20} color={theme.iconMuted} />
                    </Pressable>
                  </View>
                  <Text className="text-sm mt-3 leading-6" style={textSecondary}>
                    {post.content}
                  </Text>
                  {post.imageUrl ? (
                    <Image
                      source={{ uri: post.imageUrl }}
                      style={{ width: "100%", height: 180, borderRadius: 16, marginTop: 10 }}
                      contentFit="cover"
                    />
                  ) : null}
                  {post.tags.length > 0 ? (
                    <View className="flex-row flex-wrap gap-2 mt-3">
                      {post.tags.map((tag) => (
                        <Pressable
                          key={tag}
                          onPress={() => openTagFromPost(tag)}
                          className="rounded-full px-2.5 py-1 border"
                          style={{ backgroundColor: theme.cardBg, borderColor: theme.accent }}
                        >
                          <Text className="text-[10px] font-bold" style={{ color: theme.accentText }}>
                            #{tag}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <View className="flex-row items-center mt-4">
                    <Pressable onPress={() => void handleLike(post)} className="flex-row items-center mr-4">
                      <Ionicons
                        name={liked ? "heart" : "heart-outline"}
                        size={20}
                        color={liked ? "#ef4444" : "#52B69A"}
                      />
                      <Text className="text-xs text-[#52B69A] font-bold ml-1.5">
                        {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setCommentsPost(post)}
                      className="flex-row items-center"
                    >
                      <Ionicons name="chatbubble-outline" size={18} color="#52B69A" />
                      <Text className="text-xs text-[#52B69A] font-bold ml-1.5">
                        {post.commentCount}{" "}
                        {post.commentCount === 1 ? "comment" : "comments"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
              })}
            </View>
          </>
        ) : (
          <View className="gap-3">
            {chats.length === 0 ? (
              <Text className="text-sm text-center py-8" style={textMuted}>
                No user chats yet.
              </Text>
            ) : null}
            {chats.map((chat) => {
              const otherUid = chat.participants.find((p) => p !== currentUserId) ?? "";
              const name = chatDisplayName(chat, currentUserId ?? "", null);
              const image = chat.participantImages[otherUid] ?? null;
              const unread = currentUserId ? (chat.unreadCount[currentUserId] ?? 0) : 0;
              return (
                <Pressable
                  key={chat.id}
                  onPress={() =>
                    router.push({
                      pathname: "/community-chat" as any,
                      params: { chatId: chat.id, name, image: image ?? "", isAdmin: "1" },
                    })
                  }
                  className="flex-row items-center rounded-2xl px-4 py-4 border"
                  style={[
                    surfaceStyle,
                    highlightChatId === chat.id
                      ? { borderColor: theme.accent, borderWidth: 2 }
                      : undefined,
                  ]}
                >
                  <ProfileAvatar uri={image} />
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-center">
                      <Text className="text-base font-extrabold" style={textPrimary}>
                        {name}
                      </Text>
                      {unread > 0 ? (
                        <View className="ml-2 min-w-[20px] h-5 px-1 rounded-full bg-[#ef4444] items-center justify-center">
                          <Text className="text-[10px] font-extrabold text-white">{unread}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-sm mt-1" style={textMuted} numberOfLines={1}>
                      {chat.lastMessage || "No messages"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.accent} />
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderReportsTab = () => (
    <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 12, paddingTop: 12 }}>
      <AdminTabHeader title="Report Management" />
      <View className="rounded-[28px] p-5 gap-3" style={cardStyle}>
        <Text className="text-sm" style={textMuted}>
          Total pending: {reports.length}
        </Text>
        {reports.length === 0 ? (
          <Text className="text-sm text-center py-8" style={textMuted}>
            No pending reports.
          </Text>
        ) : null}
        {reports.map((report) => {
          const busy = reportActionId === report.id;
          return (
            <View key={report.id} className="rounded-2xl px-4 py-4" style={surfaceStyle}>
              <Text className="text-xs font-extrabold uppercase" style={{ color: theme.accentText }}>
                {report.targetType}
              </Text>
              <Text className="text-sm font-extrabold mt-2" style={textPrimary}>
                By {report.reporterName}
              </Text>
              <Text className="text-sm mt-1" style={textSecondary}>
                Reason: {report.reason}
              </Text>
              <Text
                className="text-sm mt-3 rounded-xl px-3 py-3 border"
                style={[cardStyle, textSecondary]}
              >
                {report.targetContent}
              </Text>
              {report.targetType === "post" ? (
                <Pressable
                  onPress={() => void openReportPostDetail(report)}
                  className="mt-3 rounded-full py-2.5 items-center bg-[#eaf7f0] border border-[#b7e4c7]"
                >
                  <Text className="text-xs font-extrabold text-[#52B69A]">View post details</Text>
                </Pressable>
              ) : null}
              {report.targetType === "post" ? (
                <View className="flex-row gap-2 mt-3">
                  <Pressable
                    onPress={() => void handleBlock(report)}
                    disabled={busy}
                    className="flex-1 rounded-full py-2.5 items-center bg-[#ef4444]"
                  >
                    <Text className="text-xs font-extrabold text-white">Block Post</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDismiss(report)}
                    disabled={busy}
                    className="flex-1 rounded-full py-2.5 items-center border"
                    style={cardStyle}
                  >
                    <Text className="text-xs font-extrabold" style={textSecondary}>
                      Dismiss
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => handleDismiss(report)}
                  disabled={busy}
                  className="mt-3 rounded-full py-2.5 items-center border"
                  style={cardStyle}
                >
                  <Text className="text-xs font-extrabold" style={textSecondary}>
                    Dismiss
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderUsersTab = () => (
    <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 12, paddingTop: 12 }}>
      <View className="flex-row items-center mb-1">
        <Text className="text-3xl font-extrabold flex-1" style={textPrimary}>
          User Management
        </Text>
        <Pressable
          onPress={() => {
            setInviteEmail("");
            setInviteVisible(true);
          }}
          className="rounded-full px-5 py-3 bg-[#52B69A] flex-row items-center"
        >
          <Ionicons name="mail-outline" size={18} color="white" />
          <Text className="text-sm font-extrabold text-white ml-2">Invite</Text>
        </Pressable>
      </View>
      <Text className="text-sm font-bold mb-3" style={{ color: theme.accentText }}>
        {users.length} registered users
      </Text>
      <View className="rounded-[28px] p-5 gap-3" style={cardStyle}>
        {users.length === 0 ? (
          <Text className="text-sm text-center py-8" style={textMuted}>
            No registered users yet.
          </Text>
        ) : null}
        {users.map((user) => (
          <View
            key={user.id}
            className="flex-row items-center rounded-2xl px-4 py-4"
            style={surfaceStyle}
          >
            <ProfileAvatar uri={user.profileImage} size={40} />
            <View className="flex-1 ml-3">
              <Text className="text-sm font-extrabold" style={textPrimary}>
                {user.name}
              </Text>
              <Text className="text-xs mt-0.5" style={textMuted}>
                {user.email}
              </Text>
            </View>
            <Pressable
              onPress={() => void openUserDetail(user)}
              className="rounded-full px-4 py-2 border"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.accent }}
            >
              <Text className="text-xs font-extrabold" style={{ color: theme.accentText }}>
                View
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const renderProfileTab = () => {
    const rowStyle = {
      backgroundColor: theme.rowBg,
      borderColor: theme.cardBorder,
      borderWidth: 1,
    };
    const appearanceLabel = mode === "dark" ? "Dark mode" : "Light mode";

    return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 12, paddingTop: 12 }}
      style={{ backgroundColor: theme.screenBg }}
    >
      <ProfileScreenHeader title="Profile" onBack={() => router.back()} titleClassName="text-3xl" />

      <View className="items-center mb-6">
        <View className="w-36 h-36 rounded-full border-4 border-[#b7ead1] bg-[#f7ead9] items-center justify-center overflow-hidden">
          {myProfileImage ? (
            <Image source={{ uri: myProfileImage }} style={{ width: 144, height: 144 }} contentFit="cover" />
          ) : (
            <Ionicons name="person" size={56} color="white" />
          )}
        </View>
        <View className="flex-row items-center mt-4">
          <Text className="text-3xl font-extrabold" style={{ color: theme.textPrimary }}>
            {myName}
          </Text>
          <AdminBadge small />
        </View>
        <Text className="text-lg mt-1.5" style={{ color: theme.textMuted }}>
          {myEmail}
        </Text>
      </View>

      <Pressable
        onPress={() => router.push("/EditAdminProfile" as any)}
        className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-2.5 shadow-sm"
        style={rowStyle}
      >
        <View className="flex-row items-center flex-1">
          <View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: theme.accentSoft }}
          >
            <Ionicons name="person" size={20} color={theme.accent} />
          </View>
          <Text className="text-base font-bold ml-3" style={{ color: theme.textPrimary }}>
            Edit Profile
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
      </Pressable>

      <Pressable
        onPress={() => setPasswordVisible(true)}
        className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-2.5 shadow-sm"
        style={rowStyle}
      >
        <View className="flex-row items-center flex-1">
          <View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: theme.accentSoft }}
          >
            <Ionicons name="lock-closed-outline" size={20} color={theme.accent} />
          </View>
          <Text className="text-base font-bold ml-3" style={{ color: theme.textPrimary }}>
            Change Password
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
      </Pressable>

      <Pressable
        onPress={() => router.push("/admin-edit-terms")}
        className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-2.5 shadow-sm"
        style={rowStyle}
      >
        <View className="flex-row items-center flex-1">
          <View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: theme.accentSoft }}
          >
            <Ionicons name="document-text-outline" size={20} color={theme.accent} />
          </View>
          <Text className="text-base font-bold ml-3" style={{ color: theme.textPrimary }}>
            Edit Terms of Service
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
      </Pressable>

      <Pressable
        onPress={() => setAppearanceVisible(true)}
        className="rounded-3xl px-4 py-3.5 flex-row items-center justify-between mb-2.5 shadow-sm"
        style={rowStyle}
      >
        <View className="flex-row items-center flex-1">
          <View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: theme.accentSoft }}
          >
            <Ionicons name="contrast-outline" size={20} color={theme.accent} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-base font-bold" style={{ color: theme.textPrimary }}>
              Appearance
            </Text>
            <Text className="text-sm font-semibold mt-0.5" style={{ color: theme.accentText }}>
              {appearanceLabel}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
      </Pressable>

      <Pressable
        onPress={() => void handleLogout()}
        className="rounded-3xl py-4 items-center justify-center mt-1"
        style={rowStyle}
      >
        <View className="flex-row items-center">
          <MaterialCommunityIcons name="logout" size={20} color={theme.danger} />
          <Text className="text-base font-bold ml-2" style={{ color: theme.danger }}>
            Logout
          </Text>
        </View>
      </Pressable>
    </ScrollView>
    );
  };

  const tabs: { key: AdminTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "community", label: "Community", icon: "people-outline" },
    { key: "reports", label: "Reports", icon: "flag-outline" },
    { key: "users", label: "Users", icon: "person-outline" },
    { key: "profile", label: "Profile", icon: "person-circle-outline" },
  ];

  return (
    <View className="flex-1" style={{ paddingTop: insets.top + 12, backgroundColor: theme.screenBg }}>
      {firestoreError ? (
        <View className="mx-3 mt-2 rounded-2xl bg-[#fef2f2] border border-[#fecaca] px-4 py-3">
          <Text className="text-xs font-bold text-[#b91c1c] leading-5">{firestoreError}</Text>
        </View>
      ) : null}
      <View className="flex-1">
        {activeTab === "community" ? renderCommunityTab() : null}
        {activeTab === "reports" ? renderReportsTab() : null}
        {activeTab === "users" ? renderUsersTab() : null}
        {activeTab === "profile" ? renderProfileTab() : null}
      </View>

      <View
        className="flex-row px-2 pt-2"
        style={[navStyle, { paddingBottom: insets.bottom + 8 }]}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          const badge =
            tab.key === "reports" && reports.length > 0
              ? reports.length
              : tab.key === "community" && totalUnreadChats > 0
                ? totalUnreadChats
                : 0;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className="flex-1 items-center py-2"
            >
              <View>
                <CommunityUnreadBadge count={badge}>
                  <Ionicons
                    name={tab.icon}
                    size={22}
                    color={active ? theme.accentText : theme.iconMuted}
                  />
                </CommunityUnreadBadge>
              </View>
              <Text
                className="text-[10px] font-bold mt-1"
                style={{ color: active ? theme.accentText : theme.textMuted }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={userDetailVisible && selectedUser !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setUserDetailVisible(false);
          setSelectedUser(null);
        }}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: theme.modalOverlay }}>
          <View
            className="rounded-t-[28px] px-5 pt-5"
            style={[modalCardStyle, { paddingBottom: insets.bottom + 20, borderBottomWidth: 0 }]}
          >
            {selectedUser ? (
              <>
                <View className="items-center mb-5">
                  <ProfileAvatar uri={selectedUser.profileImage} size={72} />
                  <Text className="text-xl font-extrabold mt-3" style={textPrimary}>
                    {selectedUser.name}
                  </Text>
                  <Text className="text-sm mt-1" style={textMuted}>
                    {selectedUser.email}
                  </Text>
                </View>

                <View className="rounded-2xl px-4 py-4 gap-2 mb-4" style={surfaceStyle}>
                  <Text className="text-sm" style={textSecondary}>
                    <Text className="font-bold" style={textPrimary}>
                      Joined:{" "}
                    </Text>
                    {selectedUser.createdAt
                      ? new Date(selectedUser.createdAt).toLocaleDateString()
                      : "—"}
                  </Text>
                  {userDetailExtra?.gender ? (
                    <Text className="text-sm" style={textSecondary}>
                      <Text className="font-bold" style={textPrimary}>
                        Gender:{" "}
                      </Text>
                      {userDetailExtra.gender === "male" ? "Male" : "Female"}
                    </Text>
                  ) : null}
                  {userDetailExtra?.height ? (
                    <Text className="text-sm" style={textSecondary}>
                      <Text className="font-bold" style={textPrimary}>
                        Height:{" "}
                      </Text>
                      {userDetailExtra.height} cm
                    </Text>
                  ) : null}
                  {userDetailExtra?.weight ? (
                    <Text className="text-sm" style={textSecondary}>
                      <Text className="font-bold" style={textPrimary}>
                        Weight:{" "}
                      </Text>
                      {userDetailExtra.weight} kg
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  onPress={() => void handleChatWithUser(selectedUser)}
                  disabled={openingChat}
                  className="rounded-full py-3.5 items-center bg-[#52B69A] mb-3 flex-row justify-center"
                >
                  {openingChat ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <Ionicons name="chatbubble-outline" size={18} color="white" />
                      <Text className="text-sm font-extrabold text-white ml-2">Chat with user</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => {
                    setUserDetailVisible(false);
                    setSelectedUser(null);
                  }}
                  className="rounded-full py-3.5 items-center"
                  style={surfaceStyle}
                >
                  <Text className="text-sm font-extrabold" style={textSecondary}>
                    Close
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={inviteVisible} transparent animationType="slide" onRequestClose={() => setInviteVisible(false)}>
        <View className="flex-1 justify-end" style={{ backgroundColor: theme.modalOverlay }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View
              className="rounded-t-[28px] px-5 pt-5 pb-8"
              style={[modalCardStyle, { borderBottomWidth: 0 }]}
            >
              <Text className="text-xl font-extrabold" style={textPrimary}>
                Invite user
              </Text>
              <TextInput
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="email@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                className="mt-4 rounded-2xl px-4 py-4 text-sm"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
              />
              <View className="flex-row gap-3 mt-4">
                <Pressable
                  onPress={() => setInviteVisible(false)}
                  className="flex-1 rounded-full py-3.5 items-center"
                  style={surfaceStyle}
                >
                  <Text className="text-sm font-extrabold" style={textSecondary}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleInvite()}
                  disabled={inviting || !inviteEmail.trim()}
                  className="flex-1 rounded-full py-3.5 items-center bg-[#52B69A]"
                >
                  {inviting ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-sm font-extrabold text-white">Send Invite</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={passwordVisible} transparent animationType="slide" onRequestClose={() => setPasswordVisible(false)}>
        <View className="flex-1 justify-end" style={{ backgroundColor: theme.modalOverlay }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View
              className="rounded-t-[28px] px-5 pt-5 pb-8"
              style={[modalCardStyle, { borderBottomWidth: 0 }]}
            >
              <Text className="text-xl font-extrabold" style={textPrimary}>
                Change password
              </Text>
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Current password"
                secureTextEntry
                className="mt-4 rounded-2xl px-4 py-4 text-sm"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
              />
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password"
                secureTextEntry
                className="mt-3 rounded-2xl px-4 py-4 text-sm"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
              />
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                secureTextEntry
                className="mt-3 rounded-2xl px-4 py-4 text-sm"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
              />
              <View className="flex-row gap-3 mt-4">
                <Pressable
                  onPress={() => setPasswordVisible(false)}
                  className="flex-1 rounded-full py-3.5 items-center"
                  style={surfaceStyle}
                >
                  <Text className="text-sm font-extrabold" style={textSecondary}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleChangePassword()}
                  disabled={changingPassword}
                  className="flex-1 rounded-full py-3.5 items-center bg-[#52B69A]"
                >
                  {changingPassword ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-sm font-extrabold text-white">Update</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <PostCommentsSheet
        visible={commentsPost !== null}
        post={commentsPost}
        currentUserId={currentUserId}
        onClose={() => setCommentsPost(null)}
        isAdmin
        onBlockComment={requestBlockComment}
      />

      <PostMenuModal
        visible={menuPost !== null}
        post={menuPost}
        isOwnPost={menuPost?.authorId === currentUserId}
        isAdmin
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
        onReport={() => {}}
        onBlock={() => {
          if (menuPost) requestBlockPost(menuPost);
        }}
      />

      <PostEditHistoryModal
        visible={historyPost !== null}
        authorName={historyPost?.authorName ?? ""}
        history={historyPost?.editHistory ?? []}
        onClose={() => setHistoryPost(null)}
      />

      <PostComposerModal
        visible={composerVisible}
        title={editingPost ? "Edit Post" : "New Post"}
        initial={
          editingPost
            ? { content: editingPost.content, tags: editingPost.tags }
            : undefined
        }
        submitting={posting}
        onClose={() => {
          setComposerVisible(false);
          setEditingPost(null);
        }}
        onSubmit={handleSavePost}
      />

      <BlockReasonModal
        visible={blockTarget !== null}
        title={blockTarget?.type === "comment" ? "Block Comment" : "Block Post"}
        description={
          blockTarget?.type === "report"
            ? "Choose a reason for blocking this reported post. The reporter and author will be notified via Support Admin chat."
            : "Provide a reason. The content author will receive this via Support Admin chat."
        }
        presetReasons={
          blockTarget?.type === "report" ? ADMIN_BLOCK_POST_REASONS : undefined
        }
        onClose={() => setBlockTarget(null)}
        onConfirm={handleConfirmBlock}
      />

      <Modal
        visible={reportDetailReport !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setReportDetailReport(null);
          setReportDetailPost(null);
        }}
      >
        <View className="flex-1 justify-center px-6" style={{ backgroundColor: theme.modalOverlay }}>
          <Pressable
            className="absolute inset-0"
            onPress={() => {
              setReportDetailReport(null);
              setReportDetailPost(null);
            }}
          />
          <View
            className="rounded-[28px] px-5 pt-5 pb-8 max-h-[80%]"
            style={[modalCardStyle, { marginBottom: insets.bottom }]}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-extrabold" style={textPrimary}>
                Post details
              </Text>
              <Pressable
                onPress={() => {
                  setReportDetailReport(null);
                  setReportDetailPost(null);
                }}
                className="w-10 h-10 rounded-full items-center justify-center"
                style={surfaceStyle}
              >
                <Ionicons name="close" size={22} color={theme.iconMuted} />
              </Pressable>
            </View>

            {reportDetailLoading ? (
              <View className="py-12 items-center">
                <ActivityIndicator size="large" color={theme.accentText} />
              </View>
            ) : reportDetailPost ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="flex-row items-center mb-4">
                  <ProfileAvatar uri={reportDetailPost.authorProfileImage} size={44} />
                  <View className="ml-3 flex-1">
                    <Text className="text-base font-extrabold" style={textPrimary}>
                      {reportDetailPost.authorName}
                    </Text>
                    <Text className="text-xs mt-0.5" style={textMuted}>
                      {formatPostDisplayTime(reportDetailPost.createdAt)}
                    </Text>
                  </View>
                </View>
                {reportDetailPost.content ? (
                  <Text className="text-sm leading-6" style={textSecondary}>
                    {reportDetailPost.content}
                  </Text>
                ) : null}
                {reportDetailPost.imageUrl ? (
                  <Image
                    source={{ uri: reportDetailPost.imageUrl }}
                    style={{ width: "100%", height: 220, borderRadius: 16, marginTop: 12 }}
                    contentFit="cover"
                  />
                ) : null}
                {reportDetailPost.tags.length > 0 ? (
                  <View className="flex-row flex-wrap gap-2 mt-3">
                    {reportDetailPost.tags.map((tag) => (
                      <View
                        key={tag}
                        className="rounded-full px-2.5 py-1 border"
                        style={{ backgroundColor: theme.rowBg, borderColor: theme.accent }}
                      >
                        <Text className="text-[10px] font-bold" style={{ color: theme.accentText }}>
                          #{tag}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <Text className="text-xs font-bold mt-4" style={{ color: theme.accentText }}>
                  {reportDetailPost.likeCount} likes • {reportDetailPost.commentCount} comments
                </Text>
                {reportDetailReport ? (
                  <View
                    className="mt-4 rounded-2xl px-4 py-3 border"
                    style={{ backgroundColor: theme.dangerSoft, borderColor: theme.danger }}
                  >
                    <Text className="text-xs font-extrabold uppercase" style={{ color: theme.danger }}>
                      Report
                    </Text>
                    <Text className="text-sm mt-2" style={textSecondary}>
                      By {reportDetailReport.reporterName}: {reportDetailReport.reason}
                    </Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : (
              <Text className="text-sm text-center py-8" style={textMuted}>
                Post not found. It may have been removed already.
              </Text>
            )}
          </View>
        </View>
      </Modal>

      <AppearanceModal visible={appearanceVisible} onClose={() => setAppearanceVisible(false)} />
    </View>
  );
}
