import { Pressable } from "@/components/Pressable";
import { CommentMenuModal } from "@/components/community/CommentMenuModal";
import { formatChatMessageTime } from "@/lib/chatMessageUtils";
import {
  addComment,
  deleteComment,
  subscribeComments,
  threadedComments,
} from "@/lib/communityService";
import type { CommunityComment, CommunityPost } from "@/lib/communityTypes";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

type PostCommentsSheetProps = {
  visible: boolean;
  post: CommunityPost | null;
  currentUserId: string | null;
  onClose: () => void;
  onOpenProfile?: (userId: string) => void;
  onReportComment?: (comment: CommunityComment) => void;
  isAdmin?: boolean;
  onBlockComment?: (comment: CommunityComment) => void;
};

export function PostCommentsSheet({
  visible,
  post,
  currentUserId,
  onClose,
  onOpenProfile,
  onReportComment,
  isAdmin = false,
  onBlockComment,
}: PostCommentsSheetProps) {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuComment, setMenuComment] = useState<CommunityComment | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const displayComments = useMemo(() => threadedComments(comments), [comments]);
  const canReport = Boolean(onReportComment);

  useEffect(() => {
    if (!visible || !post) return;
    const unsub = subscribeComments(post.id, setComments);
    return unsub;
  }, [visible, post]);

  useEffect(() => {
    if (!visible) {
      setReplyingTo(null);
      setMenuComment(null);
      setText("");
    }
  }, [visible]);

  const handleSend = async () => {
    if (!post || !text.trim()) return;
    try {
      setSending(true);
      await addComment(post.id, text, {
        parentCommentId: replyingTo?.id,
        replyToAuthorName: replyingTo?.authorName,
      });
      setText("");
      setReplyingTo(null);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not add comment.");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = (comment: CommunityComment) => {
    if (!post) return;
    Alert.alert("Delete comment", "Delete your comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              setDeletingCommentId(comment.id);
              setMenuComment(null);
              await deleteComment(post.id, comment.id);
              if (replyingTo?.id === comment.id) {
                setReplyingTo(null);
                setText("");
              }
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not delete comment.");
            } finally {
              setDeletingCommentId(null);
            }
          })();
        },
      },
    ]);
  };

  const startReply = (comment: CommunityComment) => {
    setReplyingTo(comment);
    setMenuComment(null);
  };

  const menuCommentBusy = menuComment != null && deletingCommentId === menuComment.id;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-black/40 justify-end"
      >
        <Pressable className="flex-1" onPress={onClose} />
        <View
          className="bg-[#f3f4f3] rounded-t-[28px] border-t border-gray-200 overflow-hidden flex-col"
          style={{ height: "50%" }}
        >
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
            <Text className="text-xl font-extrabold text-gray-900">Comments</Text>
            <Pressable
              onPress={onClose}
              className="w-10 h-10 rounded-full bg-white items-center justify-center border border-gray-200"
            >
              <Ionicons name="close" size={22} color="#6b7280" />
            </Pressable>
          </View>

          <ScrollView
            className="flex-1 px-4"
            contentContainerStyle={{ paddingVertical: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            {displayComments.length === 0 ? (
              <Text className="text-sm text-gray-500 text-center py-8">No comments yet.</Text>
            ) : null}

            {displayComments.map((comment) => {
              const isReply = Boolean(comment.parentCommentId);
              const isReplyingToThis = replyingTo?.id === comment.id;

              return (
                <View
                  key={comment.id}
                  className={`bg-white rounded-2xl p-4 border mb-2 ${
                    isReply ? "ml-6 border-l-4 border-l-[#52B69A]" : ""
                  } ${isReplyingToThis ? "border-[#52B69A] border-2" : "border-gray-200"}`}
                >
                  <View className="flex-row items-center">
                    {onOpenProfile ? (
                      <Pressable onPress={() => onOpenProfile(comment.authorId)}>
                        <ProfileAvatar uri={comment.authorProfileImage} />
                      </Pressable>
                    ) : (
                      <ProfileAvatar uri={comment.authorProfileImage} />
                    )}
                    <View className="flex-1 ml-3">
                      <View className="flex-row items-start justify-between gap-2">
                        {onOpenProfile ? (
                          <Pressable onPress={() => onOpenProfile(comment.authorId)} className="flex-1">
                            <Text className="text-sm font-extrabold text-gray-900">
                              {comment.authorName}
                            </Text>
                          </Pressable>
                        ) : (
                          <Text className="text-sm font-extrabold text-gray-900 flex-1">
                            {comment.authorName}
                          </Text>
                        )}
                        <Text className="text-[10px] text-gray-400">
                          {formatChatMessageTime(comment.createdAt)}
                        </Text>
                      </View>
                    </View>
                    {currentUserId ? (
                      <Pressable
                        onPress={() => setMenuComment(comment)}
                        className="w-8 h-8 rounded-full items-center justify-center"
                      >
                        <Ionicons name="ellipsis-vertical" size={18} color="#6b7280" />
                      </Pressable>
                    ) : null}
                  </View>
                  {comment.replyToAuthorName ? (
                    <Text className="text-xs font-bold text-[#52B69A] mt-2">
                      Replying to {comment.replyToAuthorName}
                    </Text>
                  ) : null}
                  <Pressable onPress={() => startReply(comment)}>
                    <Text className="text-sm text-gray-700 mt-2 leading-6">{comment.text}</Text>
                    <Text className="text-xs font-bold text-[#2563eb] mt-2">Reply</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          <CommentMenuModal
            visible={menuComment !== null}
            comment={menuComment}
            canDelete={menuComment != null && menuComment.authorId === currentUserId}
            canReport={!isAdmin && canReport && menuComment != null && menuComment.authorId !== currentUserId}
            isAdmin={isAdmin}
            canBlock={
              isAdmin &&
              menuComment != null &&
              menuComment.authorId !== currentUserId &&
              Boolean(onBlockComment)
            }
            deleting={menuCommentBusy}
            onClose={() => setMenuComment(null)}
            onDelete={() => {
              if (menuComment) handleDeleteComment(menuComment);
            }}
            onReport={() => {
              if (menuComment && onReportComment) {
                const target = menuComment;
                setMenuComment(null);
                onReportComment(target);
              }
            }}
            onBlock={() => {
              if (menuComment && onBlockComment) {
                const target = menuComment;
                setMenuComment(null);
                onBlockComment(target);
              }
            }}
          />

          <View
            className="px-4 border-t border-gray-200 bg-white"
            style={{ paddingBottom: insets.bottom + 8, paddingTop: 12 }}
          >
            {replyingTo ? (
              <View className="flex-row items-center justify-between bg-[#eaf7f0] rounded-xl px-3 py-2 mb-2 border border-[#b7e4c7]">
                <Text className="text-xs font-extrabold text-[#52B69A]">
                  Replying to {replyingTo.authorName}
                </Text>
                <Pressable
                  onPress={() => {
                    setReplyingTo(null);
                  }}
                >
                  <Text className="text-xs font-bold text-gray-500">Cancel</Text>
                </Pressable>
              </View>
            ) : null}
            <View className="flex-row items-end gap-2">
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={
                  replyingTo ? `Reply to ${replyingTo.authorName}...` : "Write a comment..."
                }
                multiline
                className="flex-1 bg-[#f3f4f3] rounded-2xl px-4 py-3 border border-gray-200 text-sm text-gray-800 max-h-28"
                placeholderTextColor="#9ca3af"
              />
              <Pressable
                onPress={() => void handleSend()}
                disabled={sending || !text.trim()}
                className={`w-11 h-11 rounded-full items-center justify-center ${
                  text.trim() ? "bg-[#52B69A]" : "bg-gray-200"
                }`}
              >
                {sending ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Ionicons name="send" size={18} color="white" />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
