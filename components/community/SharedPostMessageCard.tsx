import { formatPostDisplayTime } from "@/lib/chatMessageUtils";
import type { ChatMessage, CommunityPost } from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { PostAchievementChips } from "@/components/community/PostAchievementChips";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

export type SharedPostCardData = {
  postId: string;
  authorName: string;
  authorProfileImage: string | null;
  content: string;
  imageUrl: string | null;
  tags: string[];
  achievementIds: string[];
  likeCount: number;
  commentCount: number;
  createdAt: number | null;
};

export function getSharedPostCardData(
  message: ChatMessage,
  livePost?: CommunityPost | null
): SharedPostCardData | null {
  if (!message.sharedPostId) return null;

  if (livePost && livePost.id === message.sharedPostId) {
    return {
      postId: livePost.id,
      authorName: livePost.authorName,
      authorProfileImage: livePost.authorProfileImage,
      content: livePost.content,
      imageUrl: livePost.imageUrl,
      tags: livePost.tags,
      achievementIds: livePost.achievementIds ?? [],
      likeCount: livePost.likeCount,
      commentCount: livePost.commentCount,
      createdAt: livePost.createdAt,
    };
  }

  return {
    postId: message.sharedPostId,
    authorName: message.sharedPostAuthorName ?? "Community member",
    authorProfileImage: message.sharedPostAuthorImage,
    content: message.sharedPostContent ?? message.text,
    imageUrl: message.imageUrl,
    tags: message.sharedPostTags,
    achievementIds: [],
    likeCount: message.sharedPostLikeCount,
    commentCount: message.sharedPostCommentCount,
    createdAt: message.sharedPostCreatedAt,
  };
}

function ProfileAvatar({ uri, size = 36 }: { uri: string | null; size?: number }) {
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

type SharedPostMessageCardProps = {
  data: SharedPostCardData;
  onPress: () => void;
};

export function SharedPostMessageCard({ data, onPress }: SharedPostMessageCardProps) {
  const { cardStyle, textPrimary, textSecondary, textMuted, theme } = useThemedScreen();

  return (
    <Pressable onPress={onPress} className="active:opacity-90">
      <View className="rounded-2xl px-4 py-4 border overflow-hidden" style={cardStyle}>
        <View className="flex-row items-center">
          <ProfileAvatar uri={data.authorProfileImage} />
          <View className="flex-1 ml-3">
            <Text className="text-sm font-extrabold" style={textPrimary} numberOfLines={1}>
              {data.authorName}
            </Text>
            {data.createdAt ? (
              <Text className="text-[10px] mt-0.5" style={textMuted}>
                {formatPostDisplayTime(data.createdAt)}
              </Text>
            ) : null}
          </View>
        </View>

        {data.content ? (
          <Text className="text-sm mt-3 leading-6" style={textSecondary}>
            {data.content}
          </Text>
        ) : null}

        <PostAchievementChips achievementIds={data.achievementIds ?? []} compact />

        {data.imageUrl ? (
          <Image
            source={{ uri: data.imageUrl }}
            style={{ width: "100%", height: 160, borderRadius: 16, marginTop: 10 }}
            contentFit="cover"
          />
        ) : null}

        {data.tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-2 mt-3">
            {data.tags.map((tag) => (
              <View
                key={tag}
                className="rounded-full px-2.5 py-1 border"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.accent }}
              >
                <Text className="text-[10px] font-bold" style={{ color: theme.accentText }}>
                  #{tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View className="flex-row items-center mt-4">
          <View className="flex-row items-center mr-4">
            <Ionicons name="heart-outline" size={18} color="#52B69A" />
            <Text className="text-xs text-[#52B69A] font-bold ml-1.5">
              {data.likeCount} {data.likeCount === 1 ? "like" : "likes"}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="chatbubble-outline" size={17} color="#52B69A" />
            <Text className="text-xs text-[#52B69A] font-bold ml-1.5">
              {data.commentCount} {data.commentCount === 1 ? "comment" : "comments"}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
