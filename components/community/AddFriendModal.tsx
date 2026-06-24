import { Pressable } from "@/components/Pressable";
import { CommunitySearchBar } from "@/components/community/CommunitySearchBar";
import {
    getFriendRelation,
    searchUsersForAdding,
    sendFriendRequest,
} from "@/lib/communityService";
import type { FriendRelation, RegisteredUser } from "@/lib/communityTypes";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

function relationLabel(relation: FriendRelation): string {
  if (relation === "friends") return "Friends";
  if (relation === "pending_outgoing") return "Pending";
  if (relation === "pending_incoming") return "Respond in notifications";
  return "Add";
}

type AddFriendModalProps = {
  visible: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
};

export function AddFriendModal({ visible, onClose, onOpenProfile }: AddFriendModalProps) {
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<RegisteredUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [relationMap, setRelationMap] = useState<Record<string, FriendRelation>>({});
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setSearchText("");
      setSearchResults([]);
      setRelationMap({});
    }
  }, [visible]);

  useEffect(() => {
    const trimmed = searchText.trim();
    if (!visible || trimmed.length < 1) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          setSearching(true);
          const results = await searchUsersForAdding(trimmed);
          setSearchResults(results);
          const relations: Record<string, FriendRelation> = {};
          await Promise.all(
            results.map(async (user) => {
              relations[user.id] = await getFriendRelation(user.id);
            })
          );
          setRelationMap(relations);
        } catch {
          setSearchResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 350);

    return () => clearTimeout(timer);
  }, [searchText, visible]);

  const handleAddFriend = useCallback(async (user: RegisteredUser) => {
    try {
      setActionId(user.id);
      await sendFriendRequest(user.id);
      setRelationMap((prev) => ({ ...prev, [user.id]: "pending_outgoing" }));
      Alert.alert("Request sent", `Friend request sent to ${user.name}.`);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not send request.");
    } finally {
      setActionId(null);
    }
  }, []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-black/40 justify-end"
      >
        <Pressable className="flex-1" onPress={onClose} />
        <View
          className="bg-[#f3f4f3] rounded-t-[28px] border-t border-gray-200"
          style={{ paddingBottom: insets.bottom + 16, maxHeight: "85%" }}
        >
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
            <Text className="text-xl font-extrabold text-gray-900">Add Friend</Text>
            <Pressable
              onPress={onClose}
              className="w-10 h-10 rounded-full bg-white items-center justify-center border border-gray-200"
            >
              <Ionicons name="close" size={22} color="#6b7280" />
            </Pressable>
          </View>

          <View className="px-4">
            <CommunitySearchBar
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search by name or email..."
              loading={searching}
              className="mb-3"
            />
          </View>

          <ScrollView className="px-4" keyboardShouldPersistTaps="handled">
            {searchText.trim().length < 1 ? (
              <Text className="text-sm text-gray-500 text-center py-8">
                Search for an account to send a friend request.
              </Text>
            ) : searchResults.length === 0 && !searching ? (
              <Text className="text-sm text-gray-500 text-center py-8">
                No matching accounts found.
              </Text>
            ) : (
              searchResults.map((user) => {
                const relation = relationMap[user.id] ?? "none";
                const isFriend = relation === "friends";
                const isPending =
                  relation === "pending_outgoing" || relation === "pending_incoming";
                return (
                  <View
                    key={user.id}
                    className="flex-row items-center bg-white rounded-xl px-3 py-3 border border-gray-200 mb-2"
                  >
                    <Pressable onPress={() => onOpenProfile(user.id)}>
                      <ProfileAvatar uri={user.profileImage} size={40} />
                    </Pressable>
                    <Pressable onPress={() => onOpenProfile(user.id)} className="flex-1 ml-3">
                      <Text className="text-sm font-extrabold text-gray-900">{user.name}</Text>
                      <Text className="text-xs text-gray-500 mt-0.5">{user.email}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (relation === "none") void handleAddFriend(user);
                      }}
                      disabled={isFriend || isPending || actionId === user.id}
                      className={`rounded-full px-3 py-1.5 ${
                        isFriend || isPending ? "bg-[#f3f4f3]" : "bg-[#52B69A]"
                      }`}
                    >
                      {actionId === user.id ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Text
                          className={`text-xs font-extrabold ${
                            isFriend || isPending ? "text-gray-500" : "text-white"
                          }`}
                        >
                          {relationLabel(relation)}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
