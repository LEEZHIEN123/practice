import { PostPendingReviewTip } from "@/components/community/PostPendingReviewTip";
import { CommunitySearchBar } from "@/components/community/CommunitySearchBar";
import { Pressable } from "@/components/Pressable";
import { BlockReasonModal } from "@/components/community/BlockReasonModal";
import { CommunityUnreadBadge } from "@/components/community/CommunityUnreadBadge";
import { PostImagesGallery } from "@/components/community/PostImagesGallery";
import { PostComposerModal } from "@/components/community/PostComposerModal";
import { PostAchievementChips } from "@/components/community/PostAchievementChips";
import { PostEditHistoryModal } from "@/components/community/PostEditHistoryModal";
import { PostLikesModal } from "@/components/community/PostLikesModal";
import { PostMenuModal } from "@/components/community/PostMenuModal";
import { SharePostToChatModal } from "@/components/community/SharePostToChatModal";
import { UserProfileModal } from "@/components/community/UserProfileModal";
import { AppearanceModal } from "@/components/profile/AppearanceModal";
import { ThemedBackButton, ProfileScreenHeader, useProfileCardStyles } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { formatChatMessageTime, formatPostDisplayTime } from "@/lib/chatMessageUtils";
import {
  adminBlockComment,
  adminBlockPost,
  adminPermanentlyDeleteReportTarget,
  blockReportedComment,
  blockReportedPost,
  chatDisplayName,
  createPost,
  deletePost,
  dismissReport,
  dismissReReviewRequest,
  approveReReviewRequest,
  reopenReport,
  restoreReportedPost,
  restoreReportedComment,
  ensureDirectChat,
  fetchPostById,
  fetchPostIdsCommentedByUser,
  fetchPostsByIds,
  filterPostsByKeyword,
  filterPostsByTag,
  getCurrentUserProfile,
  getPostsByAuthor,
  getPublicUserProfile,
  loadLikerProfiles,
  loadProfileImageMap,
  purgeAdminQueueForMissingPosts,
  subscribeChats,
  subscribeFriendsList,
  subscribePendingReReviewRequests,
  subscribePendingCommunityPostIds,
  subscribePostIdsCommentedByUser,
  subscribeReports,
  syncPendingReviewFlags,
  subscribePosts,
  subscribeRegisteredUsers,
  subscribeComments,
  syncAdminConfig,
  togglePostLike,
  updatePost,
  type LikerProfile,
} from "@/lib/communityService";
import {
  ADMIN_BLOCK_POST_REASONS,
  type ChatConversation,
  type CommunityComment,
  type CommunityPost,
  type CommunityReport,
  type PendingReReviewRequest,
  type PublicUserProfile,
  type RegisteredUser,
} from "@/lib/communityTypes";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useScrollFieldAboveKeyboard } from "@/lib/useScrollFieldAboveKeyboard";
import { adminResendPasswordResetEmail } from "@/lib/adminUserManagement";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../../firebaseConfig";

type AdminTab = "community" | "reports" | "users" | "profile";
type PendingSourceFilter = "all" | "reported" | "request_review";
type ReviewedStatusFilter = "all" | "blocked" | "dismissed";

type PendingQueueItem =
  | { kind: "report"; id: string; createdAt: number; report: CommunityReport }
  | { kind: "reReview"; id: string; createdAt: number; request: PendingReReviewRequest };

function matchesReportSearch(report: CommunityReport, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    report.reporterName,
    report.reason,
    report.targetContent,
    report.targetAuthorName,
    report.targetType,
  ].some((field) => field.toLowerCase().includes(needle));
}

function commentFromCommunityReport(report: CommunityReport): CommunityComment {
  return {
    id: report.targetId,
    postId: report.postId,
    authorId: report.targetAuthorId,
    authorName: report.targetAuthorName,
    authorProfileImage: null,
    text: report.targetContent,
    parentCommentId: null,
    replyToAuthorName: null,
    createdAt: report.createdAt,
    blocked: true,
  };
}

function ProfileAvatar({ uri, size = 48 }: { uri: string | null; size?: number }) {
  return (
    <View
      className="rounded-full items-center justify-center overflow-hidden"
      style={{ width: size, height: size, backgroundColor: "#93c5fd" }}
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

function ReportFilterDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  open,
  onOpenChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string }[];
  onChange: (next: T) => void;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { theme, cardStyle, surfaceStyle, textPrimary, textMuted } = useThemedScreen();
  const selectedLabel = options.find((option) => option.key === value)?.label ?? value;

  return (
    <View
      className="flex-1"
      style={open ? { zIndex: 30, elevation: 30 } : { zIndex: 1, elevation: 1 }}
    >
      <Text className="text-xs font-extrabold mb-1.5" style={textMuted}>
        {label}
      </Text>
      <View style={{ position: "relative" }}>
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            onOpenChange(!open);
          }}
          className="flex-row items-center justify-between rounded-2xl px-4 py-3 border"
          style={cardStyle}
        >
          <Text className="text-sm font-bold" style={textPrimary}>
            {selectedLabel}
          </Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={theme.iconMuted} />
        </Pressable>
        {open ? (
          <View
            className="absolute left-0 right-0 mt-1 rounded-2xl border overflow-hidden"
            style={[
              surfaceStyle,
              {
                top: "100%",
                zIndex: 40,
                elevation: 40,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.14,
                shadowRadius: 8,
              },
            ]}
          >
            {options.map((option, index) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  onChange(option.key);
                  onOpenChange(false);
                }}
                className="px-4 py-3"
                style={[
                  { backgroundColor: theme.rowBg },
                  index < options.length - 1
                    ? { borderBottomWidth: 1, borderBottomColor: theme.cardBorder }
                    : undefined,
                ]}
              >
                <Text
                  className="text-sm font-bold"
                  style={{ color: value === option.key ? theme.accentText : theme.textMuted }}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
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
      <Text
        className="flex-1"
        numberOfLines={2}
        style={[
          textPrimary,
          {
            fontSize: 30,
            lineHeight: 36,
            fontWeight: "800",
          },
        ]}
      >
        {title}
      </Text>
      {right}
    </View>
  );
}

