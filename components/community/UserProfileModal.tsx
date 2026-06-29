import { Pressable } from "@/components/Pressable";
import {
  ThemedBackButton,
  ThemedCard,
  ThemedText,
} from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import type { CommunityPost, FriendRelation, PublicUserProfile } from "@/lib/communityTypes";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ActivityIndicator, Modal, ScrollView, Text, View } from "react-native";
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
  const { screenStyle, cardStyle, theme } = useThemedScreen();
  const showAddFriend = canAddFriend && !isSupportAdmin && relation === "none";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1" style={[screenStyle, { paddingTop: insets.top }]}>
        <View className="flex-row items-center px-4 py-3">
          <ThemedBackButton onPress={onClose} className="w-11 h-11 mr-3" />
          <ThemedText className="text-2xl font-extrabold flex-1">Profile</ThemedText>
          {showAddFriend ? (
            <Pressable
              onPress={onAddFriend}
              className="w-11 h-11 rounded-full bg-[#52B69A] items-center justify-center"
            >
              <Ionicons name="person-add" size={20} color="white" />
            </Pressable>
          ) : !isSelf && !isSupportAdmin && relation !== "none" ? (
            <View className="rounded-full px-3 py-2" style={cardStyle}>
              <ThemedText variant="accent" className="text-xs font-bold">
                {friendLabel(relation)}
              </ThemedText>
            </View>
          ) : null}
        </View>

        {loading || !profile ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={theme.accentText} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
            <View className="items-center mb-5">
              <ProfileAvatar uri={profile.profileImage} />
              <ThemedText className="text-2xl font-extrabold mt-3">
                {isSupportAdmin ? "Support Admin" : profile.name}
              </ThemedText>
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
                <View className="mt-3 rounded-full px-6 py-2.5" style={cardStyle}>
                  <ThemedText variant="accent" className="text-sm font-extrabold">
                    Friend request sent
                  </ThemedText>
                </View>
              ) : null}
              {!isSelf && !isSupportAdmin && relation === "pending_incoming" ? (
                <View className="mt-3 rounded-full px-6 py-2.5" style={cardStyle}>
                  <ThemedText variant="muted" className="text-sm font-extrabold">
                    Respond in notifications
                  </ThemedText>
                </View>
              ) : null}
            </View>

            {!isSupportAdmin ? (
              <ThemedCard rounded="2xl" className="p-4 mb-4 gap-2">
                {profile.goal ? (
                  <ThemedText variant="secondary" className="text-sm">
                    <ThemedText className="font-bold">Goal: </ThemedText>
                    {profile.goal}
                  </ThemedText>
                ) : null}
                {profile.gender ? (
                  <ThemedText variant="secondary" className="text-sm">
                    <ThemedText className="font-bold">Gender: </ThemedText>
                    {profile.gender === "male" ? "Male" : "Female"}
                  </ThemedText>
                ) : null}
                {profile.height != null ? (
                  <ThemedText variant="secondary" className="text-sm">
                    <ThemedText className="font-bold">Height: </ThemedText>
                    {profile.height} cm
                  </ThemedText>
                ) : null}
                {profile.weight != null ? (
                  <ThemedText variant="secondary" className="text-sm">
                    <ThemedText className="font-bold">Weight: </ThemedText>
                    {profile.weight} kg
                  </ThemedText>
                ) : null}
                {profile.bmi != null ? (
                  <ThemedText variant="secondary" className="text-sm">
                    <ThemedText className="font-bold">BMI: </ThemedText>
                    {profile.bmi}
                  </ThemedText>
                ) : null}
                {profile.bio ? (
                  <ThemedText variant="secondary" className="text-sm mt-1 leading-6">
                    <ThemedText className="font-bold">Bio: </ThemedText>
                    {profile.bio}
                  </ThemedText>
                ) : null}
              </ThemedCard>
            ) : null}

            <ThemedText className="text-lg font-extrabold mb-3">Posts</ThemedText>
            {posts.length === 0 ? (
              <ThemedText variant="muted" className="text-sm text-center py-6">
                No posts yet.
              </ThemedText>
            ) : (
              posts.map((post) => (
                <ThemedCard key={post.id} rounded="2xl" className="p-4 mb-3">
                  <ThemedText variant="secondary" className="text-sm leading-6">
                    {post.content}
                  </ThemedText>
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
                        <ThemedText key={tag} variant="accent" className="text-[10px] font-bold">
                          #{tag}
                        </ThemedText>
                      ))}
                    </View>
                  ) : null}
                  <ThemedText variant="muted" className="text-[10px] mt-2">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </ThemedText>
                </ThemedCard>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
