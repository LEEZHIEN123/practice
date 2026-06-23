import { Pressable } from "@/components/Pressable";
import type { CommunityComment } from "@/lib/communityTypes";
import { subscribeComments } from "@/lib/communityService";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

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
  const [comments, setComments] = useState<CommunityComment[]>([]);

  useEffect(() => {
    if (commentCount === 0) return;
    const unsub = subscribeComments(postId, setComments);
    return unsub;
  }, [postId, commentCount]);

  if (commentCount === 0) return null;

  const preview = comments.slice(0, 3);

  return (
    <View className="mt-3 pt-3 border-t border-gray-200">
      {preview.map((comment) => (
        <View key={comment.id} className="flex-row items-start mb-2.5">
          <CommentAvatar uri={comment.authorProfileImage} />
          <View className="flex-1 ml-2">
            <Text className="text-xs font-extrabold text-gray-900">{comment.authorName}</Text>
            {comment.replyToAuthorName ? (
              <Text className="text-[10px] font-bold text-[#52B69A] mt-0.5">
                Replying to {comment.replyToAuthorName}
              </Text>
            ) : null}
            <Text className="text-sm text-gray-700 leading-5 mt-0.5">{comment.text}</Text>
          </View>
        </View>
      ))}
      {commentCount > 3 ? (
        <Pressable onPress={onSeeMore} className="mt-1">
          <Text className="text-sm font-bold text-[#52B69A]">See more comments</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
