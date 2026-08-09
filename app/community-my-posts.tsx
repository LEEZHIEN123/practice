import { CommunitySearchBar } from "@/components/community/CommunitySearchBar";
import { PostImagesGallery } from "@/components/community/PostImagesGallery";
import { PostAchievementChips } from "@/components/community/PostAchievementChips";
import { PostMenuModal } from "@/components/community/PostMenuModal";
import { ReReviewReasonModal } from "@/components/community/ReReviewReasonModal";
import { Pressable } from "@/components/Pressable";
import {
  ProfileScreenHeader,
  ThemedCard,
  ThemedText,
} from "@/components/themed/ThemedUi";
import { formatCalendarDayKey } from "@/lib/calendarDay";
import { formatPostDisplayTime } from "@/lib/chatMessageUtils";
import {
  checkIsAdmin,
  deletePost,
  getPublicUserProfile,
  requestBlockedPostReReview,
  setPostAuthorHidden,
  subscribeMyAuthoredPosts,
  subscribePendingCommunityPostIds,
} from "@/lib/communityService";
import { patchCommunityPost, removeCommunityPost } from "@/lib/communityBootstrap";
import type { CommunityPost, PublicUserProfile } from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useUserCalendarTimezone } from "@/lib/useUserCalendarTimezone";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";

const ADMIN_BLUE = "#2563eb";
const USER_GREEN = "#52B69A";

function ProfileAvatar({
  uri,
  size = 72,
  placeholderColor = "#9fdfb6",
}: {
  uri: string | null;
  size?: number;
  placeholderColor?: string;
}) {
  return (
    <View
      className="rounded-full items-center justify-center overflow-hidden"
      style={{ width: size, height: size, backgroundColor: placeholderColor }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Ionicons name="person" size={size * 0.42} color="white" />
      )}
    </View>
  );
}

