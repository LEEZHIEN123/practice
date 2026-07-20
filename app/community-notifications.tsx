import { Pressable } from "@/components/Pressable";
import { UserProfileModal } from "@/components/community/UserProfileModal";
import {
    ProfileScreenHeader,
    ThemedCard,
    ThemedScreen,
    ThemedText,
    useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import { formatChatMessageTime } from "@/lib/chatMessageUtils";
import {
    acceptFriendRequest,
    deleteNotification,
    deleteNotifications,
    getPostsByAuthor,
    getPublicUserProfile,
    loadFriendRelations,
    markNotificationRead,
    markNotificationUnread,
    markNotificationsRead,
    rejectFriendRequest,
    resolveFriendRequestNotification,
    subscribeNotifications,
    subscribePosts,
    SUPPORT_ADMIN_NAME,
} from "@/lib/communityService";
import type { CommunityNotification, CommunityPost, FriendRelation, PublicUserProfile } from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";
import type { FriendRequest } from "../lib/communityTypes";

function ProfileAvatar({
  uri,
  size = 48,
  isSupportAdmin = false,
}: {
  uri: string | null;
  size?: number;
  isSupportAdmin?: boolean;
}) {
  const { theme } = useThemedScreen();
  return (
    <View
      className="rounded-full items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        backgroundColor: isSupportAdmin ? "#dbeafe" : theme.accent,
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Ionicons
          name={isSupportAdmin ? "shield-checkmark" : "person"}
          size={size * 0.42}
          color={isSupportAdmin ? "#2563eb" : "white"}
        />
      )}
    </View>
  );
}

