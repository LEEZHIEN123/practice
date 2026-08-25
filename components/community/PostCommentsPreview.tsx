import { CommentReviewTip } from "@/components/community/CommentReviewTip";
import { CommunityAuthorName } from "@/components/community/CommunityAuthorName";
import { PersonNameSuffix } from "@/components/community/PersonNameSuffix";
import { Pressable } from "@/components/Pressable";
import { ThemedText } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import type { CommunityComment } from "@/lib/communityTypes";
import {
  loadLikerProfiles,
  subscribeComments,
  subscribePendingCommunityCommentIds,
} from "@/lib/communityService";
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
  adminUid?: string | null;
  friendIds?: Set<string>;
  authorAvatarById?: Record<string, string | null>;
  liveNamesById?: Record<string, string>;
  onSeeMore: () => void;
  onOpenProfile?: (userId: string) => void;
};

export function PostCommentsPreview({
  postId,
  commentCount,
  currentUserId = null,
  adminUid = null,
  friendIds,
  authorAvatarById,
  liveNamesById,
  onSeeMore,
  onOpenProfile,
}: PostCommentsPreviewProps) {
  const { theme, textPrimary } = useThemedScreen();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [pendingReviewCommentIds, setPendingReviewCommentIds] = useState<string[]>([]);
  const [liveAvatars, setLiveAvatars] = useState<Record<string, string | null>>({});
  const [liveNames, setLiveNames] = useState<Record<string, string>>({});
  const friendSet = friendIds ?? new Set<string>();

  useEffect(() => {
    const unsub = subscribeComments(postId, setComments);
    return unsub;
  }, [postId]);

  useEffect(() => {
    const unsub = subscribePendingCommunityCommentIds(postId, setPendingReviewCommentIds);
    return unsub;
  }, [postId]);

  useEffect(() => {
    const ids = [...new Set(comments.map((c) => c.authorId).filter(Boolean))];
    if (ids.length === 0) {
      setLiveAvatars({});
      setLiveNames({});
      return;
    }
    let cancelled = false;
    void loadLikerProfiles(ids).then((profiles) => {
      if (cancelled) return;
      const avatarMap: Record<string, string | null> = {};
      const nameMap: Record<string, string> = {};
      for (const profile of profiles) {
        avatarMap[profile.id] = profile.profileImage;
        nameMap[profile.id] = profile.name;
      }
      setLiveAvatars(avatarMap);
      setLiveNames(nameMap);
    });
    return () => {
      cancelled = true;
    };
  }, [comments]);

  // Subscription is oldest→newest; show the latest three on the community feed.
  const preview = useMemo(() => comments.slice(-3), [comments]);
  const totalCount = Math.max(commentCount, comments.length);

  const mergedLiveNames = useMemo(
    () => ({ ...liveNames, ...liveNamesById }),
    [liveNames, liveNamesById]
  );

  if (preview.length === 0) return null;

  return (
    <View className="mt-3 pt-3 border-t" style={{ borderTopColor: theme.cardBorder }}>
      {preview.map((comment) => {
        const isMe = Boolean(currentUserId && comment.authorId === currentUserId);
        const isFriend = !isMe && friendSet.has(comment.authorId);
        const avatarUri =
          liveAvatars[comment.authorId] ??
          authorAvatarById?.[comment.authorId] ??
          comment.authorProfileImage;
        const nameRow = (
          <CommunityAuthorName
            authorId={comment.authorId}
            authorName={comment.authorName}
            adminUid={adminUid}
            liveNamesById={mergedLiveNames}
            textClassName="text-xs font-extrabold"
            textStyle={textPrimary}
            iconSize={12}
            ownSuffix={
              <PersonNameSuffix
                isMe={isMe}
                isFriend={isFriend}
                accentColor={theme.accentText}
                textClassName="text-xs font-bold"
              />
            }
          />
        );
        return (
          <View key={comment.id} className="mb-2.5">
            {pendingReviewCommentIds.includes(comment.id) ? <CommentReviewTip /> : null}
            <View className="flex-row items-start">
              {onOpenProfile ? (
                <Pressable onPress={() => onOpenProfile(comment.authorId)} hitSlop={6}>
                  <CommentAvatar uri={avatarUri} />
                </Pressable>
              ) : (
                <CommentAvatar uri={avatarUri} />
              )}
              <View className="flex-1 ml-2">
                {onOpenProfile ? (
                  <Pressable onPress={() => onOpenProfile(comment.authorId)}>{nameRow}</Pressable>
                ) : (
                  nameRow
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