export default function CommunityMyPostsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const calendarTz = useUserCalendarTimezone();
  const { screenStyle, cardStyle, textPrimary, textMuted, textSecondary, theme } = useThemedScreen();

  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [authoredPosts, setAuthoredPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuPost, setMenuPost] = useState<CommunityPost | null>(null);
  const [reReviewPost, setReReviewPost] = useState<CommunityPost | null>(null);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const [pendingReviewPostIds, setPendingReviewPostIds] = useState<string[]>([]);

  const accent = isAdminUser ? ADMIN_BLUE : theme.accentText;
  const controlAccent = isAdminUser ? ADMIN_BLUE : USER_GREEN;
  const avatarPlaceholder = isAdminUser ? ADMIN_BLUE : "#9fdfb6";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      if (user) {
        void checkIsAdmin(user).then(setIsAdminUser);
      } else {
        setIsAdminUser(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribePendingCommunityPostIds(setPendingReviewPostIds);
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    void getPublicUserProfile(uid)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setProfileLoading(false));
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setAuthoredPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubMine = subscribeMyAuthoredPosts(
      uid,
      (next) => {
        setAuthoredPosts(next);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => {
      unsubMine();
    };
  }, [uid]);

  const filteredPosts = useMemo(() => {
    let list = authoredPosts;

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const hay = `${p.content} ${p.authorName} ${p.tags.join(" ")}`.toLowerCase();
        return hay.includes(q);
      });
    }

    if (filterDate) {
      const dayKey = formatCalendarDayKey(filterDate, calendarTz);
      list = list.filter(
        (p) => formatCalendarDayKey(new Date(p.createdAt), calendarTz) === dayKey
      );
    }

    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [authoredPosts, filterDate, calendarTz, searchQuery]);

  const openPost = (postId: string) => {
    router.push({
      pathname: "/community-post" as any,
      params: { postId },
    });
  };

  const handleDelete = (post: CommunityPost) => {
    const pendingReview = post.underReview || post.blocked;
    Alert.alert(
      "Delete post",
      pendingReview
        ? "This post is under Support Admin review. Delete it permanently? It will be removed for everyone and cleared from the admin review queue."
        : "Delete this post permanently?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // Remove from Community feed immediately; Firestore delete follows.
            removeCommunityPost(post.id);
            setAuthoredPosts((prev) => prev.filter((item) => item.id !== post.id));
            setMenuPost(null);
            void deletePost(post.id).catch((e: unknown) => {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not delete post.");
            });
          },
        },
      ]
    );
  };

  const handleToggleAuthorHidden = (post: CommunityPost) => {
    const nextHidden = !post.authorHidden;
    Alert.alert(
      nextHidden ? "Hide from everyone?" : "Show to community?",
      nextHidden
        ? "This post will be hidden from the community. Only you can see it on your profile."
        : "This post will be visible in the community again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: nextHidden ? "Hide" : "Show",
          onPress: () => {
            const optimistic = { ...post, authorHidden: nextHidden };
            setAuthoredPosts((prev) =>
              prev.map((item) => (item.id === post.id ? optimistic : item))
            );
            patchCommunityPost(optimistic);
            setMenuPost(null);
            void setPostAuthorHidden(post, nextHidden).catch((e: unknown) => {
              setAuthoredPosts((prev) =>
                prev.map((item) => (item.id === post.id ? post : item))
              );
              patchCommunityPost(post);
              Alert.alert(
                "Error",
                e instanceof Error ? e.message : "Could not update post visibility."
              );
            });
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1" style={screenStyle}>
      <View style={{ paddingTop: insets.top + 12 }} className="px-4">
        <ProfileScreenHeader
          title="My Profile"
          onBack={() => {
            if (router.canGoBack()) {
              router.back();
            } else if (isAdminUser) {
              router.replace("/admin" as any);
            } else {
              router.replace("/community" as any);
            }
          }}
        />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-4 mb-4">
          {profileLoading ? (
            <View className="py-8 items-center">
              <ActivityIndicator color={accent} />
            </View>
          ) : profile ? (
            <>
              <View className="items-center mb-4">
                <Pressable
                  onPress={() => {
                    if (profile.profileImage) setAvatarViewerOpen(true);
                  }}
                  disabled={!profile.profileImage}
                  accessibilityRole="button"
                  accessibilityLabel="View profile photo"
                >
                  <ProfileAvatar
                    uri={profile.profileImage}
                    size={80}
                    placeholderColor={avatarPlaceholder}
                  />
                </Pressable>
                <View className="flex-row items-center mt-3 gap-2">
                  <Text className="text-2xl font-extrabold" style={textPrimary}>
                    {profile.name}
                  </Text>
                  {isAdminUser ? (
                    <View className="rounded-full bg-[#dbeafe] items-center justify-center w-7 h-7">
                      <Ionicons name="shield-checkmark" size={15} color={ADMIN_BLUE} />
                    </View>
                  ) : null}
                </View>
              </View>
              <ThemedCard rounded="2xl" className="p-4 mb-4">
                <View className="flex-row items-start justify-between mb-2">
                  <ThemedText className="font-bold text-sm flex-1 pr-2">Details</ThemedText>
                  <Pressable
                    onPress={() =>
                      router.push((isAdminUser ? "/EditAdminProfile" : "/EditProfile") as any)
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Edit profile details"
                    className="w-9 h-9 rounded-xl items-center justify-center"
                    style={
                      isAdminUser
                        ? { backgroundColor: "#dbeafe" }
                        : undefined
                    }
                  >
                    <Ionicons
                      name="create-outline"
                      size={20}
                      color={isAdminUser ? ADMIN_BLUE : theme.textPrimary}
                    />
                  </Pressable>
                </View>
                <View className="gap-2">
                  {profile.goal ? (
                    <ThemedText variant="secondary" className="text-sm">
                      <ThemedText className="font-bold">Goal: </ThemedText>
                      {profile.goal}
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
                  {!profile.goal &&
                  profile.height == null &&
                  profile.weight == null &&
                  !profile.bio ? (
                    <ThemedText variant="muted" className="text-sm">
                      No profile details yet.
                    </ThemedText>
                  ) : null}
                </View>
              </ThemedCard>
            </>
          ) : null}

          <Text className="text-lg font-extrabold mb-2" style={textPrimary}>
            {filterDate ? "Posts" : "All Post"}
          </Text>

          <View className="flex-row items-center gap-2 mb-2">
            <View className="flex-1">
              <CommunitySearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search posts..."
                className="mb-0"
              />
            </View>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="w-12 h-12 rounded-2xl items-center justify-center border"
              style={
                filterDate
                  ? { backgroundColor: isAdminUser ? "#dbeafe" : theme.accentSoft, borderColor: accent }
                  : cardStyle
              }
            >
              <Ionicons
                name={filterDate ? "calendar" : "calendar-outline"}
                size={22}
                color={filterDate ? accent : theme.iconMuted}
              />
            </Pressable>
            {filterDate ? (
              <Pressable
                onPress={() => setFilterDate(null)}
                className="rounded-2xl px-3 py-3 border"
                style={
                  isAdminUser
                    ? { backgroundColor: "#dbeafe", borderColor: ADMIN_BLUE }
                    : cardStyle
                }
              >
                <Text className="text-[10px] font-extrabold" style={{ color: accent }}>
                  All
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text className="text-sm font-semibold mb-3" style={textMuted}>
            {filterDate
              ? filterDate.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "All dates"}
          </Text>
        </View>

        {showDatePicker ? (
          <DateTimePicker
            value={filterDate ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            maximumDate={new Date()}
            onChange={(event, date) => {
              if (Platform.OS === "android") setShowDatePicker(false);
              if (event.type === "dismissed") return;
              if (date) setFilterDate(date);
            }}
          />
        ) : null}
        {showDatePicker && Platform.OS === "ios" ? (
          <View className="px-4 mb-2 flex-row justify-end">
            <Pressable onPress={() => setShowDatePicker(false)} className="px-4 py-2">
              <Text className="text-sm font-extrabold" style={{ color: accent }}>
                Done
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View className="px-4">
          {loading ? (
            <View className="py-16 items-center">
              <ActivityIndicator size="large" color={accent} />
            </View>
          ) : filteredPosts.length === 0 ? (
            <ThemedCard className="p-6 items-center">
              <ThemedText variant="muted" className="text-sm text-center">
                No posts found.
              </ThemedText>
            </ThemedCard>
          ) : (
            filteredPosts.map((post) => (
              <Pressable key={post.id} onPress={() => openPost(post.id)} className="mb-3">
                <ThemedCard rounded="2xl" className="p-4">
                  <View className="flex-row items-center">
                    <ProfileAvatar
                      uri={post.authorProfileImage ?? profile?.profileImage ?? null}
                      size={48}
                      placeholderColor={avatarPlaceholder}
                    />
                    <View className="flex-1 ml-3">
                      <Text className="text-base font-extrabold" style={textPrimary}>
                        {post.authorName || profile?.name || "You"}
                        <Text className="text-sm font-bold" style={{ color: accent }}>
                          {" "}
                          · me
                        </Text>
                      </Text>
                      <Text className="text-[10px] mt-0.5" style={textMuted}>
                        {formatPostDisplayTime(post.createdAt)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setMenuPost(post)}
                      hitSlop={8}
                      className="w-9 h-9 rounded-full items-center justify-center"
                    >
                      <Ionicons name="ellipsis-vertical" size={20} color={theme.iconMuted} />
                    </Pressable>
                  </View>

                  {post.blocked ? (
                    <View
                      className="mt-2.5 rounded-lg px-2.5 py-1.5 border"
                      style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}
                    >
                      <Text className="text-[11px] font-semibold text-[#b91c1c]">
                        {post.underReview
                          ? "Hidden while Support Admin reviews your request."
                          : "Hidden by Support Admin. Only you can see this here."}
                      </Text>
                    </View>
                  ) : post.authorHidden ? (
                    <View
                      className="mt-2.5 rounded-lg px-2.5 py-1.5 border"
                      style={{ backgroundColor: "#f8fafc", borderColor: "#cbd5e1" }}
                    >
                      <Text className="text-[11px] font-semibold" style={{ color: "#475569" }}>
                        Hidden from everyone. Only you can see this here.
                      </Text>
                    </View>
                  ) : post.underReview || pendingReviewPostIds.includes(post.id) ? (
                    <View
                      className="mt-2.5 rounded-lg px-2.5 py-1.5 border"
                      style={{ backgroundColor: "#fff7ed", borderColor: "#fdba74" }}
                    >
                      <Text className="text-[11px] font-semibold text-[#c2410c]">
                        Under review. Please be careful with community guidelines.
                      </Text>
                    </View>
                  ) : null}

                  {post.content ? (
                    <Text className="text-base mt-3 leading-7" style={textSecondary}>
                      {post.content}
                    </Text>
                  ) : null}
                  <PostAchievementChips achievementIds={post.achievementIds ?? []} compact />
                  <PostImagesGallery imageUrls={post.imageUrls} maxHeight={160} />
                  {post.tags.length > 0 ? (
                    <View className="flex-row flex-wrap gap-1.5 mt-2">
                      {post.tags.map((tag) => (
                        <Text
                          key={tag}
                          className="text-[10px] font-bold"
                          style={{ color: accent }}
                        >
                          #{tag}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  <View className="flex-row items-center mt-3 gap-4">
                    <View className="flex-row items-center">
                      <Ionicons
                        name={uid && post.likedBy.includes(uid) ? "heart" : "heart-outline"}
                        size={16}
                        color={uid && post.likedBy.includes(uid) ? "#ef4444" : controlAccent}
                      />
                      <Text className="text-xs font-bold ml-1.5" style={{ color: accent }}>
                        {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
                      </Text>
                    </View>
                    <View className="flex-row items-center">
                      <Ionicons name="chatbubble-outline" size={15} color={controlAccent} />
                      <Text className="text-xs font-bold ml-1.5" style={{ color: accent }}>
                        {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
                      </Text>
                    </View>
                  </View>
                </ThemedCard>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <PostMenuModal
        visible={menuPost != null}
        post={menuPost}
        isOwnPost
        onClose={() => setMenuPost(null)}
        onEdit={() => {
          setMenuPost(null);
          Alert.alert("Edit", "Open the post from the community feed to edit it.");
        }}
        onDelete={() => {
          if (!menuPost) return;
          const post = menuPost;
          setMenuPost(null);
          handleDelete(post);
        }}
        onEditHistory={() => setMenuPost(null)}
        onReport={() => setMenuPost(null)}
        onRequestReReview={
          menuPost?.blocked && !menuPost.underReview
            ? () => {
                const post = menuPost;
                setMenuPost(null);
                if (post) setReReviewPost(post);
              }
            : undefined
        }
        onToggleAuthorHidden={
          menuPost && !menuPost.blocked
            ? () => {
                const post = menuPost;
                setMenuPost(null);
                if (post) handleToggleAuthorHidden(post);
              }
            : undefined
        }
      />

      <ReReviewReasonModal
        visible={reReviewPost != null}
        onClose={() => setReReviewPost(null)}
        onSubmit={async (reason) => {
          if (!reReviewPost) return;
          await requestBlockedPostReReview(reReviewPost.id, reason);
          setAuthoredPosts((prev) =>
            prev.map((item) =>
              item.id === reReviewPost.id ? { ...item, underReview: true } : item
            )
          );
          setReReviewPost(null);
        }}
      />

      <Modal
        visible={avatarViewerOpen && !!profile?.profileImage}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarViewerOpen(false)}
      >
        <View className="flex-1 bg-black">
          <Pressable className="flex-1" onPress={() => setAvatarViewerOpen(false)}>
            {profile?.profileImage ? (
              <Image
                source={{ uri: profile.profileImage }}
                style={{ flex: 1, width: "100%" }}
                contentFit="contain"
              />
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => setAvatarViewerOpen(false)}
            className="absolute right-4 w-10 h-10 rounded-full items-center justify-center"
            style={{ top: insets.top + 12, backgroundColor: "rgba(0,0,0,0.5)" }}
            accessibilityRole="button"
            accessibilityLabel="Close profile photo"
          >
            <Ionicons name="close" size={24} color="#ffffff" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
