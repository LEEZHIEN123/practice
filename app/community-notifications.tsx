import { Pressable } from "@/components/Pressable";
import type { CommunityNotification } from "@/lib/communityTypes";
import {
  acceptFriendRequest,
  markAllNotificationsRead,
  markNotificationRead,
  rejectFriendRequest,
  resolveFriendRequestNotification,
  subscribeNotifications,
} from "@/lib/communityService";
import { formatChatMessageTime } from "@/lib/chatMessageUtils";
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

export default function CommunityNotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeNotifications(setNotifications);
    return unsub;
  }, []);

  useEffect(() => {
    void markAllNotificationsRead().catch(() => {});
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
    <View className="flex-1 bg-[#f3f4f3]">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
      >
        <View className="flex-row items-center mb-5">
          <Pressable
            onPress={() => router.back()}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <Text className="text-2xl font-extrabold text-gray-900 flex-1">Notifications</Text>
        </View>

        <View className="bg-white rounded-[28px] p-5 border border-gray-200 gap-3">
          {notifications.length === 0 ? (
            <Text className="text-sm text-gray-500 text-center py-8">No notifications yet.</Text>
          ) : null}

          {notifications.map((notification) => {
            const busy = loadingAction === notification.id;
            return (
              <Pressable
                key={notification.id}
                onPress={() => void handleOpen(notification)}
                className={`rounded-2xl px-4 py-4 border ${
                  notification.read ? "bg-[#f9fafb] border-gray-200" : "bg-[#eaf7f0] border-[#52B69A]"
                }`}
              >
                <View className="flex-row items-center">
                  <ProfileAvatar uri={notification.fromUserProfileImage} size={44} />
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-start justify-between gap-2">
                      <Text className="text-sm font-extrabold text-gray-900 flex-1">
                        {notification.fromUserName}
                      </Text>
                      <Text className="text-[10px] text-gray-400">
                        {formatChatMessageTime(notification.createdAt)}
                      </Text>
                    </View>
                    <Text className="text-sm text-gray-600 mt-1">
                      {notificationMessage(notification)}
                    </Text>
                    {notification.postPreview ? (
                      <Text className="text-xs text-gray-400 mt-1" numberOfLines={2}>
                        {notification.postPreview}
                      </Text>
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
                        <Text className="text-xs font-extrabold text-white">Accept</Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => void handleReject(notification)}
                      disabled={busy}
                      className="flex-1 rounded-full py-2.5 items-center bg-white border border-gray-200"
                    >
                      <Text className="text-xs font-extrabold text-gray-600">Decline</Text>
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
