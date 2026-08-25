import { Pressable } from "@/components/Pressable";
import { CommunitySearchBar } from "@/components/community/CommunitySearchBar";
import { ThemedText } from "@/components/themed/ThemedUi";
import {
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  resolveFriendRequestNotificationByRequestId,
  subscribeFriendsList,
  subscribePendingIncomingFriendRequests,
  displayCommunityUserName,
} from "@/lib/communityService";
import type { FriendListEntry, FriendRequest } from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";

function ProfileAvatar({ uri, size = 44 }: { uri: string | null; size?: number }) {
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

type FriendsSectionProps = {
  adminUid: string | null;
  liveNamesById?: Record<string, string>;
  onOpenProfile: (userId: string) => void;
  onOpenChat: (friend: FriendListEntry) => void;
};

function friendDisplayName(
  friend: FriendListEntry,
  adminUid: string | null,
  liveNamesById?: Record<string, string>
): string {
  return displayCommunityUserName(
    friend.id,
    liveNamesById?.[friend.id] ?? friend.name,
    adminUid
  );
}

export function FriendsSection({
  adminUid,
  liveNamesById,
  onOpenProfile,
  onOpenChat,
}: FriendsSectionProps) {
  const { cardStyle, theme, segmentTrackStyle, segmentActiveStyle } = useThemedScreen();
  const [friendsSubTab, setFriendsSubTab] = useState<"friends" | "pending">("friends");
  const [friends, setFriends] = useState<FriendListEntry[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [searchText, setSearchText] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [chattingId, setChattingId] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  useEffect(() => {
    const unsubFriends = subscribeFriendsList(setFriends);
    const unsubPending = subscribePendingIncomingFriendRequests(setPendingRequests);
    return () => {
      unsubFriends();
      unsubPending();
    };
  }, []);

  const filteredFriends = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) return friends;
    return friends.filter((friend) => {
      const name = friendDisplayName(friend, adminUid, liveNamesById);
      return (
        name.toLowerCase().includes(needle) ||
        friend.email.toLowerCase().includes(needle)
      );
    });
  }, [friends, searchText, adminUid, liveNamesById]);

  const filteredPending = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) return pendingRequests;
    return pendingRequests.filter((request) =>
      request.fromUserName.toLowerCase().includes(needle)
    );
  }, [pendingRequests, searchText]);

  const handleRemoveFriend = (friend: FriendListEntry) => {
    const name = friendDisplayName(friend, adminUid, liveNamesById);
    Alert.alert("Remove friend", `Remove ${name} from your friends?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              setRemovingId(friend.id);
              await removeFriend(friend.id);
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not remove friend.");
            } finally {
              setRemovingId(null);
            }
          })();
        },
      },
    ]);
  };

  const handleAccept = async (request: FriendRequest) => {
    try {
      setPendingActionId(request.id);
      await acceptFriendRequest(request);
      await resolveFriendRequestNotificationByRequestId(request.id, "accepted");
      Alert.alert("Friend added", `You are now friends with ${request.fromUserName}.`);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not accept request.");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleReject = (request: FriendRequest) => {
    Alert.alert("Reject request", `Reject friend request from ${request.fromUserName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              setPendingActionId(request.id);
              await rejectFriendRequest(request.id);
              await resolveFriendRequestNotificationByRequestId(request.id, "rejected");
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not reject request.");
            } finally {
              setPendingActionId(null);
            }
          })();
        },
      },
    ]);
  };

  return (
    <View className="gap-4">
      <View className="flex-row rounded-full p-1" style={segmentTrackStyle}>
        <Pressable
          onPress={() => setFriendsSubTab("friends")}
          className="flex-1 rounded-full py-3 items-center mr-1"
          style={friendsSubTab === "friends" ? segmentActiveStyle : undefined}
        >
          <ThemedText
            className="text-sm font-extrabold"
            style={{
              color: friendsSubTab === "friends" ? theme.accentText : theme.textMuted,
            }}
          >
            Friends ({friends.length})
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setFriendsSubTab("pending")}
          className="flex-1 rounded-full py-3 items-center ml-1"
          style={friendsSubTab === "pending" ? segmentActiveStyle : undefined}
        >
          <ThemedText
            className="text-sm font-extrabold"
            style={{
              color: friendsSubTab === "pending" ? theme.accentText : theme.textMuted,
            }}
          >
            Pending ({pendingRequests.length})
          </ThemedText>
        </Pressable>
      </View>

      <CommunitySearchBar
        value={searchText}
        onChangeText={setSearchText}
        placeholder={friendsSubTab === "pending" ? "Search pending..." : "Search friend..."}
        className="mb-0"
      />

      {friendsSubTab === "pending" ? (
        pendingRequests.length === 0 ? (
          <View className="rounded-2xl px-4 py-8 items-center" style={cardStyle}>
            <ThemedText variant="muted" className="text-sm text-center">
              No pending friend requests.
            </ThemedText>
          </View>
        ) : filteredPending.length === 0 ? (
          <View className="rounded-2xl px-4 py-8 items-center" style={cardStyle}>
            <ThemedText variant="muted" className="text-sm text-center">
              No pending requests match your search.
            </ThemedText>
          </View>
        ) : (
          filteredPending.map((request) => {
            const busy = pendingActionId === request.id;
            return (
              <View
                key={request.id}
                className="flex-row items-center rounded-2xl px-4 py-4 mb-2"
                style={cardStyle}
              >
                <Pressable onPress={() => onOpenProfile(request.fromUserId)}>
                  <ProfileAvatar uri={request.fromUserProfileImage} />
                </Pressable>
                <Pressable
                  onPress={() => onOpenProfile(request.fromUserId)}
                  className="flex-1 ml-3 min-w-0"
                >
                  <ThemedText className="text-base font-extrabold" numberOfLines={1}>
                    {request.fromUserName}
                  </ThemedText>
                  <ThemedText variant="muted" className="text-xs mt-0.5">
                    Wants to be friends
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => void handleAccept(request)}
                  disabled={busy}
                  className="w-10 h-10 rounded-full items-center justify-center mr-2"
                  style={{
                    backgroundColor: theme.accentText,
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Ionicons name="checkmark" size={20} color="#ffffff" />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => handleReject(request)}
                  disabled={busy}
                  className="w-10 h-10 rounded-full items-center justify-center border"
                  style={{
                    backgroundColor: theme.dangerSoft,
                    borderColor: theme.danger,
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  <Ionicons name="close" size={20} color={theme.danger} />
                </Pressable>
              </View>
            );
          })
        )
      ) : friends.length === 0 ? (
        <View className="rounded-2xl px-4 py-8 items-center" style={cardStyle}>
          <ThemedText variant="muted" className="text-sm text-center">
            No friends yet. Tap Add friend to find someone.
          </ThemedText>
        </View>
      ) : filteredFriends.length === 0 ? (
        <View className="rounded-2xl px-4 py-8 items-center" style={cardStyle}>
          <ThemedText variant="muted" className="text-sm text-center">
            No friends match your search.
          </ThemedText>
        </View>
      ) : (
        filteredFriends.map((friend) => (
          <View
            key={friend.id}
            className="flex-row items-center rounded-2xl px-4 py-4 mb-2"
            style={cardStyle}
          >
            <Pressable onPress={() => onOpenProfile(friend.id)}>
              <ProfileAvatar uri={friend.profileImage} />
            </Pressable>
            <Pressable onPress={() => onOpenProfile(friend.id)} className="flex-1 ml-3">
              <ThemedText className="text-base font-extrabold">
                {friendDisplayName(friend, adminUid, liveNamesById)}
              </ThemedText>
              <ThemedText variant="muted" className="text-xs mt-0.5">
                {friend.email}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => {
                setChattingId(friend.id);
                void Promise.resolve(onOpenChat(friend)).finally(() => setChattingId(null));
              }}
              disabled={chattingId === friend.id || removingId === friend.id}
              className="w-10 h-10 rounded-full items-center justify-center border mr-2"
              style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
            >
              {chattingId === friend.id ? (
                <ActivityIndicator size="small" color={theme.accentText} />
              ) : (
                <Ionicons name="chatbubble-outline" size={18} color={theme.accentText} />
              )}
            </Pressable>
            <Pressable
              onPress={() => handleRemoveFriend(friend)}
              disabled={removingId === friend.id}
              className="w-10 h-10 rounded-full items-center justify-center border"
              style={{ backgroundColor: theme.dangerSoft, borderColor: theme.danger }}
            >
              {removingId === friend.id ? (
                <ActivityIndicator size="small" color={theme.danger} />
              ) : (
                <Ionicons name="person-remove-outline" size={18} color={theme.danger} />
              )}
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}
