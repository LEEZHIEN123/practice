import { CommentReviewTip } from "@/components/community/CommentReviewTip";
import { PersonNameSuffix } from "@/components/community/PersonNameSuffix";
import { Pressable } from "@/components/Pressable";
import { ThemedText } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import type { CommunityComment } from "@/lib/communityTypes";
import { subscribeComments, subscribePendingCommunityCommentIds } from "@/lib/communityService";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
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

/** Live comment count from the comments subcollection (not the denormalized post field). */
export function useLiveCommentCount(postId: string, fallback = 0): number {
  const [count, setCount] = useState(fallback);

  useEffect(() => {
    setCount(fallback);
  }, [fallback, postId]);

  useEffect(() => {
    const unsub = subscribeComments(postId, (comments) => {
      setCount(comments.length);
    });
    return unsub;
  }, [postId]);

  return count;
}

type PostCommentsPreviewProps = {
  postId: string;
  commentCount: number;
  currentUserId?: string | null;
  friendIds?: Set<string>;
  onSeeMore: () => void;
  onOpenProfile?: (userId: string) => void;
};

export function PostCommentsPreview({
  postId,
  commentCount,
  currentUserId = null,
  friendIds,
  onSeeMore,
  onOpenProfile,
}: PostCommentsPreviewProps) {
  const { theme } = useThemedScreen();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [pendingReviewCommentIds, setPendingReviewCommentIds] = useState<string[]>([]);
  const friendSet = friendIds ?? new Set<string>();

  useEffect(() => {
    const unsub = subscribeComments(postId, setComments);
    return unsub;
  }, [postId]);

  useEffect(() => {
    const unsub = subscribePendingCommunityCommentIds(postId, setPendingReviewCommentIds);
    return unsub;
  }, [postId]);

  // Subscription is oldest→newest; show the latest three on the community feed.
  const preview = useMemo(() => comments.slice(-3), [comments]);
  const totalCount = Math.max(commentCount, comments.length);

  if (preview.length === 0) return null;

  return (
    <View className="mt-3 pt-3 border-t" style={{ borderTopColor: theme.cardBorder }}>
      {preview.map((comment) => {
        const isMe = Boolean(currentUserId && comment.authorId === currentUserId);
        const isFriend = !isMe && friendSet.has(comment.authorId);
        return (
          <View key={comment.id} className="mb-2.5">
            {pendingReviewCommentIds.includes(comment.id) ? <CommentReviewTip /> : null}
            <View className="flex-row items-start">
              {onOpenProfile ? (
                <Pressable onPress={() => onOpenProfile(comment.authorId)} hitSlop={6}>
                  <CommentAvatar uri={comment.authorProfileImage} />
                </Pressable>
              ) : (
                <CommentAvatar uri={comment.authorProfileImage} />
              )}
              <View className="flex-1 ml-2">
                {onOpenProfile ? (
                  <Pressable onPress={() => onOpenProfile(comment.authorId)}>
                    <ThemedText className="text-xs font-extrabold">
                      {comment.authorName}
                      <PersonNameSuffix
                        isMe={isMe}
                        isFriend={isFriend}
                        accentColor={theme.accentText}
                        textClassName="text-xs font-bold"
                      />
                    </ThemedText>
                  </Pressable>
                ) : (
                  <ThemedText className="text-xs font-extrabold">
                    {comment.authorName}
                    <PersonNameSuffix
                      isMe={isMe}
                      isFriend={isFriend}
                      accentColor={theme.accentText}
                      textClassName="text-xs font-bold"
                    />
                  </ThemedText>
                )}
                {comment.replyToAuthorName ? (
                  <ThemedText variant="accent" className="text-[10px] font-bold mt-0.5">
                    Replying to {comment.replyToAuthorName}
                  </ThemedText>
                ) : null}
                <Pressable onPress={onSeeMore}>
                  <ThemedText variant="secondary" className="text-sm leading-5 mt-0.5">
                    {comment.text}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
      {totalCount > 3 ? (
        <Pressable onPress={onSeeMore} className="mt-1">
          <ThemedText variant="accent" className="text-sm font-bold">
            See more comments
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}
