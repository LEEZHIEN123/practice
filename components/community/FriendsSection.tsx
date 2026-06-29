import { Pressable } from "@/components/Pressable";
import { CommunitySearchBar } from "@/components/community/CommunitySearchBar";
import { ThemedText } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { removeFriend, subscribeFriendsList } from "@/lib/communityService";
import type { FriendListEntry } from "@/lib/communityTypes";
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
  onOpenProfile: (userId: string) => void;
  onOpenChat: (friend: FriendListEntry) => void;
};

export function FriendsSection({ onOpenProfile, onOpenChat }: FriendsSectionProps) {
  const { cardStyle, theme } = useThemedScreen();
  const [friends, setFriends] = useState<FriendListEntry[]>([]);
  const [searchText, setSearchText] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [chattingId, setChattingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeFriendsList(setFriends);
    return unsub;
  }, []);

  const filteredFriends = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) return friends;
    return friends.filter(
      (friend) =>
        friend.name.toLowerCase().includes(needle) ||
        friend.email.toLowerCase().includes(needle)
    );
  }, [friends, searchText]);

  const handleRemoveFriend = (friend: FriendListEntry) => {
    Alert.alert("Remove friend", `Remove ${friend.name} from your friends?`, [
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

  return (
    <View className="gap-4">
      <CommunitySearchBar
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Search friend..."
        className="mb-0"
      />

      <View>
        <ThemedText className="text-sm font-extrabold mb-3">
          My friends ({friends.length})
        </ThemedText>
        {friends.length === 0 ? (
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
                <ThemedText className="text-base font-extrabold">{friend.name}</ThemedText>
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
    </View>
  );
}