export function AdminCommunityHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const reportDetailModalMaxHeight = Math.min(windowHeight - insets.top - insets.bottom - 48, 560);
  const reportDetailModalWidth = Math.min(windowWidth - 40, 420);
  const reportDetailScrollMaxHeight = reportDetailModalMaxHeight - 72;
  const {
    mode,
    theme,
    cardStyle,
    surfaceStyle,
    screenStyle,
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
  const previousAdminTabRef = useRef<AdminTab>("community");
  const switchAdminTab = useCallback((tab: AdminTab) => {
    setActiveTab((prev) => {
      if (prev !== tab) previousAdminTabRef.current = prev;
      return tab;
    });
  }, []);
  const [communitySubTab, setCommunitySubTab] = useState<"feed" | "chat">("feed");
  const [reportsSubTab, setReportsSubTab] = useState<"pending" | "reviewed">("pending");
  const [pendingReportSearch, setPendingReportSearch] = useState("");
  const [reviewedReportSearch, setReviewedReportSearch] = useState("");
  const [pendingSourceFilter, setPendingSourceFilter] = useState<PendingSourceFilter>("all");
  const [reviewedReportStatusFilter, setReviewedReportStatusFilter] =
    useState<ReviewedStatusFilter>("all");
  const [openReportFilter, setOpenReportFilter] = useState<
    "pending-source" | "reviewed-status" | null
  >(null);
  const [reportDeleteMode, setReportDeleteMode] = useState(false);
  const [selectedReportDeleteIds, setSelectedReportDeleteIds] = useState<string[]>([]);
  const [reportBulkDeleting, setReportBulkDeleting] = useState(false);

  const {
    scrollRef: reportsScrollRef,
    scrollFieldIntoView: scrollReportSearchIntoView,
    scrollBottomPad: reportsScrollBottomPad,
    keyboardHeight: reportsKeyboardHeight,
    onScroll: onReportsScroll,
  } = useScrollFieldAboveKeyboard();
  const pendingReportSearchWrapRef = useRef<View>(null);
  const reviewedReportSearchWrapRef = useRef<View>(null);

  const [myName, setMyName] = useState("Admin");
  const [myEmail, setMyEmail] = useState("");
  const [myProfileImage, setMyProfileImage] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [reReviewRequests, setReReviewRequests] = useState<PendingReReviewRequest[]>([]);
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [reportActionId, setReportActionId] = useState<string | null>(null);
  const [reportDetailReport, setReportDetailReport] = useState<CommunityReport | null>(null);
  const [reportDetailPost, setReportDetailPost] = useState<CommunityPost | null>(null);
  const [reportDetailLoading, setReportDetailLoading] = useState(false);
  const [reportDetailComments, setReportDetailComments] = useState<CommunityComment[]>([]);
  const [reportDetailCommentsReady, setReportDetailCommentsReady] = useState(false);

  const [menuPost, setMenuPost] = useState<CommunityPost | null>(null);
  const [sharePost, setSharePost] = useState<CommunityPost | null>(null);
  const [historyPost, setHistoryPost] = useState<CommunityPost | null>(null);
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [composerVisible, setComposerVisible] = useState(false);
  const [likesPost, setLikesPost] = useState<CommunityPost | null>(null);
  const [likers, setLikers] = useState<LikerProfile[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<PublicUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [blockTarget, setBlockTarget] = useState<{
    type: "post" | "comment" | "report" | "reReview";
    post?: CommunityPost;
    comment?: CommunityComment;
    report?: CommunityReport;
    reReview?: PendingReReviewRequest;
  } | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [tagFilterView, setTagFilterView] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [manageFilter, setManageFilter] = useState<"liked" | "commented" | null>(null);
  const [manageMenuVisible, setManageMenuVisible] = useState(false);
  const [commentedPostIds, setCommentedPostIds] = useState<string[]>([]);
  const [commentedFilterPosts, setCommentedFilterPosts] = useState<CommunityPost[]>([]);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [pendingReviewPostIds, setPendingReviewPostIds] = useState<string[]>([]);

  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);

  const [userSearch, setUserSearch] = useState("");
  const [userManagementActionId, setUserManagementActionId] = useState<string | null>(null);

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
  const [avatarById, setAvatarById] = useState<Record<string, string | null>>({});

  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const avatarFor = useCallback(
    (userId: string | null | undefined, fallback?: string | null) => {
      if (!userId) return fallback ?? null;
      const live = avatarById[userId];
      if (live !== undefined) return live;
      return fallback ?? null;
    },
    [avatarById]
  );

  useEffect(() => {
    const user = auth.currentUser;
    setCurrentUserId(user?.uid ?? null);
    if (user?.email) setMyEmail(user.email);
    void syncAdminConfig().catch(() => {});
  }, []);

  const refreshMyProfile = useCallback(() => {
    void getCurrentUserProfile()
      .then(({ uid, profile }) => {
        setMyName(profile.name);
        setMyProfileImage(profile.profileImage);
        setAvatarById((prev) => ({ ...prev, [uid]: profile.profileImage }));
      })
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshMyProfile();
    }, [refreshMyProfile])
  );

  useEffect(() => {
    if (activeTab === "profile") refreshMyProfile();
  }, [activeTab, refreshMyProfile]);

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
    if (!currentUserId) {
      setCommentedPostIds([]);
      setFriendIds([]);
      return;
    }
    const unsubCommented = subscribePostIdsCommentedByUser(
      currentUserId,
      setCommentedPostIds
    );
    const unsubFriends = subscribeFriendsList(
      (friends) => setFriendIds(friends.map((f) => f.id)),
      () => setFriendIds([])
    );
    return () => {
      unsubCommented();
      unsubFriends();
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || manageFilter !== "commented") {
      if (manageFilter !== "commented") setCommentedFilterPosts([]);
      return;
    }
    void fetchPostIdsCommentedByUser(currentUserId)
      .then(setCommentedPostIds)
      .catch(() => {});
  }, [currentUserId, manageFilter]);

  useEffect(() => {
    if (manageFilter !== "commented") return;
    const missing = commentedPostIds.filter((id) => !posts.some((p) => p.id === id));
    if (missing.length === 0) {
      setCommentedFilterPosts([]);
      return;
    }
    let cancelled = false;
    void fetchPostsByIds(missing)
      .then((extras) => {
        if (!cancelled) setCommentedFilterPosts(extras);
      })
      .catch(() => {
        if (!cancelled) setCommentedFilterPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [manageFilter, commentedPostIds, posts]);

  useEffect(() => {
    if (communitySubTab !== "feed" || activeTab !== "community") {
      setManageFilter(null);
    }
  }, [communitySubTab, activeTab]);

  useEffect(() => {
    const unsub = subscribeChats(setChats, handleFirestoreErr);
    return unsub;
  }, [handleFirestoreErr]);

  useEffect(() => {
    const unsub = subscribeReports(setReports, handleFirestoreErr);
    return unsub;
  }, [handleFirestoreErr]);

  useEffect(() => {
    const unsub = subscribePendingCommunityPostIds(setPendingReviewPostIds, handleFirestoreErr);
    return unsub;
  }, [handleFirestoreErr]);

  useEffect(() => {
    const unsub = subscribePendingReReviewRequests(setReReviewRequests, handleFirestoreErr);
    return unsub;
  }, [handleFirestoreErr]);

  // If an author deletes a reported post, drop it from pending + reviewed queues.
  const verifiedExistingPostIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const postIds = [
      ...new Set([
        ...reports.map((report) => report.postId),
        ...reReviewRequests.map((request) => request.postId),
      ]),
    ].filter((postId) => postId && !verifiedExistingPostIdsRef.current.has(postId));
    if (postIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      // Mark posts that still exist so we don't re-check them every snapshot.
      await Promise.all(
        postIds.map(async (postId) => {
          try {
            const post = await fetchPostById(postId);
            if (post) verifiedExistingPostIdsRef.current.add(postId);
          } catch {
            // Will be included in purge attempt below.
          }
        })
      );
      if (cancelled) return;
      const maybeMissing = postIds.filter((id) => !verifiedExistingPostIdsRef.current.has(id));
      if (maybeMissing.length === 0) return;
      const missing = await purgeAdminQueueForMissingPosts(maybeMissing);
      missing.forEach((id) => verifiedExistingPostIdsRef.current.delete(id));
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [reports, reReviewRequests]);

  useEffect(() => {
    const unsub = subscribeRegisteredUsers(setUsers, handleFirestoreErr);
    return unsub;
  }, [handleFirestoreErr]);

  /** Prefer live users/{uid}.profileImage so updated photos show across admin surfaces. */
  useEffect(() => {
    const ids = new Set<string>();
    for (const post of posts) {
      if (post.authorId) ids.add(post.authorId);
    }
    for (const post of commentedFilterPosts) {
      if (post.authorId) ids.add(post.authorId);
    }
    for (const chat of chats) {
      for (const participantId of chat.participants) {
        if (participantId) ids.add(participantId);
      }
    }
    for (const user of users) {
      if (user.id) ids.add(user.id);
    }
    for (const report of reports) {
      if (report.reporterId) ids.add(report.reporterId);
      if (report.targetAuthorId) ids.add(report.targetAuthorId);
    }
    for (const request of reReviewRequests) {
      if (request.requestedBy) ids.add(request.requestedBy);
      if (request.authorId) ids.add(request.authorId);
    }
    if (reportDetailPost?.authorId) ids.add(reportDetailPost.authorId);
    for (const comment of reportDetailComments) {
      if (comment.authorId) ids.add(comment.authorId);
    }
    if (reportDetailReport?.reporterId) ids.add(reportDetailReport.reporterId);
    if (reportDetailReport?.targetAuthorId) ids.add(reportDetailReport.targetAuthorId);
    if (currentUserId) ids.add(currentUserId);

    const userIds = [...ids].filter(Boolean);
    if (userIds.length === 0) {
      setAvatarById({});
      return;
    }
    let cancelled = false;
    void loadProfileImageMap(userIds).then((map) => {
      if (!cancelled) setAvatarById((prev) => ({ ...prev, ...map }));
    });
    return () => {
      cancelled = true;
    };
  }, [
    posts,
    commentedFilterPosts,
    chats,
    users,
    reports,
    reReviewRequests,
    reportDetailPost?.authorId,
    reportDetailComments,
    reportDetailReport?.reporterId,
    reportDetailReport?.targetAuthorId,
    currentUserId,
  ]);

  const totalUnreadChats = useMemo(
    () =>
      chats.reduce((sum, chat) => {
        if (!currentUserId) return sum;
        return sum + (chat.unreadCount[currentUserId] ?? 0);
      }, 0),
    [chats, currentUserId]
  );

  const pendingReports = useMemo(
    () => reports.filter((report) => report.status === "pending"),
    [reports]
  );

  const pendingReportPostIds = useMemo(
    () => new Set(pendingReports.map((report) => report.postId)),
    [pendingReports]
  );

  const pendingPostIdsKey = useMemo(
    () =>
      pendingReports
        .map((report) => report.postId)
        .sort()
        .join(","),
    [pendingReports]
  );

  useEffect(() => {
    if (!pendingPostIdsKey) return;
    void syncPendingReviewFlags(pendingReports).catch(() => {});
  }, [pendingPostIdsKey, pendingReports]);

  const reviewedReports = useMemo(
    () => reports.filter((report) => report.status !== "pending"),
    [reports]
  );

  /** One card per post/comment — multiple reporters should not repeat the same target. */
  const uniqueReviewedReports = useMemo(() => {
    const byTarget = new Map<string, CommunityReport>();
    for (const report of reviewedReports) {
      const key =
        report.targetType === "comment"
          ? `comment:${report.targetId}`
          : `post:${report.postId || report.targetId}`;
      const existing = byTarget.get(key);
      if (!existing || report.createdAt > existing.createdAt) {
        byTarget.set(key, report);
      }
    }
    return [...byTarget.values()].sort((a, b) => b.createdAt - a.createdAt);
  }, [reviewedReports]);

  const filteredPendingReports = useMemo(() => {
    if (!pendingReportSearch.trim()) return pendingReports;
    return pendingReports.filter((report) => matchesReportSearch(report, pendingReportSearch));
  }, [pendingReports, pendingReportSearch]);

  const filteredPendingQueue = useMemo(() => {
    const items: PendingQueueItem[] = [];
    const pendingReReviewPostIds = new Set(
      pendingReports.filter((report) => report.source === "re_review").map((report) => report.postId)
    );

    if (pendingSourceFilter !== "request_review") {
      for (const report of pendingReports) {
        items.push({
          kind: "report",
          id: `report-${report.id}`,
          createdAt: report.createdAt,
          report,
        });
      }
    }

    if (pendingSourceFilter !== "reported") {
      for (const request of reReviewRequests) {
        if (pendingReReviewPostIds.has(request.postId)) continue;
        items.push({
          kind: "reReview",
          id: `rereview-${request.postId}`,
          createdAt: request.requestedAt,
          request,
        });
      }
    }

    const needle = pendingReportSearch.trim().toLowerCase();
    const filtered = needle
      ? items.filter((item) => {
          if (item.kind === "report") return matchesReportSearch(item.report, pendingReportSearch);
          const hay = [
            item.request.requestedByName,
            item.request.authorName,
            item.request.reason,
            item.request.content,
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(needle);
        })
      : items;

    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }, [pendingReports, reReviewRequests, pendingSourceFilter, pendingReportSearch]);

  const pendingQueueTotalCount = pendingReports.length + reReviewRequests.length;

  const filteredReviewedReports = useMemo(() => {
    let list = uniqueReviewedReports;
    if (reviewedReportStatusFilter === "blocked") {
      list = list.filter((report) => report.status === "resolved");
    } else if (reviewedReportStatusFilter === "dismissed") {
      list = list.filter((report) => report.status === "dismissed");
    }
    if (reviewedReportSearch.trim()) {
      list = list.filter((report) => matchesReportSearch(report, reviewedReportSearch));
    }
    return list;
  }, [uniqueReviewedReports, reviewedReportStatusFilter, reviewedReportSearch]);

  const displayedPosts = useMemo(() => {
    let list = filterPostsByTag(
      posts.filter((post) => !post.authorHidden),
      tagFilterView ? activeTagFilter : null
    );
    list = filterPostsByKeyword(list, searchQuery);
    if (manageFilter === "liked" && currentUserId) {
      list = list.filter((post) => post.likedBy.includes(currentUserId));
    } else if (manageFilter === "commented") {
      const idSet = new Set(commentedPostIds);
      const byId = new Map(list.map((post) => [post.id, post]));
      for (const post of commentedFilterPosts) {
        if (!byId.has(post.id)) byId.set(post.id, post);
      }
      list = [...byId.values()]
        .filter((post) => idSet.has(post.id))
        .sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  }, [
    posts,
    activeTagFilter,
    tagFilterView,
    searchQuery,
    manageFilter,
    currentUserId,
    commentedPostIds,
    commentedFilterPosts,
  ]);

  const filteredUsers = useMemo(() => {
    const needle = userSearch.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle)
    );
  }, [users, userSearch]);

  const profilePosts = useMemo(
    () => (profileUserId ? getPostsByAuthor(posts, profileUserId, currentUserId) : []),
    [posts, profileUserId, currentUserId]
  );

  const openCommunityUserProfile = async (userId: string) => {
    if (!userId) return;
    setProfileUserId(userId);
    setProfileLoading(true);
    setProfileData(null);
    try {
      const profile = await getPublicUserProfile(userId);
      setProfileData({
        ...profile,
        profileImage: profile.profileImage ?? avatarById[userId] ?? null,
      });
    } catch {
      Alert.alert("Error", "Could not load profile.");
      setProfileUserId(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const openChatWithUserId = async (
    userId: string,
    name: string,
    image?: string | null
  ) => {
    if (!userId || userId === currentUserId) return;
    try {
      setOpeningChat(true);
      const chatId = await ensureDirectChat(userId);
      setUserDetailVisible(false);
      setSelectedUser(null);
      setProfileUserId(null);
      setProfileData(null);
      switchAdminTab("community");
      setCommunitySubTab("chat");
      setHighlightChatId(chatId);
      router.push({
        pathname: "/community-chat" as any,
        params: {
          chatId,
          name,
          image: avatarFor(userId, image) ?? image ?? "",
          isAdmin: "1",
          otherUserId: userId,
        },
      });
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not open chat.");
    } finally {
      setOpeningChat(false);
    }
  };

  const openTagFromPost = (tag: string) => {
    setActiveTagFilter(tag);
    setTagFilterView(true);
  };

  const exitTagView = () => {
    setTagFilterView(false);
    setActiveTagFilter(null);
  };

  const handleBlock = (report: CommunityReport) => {
    const isComment = report.targetType === "comment";
    Alert.alert(
      isComment ? "Block Comment" : "Block Post",
      isComment
        ? "This comment will be removed. The reporter and comment author will be notified via Support Admin chat."
        : "This post will be hidden from all users. The reporter and post author will be notified via Support Admin chat.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => setBlockTarget({ type: "report", report }),
        },
      ]
    );
  };

  const exitReportDeleteMode = () => {
    setReportDeleteMode(false);
    setSelectedReportDeleteIds([]);
  };

  const toggleReportDeleteSelection = (reportId: string) => {
    setSelectedReportDeleteIds((prev) =>
      prev.includes(reportId) ? prev.filter((id) => id !== reportId) : [...prev, reportId]
    );
  };

  const handleConfirmBulkPermanentDelete = (reportsToDelete: CommunityReport[]) => {
    const selectedReports = reportsToDelete.filter((report) =>
      selectedReportDeleteIds.includes(report.id)
    );
    if (selectedReports.length === 0) return;

    Alert.alert(
      "Remove from admin list",
      `Remove ${selectedReports.length} selected record${
        selectedReports.length === 1 ? "" : "s"
      } from the admin report list? The author's post or comment stays on their profile (they can still request another check if it is blocked).`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                setReportBulkDeleting(true);
                for (const report of selectedReports) {
                  await adminPermanentlyDeleteReportTarget(report);
                }
                exitReportDeleteMode();
                Alert.alert(
                  "Removed",
                  `${selectedReports.length} admin record${
                    selectedReports.length === 1 ? "" : "s"
                  } removed. Author content was kept.`
                );
              } catch (e: unknown) {
                Alert.alert(
                  "Error",
                  e instanceof Error ? e.message : "Could not remove admin records."
                );
              } finally {
                setReportBulkDeleting(false);
              }
            })();
          },
        },
      ]
    );
  };

  const handleCreatePost = async () => {
    if (!auth.currentUser?.uid) {
      Alert.alert("Sign in required", "Please sign in to post.");
      return;
    }
    if (!postText.trim()) return;
    setEditingPost(null);
    setComposerVisible(true);
  };

  const handleLike = async (post: CommunityPost) => {
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

    setPosts((prev) => prev.map((item) => (item.id === post.id ? optimistic : item)));

    try {
      await togglePostLike(post);
    } catch (e: unknown) {
      setPosts((prev) => prev.map((item) => (item.id === post.id ? post : item)));
      Alert.alert("Error", e instanceof Error ? e.message : "Could not update like.");
    }
  };

  const openLikesModal = async (post: CommunityPost) => {
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

  const handleSavePost = async (values: {
    content: string;
    tags: string[];
    achievementIds: string[];
    imageUris: string[];
  }) => {
    if (!auth.currentUser?.uid) {
      Alert.alert("Sign in required", "Please sign in to post.");
      return;
    }
    try {
      setPosting(true);
      if (editingPost) {
        await updatePost(editingPost, {
          content: values.content,
          imageUris: values.imageUris,
          tags: values.tags,
          achievementIds: values.achievementIds,
        });
      } else {
        const created = await createPost({
          content: values.content,
          tags: values.tags,
          achievementIds: values.achievementIds,
          imageUris: values.imageUris,
        });
        setPosts((prev) => {
          const merged = [created, ...prev.filter((item) => item.id !== created.id)];
          return merged.sort((a, b) => b.createdAt - a.createdAt);
        });
        setPostText("");
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
      "This post will be removed and the author will be notified via Support Admin chat. It will also appear under Reviewed in report management.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => setBlockTarget({ type: "post", post }),
        },
      ]
    );
  };

  const handleConfirmBlock = async (reason: string) => {
    if (!blockTarget) return;
    try {
      if (blockTarget.type === "reReview" && blockTarget.reReview) {
        setReportActionId(`rereview-${blockTarget.reReview.postId}`);
        await dismissReReviewRequest(blockTarget.reReview.postId, reason);
        Alert.alert("Request dismissed", "The author has been notified.");
      } else if (blockTarget.type === "report" && blockTarget.report) {
        setReportActionId(blockTarget.report.id);
        if (blockTarget.report.targetType === "comment") {
          await blockReportedComment(blockTarget.report, reason);
          Alert.alert("Comment blocked", "The reporter and author have been notified.");
        } else {
          await blockReportedPost(blockTarget.report, reason);
          Alert.alert("Post blocked", "The reporter and author have been notified.");
        }
      } else if (blockTarget.type === "post" && blockTarget.post) {
        await adminBlockPost(blockTarget.post, reason);
        Alert.alert("Post blocked", "The author has been notified.");
      } else if (blockTarget.type === "comment" && blockTarget.post && blockTarget.comment) {
        await adminBlockComment(blockTarget.post.id, blockTarget.comment, reason);
        Alert.alert("Comment blocked", "The author has been notified.");
      }
      setBlockTarget(null);
    } catch (e: unknown) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not complete this action."
      );
      throw e;
    } finally {
      setReportActionId(null);
    }
  };

  useEffect(() => {
    if (!reportDetailPost || !reportDetailReport) {
      setReportDetailComments([]);
      setReportDetailCommentsReady(false);
      return;
    }
    setReportDetailCommentsReady(false);
    const unsub = subscribeComments(reportDetailPost.id, (comments) => {
      setReportDetailComments(comments);
      setReportDetailCommentsReady(true);
    }, { includeBlocked: true });
    return unsub;
  }, [reportDetailPost?.id, reportDetailReport?.id]);

  const closeReportDetailModal = () => {
    setReportDetailReport(null);
    setReportDetailPost(null);
    setReportDetailComments([]);
    setReportDetailCommentsReady(false);
  };

  const openReportPostDetail = async (report: CommunityReport) => {
    setReportDetailReport(report);
    setReportDetailPost(null);
    setReportDetailComments([]);
    setReportDetailCommentsReady(false);
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
      closeReportDetailModal();
    } finally {
      setReportDetailLoading(false);
    }
  };

  const reportDetailReportedCommentDisplay = useMemo(() => {
    if (!reportDetailReport || reportDetailReport.targetType !== "comment") return null;
    if (!reportDetailPost) {
      return { comment: commentFromCommunityReport(reportDetailReport), removed: true };
    }
    const live = reportDetailComments.find((comment) => comment.id === reportDetailReport.targetId);
    if (live) return { comment: live, removed: live.blocked };
    if (!reportDetailCommentsReady) return null;
    return { comment: commentFromCommunityReport(reportDetailReport), removed: true };
  }, [
    reportDetailComments,
    reportDetailCommentsReady,
    reportDetailPost,
    reportDetailReport,
  ]);

  const renderReportDetailPostSummary = () => {
    if (!reportDetailPost) return null;

    return (
      <View className="mb-4" style={{ borderBottomColor: theme.cardBorder }}>
        <Text className="text-xs font-extrabold uppercase mb-3" style={{ color: theme.accentText }}>
          Post
        </Text>
        <View className="flex-row items-center mb-3">
          <Pressable
            onPress={() => void openCommunityUserProfile(reportDetailPost.authorId)}
            className="flex-row items-center flex-1"
          >
            <ProfileAvatar uri={avatarFor(reportDetailPost.authorId, reportDetailPost.authorProfileImage)} size={44} />
            <View className="ml-3 flex-1">
              <Text className="text-base font-extrabold" style={textPrimary} numberOfLines={1}>
                {reportDetailPost.authorName}
              </Text>
              <Text className="text-xs mt-0.5" style={textMuted}>
                {formatPostDisplayTime(reportDetailPost.createdAt)}
              </Text>
            </View>
          </Pressable>
        </View>
        {reportDetailPost.content ? (
          <Text className="text-sm leading-6" style={textSecondary}>
            {reportDetailPost.content}
          </Text>
        ) : null}
        {reportDetailPost.imageUrls.length > 0 ? (
          <PostImagesGallery imageUrls={reportDetailPost.imageUrls} maxHeight={220} />
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
      </View>
    );
  };

  const renderReportDetailCommentBody = (
    comment: CommunityComment,
    options?: { showReport?: boolean; highlighted?: boolean; removed?: boolean }
  ) => (
    <View
      className="rounded-2xl px-4 py-3 border"
      style={[
        surfaceStyle,
        options?.highlighted ? { borderColor: theme.danger, borderWidth: 2 } : undefined,
      ]}
    >
      {options?.removed ? (
        <Text className="text-[10px] font-extrabold uppercase mb-2" style={{ color: theme.danger }}>
          Comment removed
        </Text>
      ) : null}
      <View className="flex-row items-center">
        <Pressable
          onPress={() => void openCommunityUserProfile(comment.authorId)}
          className="flex-row items-center flex-1"
        >
          <ProfileAvatar uri={avatarFor(comment.authorId, comment.authorProfileImage)} size={40} />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-extrabold" style={textPrimary}>
              {comment.authorName}
            </Text>
            <Text className="text-[10px] mt-0.5" style={textMuted}>
              {formatChatMessageTime(comment.createdAt)}
            </Text>
          </View>
        </Pressable>
      </View>
      {comment.replyToAuthorName ? (
        <Text className="text-xs font-bold mt-2" style={{ color: theme.accentText }}>
          Replying to {comment.replyToAuthorName}
        </Text>
      ) : null}
      <Text className="text-sm mt-2 leading-6" style={textSecondary}>
        {comment.text}
      </Text>
      {options?.showReport && reportDetailReport ? (
        <View
          className="mt-4 rounded-2xl px-4 py-3 border"
          style={{ backgroundColor: theme.dangerSoft, borderColor: theme.danger }}
        >
          <Text className="text-xs font-extrabold uppercase" style={{ color: theme.danger }}>
            Report
          </Text>
          <Text className="text-sm mt-2 leading-5" style={textSecondary}>
            By{" "}
            <Text
              style={{ color: theme.accentText, fontWeight: "800" }}
              onPress={() => void openCommunityUserProfile(reportDetailReport.reporterId)}
            >
              {reportDetailReport.reporterName}
            </Text>
            : {reportDetailReport.reason}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderReportDetailReportedCommentSection = () => {
    if (!reportDetailReport || reportDetailReport.targetType !== "comment") return null;

    return (
      <View className="mt-5">
        <Text className="text-xs font-extrabold uppercase mb-3" style={{ color: theme.accentText }}>
          Reported comment
        </Text>
        {!reportDetailPost || reportDetailCommentsReady ? (
          reportDetailReportedCommentDisplay ? (
            renderReportDetailCommentBody(reportDetailReportedCommentDisplay.comment, {
              showReport: true,
              highlighted: true,
              removed: reportDetailReportedCommentDisplay.removed,
            })
          ) : null
        ) : (
          <View className="py-6 items-center">
            <ActivityIndicator size="small" color={theme.accentText} />
          </View>
        )}
      </View>
    );
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

  const handleLogout = () => {
    Alert.alert("Log out?", "You will need to sign in again to use your account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await signOut(auth);
              router.replace("/login");
            } catch {
              Alert.alert("Error", "Could not log out. Please try again.");
            }
          })();
        },
      },
    ]);
  };

  const openPostDetail = (postId: string) => {
    router.push({
      pathname: "/community-post" as any,
      params: { postId },
    });
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
    await openChatWithUserId(user.id, user.name, user.profileImage);
  };

  const handleResendPasswordReset = (user: RegisteredUser) => {
    Alert.alert(
      "Resend password link",
      `Send a password reset email to ${user.email}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: () => {
            void (async () => {
              try {
                setUserManagementActionId(user.id);
                await adminResendPasswordResetEmail(user.email);
                Alert.alert(
                  "Email sent",
                  `A password reset link was sent to ${user.email}. Ask them to check Inbox, Spam, and Promotions.`
                );
              } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Could not send reset email.");
              } finally {
                setUserManagementActionId(null);
              }
            })();
          },
        },
      ]
    );
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

  const handleApproveReReview = useCallback((request: PendingReReviewRequest) => {
    Alert.alert(
      "Restore post",
      "Approve this review request and restore the post to the community?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: () => {
            void (async () => {
              try {
                setReportActionId(`rereview-${request.postId}`);
                await approveReReviewRequest(request.postId);
                Alert.alert("Post restored", "The author has been notified.");
              } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Could not restore post.");
              } finally {
                setReportActionId(null);
              }
            })();
          },
        },
      ]
    );
  }, []);

  const handleDismissReReview = useCallback((request: PendingReReviewRequest) => {
    Alert.alert(
      "Keep hidden",
      "Keep this post hidden? You will need to provide a reason for the author.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => setBlockTarget({ type: "reReview", reReview: request }),
        },
      ]
    );
  }, []);

  const handleApproveReReviewFromReport = useCallback((report: CommunityReport) => {
    Alert.alert(
      "Restore post",
      "Approve this review request and restore the post to the community?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: () => {
            void (async () => {
              try {
                setReportActionId(report.id);
                await approveReReviewRequest(report.postId);
                Alert.alert("Post restored", "The author has been notified.");
              } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Could not restore post.");
              } finally {
                setReportActionId(null);
              }
            })();
          },
        },
      ]
    );
  }, []);

  const handleDismissReReviewFromReport = useCallback((report: CommunityReport) => {
    setBlockTarget({
      type: "reReview",
      reReview: {
        postId: report.postId,
        reason: report.requestReason ?? report.reason,
        requestedBy: report.reporterId,
        requestedByName: report.reporterName,
        authorId: report.targetAuthorId,
        authorName: report.targetAuthorName,
        content: report.targetContent,
        requestedAt: report.createdAt,
      },
    });
  }, []);

  const handleReopenReport = useCallback((report: CommunityReport) => {
    Alert.alert(
      "Move to pending",
      report.targetType === "post"
        ? "Move this report back to pending review? The post will be visible in the community again with a notice for all users."
        : "Move this report back to pending review?",
      [
      { text: "Cancel", style: "cancel" },
      {
        text: "Move",
        onPress: () => {
          void (async () => {
            try {
              setReportActionId(report.id);
              await reopenReport(report);
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not reopen report.");
            } finally {
              setReportActionId(null);
            }
          })();
        },
      },
    ]);
  }, []);

  const handleRestorePost = useCallback((report: CommunityReport) => {
    Alert.alert("Restore post", "Restore this blocked post to the community?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        onPress: () => {
          void (async () => {
            try {
              setReportActionId(report.id);
              await restoreReportedPost(report);
              Alert.alert("Post restored", "The author has been notified.");
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not restore post.");
            } finally {
              setReportActionId(null);
            }
          })();
        },
      },
    ]);
  }, []);

  const handleRestoreComment = useCallback((report: CommunityReport) => {
    Alert.alert("Restore comment", "Restore this blocked comment to the community?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        onPress: () => {
          void (async () => {
            try {
              setReportActionId(report.id);
              await restoreReportedComment(report);
              Alert.alert("Comment restored", "The author has been notified.");
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not restore comment.");
            } finally {
              setReportActionId(null);
            }
          })();
        },
      },
    ]);
  }, []);

  const renderCommunityTab = () => (
    <View className="flex-1">
      <View style={{ backgroundColor: theme.screenBg, paddingHorizontal: 12, paddingTop: 12 }}>
        <AdminTabHeader title="Community" right={<AdminBadge />} />

        <View className="flex-row mb-3 gap-2">
          <Pressable
            onPress={() => setCommunitySubTab("feed")}
            className="flex-1 rounded-full py-3.5 items-center justify-center border-2"
            style={
              communitySubTab === "feed"
                ? { backgroundColor: theme.accent, borderColor: theme.accent }
                : cardStyle
            }
          >
            <Text
              className={`font-extrabold ${communitySubTab === "feed" ? "text-base" : "text-sm"}`}
              style={{
                color: communitySubTab === "feed" ? "#ffffff" : theme.textSecondary,
              }}
            >
              Feed
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setCommunitySubTab("chat")}
            className="flex-1 rounded-full py-3.5 items-center justify-center flex-row border-2"
            style={
              communitySubTab === "chat"
                ? { backgroundColor: theme.accent, borderColor: theme.accent }
                : cardStyle
            }
          >
            <Text
              className={`font-extrabold ${communitySubTab === "chat" ? "text-base" : "text-sm"}`}
              style={{
                color: communitySubTab === "chat" ? "#ffffff" : theme.textSecondary,
              }}
            >
              Chat
            </Text>
            {totalUnreadChats > 0 ? (
              <View
                className={`ml-1.5 min-w-[20px] h-5 px-1 rounded-full items-center justify-center ${
                  communitySubTab === "chat" ? "bg-white" : "bg-[#ef4444]"
                }`}
              >
                <Text
                  className="text-[10px] font-extrabold"
                  style={{
                    color: communitySubTab === "chat" ? theme.accent : "#ffffff",
                  }}
                >
                  {totalUnreadChats > 9 ? "9+" : totalUnreadChats}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {communitySubTab === "feed" ? (
          tagFilterView && activeTagFilter ? (
            <View className="flex-row items-center mb-3">
              <ThemedBackButton onPress={exitTagView} className="mr-3" />
              <Text className="text-lg font-extrabold" style={textPrimary}>
                #{activeTagFilter}
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-2 mb-3">
              <View className="flex-1">
                <CommunitySearchBar
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search posts, tags, or people..."
                  className="mb-0"
                />
              </View>
              <Pressable
                onPress={() => setManageMenuVisible(true)}
                className="w-12 h-12 rounded-2xl items-center justify-center border"
                style={
                  manageFilter
                    ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
                    : cardStyle
                }
                accessibilityRole="button"
                accessibilityLabel="Manage posts"
              >
                <Ionicons
                  name="options-outline"
                  size={22}
                  color={manageFilter ? theme.accent : theme.textPrimary}
                />
              </Pressable>
              {manageFilter ? (
                <Pressable
                  onPress={() => setManageFilter(null)}
                  className="w-12 h-12 rounded-2xl items-center justify-center border"
                  style={cardStyle}
                  accessibilityRole="button"
                  accessibilityLabel="Clear manage filter"
                >
                  <Ionicons name="close" size={20} color={theme.textPrimary} />
                </Pressable>
              ) : null}
            </View>
          )
        ) : null}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {communitySubTab === "feed" ? (
          <View className="gap-3 px-3 pb-4">
            {!tagFilterView ? (
              <View className="rounded-2xl px-4 py-4" style={cardStyle}>
                <View className="flex-row items-center">
                  <ProfileAvatar uri={avatarFor(currentUserId, myProfileImage)} />
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
                  disabled={!postText.trim()}
                  className="mt-3 rounded-full py-3 items-center"
                  style={{ backgroundColor: postText.trim() ? theme.accent : theme.iconMuted }}
                >
                  <Text className="text-sm font-extrabold text-white">Continue</Text>
                </Pressable>
              </View>
            ) : null}

            {displayedPosts.length === 0 ? (
              <View className="px-4 py-8 rounded-2xl items-center" style={cardStyle}>
                <Text className="text-sm text-center" style={textMuted}>
                  {manageFilter === "liked"
                    ? "No liked posts yet."
                    : manageFilter === "commented"
                      ? "No posts you've commented on yet."
                      : tagFilterView && activeTagFilter
                        ? `No posts with #${activeTagFilter}`
                        : searchQuery.trim()
                          ? "No posts match your search."
                          : "No posts yet."}
                </Text>
              </View>
            ) : null}

            {displayedPosts.map((post) => {
              const liked = currentUserId ? post.likedBy.includes(currentUserId) : false;
              const isOwnPost = post.authorId === currentUserId;
              const isPendingReview =
                !post.blocked &&
                (post.underReview ||
                  pendingReviewPostIds.includes(post.id) ||
                  pendingReportPostIds.has(post.id));
              return (
                <View key={post.id} className="rounded-2xl px-4 py-4" style={cardStyle}>
                  <View className="flex-row items-center">
                    <Pressable onPress={() => void openCommunityUserProfile(post.authorId)}>
                      <ProfileAvatar
                        uri={avatarFor(post.authorId, post.authorProfileImage)}
                        size={40}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => void openCommunityUserProfile(post.authorId)}
                      className="flex-1 ml-3"
                    >
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
                    </Pressable>
                    <Pressable
                      onPress={() => setMenuPost(post)}
                      className="w-9 h-9 rounded-full items-center justify-center"
                    >
                      <Ionicons name="ellipsis-vertical" size={20} color={theme.iconMuted} />
                    </Pressable>
                  </View>

                  {isPendingReview ? (
                    <View className="mt-2">
                      <PostPendingReviewTip variant="admin" />
                    </View>
                  ) : null}

                  <Pressable onPress={() => openPostDetail(post.id)}>
                    <Text className="text-sm mt-3 leading-6" style={textSecondary}>
                      {post.content}
                    </Text>
                    <PostAchievementChips achievementIds={post.achievementIds ?? []} />
                    <PostImagesGallery imageUrls={post.imageUrls} maxHeight={180} />
                  </Pressable>
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
                    <View className="flex-row items-center mr-4">
                      <Pressable
                        onPress={() => void handleLike(post)}
                        hitSlop={10}
                        className="flex-row items-center"
                      >
                        <Ionicons
                          name={liked ? "heart" : "heart-outline"}
                          size={20}
                          color={liked ? "#ef4444" : theme.accent}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => void openLikesModal(post)}
                        hitSlop={{ top: 10, bottom: 10, left: 4, right: 8 }}
                      >
                        <Text className="text-xs font-bold ml-1.5" style={{ color: theme.accent }}>
                          {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
                        </Text>
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={() => openPostDetail(post.id)}
                      className="flex-row items-center"
                    >
                      <Ionicons name="chatbubble-outline" size={18} color={theme.accent} />
                      <Text className="text-xs font-bold ml-1.5" style={{ color: theme.accent }}>
                        {post.commentCount}{" "}
                        {post.commentCount === 1 ? "comment" : "comments"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View className="px-3 gap-0 pb-4">
            {chats.length === 0 ? (
              <View className="px-4 py-8 items-center rounded-2xl" style={surfaceStyle}>
                <Text className="text-sm text-center" style={textMuted}>
                  No user chats yet.
                </Text>
              </View>
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
                      params: {
                        chatId: chat.id,
                        name,
                        image: avatarFor(otherUid, image) ?? "",
                        isAdmin: "1",
                        otherUserId: otherUid,
                      },
                    })
                  }
                  className="flex-row items-center rounded-2xl px-4 py-4 mb-2"
                  style={[
                    surfaceStyle,
                    highlightChatId === chat.id
                      ? { borderColor: theme.accent, borderWidth: 1 }
                      : undefined,
                  ]}
                >
                  <ProfileAvatar
                    uri={avatarFor(otherUid, image)}
                  />
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
      </ScrollView>
    </View>
  );

  const renderReportsTab = () => {
    const pendingSourceOptions = [
      { key: "all" as const, label: "All" },
      { key: "reported" as const, label: "Reported" },
      { key: "request_review" as const, label: "Request review" },
    ];
    const reportStatusOptions = [
      { key: "all" as const, label: "All" },
      { key: "blocked" as const, label: "Blocked" },
      { key: "dismissed" as const, label: "Dismissed" },
    ];

    const renderReportTotalsHeader = (
      totalLabel: string,
      totalCount: number,
      totalColor: string,
      description: string
    ) => (
      <>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-baseline">
            <Text className="text-base font-extrabold" style={textPrimary}>
              {totalLabel}:{" "}
            </Text>
            <Text className="text-base font-extrabold" style={{ color: totalColor }}>
              {totalCount}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (reportDeleteMode) exitReportDeleteMode();
              else {
                setSelectedReportDeleteIds([]);
                setReportDeleteMode(true);
              }
            }}
            className="flex-row items-center rounded-full px-3 py-1.5 border"
            style={{
              backgroundColor: reportDeleteMode ? theme.rowBg : theme.dangerSoft,
              borderColor: reportDeleteMode ? theme.cardBorder : theme.danger,
            }}
          >
            <Ionicons
              name={reportDeleteMode ? "close" : "trash-outline"}
              size={14}
              color={reportDeleteMode ? theme.iconMuted : theme.danger}
            />
            <Text
              className="text-[10px] font-extrabold ml-1.5"
              style={{ color: reportDeleteMode ? theme.textMuted : theme.danger }}
            >
              {reportDeleteMode ? "Cancel" : "Permanent delete"}
            </Text>
          </Pressable>
        </View>
        <Text className="text-xs leading-5" style={textMuted}>
          {description}
        </Text>
      </>
    );

    const renderReportSelectionCheckbox = (reportId: string) => {
      if (!reportDeleteMode) return null;
      const selected = selectedReportDeleteIds.includes(reportId);
      return (
        <View className="mr-3">
          <Ionicons
            name={selected ? "checkbox" : "square-outline"}
            size={22}
            color={selected ? theme.accentText : theme.iconMuted}
          />
        </View>
      );
    };

    return (
    <KeyboardAvoidingView behavior="padding" className="flex-1">
    <ScrollView
      ref={reportsScrollRef}
      keyboardShouldPersistTaps="handled"
      onScroll={(event) => onReportsScroll(event.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
      contentContainerStyle={{
        paddingBottom:
          (reportsKeyboardHeight > 0 ? reportsScrollBottomPad + 24 : 20) +
          (reportDeleteMode ? 72 : 0),
        paddingHorizontal: 12,
        paddingTop: 12,
      }}
    >
      <AdminTabHeader title="Report Management" right={<AdminBadge />} />
      <View
        className="rounded-[28px] p-5 gap-3"
        style={[cardStyle, openReportFilter ? { overflow: "visible", zIndex: 20 } : undefined]}
      >
        <View className="flex-row mb-1">
          <Pressable
            onPress={() => {
              setOpenReportFilter(null);
              exitReportDeleteMode();
              setReportsSubTab("pending");
            }}
            className="flex-1 rounded-full py-3 items-center mr-2"
            style={reportsSubTab === "pending" ? segmentActiveStyle : segmentTrackStyle}
          >
            <Text
              className="text-sm font-extrabold"
              style={{ color: reportsSubTab === "pending" ? theme.accentText : theme.textMuted }}
            >
              Pending
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setOpenReportFilter(null);
              exitReportDeleteMode();
              setReportsSubTab("reviewed");
            }}
            className="flex-1 rounded-full py-3 items-center ml-2"
            style={reportsSubTab === "reviewed" ? segmentActiveStyle : segmentTrackStyle}
          >
            <Text
              className="text-sm font-extrabold"
              style={{ color: reportsSubTab === "reviewed" ? theme.accentText : theme.textMuted }}
            >
              Reviewed
            </Text>
          </Pressable>
        </View>

        {reportsSubTab === "pending" ? (
          <>
            {renderReportTotalsHeader(
              "Total pending",
              pendingQueueTotalCount,
              "#ef4444",
              "All posts and comments below are waiting for a decision. You can block or dismiss reports, and restore or keep hidden review requests."
            )}
            <CommunitySearchBar
              value={pendingReportSearch}
              onChangeText={setPendingReportSearch}
              placeholder="Search reports..."
              className="mb-0"
              wrapRef={pendingReportSearchWrapRef}
              onFocus={() => scrollReportSearchIntoView(pendingReportSearchWrapRef)}
            />
            <View
              className="flex-row gap-2 mt-3"
              style={openReportFilter ? { zIndex: 30, elevation: 30, overflow: "visible" } : undefined}
            >
              <ReportFilterDropdown
                label="Source"
                value={pendingSourceFilter}
                options={pendingSourceOptions}
                onChange={setPendingSourceFilter}
                open={openReportFilter === "pending-source"}
                onOpenChange={(next) => setOpenReportFilter(next ? "pending-source" : null)}
              />
            </View>
            {pendingQueueTotalCount === 0 ? (
              <Text className="text-sm text-center py-8" style={textMuted}>
                No pending reports.
              </Text>
            ) : filteredPendingQueue.length === 0 ? (
              <Text className="text-sm text-center py-8" style={textMuted}>
                No reports match your search or filters.
              </Text>
            ) : null}
            {filteredPendingQueue.map((item) => {
              if (item.kind === "reReview") {
                const request = item.request;
                const busy = reportActionId === `rereview-${request.postId}`;
                return (
                  <View key={item.id} className="rounded-2xl px-4 py-4" style={surfaceStyle}>
                    <View className="flex-row items-start justify-between gap-2">
                      <Text
                        className="text-xs font-extrabold uppercase flex-1"
                        style={{ color: "#c2410c" }}
                      >
                        Request review · Post
                      </Text>
                      <Text
                        className="text-xs font-extrabold text-right shrink max-w-[55%]"
                        style={textPrimary}
                        numberOfLines={2}
                      >
                        Request review by{" "}
                        <Text
                          style={{ color: theme.accentText }}
                          onPress={() => void openCommunityUserProfile(request.requestedBy)}
                        >
                          {request.requestedByName}
                        </Text>
                      </Text>
                    </View>
                    <Text className="text-sm mt-2 font-extrabold" style={textPrimary}>
                      Request reason:{" "}
                      <Text className="font-extrabold" style={{ color: "#16a34a" }}>
                        {request.reason || "(No reason provided)"}
                      </Text>
                    </Text>
                    <Pressable onPress={() => void openCommunityUserProfile(request.authorId)}>
                      <Text className="text-xs mt-2" style={textMuted}>
                        Post author:{" "}
                        <Text style={{ color: theme.accentText, fontWeight: "800" }}>
                          {request.authorName}
                        </Text>
                      </Text>
                    </Pressable>
                    <Text
                      className="text-sm mt-3 rounded-xl px-3 py-3 border"
                      style={[
                        { backgroundColor: theme.rowBg, borderColor: theme.cardBorder },
                        textSecondary,
                      ]}
                    >
                      {request.content || "(No text)"}
                    </Text>
                    <Pressable
                      onPress={() =>
                        void openReportPostDetail({
                          id: `rereview-${request.postId}`,
                          targetType: "post",
                          targetId: request.postId,
                          postId: request.postId,
                          reporterId: request.requestedBy,
                          reporterName: request.requestedByName,
                          reason: request.reason,
                          status: "pending",
                          createdAt: request.requestedAt,
                          targetContent: request.content,
                          targetAuthorId: request.authorId,
                          targetAuthorName: request.authorName,
                          read: true,
                        })
                      }
                      disabled={busy || reportDeleteMode}
                      className="mt-3 rounded-full py-2.5 items-center border"
                      style={{
                        backgroundColor: theme.accentSoft,
                        borderColor: theme.accent,
                        opacity: busy || reportDeleteMode ? 0.5 : 1,
                      }}
                    >
                      <Text className="text-xs font-extrabold" style={{ color: theme.accentText }}>
                        View post details
                      </Text>
                    </Pressable>
                    <View className="flex-row gap-2 mt-3">
                      <Pressable
                        onPress={() => handleApproveReReview(request)}
                        disabled={busy || reportDeleteMode}
                        className="flex-1 rounded-full py-2.5 items-center"
                        style={{ backgroundColor: theme.accent, opacity: busy || reportDeleteMode ? 0.5 : 1 }}
                      >
                        <Text className="text-xs font-extrabold" style={{ color: "#ffffff" }}>
                          Restore Post
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDismissReReview(request)}
                        disabled={busy || reportDeleteMode}
                        className="flex-1 rounded-full py-2.5 items-center border"
                        style={[cardStyle, busy || reportDeleteMode ? { opacity: 0.5 } : undefined]}
                      >
                        <Text className="text-xs font-extrabold" style={textSecondary}>
                          Keep Hidden
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }

              const report = item.report;
              const busy = reportActionId === report.id;
              const cardDisabled = reportDeleteMode || busy;
              const selected = selectedReportDeleteIds.includes(report.id);
              const isReReviewPending =
                report.source === "re_review" && report.targetType === "post";
              const reportTypeLabel = isReReviewPending
                ? `Request review · ${report.targetType}`
                : report.source === "admin_direct"
                  ? `Admin block · ${report.targetType}`
                  : `Reported · ${report.targetType}`;
              const reportByPrefix = isReReviewPending
                ? "Request review by "
                : report.source === "admin_direct"
                  ? "Blocked by "
                  : "Reported by ";
              return (
                <View
                  key={item.id}
                  className="rounded-2xl px-4 py-4"
                  style={[
                    surfaceStyle,
                    reportDeleteMode && selected
                      ? { borderColor: theme.accent, borderWidth: 2 }
                      : undefined,
                  ]}
                >
                  {reportDeleteMode ? (
                    <Pressable
                      onPress={() => toggleReportDeleteSelection(report.id)}
                      className="flex-row items-start justify-between gap-2"
                    >
                      <View className="flex-row items-center flex-1 min-w-0">
                        {renderReportSelectionCheckbox(report.id)}
                        <Text
                          className="text-xs font-extrabold uppercase flex-1"
                          style={{ color: theme.accentText }}
                        >
                          {reportTypeLabel}
                        </Text>
                      </View>
                      <Text
                        className="text-xs font-extrabold text-right shrink max-w-[50%]"
                        style={textPrimary}
                        numberOfLines={2}
                      >
                        {reportByPrefix}
                        <Text
                          style={{ color: theme.accentText }}
                          onPress={() => void openCommunityUserProfile(report.reporterId)}
                        >
                          {report.reporterName}
                        </Text>
                      </Text>
                    </Pressable>
                  ) : (
                    <View className="flex-row items-start justify-between gap-2">
                      <Text
                        className="text-xs font-extrabold uppercase flex-1"
                        style={{ color: theme.accentText }}
                      >
                        {reportTypeLabel}
                      </Text>
                      <Text
                        className="text-xs font-extrabold text-right shrink max-w-[55%]"
                        style={textPrimary}
                        numberOfLines={2}
                      >
                        {reportByPrefix}
                        <Text
                          style={{ color: theme.accentText }}
                          onPress={() => void openCommunityUserProfile(report.reporterId)}
                        >
                          {report.reporterName}
                        </Text>
                      </Text>
                    </View>
                  )}
                  {isReReviewPending && report.requestReason ? (
                    <Text className="text-sm mt-2 font-extrabold" style={textPrimary}>
                      Request reason:{" "}
                      <Text className="font-extrabold" style={{ color: "#16a34a" }}>
                        {report.requestReason}
                      </Text>
                    </Text>
                  ) : null}
                  <Text
                    className={`text-sm font-extrabold ${
                      isReReviewPending && report.requestReason ? "mt-1" : "mt-2"
                    }`}
                    style={textPrimary}
                  >
                    {isReReviewPending
                      ? "Block reason: "
                      : report.source === "admin_direct"
                        ? "Block reason: "
                        : "Report reason: "}
                    <Text className="font-extrabold" style={{ color: "#16a34a" }}>
                      {report.reason}
                    </Text>
                  </Text>
                  <Text
                    className="text-sm mt-3 rounded-xl px-3 py-3 border"
                    style={[
                      { backgroundColor: theme.rowBg, borderColor: theme.cardBorder },
                      textSecondary,
                    ]}
                  >
                    {report.targetContent}
                  </Text>
                  <Pressable
                    onPress={() => void openReportPostDetail(report)}
                    disabled={cardDisabled}
                    className="mt-3 rounded-full py-2.5 items-center border"
                    style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent, opacity: cardDisabled ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-extrabold" style={{ color: theme.accentText }}>
                      View post details
                    </Text>
                  </Pressable>
                  <View className="flex-row gap-2 mt-3">
                    {isReReviewPending ? (
                      <>
                        <Pressable
                          onPress={() => handleApproveReReviewFromReport(report)}
                          disabled={cardDisabled}
                          className="flex-1 rounded-full py-2.5 items-center"
                          style={{ backgroundColor: theme.accent, opacity: cardDisabled ? 0.5 : 1 }}
                        >
                          <Text className="text-xs font-extrabold" style={{ color: "#ffffff" }}>
                            Restore Post
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDismissReReviewFromReport(report)}
                          disabled={cardDisabled}
                          className="flex-1 rounded-full py-2.5 items-center"
                          style={{ backgroundColor: "#ef4444", opacity: cardDisabled ? 0.5 : 1 }}
                        >
                          <Text className="text-xs font-extrabold" style={{ color: "#ffffff" }}>
                            Keep Hidden
                          </Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable
                          onPress={() => void handleBlock(report)}
                          disabled={cardDisabled}
                          className="flex-1 rounded-full py-2.5 items-center"
                          style={{ backgroundColor: "#ef4444", opacity: cardDisabled ? 0.5 : 1 }}
                        >
                          <Text className="text-xs font-extrabold" style={{ color: "#ffffff" }}>
                            {report.targetType === "comment" ? "Block Comment" : "Block Post"}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDismiss(report)}
                          disabled={cardDisabled}
                          className="flex-1 rounded-full py-2.5 items-center border"
                          style={[cardStyle, cardDisabled ? { opacity: 0.5 } : undefined]}
                        >
                          <Text className="text-xs font-extrabold" style={textSecondary}>
                            Dismiss
                          </Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <>
            {renderReportTotalsHeader(
              "Total reviewed",
              uniqueReviewedReports.length,
              "#3b82f6",
              "All posts and comments below have already been reviewed. You can restore a blocked post or comment, block a dismissed item, move items back to pending, or remove records from this admin list (author content stays on their profile)."
            )}
            <CommunitySearchBar
              value={reviewedReportSearch}
              onChangeText={setReviewedReportSearch}
              placeholder="Search reports..."
              className="mb-0"
              wrapRef={reviewedReportSearchWrapRef}
              onFocus={() => scrollReportSearchIntoView(reviewedReportSearchWrapRef)}
            />
            <View
              className="flex-row gap-3"
              style={openReportFilter ? { zIndex: 30, elevation: 30, overflow: "visible" } : undefined}
            >
              <ReportFilterDropdown
                label="Status"
                value={reviewedReportStatusFilter}
                options={reportStatusOptions}
                onChange={setReviewedReportStatusFilter}
                open={openReportFilter === "reviewed-status"}
                onOpenChange={(next) => setOpenReportFilter(next ? "reviewed-status" : null)}
              />
            </View>
            {uniqueReviewedReports.length === 0 ? (
              <Text className="text-sm text-center py-6" style={textMuted}>
                No reviewed reports yet.
              </Text>
            ) : filteredReviewedReports.length === 0 ? (
              <Text className="text-sm text-center py-6" style={textMuted}>
                No reports match your search or filters.
              </Text>
            ) : null}
            {filteredReviewedReports.map((report) => {
              const busy = reportActionId === report.id;
              const isResolved = report.status === "resolved";
              const isDismissed = report.status === "dismissed";
              const cardDisabled = reportDeleteMode || busy;
              const selected = selectedReportDeleteIds.includes(report.id);
              return (
                <View
                  key={report.id}
                  className="rounded-2xl px-4 py-4 border"
                  style={[
                    cardStyle,
                    reportDeleteMode && selected
                      ? { borderColor: theme.accent, borderWidth: 2 }
                      : undefined,
                  ]}
                >
                  {reportDeleteMode ? (
                    <Pressable
                      onPress={() => toggleReportDeleteSelection(report.id)}
                      className="flex-row items-start justify-between gap-2"
                    >
                      <View className="flex-row items-center flex-1 min-w-0">
                        {renderReportSelectionCheckbox(report.id)}
                        <Text
                          className="text-xs font-extrabold uppercase flex-1"
                          style={{ color: theme.accentText }}
                        >
                          {report.source === "re_review"
                            ? `Request review · ${report.targetType}`
                            : report.source === "admin_direct"
                              ? `Admin block · ${report.targetType}`
                              : `Reported · ${report.targetType}`}
                        </Text>
                      </View>
                      <Text
                        className="text-xs font-extrabold text-right shrink max-w-[50%]"
                        style={textPrimary}
                        numberOfLines={2}
                      >
                        {report.source === "re_review"
                          ? "Request review by "
                          : report.source === "admin_direct"
                            ? "Blocked by "
                            : "Reported by "}
                        <Text
                          style={{ color: theme.accentText }}
                          onPress={() => void openCommunityUserProfile(report.reporterId)}
                        >
                          {report.reporterName}
                        </Text>
                      </Text>
                    </Pressable>
                  ) : (
                    <View className="flex-row items-start justify-between gap-2">
                      <Text
                        className="text-xs font-extrabold uppercase flex-1"
                        style={{ color: theme.accentText }}
                      >
                        {report.source === "re_review"
                          ? `Request review · ${report.targetType}`
                          : report.source === "admin_direct"
                            ? `Admin block · ${report.targetType}`
                            : `Reported · ${report.targetType}`}
                      </Text>
                      <Text
                        className="text-xs font-extrabold text-right shrink max-w-[55%]"
                        style={textPrimary}
                        numberOfLines={2}
                      >
                        {report.source === "re_review"
                          ? "Request review by "
                          : report.source === "admin_direct"
                            ? "Blocked by "
                            : "Reported by "}
                        <Text
                          style={{ color: theme.accentText }}
                          onPress={() => void openCommunityUserProfile(report.reporterId)}
                        >
                          {report.reporterName}
                        </Text>
                      </Text>
                    </View>
                  )}
                  {report.source === "re_review" && report.requestReason ? (
                    <Text className="text-sm mt-2 font-extrabold" style={textPrimary}>
                      Request reason:{" "}
                      <Text className="font-extrabold" style={{ color: "#16a34a" }}>
                        {report.requestReason}
                      </Text>
                    </Text>
                  ) : null}
                  <Text
                    className={`text-sm font-extrabold ${
                      report.source === "re_review" && report.requestReason ? "mt-1" : "mt-2"
                    }`}
                    style={textPrimary}
                  >
                    {report.source === "re_review"
                      ? "Keep hidden reason: "
                      : report.source === "admin_direct"
                        ? "Block reason: "
                        : "Report reason: "}
                    <Text className="font-extrabold" style={{ color: "#16a34a" }}>
                      {report.reason}
                    </Text>
                  </Text>
                  <Text className="text-sm mt-1 font-extrabold" style={textPrimary}>
                    Status:{" "}
                    <Text className="font-extrabold" style={{ color: "#ef4444" }}>
                      {report.status === "resolved" ? "Blocked" : "Dismissed"}
                    </Text>
                  </Text>
                  <Text
                    className="text-sm mt-3 rounded-xl px-3 py-3 border"
                    style={[
                      { backgroundColor: theme.rowBg, borderColor: theme.cardBorder },
                      textSecondary,
                    ]}
                  >
                    {report.targetContent}
                  </Text>
                  <Pressable
                    onPress={() => void openReportPostDetail(report)}
                    disabled={cardDisabled}
                    className="mt-3 rounded-full py-2.5 items-center border"
                    style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent, opacity: cardDisabled ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-extrabold" style={{ color: theme.accentText }}>
                      View post details
                    </Text>
                  </Pressable>
                  <View className="flex-row gap-2 mt-3">
                    {isResolved ? (
                      <Pressable
                        onPress={() =>
                          report.targetType === "comment"
                            ? handleRestoreComment(report)
                            : handleRestorePost(report)
                        }
                        disabled={cardDisabled}
                        className="flex-1 rounded-full py-2.5 items-center"
                        style={{ backgroundColor: theme.accent, opacity: cardDisabled ? 0.5 : 1 }}
                      >
                        <Text className="text-xs font-extrabold" style={{ color: "#ffffff" }}>
                          {report.targetType === "comment" ? "Restore Comment" : "Restore Post"}
                        </Text>
                      </Pressable>
                    ) : null}
                    {isDismissed ? (
                      <Pressable
                        onPress={() => void handleBlock(report)}
                        disabled={cardDisabled}
                        className="flex-1 rounded-full py-2.5 items-center"
                        style={{ backgroundColor: "#ef4444", opacity: cardDisabled ? 0.5 : 1 }}
                      >
                        <Text className="text-xs font-extrabold" style={{ color: "#ffffff" }}>
                          {report.targetType === "comment" ? "Block Comment" : "Block Post"}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => handleReopenReport(report)}
                      disabled={cardDisabled}
                      className="flex-1 rounded-full py-2.5 items-center"
                      style={{ backgroundColor: "#2563eb", opacity: cardDisabled ? 0.5 : 1 }}
                    >
                      <Text className="text-xs font-extrabold" style={{ color: "#ffffff" }}>
                        Move to Pending
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
    );
  };

  const renderUsersTab = () => (
    <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 12, paddingTop: 12 }}>
      <AdminTabHeader title="User Management" right={<AdminBadge />} />
      <Text className="text-sm font-bold mb-3" style={{ color: theme.accentText }}>
        {filteredUsers.length === users.length
          ? `${users.length} registered users`
          : `${filteredUsers.length} of ${users.length} users`}
      </Text>
      <CommunitySearchBar
        className="mb-4"
        value={userSearch}
        onChangeText={setUserSearch}
        placeholder="Search by name or email"
      />
      <View className="rounded-[28px] p-5 gap-3" style={cardStyle}>
        {users.length === 0 ? (
          <Text className="text-sm text-center py-8" style={textMuted}>
            No registered users yet.
          </Text>
        ) : filteredUsers.length === 0 ? (
          <Text className="text-sm text-center py-8" style={textMuted}>
            No users match your search.
          </Text>
        ) : null}
        {filteredUsers.map((user) => {
          const busy = userManagementActionId === user.id;
          return (
          <View
            key={user.id}
            className="rounded-2xl px-4 py-4"
            style={surfaceStyle}
          >
            <View className="flex-row items-center">
              <ProfileAvatar uri={avatarFor(user.id, user.profileImage)} size={40} />
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
                className="rounded-full px-4 py-2 border flex-row items-center"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.accent }}
              >
                <Ionicons name="eye-outline" size={14} color={theme.accentText} />
                <Text className="text-xs font-extrabold ml-1.5" style={{ color: theme.accentText }}>
                  View Profile
                </Text>
              </Pressable>
            </View>
            <View className="flex-row gap-2 mt-3">
              <Pressable
                onPress={() => handleResendPasswordReset(user)}
                disabled={busy}
                className="flex-1 rounded-full py-2.5 items-center border flex-row justify-center"
                style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent, opacity: busy ? 0.6 : 1 }}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : (
                  <>
                    <Ionicons name="mail-outline" size={14} color={theme.accent} />
                    <Text className="text-xs font-semibold ml-1.5" style={{ color: theme.accentText }}>
                      Resend password link
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        );
        })}
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
    const profilePhotoUri = avatarFor(currentUserId, myProfileImage);

    return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 12, paddingTop: 12 }}
      style={{ backgroundColor: theme.screenBg }}
    >
      <ProfileScreenHeader
        title="Profile"
        onBack={() => {
          const prev = previousAdminTabRef.current;
          switchAdminTab(prev === "profile" ? "community" : prev);
        }}
        titleClassName="text-3xl"
      />

      <View className="items-center mb-6">
        <View
          className="w-36 h-36 rounded-full border-4 items-center justify-center overflow-hidden"
          style={{ borderColor: theme.accent, backgroundColor: theme.accentSoft }}
        >
          {profilePhotoUri ? (
            <Image
              source={{ uri: profilePhotoUri }}
              style={{ width: 144, height: 144 }}
              contentFit="cover"
            />
          ) : (
            <Ionicons name="person" size={56} color={theme.accent} />
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
        onPress={handleLogout}
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
    <View className="flex-1" style={[screenStyle, { paddingTop: insets.top + 12 }]}>
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

      {activeTab === "community" && communitySubTab === "feed" ? (
        <Pressable
          onPress={() => {
            setEditingPost(null);
            setComposerVisible(true);
          }}
          className="absolute right-5 flex-row items-center rounded-full px-6 py-4 shadow-lg z-10"
          style={{ bottom: insets.bottom + 72, backgroundColor: theme.accent }}
          accessibilityRole="button"
          accessibilityLabel="New post"
        >
          <Ionicons name="add" size={28} color="white" />
          <Text className="text-base font-extrabold text-white ml-1.5">New post</Text>
        </Pressable>
      ) : null}

      {activeTab === "reports" && reportDeleteMode ? (
        <View
          className="px-4 pt-2 pb-2 border-t"
          style={{ backgroundColor: theme.screenBg, borderTopColor: theme.cardBorder }}
        >
          <Pressable
            onPress={() =>
              handleConfirmBulkPermanentDelete(
                reportsSubTab === "pending" ? filteredPendingReports : filteredReviewedReports
              )
            }
            disabled={selectedReportDeleteIds.length === 0 || reportBulkDeleting}
            className="rounded-full py-3.5 items-center flex-row justify-center"
            style={{
              backgroundColor: "#ef4444",
              opacity: selectedReportDeleteIds.length === 0 || reportBulkDeleting ? 0.5 : 1,
            }}
          >
            {reportBulkDeleting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#ffffff" />
                <Text className="text-sm font-extrabold text-white ml-1.5">
                  Confirm delete ({selectedReportDeleteIds.length})
                </Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      {!(activeTab === "reports" && reportsKeyboardHeight > 0) ? (
      <View
        className="flex-row px-2 pt-2"
        style={[navStyle, { paddingBottom: insets.bottom + 8 }]}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          const badge =
            tab.key === "reports" && pendingReports.length > 0
              ? pendingReports.length
              : tab.key === "community" && totalUnreadChats > 0
                ? totalUnreadChats
                : 0;
          return (
            <Pressable
              key={tab.key}
              onPress={() => switchAdminTab(tab.key)}
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
      ) : null}

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
                  <ProfileAvatar uri={avatarFor(selectedUser.id, selectedUser.profileImage)} size={72} />
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
                  onPress={() => {
                    const user = selectedUser;
                    setUserDetailVisible(false);
                    setSelectedUser(null);
                    void openCommunityUserProfile(user.id);
                  }}
                  className="rounded-full py-3.5 items-center mb-3 flex-row justify-center border"
                  style={{ backgroundColor: theme.cardBg, borderColor: theme.accent }}
                >
                  <Ionicons name="person-outline" size={18} color={theme.accentText} />
                  <Text className="text-sm font-extrabold ml-2" style={{ color: theme.accentText }}>
                    View community profile
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => void handleChatWithUser(selectedUser)}
                  disabled={openingChat}
                  className="rounded-full py-3.5 items-center mb-3 flex-row justify-center"
                  style={{ backgroundColor: theme.accent }}
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
                  onPress={() => handleResendPasswordReset(selectedUser)}
                  disabled={userManagementActionId === selectedUser.id}
                  className="rounded-full py-3 items-center border flex-row justify-center mb-3"
                  style={{
                    backgroundColor: theme.accentSoft,
                    borderColor: theme.accent,
                    opacity: userManagementActionId === selectedUser.id ? 0.6 : 1,
                  }}
                >
                  <Ionicons name="mail-outline" size={14} color={theme.accent} />
                  <Text className="text-xs font-semibold ml-1.5" style={{ color: theme.accentText }}>
                    Resend password link
                  </Text>
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

      <Modal
        visible={passwordVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordVisible(false)}
      >
        <View
          className="flex-1 items-center justify-center"
          style={{
            backgroundColor: theme.modalOverlay,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 20,
          }}
        >
          <Pressable className="absolute inset-0" onPress={() => setPasswordVisible(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: reportDetailModalWidth, zIndex: 1 }}
          >
            <View
              className="rounded-[28px] px-5 pt-5 pb-6 border"
              style={[
                modalCardStyle,
                { borderColor: theme.accent, backgroundColor: theme.modalBg },
              ]}
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
                  className="flex-1 rounded-full py-3.5 items-center"
                  style={{ backgroundColor: theme.accent }}
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
        onShare={() => {
          if (!menuPost) return;
          setSharePost(menuPost);
          setMenuPost(null);
        }}
      />

      <SharePostToChatModal
        visible={sharePost !== null}
        post={sharePost}
        chats={chats}
        currentUserId={currentUserId}
        adminUid={currentUserId}
        onClose={() => setSharePost(null)}
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
          void openCommunityUserProfile(userId);
        }}
      />

      <UserProfileModal
        visible={profileUserId !== null}
        profile={profileData}
        posts={profilePosts}
        relation="none"
        loading={profileLoading}
        isSelf={profileUserId === currentUserId}
        isSupportAdmin={false}
        canAddFriend={false}
        onClose={() => {
          setProfileUserId(null);
          setProfileData(null);
        }}
        onAddFriend={() => {}}
        onChat={
          profileUserId && profileUserId !== currentUserId && profileData
            ? () => {
                void openChatWithUserId(
                  profileUserId,
                  profileData.name,
                  profileData.profileImage
                );
              }
            : undefined
        }
        onOpenPost={(postId) => {
          setProfileUserId(null);
          setProfileData(null);
          openPostDetail(postId);
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
        showAchievements={false}
        initial={
          editingPost
            ? {
                content: editingPost.content,
                tags: editingPost.tags,
                achievementIds: editingPost.achievementIds ?? [],
                imageUris: editingPost.imageUrls,
              }
            : postText.trim()
              ? {
                  content: postText,
                  tags: [],
                  achievementIds: [],
                  imageUris: [],
                }
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
        title={
          blockTarget?.type === "reReview"
            ? "Keep Post Hidden"
            : blockTarget?.type === "comment" ||
                (blockTarget?.type === "report" && blockTarget.report?.targetType === "comment")
              ? "Block Comment"
              : "Block Post"
        }
        description={
          blockTarget?.type === "reReview"
            ? "Choose a reason for keeping this post hidden. The author will be notified via Support Admin chat."
            : blockTarget?.type === "report" && blockTarget.report?.targetType === "comment"
              ? "Choose a reason for blocking this reported comment. The reporter and author will be notified via Support Admin chat."
              : blockTarget?.type === "report"
                ? "Choose a reason for blocking this reported post. The reporter and author will be notified via Support Admin chat."
                : blockTarget?.type === "comment"
                  ? "Provide a reason. The comment author will be notified via Support Admin chat, and this action will appear under Reviewed."
                  : "Provide a reason. The content author will receive this via Support Admin chat, and this action will appear under Reviewed."
        }
        presetReasons={
          blockTarget?.type === "report" || blockTarget?.type === "reReview"
            ? ADMIN_BLOCK_POST_REASONS
            : undefined
        }
        onClose={() => setBlockTarget(null)}
        onConfirm={handleConfirmBlock}
      />

      <Modal
        visible={reportDetailReport !== null}
        transparent
        animationType="fade"
        onRequestClose={closeReportDetailModal}
      >
        <View
          className="flex-1 items-center justify-center"
          style={{
            backgroundColor: theme.modalOverlay,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 20,
          }}
        >
          <Pressable className="absolute inset-0" onPress={closeReportDetailModal} />
          <View
            className="rounded-[28px] border overflow-hidden"
            style={[
              modalCardStyle,
              {
                width: reportDetailModalWidth,
                maxHeight: reportDetailModalMaxHeight,
                borderColor: theme.accent,
                backgroundColor: theme.modalBg,
                zIndex: 1,
              },
            ]}
          >
            <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
              <View className="w-10" />
              <Text className="text-xl font-extrabold flex-1 text-center px-2" style={textPrimary}>
                {reportDetailReport?.targetType === "comment"
                  ? "Post & comment details"
                  : "Post details"}
              </Text>
              <Pressable
                onPress={closeReportDetailModal}
                className="w-10 h-10 rounded-full items-center justify-center"
                style={surfaceStyle}
              >
                <Ionicons name="close" size={22} color={theme.iconMuted} />
              </Pressable>
            </View>

            {reportDetailLoading ? (
              <View className="py-12 items-center px-5">
                <ActivityIndicator size="large" color={theme.accentText} />
              </View>
            ) : reportDetailPost ? (
              <ScrollView
                style={{ maxHeight: reportDetailScrollMaxHeight }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
                showsVerticalScrollIndicator
                bounces={false}
                keyboardShouldPersistTaps="handled"
              >
                {renderReportDetailPostSummary()}
                {reportDetailReport?.targetType === "post" ? (
                  <View
                    className="mt-4 rounded-2xl px-4 py-3 border"
                    style={{ backgroundColor: theme.dangerSoft, borderColor: theme.danger }}
                  >
                    <Text className="text-xs font-extrabold uppercase" style={{ color: theme.danger }}>
                      Report
                    </Text>
                    <Text className="text-sm mt-2 leading-5" style={textSecondary}>
                      By{" "}
                      <Text
                        style={{ color: theme.accentText, fontWeight: "800" }}
                        onPress={() =>
                          reportDetailReport
                            ? void openCommunityUserProfile(reportDetailReport.reporterId)
                            : undefined
                        }
                      >
                        {reportDetailReport.reporterName}
                      </Text>
                      : {reportDetailReport.reason}
                    </Text>
                  </View>
                ) : null}
                {reportDetailReport?.targetType === "comment"
                  ? renderReportDetailReportedCommentSection()
                  : null}
              </ScrollView>
            ) : reportDetailReport?.targetType === "comment" ? (
              <ScrollView
                style={{ maxHeight: reportDetailScrollMaxHeight }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
                showsVerticalScrollIndicator
                bounces={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text className="text-sm text-center py-4" style={textMuted}>
                  The original post is no longer available.
                </Text>
                {renderReportDetailReportedCommentSection()}
              </ScrollView>
            ) : (
              <View className="px-5 pb-8">
                <Text className="text-sm text-center py-8" style={textMuted}>
                  Post not found. It may have been removed already.
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <AppearanceModal visible={appearanceVisible} onClose={() => setAppearanceVisible(false)} />

      <Modal
        visible={manageMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setManageMenuVisible(false)}
      >
        <View className="flex-1 justify-center px-8" style={{ backgroundColor: theme.modalOverlay }}>
          <Pressable className="absolute inset-0" onPress={() => setManageMenuVisible(false)} />
          <View className="rounded-[24px] overflow-hidden" style={modalCardStyle}>
            <Text className="text-lg font-extrabold px-5 pt-5 pb-2" style={textPrimary}>
              Manage
            </Text>
            {(
              [
                { key: "liked", label: "My like", icon: "heart-outline" as const },
                { key: "commented", label: "My comment", icon: "chatbubble-outline" as const },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => {
                  setManageFilter(opt.key);
                  setManageMenuVisible(false);
                }}
                className="px-5 py-4 border-b flex-row items-center gap-3"
                style={{ borderBottomColor: theme.cardBorder }}
              >
                <Ionicons name={opt.icon} size={20} color={theme.textPrimary} />
                <Text className="text-base font-bold flex-1" style={textPrimary}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setManageMenuVisible(false)} className="px-5 py-4">
              <Text className="text-center text-base font-bold" style={textMuted}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
