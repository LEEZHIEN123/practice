import { CommentReviewTip } from "@/components/community/CommentReviewTip";
import { Pressable } from "@/components/Pressable";
import { ThemedText } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import type { CommunityComment } from "@/lib/communityTypes";
import { subscribeComments, subscribePendingCommunityCommentIds } from "@/lib/communityService";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { View } from "react-native";

function CommentAvatar({ uri }: { uri: string | null }) {
  return (
    <View className="w-8 h-8 rounded-full bg-[#9fdfb6] items-center justify-center overflow-hidden">
      {uri ? (
        <Image source={{ uri }} style={{ width: 32, height: 32 }} contentFit="cover" />
      ) : (
        <Ionicons name="person" size={14} color="white" />
      )}
    </View>
  );
}

type PostCommentsPreviewProps = {
  postId: string;
  commentCount: number;
  onSeeMore: () => void;
};

export function PostCommentsPreview({
  postId,
  commentCount,
  onSeeMore,
}: PostCommentsPreviewProps) {
  const { theme } = useThemedScreen();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [pendingReviewCommentIds, setPendingReviewCommentIds] = useState<string[]>([]);

  useEffect(() => {
    if (commentCount === 0) return;
    const unsub = subscribeComments(postId, setComments);
    return unsub;
  }, [postId, commentCount]);

  useEffect(() => {
    if (commentCount === 0) return;
    const unsub = subscribePendingCommunityCommentIds(postId, setPendingReviewCommentIds);
    return unsub;
  }, [postId, commentCount]);

  if (commentCount === 0) return null;

  const preview = comments.slice(0, 3);

  return (
    <View className="mt-3 pt-3 border-t" style={{ borderTopColor: theme.cardBorder }}>
      {preview.map((comment) => (
        <View key={comment.id} className="mb-2.5">
          {pendingReviewCommentIds.includes(comment.id) ? <CommentReviewTip /> : null}
          <View className="flex-row items-start">
            <CommentAvatar uri={comment.authorProfileImage} />
            <View className="flex-1 ml-2">
            <ThemedText className="text-xs font-extrabold">{comment.authorName}</ThemedText>
            {comment.replyToAuthorName ? (
              <ThemedText variant="accent" className="text-[10px] font-bold mt-0.5">
                Replying to {comment.replyToAuthorName}
              </ThemedText>
            ) : null}
            <ThemedText variant="secondary" className="text-sm leading-5 mt-0.5">
              {comment.text}
            </ThemedText>
          </View>
          </View>
        </View>
      ))}
      {commentCount > 3 ? (
        <Pressable onPress={onSeeMore} className="mt-1">
          <ThemedText variant="accent" className="text-sm font-bold">
            See more comments
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}
