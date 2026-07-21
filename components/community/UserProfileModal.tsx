import { Pressable } from "@/components/Pressable";
import { PostImagesGallery } from "@/components/community/PostImagesGallery";
import { PostAchievementChips } from "@/components/community/PostAchievementChips";
import {
  ProfileScreenHeader,
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
  if (relation === "pending_incoming") return "Friend request";
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
  /** Post IDs currently pending Support Admin review (optional fallback). */
  pendingReviewPostIds?: string[];
  onClose: () => void;
  onAddFriend: () => void;
  onAcceptFriend?: () => void;
  onDeclineFriend?: () => void;
  friendActionBusy?: boolean;
  onChat?: () => void;
  onOpenPost?: (postId: string) => void;
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
  pendingReviewPostIds = [],
  onClose,
  onAddFriend,
  onAcceptFriend,
  onDeclineFriend,
  friendActionBusy = false,
  onChat,
  onOpenPost,
}: UserProfileModalProps) {
  const insets = useSafeAreaInsets();
  const { screenStyle, cardStyle, theme, iconButtonStyle } = useThemedScreen();
  const showAddFriend = canAddFriend && !isSupportAdmin && relation === "none";
  const pendingSet = new Set(pendingReviewPostIds);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1" style={[screenStyle, { paddingTop: insets.top + 12 }]}>
        <View className="px-4">
          <ProfileScreenHeader
            title="Profile"
            onBack={onClose}
            rightSlot={
              showAddFriend ? (
                <Pressable
                  onPress={onAddFriend}
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={iconButtonStyle}
                >
                  <Ionicons name="person-add" size={20} color={theme.textPrimary} />
                </Pressable>
              ) : !isSelf && !isSupportAdmin && relation !== "none" ? (
                <View className="rounded-full px-3 py-2" style={cardStyle}>
                  <ThemedText variant="accent" className="text-xs font-bold">
                    {friendLabel(relation)}
                  </ThemedText>
                </View>
              ) : null
            }
          />
        </View>

        {loading || !profile ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={theme.accentText} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
            <View className="items-center mb-5">
              <ProfileAvatar uri={profile.profileImage} />
              <View className="flex-row items-center justify-center mt-3">
                <ThemedText className="text-2xl font-extrabold">
                  {isSupportAdmin ? "Support Admin" : profile.name}
                </ThemedText>
                {isSupportAdmin ? (
                  <Ionicons
                    name="shield-checkmark"
                    size={20}
                    color="#2563eb"
                    style={{ marginLeft: 6 }}
                    accessibilityLabel="Support Admin"
                  />
                ) : null}
              </View>
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
                <View className="mt-3 flex-row gap-2 w-full max-w-sm px-2">
                  <Pressable
                    onPress={onAcceptFriend}
                    disabled={friendActionBusy || !onAcceptFriend}
                    className="flex-1 flex-row items-center justify-center rounded-full px-5 py-2.5 bg-[#52B69A]"
                    style={{ opacity: friendActionBusy || !onAcceptFriend ? 0.7 : 1 }}
                  >
                    {friendActionBusy ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text className="text-sm font-extrabold text-white">Accept</Text>
                    )}
                  </Pressable>
                  {onDeclineFriend ? (
                    <Pressable
                      onPress={onDeclineFriend}
                      disabled={friendActionBusy}
                      className="flex-1 flex-row items-center justify-center rounded-full px-5 py-2.5"
                      style={{
                        backgroundColor: theme.danger,
                        opacity: friendActionBusy ? 0.7 : 1,
                      }}
                    >
                      <Text className="text-sm font-extrabold text-white">Decline</Text>
                    </Pressable>
                  ) : null}
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

            <ThemedText className="text-lg font-extrabold mb-3">
              {isSelf ? "My posts" : "Posts"}
            </ThemedText>
            {posts.length === 0 ? (
              <ThemedText variant="muted" className="text-sm text-center py-6">
                {isSelf ? "You have not posted yet." : "No posts yet."}
              </ThemedText>
            ) : (
              posts.map((post) => {
                const isPendingReview =
                  !post.blocked && (post.underReview || pendingSet.has(post.id));
                return (
                <Pressable
                  key={post.id}
                  onPress={() => onOpenPost?.(post.id)}
                  disabled={!onOpenPost}
                >
                  <ThemedCard rounded="2xl" className="p-4 mb-3">
                    {post.blocked && isSelf ? (
                      <View
                        className="mb-2 rounded-lg px-2.5 py-1.5 border"
                        style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}
                      >
                        <ThemedText className="text-[11px] font-semibold" style={{ color: "#b91c1c" }}>
                          {post.underReview
                            ? "Hidden while Support Admin reviews your request."
                            : "Hidden by Support Admin. Only you can see this here."}
                        </ThemedText>
                      </View>
                    ) : post.authorHidden && isSelf ? (
                      <View
                        className="mb-2 rounded-lg px-2.5 py-1.5 border"
                        style={{ backgroundColor: "#f8fafc", borderColor: "#cbd5e1" }}
                      >
                        <ThemedText className="text-[11px] font-semibold" style={{ color: "#475569" }}>
                          Hidden from everyone. Only you can see this here.
                        </ThemedText>
                      </View>
                    ) : isPendingReview ? (
                      <View
                        className="mb-2 rounded-lg px-2.5 py-1.5 border"
                        style={{ backgroundColor: "#fff7ed", borderColor: "#fdba74" }}
                      >
                        <ThemedText className="text-[11px] font-semibold" style={{ color: "#c2410c" }}>
                          Under review. Please be careful with community guidelines.
                        </ThemedText>
                      </View>
                    ) : null}
                    <ThemedText variant="secondary" className="text-sm leading-6">
                      {post.content}
                    </ThemedText>
                    <PostAchievementChips achievementIds={post.achievementIds ?? []} compact />
                    <PostImagesGallery imageUrls={post.imageUrls} maxHeight={160} />
                    {post.tags.length > 0 ? (
                      <View className="flex-row flex-wrap gap-1.5 mt-2">
                        {post.tags.map((tag) => (
                          <ThemedText key={tag} variant="accent" className="text-[10px] font-bold">
                            #{tag}
                          </ThemedText>
                        ))}
                      </View>
                    ) : null}
                    <View className="flex-row items-center mt-3 gap-4">
                      <View className="flex-row items-center">
                        <Ionicons
                          name={post.likeCount > 0 ? "heart" : "heart-outline"}
                          size={16}
                          color={post.likeCount > 0 ? "#ef4444" : "#52B69A"}
                        />
                        <ThemedText variant="accent" className="text-xs font-bold ml-1.5">
                          {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
                        </ThemedText>
                      </View>
                      <View className="flex-row items-center">
                        <Ionicons name="chatbubble-outline" size={15} color="#52B69A" />
                        <ThemedText variant="accent" className="text-xs font-bold ml-1.5">
                          {post.commentCount}{" "}
                          {post.commentCount === 1 ? "comment" : "comments"}
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText variant="muted" className="text-[10px] mt-2">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </ThemedText>
                  </ThemedCard>
                </Pressable>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