export default function CommunityNotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cardStyle, theme } = useThemedScreen();
  const { rowBorderStyle } = useProfileCardStyles();
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [allPosts, setAllPosts] = useState<CommunityPost[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<PublicUserProfile | null>(null);
  const [profileRelation, setProfileRelation] = useState<FriendRelation>("none");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFriendBusy, setProfileFriendBusy] = useState(false);
  const [activeFriendNotification, setActiveFriendNotification] =
    useState<CommunityNotification | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(auth.currentUser?.uid ?? null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUserId(user?.uid ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeNotifications(setNotifications);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribePosts(setAllPosts);
    return unsub;
  }, []);

  const profilePosts = useMemo(
    () => (profileUserId ? getPostsByAuthor(allPosts, profileUserId, currentUserId) : []),
    [allPosts, profileUserId, currentUserId]
  );

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  const selectedCount = selectedIds.length;
  const allSelected = notifications.length > 0 && selectedCount === notifications.length;

  const exitManageMode = () => {
    setManageMode(false);
    setSelectedIds([]);
  };

  const toggleManageMode = () => {
    if (manageMode) {
      exitManageMode();
      return;
    }
    setActionMenuId(null);
    setManageMode(true);
  };

  const toggleSelected = (notificationId: string) => {
    setSelectedIds((current) =>
      current.includes(notificationId)
        ? current.filter((id) => id !== notificationId)
        : [...current, notificationId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : notifications.map((notification) => notification.id));
  };

  const loadFriendRequest = async (requestId: string): Promise<FriendRequest | null> => {
    const snap = await getDoc(doc(db, "friendRequests", requestId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      fromUserId: String(data.fromUserId ?? ""),
      fromUserName: String(data.fromUserName ?? "User"),
      fromUserProfileImage:
        typeof data.fromUserProfileImage === "string" ? data.fromUserProfileImage : null,
      toUserId: String(data.toUserId ?? ""),
      toUserName: String(data.toUserName ?? "User"),
      toUserProfileImage:
        typeof data.toUserProfileImage === "string" ? data.toUserProfileImage : null,
      status: data.status === "accepted" || data.status === "rejected" ? data.status : "pending",
      createdAt: Number(data.createdAt ?? 0),
    };
  };

  const openFriendRequestProfile = async (notification: CommunityNotification) => {
    if (!notification.fromUserId) return;
    setActiveFriendNotification(notification);
    setProfileUserId(notification.fromUserId);
    setProfileLoading(true);
    setProfileData(null);
    try {
      const profile = await getPublicUserProfile(notification.fromUserId);
      setProfileData(profile);
      const relations = await loadFriendRelations([notification.fromUserId]);
      setProfileRelation(relations[notification.fromUserId] ?? "pending_incoming");
    } catch {
      Alert.alert("Error", "Could not load profile.");
      setProfileUserId(null);
      setActiveFriendNotification(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const closeProfile = () => {
    setProfileUserId(null);
    setProfileData(null);
    setActiveFriendNotification(null);
    setProfileRelation("none");
  };

  const handleAcceptFromProfile = async () => {
    if (!activeFriendNotification?.friendRequestId) return;
    try {
      setProfileFriendBusy(true);
      const request = await loadFriendRequest(activeFriendNotification.friendRequestId);
      if (!request || request.status !== "pending") {
        Alert.alert("Unavailable", "This friend request is no longer pending.");
        if (request?.status === "accepted") {
          await resolveFriendRequestNotification(activeFriendNotification.id, "accepted");
        } else if (request?.status === "rejected") {
          await resolveFriendRequestNotification(activeFriendNotification.id, "rejected");
        }
        closeProfile();
        return;
      }
      await acceptFriendRequest(request);
      await resolveFriendRequestNotification(activeFriendNotification.id, "accepted");
      setProfileRelation("friends");
      Alert.alert(
        "Friend added",
        `You are now friends with ${activeFriendNotification.fromUserName}.`
      );
      closeProfile();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not accept request.");
    } finally {
      setProfileFriendBusy(false);
    }
  };

  const handleDeclineFromProfile = async () => {
    if (!activeFriendNotification?.friendRequestId) return;
    try {
      setProfileFriendBusy(true);
      await rejectFriendRequest(activeFriendNotification.friendRequestId);
      await resolveFriendRequestNotification(activeFriendNotification.id, "rejected");
      closeProfile();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not decline request.");
    } finally {
      setProfileFriendBusy(false);
    }
  };

  const handleMarkUnread = async (notification: CommunityNotification) => {
    if (!notification.read) return;
    try {
      setLoadingAction(notification.id);
      await markNotificationUnread(notification.id);
      setActionMenuId(null);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not update notification.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleMarkRead = async (notification: CommunityNotification) => {
    if (notification.read) return;
    try {
      setLoadingAction(notification.id);
      await markNotificationRead(notification.id);
      setActionMenuId(null);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not update notification.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async (notification: CommunityNotification) => {
    try {
      setLoadingAction(notification.id);
      setActionMenuId(null);
      await deleteNotification(notification.id);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not delete notification.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleBulkMarkRead = async () => {
    if (selectedIds.length === 0) return;
    try {
      setBulkLoading(true);
      await markNotificationsRead(selectedIds);
      exitManageMode();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not mark notifications as read.");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    Alert.alert(
      "Delete notifications",
      `Delete ${selectedIds.length} selected notification${selectedIds.length === 1 ? "" : "s"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                setBulkLoading(true);
                await deleteNotifications(selectedIds);
                exitManageMode();
              } catch (e: unknown) {
                Alert.alert(
                  "Error",
                  e instanceof Error ? e.message : "Could not delete notifications."
                );
              } finally {
                setBulkLoading(false);
              }
            })();
          },
        },
      ]
    );
  };

  const handleOpen = async (notification: CommunityNotification) => {
    if (manageMode) {
      toggleSelected(notification.id);
      return;
    }

    if (
      notification.type === "friend_request" &&
      notification.friendRequestId &&
      (notification.friendRequestStatus ?? "pending") === "pending"
    ) {
      await openFriendRequestProfile(notification);
      return;
    }

    if (
      (notification.type === "post_like" ||
        notification.type === "post_comment" ||
        notification.type === "post_reported" ||
        notification.type === "comment_reported") &&
      notification.postId
    ) {
      if (!notification.read) {
        try {
          await markNotificationRead(notification.id);
        } catch {
          // Continue navigation even if marking read fails.
        }
      }
      router.push({
        pathname: "/community-post" as any,
        params: { postId: notification.postId },
      });
    }
  };

  const isReportNotice = (notification: CommunityNotification) =>
    notification.type === "post_reported" || notification.type === "comment_reported";

  const notificationMessage = (notification: CommunityNotification) => {
    switch (notification.type) {
      case "friend_request":
        if (notification.friendRequestStatus === "accepted") {
          return "You accepted the friend request";
        }
        if (notification.friendRequestStatus === "rejected") {
          return "You declined the friend request";
        }
        return "sent you a friend request";
      case "friend_accepted":
        return "accepted your friend request";
      case "post_like":
        return "liked your post";
      case "post_comment":
        return "commented on your post";
      case "post_reported":
        return "Your post is hidden and pending Support Admin review";
      case "comment_reported":
        return "Your comment is hidden and pending Support Admin review";
      default:
        return "sent you a notification";
    }
  };

  const notificationTitle = (notification: CommunityNotification) => {
    if (isReportNotice(notification)) return SUPPORT_ADMIN_NAME;
    return notification.fromUserName;
  };

  const isPendingFriendRequest = (notification: CommunityNotification) =>
    notification.type === "friend_request" &&
    Boolean(notification.friendRequestId) &&
    (notification.friendRequestStatus ?? "pending") === "pending";

  return (
    <ThemedScreen>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + (manageMode ? 96 : 24),
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
        onScrollBeginDrag={() => setActionMenuId(null)}
      >
        <ProfileScreenHeader
          title="Notifications"
          onBack={() => (manageMode ? exitManageMode() : router.back())}
          titleBadgeCount={manageMode ? undefined : unreadCount}
          rightSlot={
            notifications.length > 0 ? (
              <Pressable
                onPress={toggleManageMode}
                className="w-12 h-12 rounded-full items-center justify-center active:opacity-70"
                style={cardStyle}
              >
                <Ionicons
                  name={manageMode ? "close" : "options-outline"}
                  size={22}
                  color={theme.textPrimary}
                />
              </Pressable>
            ) : null
          }
        />

        {manageMode ? (
          <Pressable
            onPress={toggleSelectAll}
            className="flex-row items-center mb-3 px-1 active:opacity-70"
          >
            <Ionicons
              name={allSelected ? "checkbox" : "square-outline"}
              size={20}
              color={theme.accentText}
            />
            <ThemedText className="text-sm font-extrabold ml-2">
              {allSelected ? "Deselect all" : "Select all"}
            </ThemedText>
            {selectedCount > 0 ? (
              <ThemedText variant="muted" className="text-sm ml-2">
                ({selectedCount} selected)
              </ThemedText>
            ) : null}
          </Pressable>
        ) : null}

        <ThemedCard className="p-5 gap-3" rounded="2xl">
          {notifications.length === 0 ? (
            <ThemedText variant="muted" className="text-sm text-center py-8">
              No notifications yet.
            </ThemedText>
          ) : null}

          {notifications.map((notification) => {
            const busy = loadingAction === notification.id;
            const unread = !notification.read;
            const showActions = !manageMode && actionMenuId === notification.id;
            const pendingFriend = isPendingFriendRequest(notification);
            const selected = selectedIds.includes(notification.id);
            return (
              <View
                key={notification.id}
                className="rounded-2xl px-4 py-4 border"
                style={[
                  unread
                    ? { backgroundColor: theme.accentSoft, borderColor: theme.accentText }
                    : { backgroundColor: theme.rowBg, borderColor: theme.cardBorder },
                  manageMode && selected
                    ? { borderColor: theme.accent, borderWidth: 2 }
                    : undefined,
                  { position: "relative" },
                ]}
              >
                {unread && !manageMode ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      minWidth: 18,
                      height: 18,
                      paddingHorizontal: 4,
                      borderRadius: 9,
                      backgroundColor: "#ef4444",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 1,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "800", color: "#ffffff" }}>1</Text>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => {
                    if (showActions) {
                      setActionMenuId(null);
                      return;
                    }
                    void handleOpen(notification);
                  }}
                  onLongPress={() => {
                    if (manageMode) return;
                    setActionMenuId((current) =>
                      current === notification.id ? null : notification.id
                    );
                  }}
                  delayLongPress={280}
                >
                  <View className="flex-row items-center">
                    {manageMode ? (
                      <View className="mr-3">
                        <Ionicons
                          name={selected ? "checkbox" : "square-outline"}
                          size={22}
                          color={selected ? theme.accentText : theme.iconMuted}
                        />
                      </View>
                    ) : null}
                    <ProfileAvatar
                      uri={notification.fromUserProfileImage}
                      size={44}
                      isSupportAdmin={isReportNotice(notification)}
                    />
                    <View className="flex-1 ml-3" style={unread && !manageMode ? { paddingRight: 14 } : undefined}>
                      <View className="flex-row items-start justify-between gap-2">
                        <ThemedText className="text-sm font-extrabold flex-1">
                          {notificationTitle(notification)}
                        </ThemedText>
                        <ThemedText variant="muted" className="text-[10px]">
                          {formatChatMessageTime(notification.createdAt)}
                        </ThemedText>
                      </View>
                      <ThemedText variant="secondary" className="text-sm mt-1">
                        {notificationMessage(notification)}
                      </ThemedText>
                      {notification.postPreview ? (
                        <ThemedText variant="muted" className="text-xs mt-1" numberOfLines={2}>
                          {notification.postPreview}
                        </ThemedText>
                      ) : null}
                    </View>
                  </View>
                </Pressable>

                {pendingFriend && !manageMode ? (
                  <Pressable
                    onPress={() => void openFriendRequestProfile(notification)}
                    disabled={busy}
                    className="mt-3 self-start flex-row items-center rounded-full px-4 py-2 bg-[#52B69A] active:opacity-90"
                  >
                    <Ionicons name="person-add" size={16} color="#ffffff" />
                    <Text className="text-xs font-extrabold text-white ml-1.5">+ Friend</Text>
                  </Pressable>
                ) : null}

                {showActions ? (
                  <View className="flex-row gap-2 mt-3">
                    <Pressable
                      onPress={() =>
                        void (unread ? handleMarkRead(notification) : handleMarkUnread(notification))
                      }
                      disabled={busy}
                      className="flex-1 rounded-full py-2.5 items-center border active:opacity-90"
                      style={[cardStyle, rowBorderStyle, busy ? { opacity: 0.45 } : undefined]}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={theme.textSecondary} />
                      ) : (
                        <ThemedText variant="secondary" className="text-xs font-extrabold">
                          {unread ? "Mark as read" : "Mark as unread"}
                        </ThemedText>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => void handleDelete(notification)}
                      disabled={busy}
                      className="flex-1 rounded-full py-2.5 items-center border active:opacity-90"
                      style={[
                        cardStyle,
                        rowBorderStyle,
                        { borderColor: theme.danger, backgroundColor: `${theme.danger}18` },
                        busy ? { opacity: 0.45 } : undefined,
                      ]}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={theme.danger} />
                      ) : (
                        <Text className="text-xs font-extrabold" style={{ color: theme.danger }}>
                          Delete
                        </Text>
                      )}
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ThemedCard>
      </ScrollView>

      {manageMode ? (
        <View
          className="absolute left-0 right-0 flex-row gap-3 px-4 pt-3 border-t"
          style={{
            bottom: 0,
            paddingBottom: insets.bottom + 12,
            backgroundColor: theme.screenBg,
            borderTopColor: theme.cardBorder,
          }}
        >
          <Pressable
            onPress={() => void handleBulkMarkRead()}
            disabled={selectedCount === 0 || bulkLoading}
            className="flex-1 rounded-full py-3.5 items-center border active:opacity-90"
            style={[
              cardStyle,
              rowBorderStyle,
              selectedCount === 0 || bulkLoading ? { opacity: 0.45 } : undefined,
            ]}
          >
            {bulkLoading ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : (
              <ThemedText variant="secondary" className="text-sm font-extrabold">
                Mark as read
              </ThemedText>
            )}
          </Pressable>
          <Pressable
            onPress={handleBulkDelete}
            disabled={selectedCount === 0 || bulkLoading}
            className="flex-1 rounded-full py-3.5 items-center border active:opacity-90"
            style={[
              cardStyle,
              rowBorderStyle,
              { borderColor: theme.danger, backgroundColor: `${theme.danger}18` },
              selectedCount === 0 || bulkLoading ? { opacity: 0.45 } : undefined,
            ]}
          >
            {bulkLoading ? (
              <ActivityIndicator size="small" color={theme.danger} />
            ) : (
              <Text className="text-sm font-extrabold" style={{ color: theme.danger }}>
                Delete
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <UserProfileModal
        visible={profileUserId !== null}
        profile={profileData}
        posts={profilePosts}
        relation={profileRelation}
        loading={profileLoading}
        isSelf={false}
        canAddFriend={false}
        onClose={closeProfile}
        onAddFriend={() => {}}
        onAcceptFriend={() => void handleAcceptFromProfile()}
        onDeclineFriend={() => void handleDeclineFromProfile()}
        friendActionBusy={profileFriendBusy}
      />
    </ThemedScreen>
  );
}
