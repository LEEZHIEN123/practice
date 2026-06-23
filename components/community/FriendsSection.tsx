import { Pressable } from "@/components/Pressable";
import { CommunitySearchBar } from "@/components/community/CommunitySearchBar";
import { removeFriend, subscribeFriendsList } from "@/lib/communityService";
import type { FriendListEntry } from "@/lib/communityTypes";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";

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
        <Text className="text-sm font-extrabold text-gray-900 mb-3">
          My friends ({friends.length})
        </Text>
        {friends.length === 0 ? (
          <View className="bg-white rounded-2xl px-4 py-8 border border-gray-200 items-center">
            <Text className="text-sm text-gray-500 text-center">
              No friends yet. Tap Add friend to find someone.
            </Text>
          </View>
        ) : filteredFriends.length === 0 ? (
          <View className="bg-white rounded-2xl px-4 py-8 border border-gray-200 items-center">
            <Text className="text-sm text-gray-500 text-center">No friends match your search.</Text>
          </View>
        ) : (
          filteredFriends.map((friend) => (
            <View
              key={friend.id}
              className="flex-row items-center bg-white rounded-2xl px-4 py-4 border border-gray-200 mb-2"
            >
              <Pressable onPress={() => onOpenProfile(friend.id)}>
                <ProfileAvatar uri={friend.profileImage} />
              </Pressable>
              <Pressable onPress={() => onOpenProfile(friend.id)} className="flex-1 ml-3">
                <Text className="text-base font-extrabold text-gray-900">{friend.name}</Text>
                <Text className="text-xs text-gray-500 mt-0.5">{friend.email}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setChattingId(friend.id);
                  void Promise.resolve(onOpenChat(friend)).finally(() => setChattingId(null));
                }}
                disabled={chattingId === friend.id || removingId === friend.id}
                className="w-10 h-10 rounded-full bg-[#e8f8ef] items-center justify-center border border-[#b7e4c7] mr-2"
              >
                {chattingId === friend.id ? (
                  <ActivityIndicator size="small" color="#52B69A" />
                ) : (
                  <Ionicons name="chatbubble-outline" size={18} color="#52B69A" />
                )}
              </Pressable>
              <Pressable
                onPress={() => handleRemoveFriend(friend)}
                disabled={removingId === friend.id}
                className="w-10 h-10 rounded-full bg-[#fef2f2] items-center justify-center border border-[#fecaca]"
              >
                {removingId === friend.id ? (
                  <ActivityIndicator size="small" color="#dc2626" />
                ) : (
                  <Ionicons name="person-remove-outline" size={18} color="#dc2626" />
                )}
              </Pressable>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
