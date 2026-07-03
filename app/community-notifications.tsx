import { Pressable } from "@/components/Pressable";
import {
  ProfileScreenHeader,
  ThemedCard,
  ThemedScreen,
  ThemedText,
  useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import type { CommunityNotification } from "@/lib/communityTypes";
import {
  acceptFriendRequest,
  deleteNotification,
  markNotificationRead,
  markNotificationUnread,
  rejectFriendRequest,
  resolveFriendRequestNotification,
  subscribeNotifications,
} from "@/lib/communityService";
import { formatChatMessageTime } from "@/lib/chatMessageUtils";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db } from "../firebaseConfig";
import type { FriendRequest } from "../lib/communityTypes";

function ProfileAvatar({ uri, size = 48 }: { uri: string | null; size?: number }) {
  const { theme } = useThemedScreen();
  return (
    <View
      className="rounded-full items-center justify-center overflow-hidden"
      style={{ width: size, height: size, backgroundColor: theme.accent }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Ionicons name="person" size={size * 0.42} color="white" />
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
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeNotifications(setNotifications);
    return unsub;
  }, []);

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

  const handleAccept = async (notification: CommunityNotification) => {
    if (!notification.friendRequestId) return;
    try {
      setLoadingAction(notification.id);
      const request = await loadFriendRequest(notification.friendRequestId);
      if (!request || request.status !== "pending") {
        Alert.alert("Unavailable", "This friend request is no longer pending.");
        if (request?.status === "accepted") {
          await resolveFriendRequestNotification(notification.id, "accepted");
        } else if (request?.status === "rejected") {
          await resolveFriendRequestNotification(notification.id, "rejected");
        } else {
          await markNotificationRead(notification.id);
        }
        return;
      }
      await acceptFriendRequest(request);
      await resolveFriendRequestNotification(notification.id, "accepted");
      Alert.alert("Friend added", `You are now friends with ${notification.fromUserName}.`);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not accept request.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReject = async (notification: CommunityNotification) => {
    if (!notification.friendRequestId) return;
    try {
      setLoadingAction(notification.id);
      await rejectFriendRequest(notification.friendRequestId);
      await resolveFriendRequestNotification(notification.id, "rejected");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not reject request.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleMarkUnread = async (notification: CommunityNotification) => {
    try {
      await markNotificationUnread(notification.id);
      setActionMenuId(null);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not update notification.");
    }
  };

  const handleDelete = async (notification: CommunityNotification) => {
    try {
      setActionMenuId(null);
      await deleteNotification(notification.id);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not delete notification.");
    }
  };

  const handleOpen = async (notification: CommunityNotification) => {
    if (!notification.read) {
      await markNotificationRead(notification.id);
    }

    if (
      (notification.type === "post_like" || notification.type === "post_comment") &&
      notification.postId
    ) {
      router.push({
        pathname: "/community" as any,
        params: {
          openPostId: notification.postId,
          openComments: notification.type === "post_comment" ? "1" : "0",
        },
      });
    }
  };

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
      default:
        return "sent you a notification";
    }
  };

  return (
    <ThemedScreen>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
        onScrollBeginDrag={() => setActionMenuId(null)}
      >
        <ProfileScreenHeader title="Notifications" onBack={() => router.back()} />

        <ThemedCard className="p-5 gap-3" rounded="2xl">
          {notifications.length === 0 ? (
            <ThemedText variant="muted" className="text-sm text-center py-8">
              No notifications yet.
            </ThemedText>
          ) : null}

          {notifications.map((notification) => {
            const busy = loadingAction === notification.id;
            const unread = !notification.read;
            const showActions = actionMenuId === notification.id;
            return (
              <Pressable
                key={notification.id}
                onPress={() => {
                  if (showActions) {
                    setActionMenuId(null);
                    return;
                  }
                  setActionMenuId(null);
                  void handleOpen(notification);
                }}
                onLongPress={() =>
                  setActionMenuId((current) =>
                    current === notification.id ? null : notification.id
                  )
                }
                delayLongPress={280}
                className="rounded-2xl px-4 py-4 border"
                style={
                  unread
                    ? { backgroundColor: theme.accentSoft, borderColor: theme.accentText }
                    : { backgroundColor: theme.rowBg, borderColor: theme.cardBorder }
                }
              >
                <View className="flex-row items-center">
                  <ProfileAvatar uri={notification.fromUserProfileImage} size={44} />
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-start justify-between gap-2">
                      <ThemedText className="text-sm font-extrabold flex-1">
                        {notification.fromUserName}
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

                {notification.type === "friend_request" &&
                notification.friendRequestId &&
                (notification.friendRequestStatus ?? "pending") === "pending" ? (
                  <View className="flex-row gap-2 mt-3">
                    <Pressable
                      onPress={() => void handleAccept(notification)}
                      disabled={busy}
                      className="flex-1 rounded-full py-2.5 items-center bg-[#52B69A]"
                    >
                      {busy ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <Text className="text-xs font-extrabold" style={{ color: "#ffffff" }}>
                          Accept
                        </Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => void handleReject(notification)}
                      disabled={busy}
                      className="flex-1 rounded-full py-2.5 items-center border active:opacity-90"
                      style={[cardStyle, rowBorderStyle]}
                    >
                      <ThemedText variant="secondary" className="text-xs font-extrabold">
                        Decline
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : null}

                {showActions ? (
                  <View className="flex-row gap-2 mt-3">
                    <Pressable
                      onPress={() => void handleMarkUnread(notification)}
                      disabled={unread}
                      className="flex-1 rounded-full py-2.5 items-center border active:opacity-90"
                      style={[cardStyle, rowBorderStyle, unread ? { opacity: 0.45 } : undefined]}
                    >
                      <ThemedText variant="secondary" className="text-xs font-extrabold">
                        Mark as unread
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleDelete(notification)}
                      className="flex-1 rounded-full py-2.5 items-center border active:opacity-90"
                      style={[
                        cardStyle,
                        rowBorderStyle,
                        { borderColor: theme.danger, backgroundColor: `${theme.danger}18` },
                      ]}
                    >
                      <Text className="text-xs font-extrabold" style={{ color: theme.danger }}>
                        Delete
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ThemedCard>
      </ScrollView>
    </ThemedScreen>
  );
}
