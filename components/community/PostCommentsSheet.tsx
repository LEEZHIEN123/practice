import { Pressable } from "@/components/Pressable";
import { AdminPendingReportTip } from "@/components/community/AdminPendingReportTip";
import { CommentMenuModal } from "@/components/community/CommentMenuModal";
import { CommunityAuthorName } from "@/components/community/CommunityAuthorName";
import { PersonNameSuffix } from "@/components/community/PersonNameSuffix";
import { ThemedText, useProfileCardStyles } from "@/components/themed/ThemedUi";
import { formatChatMessageTime } from "@/lib/chatMessageUtils";
import {
  addComment,
  deleteComment,
  loadLikerProfiles,
  subscribeComments,
  threadedComments,
} from "@/lib/communityService";
import type { CommunityComment, CommunityPost } from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
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
  adminUid?: string | null;
  friendIds?: Set<string> | string[];
  onClose: () => void;
  onOpenProfile?: (userId: string) => void;
  isAdmin?: boolean;
  adminPendingCommentIds?: string[];
  onBlockComment?: (comment: CommunityComment) => void;
};

export function PostCommentsSheet({
  visible,
  post,
  currentUserId,
  adminUid = null,
  friendIds,
  onClose,
  onOpenProfile,
  isAdmin = false,
  adminPendingCommentIds = [],
  onBlockComment,
}: PostCommentsSheetProps) {
  const insets = useSafeAreaInsets();
  const { cardStyle, theme } = useThemedScreen();
  const { modalCardStyle, inputStyle, placeholderColor } = useProfileCardStyles();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [authorAvatarById, setAuthorAvatarById] = useState<Record<string, string | null>>({});
  const [authorNameById, setAuthorNameById] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuComment, setMenuComment] = useState<CommunityComment | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const commentsScrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [windowHeight, setWindowHeight] = useState(() => Dimensions.get("window").height);

  const displayComments = useMemo(() => threadedComments(comments), [comments]);
  const friendSet = useMemo(
    () => (friendIds instanceof Set ? friendIds : new Set(Array.isArray(friendIds) ? friendIds : [])),
    [friendIds]
  );

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
      setAuthorAvatarById({});
      setAuthorNameById({});
      return;
    }
    const ids = new Set(comments.map((c) => c.authorId).filter(Boolean));
    if (post?.authorId) ids.add(post.authorId);
    const uniqueIds = [...ids];
    if (uniqueIds.length === 0) return;
    let cancelled = false;
    void loadLikerProfiles(uniqueIds).then((profiles) => {
      if (cancelled) return;
      const avatarMap: Record<string, string | null> = {};
      const nameMap: Record<string, string> = {};
      for (const profile of profiles) {
        avatarMap[profile.id] = profile.profileImage;
        nameMap[profile.id] = profile.name;
      }
      setAuthorAvatarById(avatarMap);
      setAuthorNameById(nameMap);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, comments, post?.authorId]);

  const scrollCommentsToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      commentsScrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      setWindowHeight(Dimensions.get("window").height);
      scrollCommentsToBottom(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setWindowHeight(Dimensions.get("window").height);
    });
    const dimSub = Dimensions.addEventListener("change", ({ window }) => {
      setWindowHeight(window.height);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      dimSub.remove();
    };
  }, [visible, scrollCommentsToBottom]);

  const commentInputBottomPadding = useMemo(() => {
    if (keyboardHeight <= 0) return insets.bottom + 8;
    if (Platform.OS === "android") {
      const screenH = Dimensions.get("screen").height;
      const windowShrunkForKeyboard = screenH - windowHeight > keyboardHeight * 0.45;
      if (windowShrunkForKeyboard) return 8;
    }
    return keyboardHeight + 8;
  }, [insets.bottom, keyboardHeight, windowHeight]);

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
      Keyboard.dismiss();
      Alert.alert("Comment sent", "Your comment has been posted.");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not add comment.");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = (comment: CommunityComment) => {
    if (!post) return;
    const isOwnComment = comment.authorId === currentUserId;
    const message = isOwnComment
      ? "Delete your comment?"
      : isAdmin
        ? "Delete this comment? It will be removed for everyone."
        : "Delete this comment from your post?";
    Alert.alert("Delete comment", message, [
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
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        className="flex-1 justify-end"
        style={{ backgroundColor: theme.modalOverlay }}
      >
        <Pressable className="flex-1" onPress={onClose} />
        <View
          className="rounded-t-[28px] overflow-hidden flex-col"
          style={[modalCardStyle, { height: "50%", borderBottomWidth: 0 }]}
        >
          <View
            className="flex-row items-center justify-between px-4 py-3 border-b"
            style={{ borderBottomColor: theme.cardBorder }}
          >
            <ThemedText className="text-xl font-extrabold">Comments</ThemedText>
            <Pressable
              onPress={onClose}
              className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
            >
              <Ionicons name="close" size={22} color={theme.iconMuted} />
            </Pressable>
          </View>

          <ScrollView
            ref={commentsScrollRef}
            className="flex-1 px-4"
            contentContainerStyle={{ paddingVertical: 12 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (keyboardHeight > 0) scrollCommentsToBottom(false);
            }}
          >
            {displayComments.length === 0 ? (
              <ThemedText variant="muted" className="text-sm text-center py-8">
                No comments yet.
              </ThemedText>
            ) : null}

            {displayComments.map((comment) => {
              const isReply = Boolean(comment.parentCommentId);
              const isReplyingToThis = replyingTo?.id === comment.id;
              const hasAdminPendingReportTip =
                isAdmin && adminPendingCommentIds.includes(comment.id);

              return (
                <View
                  key={comment.id}
                  className={`rounded-2xl p-4 border mb-2 ${isReply ? "ml-6 border-l-4" : ""}`}
                  style={[
                    cardStyle,
                    isReply ? { borderLeftColor: theme.accent } : undefined,
                    isReplyingToThis
                      ? { borderColor: theme.accent, borderWidth: 2 }
                      : undefined,
                  ]}
                >
                  <View className="flex-row items-center">
                    {onOpenProfile ? (
                      <Pressable onPress={() => onOpenProfile(comment.authorId)}>
                        <ProfileAvatar
                          uri={authorAvatarById[comment.authorId] ?? comment.authorProfileImage}
                        />
                      </Pressable>
                    ) : (
                      <ProfileAvatar
                        uri={authorAvatarById[comment.authorId] ?? comment.authorProfileImage}
                      />
                    )}
                    <View className="flex-1 ml-3">
                      <View className="flex-row items-start justify-between gap-2">
                        {onOpenProfile ? (
                          <Pressable onPress={() => onOpenProfile(comment.authorId)} className="flex-1">
                            <CommunityAuthorName
                              authorId={comment.authorId}
                              authorName={comment.authorName}
                              adminUid={adminUid}
                              liveNamesById={authorNameById}
                              textClassName="text-sm font-extrabold"
                              iconSize={14}
                              ownSuffix={
                                <PersonNameSuffix
                                  isMe={comment.authorId === currentUserId}
                                  isFriend={
                                    comment.authorId !== currentUserId &&
                                    friendSet.has(comment.authorId)
                                  }
                                  accentColor={theme.accentText}
                                  textClassName="text-sm font-bold"
                                />
                              }
                            />
                          </Pressable>
                        ) : (
                          <View className="flex-1">
                            <CommunityAuthorName
                              authorId={comment.authorId}
                              authorName={comment.authorName}
                              adminUid={adminUid}
                              liveNamesById={authorNameById}
                              textClassName="text-sm font-extrabold"
                              iconSize={14}
                              ownSuffix={
                                <PersonNameSuffix
                                  isMe={comment.authorId === currentUserId}
                                  isFriend={
                                    comment.authorId !== currentUserId &&
                                    friendSet.has(comment.authorId)
                                  }
                                  accentColor={theme.accentText}
                                  textClassName="text-sm font-bold"
                                />
                              }
                            />
                          </View>
                        )}
                        <ThemedText variant="muted" className="text-[10px]">
                          {formatChatMessageTime(comment.createdAt)}
                        </ThemedText>
                      </View>
                    </View>
                    {currentUserId &&
                    (isAdmin ||
                      comment.authorId === currentUserId ||
                      post?.authorId === currentUserId) ? (
                      <Pressable
                        onPress={() => setMenuComment(comment)}
                        className="w-8 h-8 rounded-full items-center justify-center"
                      >
                        <Ionicons name="ellipsis-vertical" size={18} color={theme.iconMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                  {comment.replyToAuthorName ? (
                    <ThemedText variant="accent" className="text-xs font-bold mt-2">
                      Replying to {comment.replyToAuthorName}
                    </ThemedText>
                  ) : null}
                  {hasAdminPendingReportTip ? (
                    <View className="mt-2">
                      <AdminPendingReportTip target="comment" />
                    </View>
                  ) : null}
                  <Pressable onPress={() => startReply(comment)}>
                    <ThemedText variant="secondary" className="text-sm mt-2 leading-6">
                      {comment.text}
                    </ThemedText>
                    <ThemedText className="text-xs font-bold mt-2" style={{ color: theme.accentText }}>
                      Reply
                    </ThemedText>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          <CommentMenuModal
            visible={menuComment !== null}
            comment={menuComment}
            canDelete={
              menuComment != null &&
              (isAdmin ||
                menuComment.authorId === currentUserId ||
                post?.authorId === currentUserId)
            }
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
            onBlock={() => {
              if (menuComment && onBlockComment) {
                const target = menuComment;
                setMenuComment(null);
                onBlockComment(target);
              }
            }}
          />

          <View
            className="px-4 border-t"
            style={{
              paddingBottom: commentInputBottomPadding,
              paddingTop: 12,
              borderTopColor: theme.cardBorder,
              backgroundColor: theme.modalBg,
            }}
          >
            {replyingTo ? (
              <View
                className="flex-row items-center justify-between rounded-xl px-3 py-2 mb-2 border"
                style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
              >
                <ThemedText variant="accent" className="text-xs font-extrabold">
                  Replying to {replyingTo.authorName}
                </ThemedText>
                <Pressable
                  onPress={() => {
                    setReplyingTo(null);
                  }}
                >
                  <ThemedText variant="muted" className="text-xs font-bold">
                    Cancel
                  </ThemedText>
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
                onFocus={() => {
                  setTimeout(() => scrollCommentsToBottom(true), 250);
                }}
                className="flex-1 rounded-2xl px-4 py-3 text-sm max-h-28"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
              />
              <Pressable
                onPress={() => void handleSend()}
                disabled={sending || !text.trim()}
                className="w-11 h-11 rounded-full items-center justify-center"
                style={{ backgroundColor: text.trim() ? theme.accent : theme.iconMuted }}
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
