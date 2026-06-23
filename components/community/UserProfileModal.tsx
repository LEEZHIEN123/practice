import { Pressable } from "@/components/Pressable";
import type { CommunityPost, FriendRelation, PublicUserProfile } from "@/lib/communityTypes";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function ProfileAvatar({ uri, size = 72 }: { uri: string | null; size?: number }) {
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

type UserProfileModalProps = {
  visible: boolean;
  profile: PublicUserProfile | null;
  posts: CommunityPost[];
  relation: FriendRelation;
  loading: boolean;
  isSelf: boolean;
  canAddFriend?: boolean;
  isSupportAdmin?: boolean;
  onClose: () => void;
  onAddFriend: () => void;
  onChat?: () => void;
};

export function UserProfileModal({
  visible,
  profile,
  posts,
  relation,
  loading,
  isSelf,
  canAddFriend = true,
  isSupportAdmin = false,
  onClose,
  onAddFriend,
  onChat,
}: UserProfileModalProps) {
  const insets = useSafeAreaInsets();
  const showAddFriend = canAddFriend && !isSupportAdmin && relation === "none";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-[#f3f4f3]" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={onClose}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <Text className="text-2xl font-extrabold text-gray-900 flex-1">Profile</Text>
          {showAddFriend ? (
            <Pressable
              onPress={onAddFriend}
              className="w-11 h-11 rounded-full bg-[#52B69A] items-center justify-center"
            >
              <Ionicons name="person-add" size={20} color="white" />
            </Pressable>
          ) : !isSelf && !isSupportAdmin && relation !== "none" ? (
            <View className="rounded-full px-3 py-2 bg-white border border-gray-200">
              <Text className="text-xs font-bold text-[#52B69A]">{friendLabel(relation)}</Text>
            </View>
          ) : null}
        </View>

        {loading || !profile ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#52B69A" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
            <View className="items-center mb-5">
              <ProfileAvatar uri={profile.profileImage} />
              <Text className="text-2xl font-extrabold text-gray-900 mt-3">
                {isSupportAdmin ? "Support Admin" : profile.name}
              </Text>
              {!isSelf && isSupportAdmin && onChat ? (
                <Pressable
                  onPress={onChat}
                  className="mt-3 flex-row items-center rounded-full px-6 py-2.5 bg-[#52B69A]"
                >
                  <Ionicons name="chatbubble-outline" size={18} color="white" />
                  <Text className="text-sm font-extrabold text-white ml-2">Chat</Text>
                </Pressable>
              ) : null}
              {!isSelf && !isSupportAdmin && relation === "friends" && onChat ? (
                <Pressable
                  onPress={onChat}
                  className="mt-3 flex-row items-center rounded-full px-6 py-2.5 bg-[#52B69A]"
                >
                  <Ionicons name="chatbubble-outline" size={18} color="white" />
                  <Text className="text-sm font-extrabold text-white ml-2">Chat</Text>
                </Pressable>
              ) : null}
              {showAddFriend ? (
                <Pressable
                  onPress={onAddFriend}
                  className="mt-3 flex-row items-center rounded-full px-6 py-2.5 bg-[#52B69A]"
                >
                  <Ionicons name="person-add-outline" size={18} color="white" />
                  <Text className="text-sm font-extrabold text-white ml-2">Add friend</Text>
                </Pressable>
              ) : null}
              {!isSelf && !isSupportAdmin && relation === "pending_outgoing" ? (
                <View className="mt-3 rounded-full px-6 py-2.5 bg-white border border-gray-200">
                  <Text className="text-sm font-extrabold text-[#52B69A]">Friend request sent</Text>
                </View>
              ) : null}
              {!isSelf && !isSupportAdmin && relation === "pending_incoming" ? (
                <View className="mt-3 rounded-full px-6 py-2.5 bg-white border border-gray-200">
                  <Text className="text-sm font-extrabold text-gray-600">Respond in notifications</Text>
                </View>
              ) : null}
            </View>

            {!isSupportAdmin ? (
              <View className="bg-white rounded-2xl p-4 border border-gray-200 mb-4 gap-2">
                {profile.goal ? (
                  <Text className="text-sm text-gray-700">
                    <Text className="font-bold">Goal: </Text>
                    {profile.goal}
                  </Text>
                ) : null}
                {profile.gender ? (
                  <Text className="text-sm text-gray-700">
                    <Text className="font-bold">Gender: </Text>
                    {profile.gender === "male" ? "Male" : "Female"}
                  </Text>
                ) : null}
                {profile.height != null ? (
                  <Text className="text-sm text-gray-700">
                    <Text className="font-bold">Height: </Text>
                    {profile.height} cm
                  </Text>
                ) : null}
                {profile.weight != null ? (
                  <Text className="text-sm text-gray-700">
                    <Text className="font-bold">Weight: </Text>
                    {profile.weight} kg
                  </Text>
                ) : null}
                {profile.bmi != null ? (
                  <Text className="text-sm text-gray-700">
                    <Text className="font-bold">BMI: </Text>
                    {profile.bmi}
                  </Text>
                ) : null}
                {profile.bio ? (
                  <Text className="text-sm text-gray-700 mt-1 leading-6">
                    <Text className="font-bold">Bio: </Text>
                    {profile.bio}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <Text className="text-lg font-extrabold text-gray-900 mb-3">Posts</Text>
            {posts.length === 0 ? (
              <Text className="text-sm text-gray-500 text-center py-6">No posts yet.</Text>
            ) : (
              posts.map((post) => (
                <View
                  key={post.id}
                  className="bg-white rounded-2xl p-4 border border-gray-200 mb-3"
                >
                  <Text className="text-sm text-gray-700 leading-6">{post.content}</Text>
                  {post.imageUrl ? (
                    <Image
                      source={{ uri: post.imageUrl }}
                      style={{ width: "100%", height: 160, borderRadius: 12, marginTop: 10 }}
                      contentFit="cover"
                    />
                  ) : null}
                  {post.tags.length > 0 ? (
                    <View className="flex-row flex-wrap gap-1.5 mt-2">
                      {post.tags.map((tag) => (
                        <Text key={tag} className="text-[10px] font-bold text-[#52B69A]">
                          #{tag}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  <Text className="text-[10px] text-gray-400 mt-2">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
