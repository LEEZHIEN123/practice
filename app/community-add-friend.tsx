import { Pressable } from "@/components/Pressable";
import { CommunitySearchBar } from "@/components/community/CommunitySearchBar";
import { UserProfileModal } from "@/components/community/UserProfileModal";
import {
  ProfileScreenHeader,
  ThemedScreen,
  ThemedText,
  useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import {
  acceptFriendRequest,
  ensureDirectChat,
  getFriendRelation,
  getPendingIncomingFriendRequest,
  getPostsByAuthor,
  getPublicUserProfile,
  loadFriendRelations,
  rejectFriendRequest,
  resolveAdminUid,
  resolveFriendRequestNotificationByRequestId,
  searchUsersForAdding,
  sendFriendRequest,
  subscribePosts,
} from "@/lib/communityService";
import type {
  CommunityPost,
  FriendRelation,
  PublicUserProfile,
  RegisteredUser,
} from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";

function ProfileAvatar({ uri, size = 44 }: { uri: string | null; size?: number }) {
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

function relationLabel(relation: FriendRelation): string {
  if (relation === "friends") return "Friends";
  if (relation === "pending_outgoing") return "Pending";
  if (relation === "pending_incoming") return "+ Friend";
  return "Add";
}

export default function CommunityAddFriendScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cardStyle, theme } = useThemedScreen();
  const { rowStyle } = useProfileCardStyles();

  const [currentUserId, setCurrentUserId] = useState(auth.currentUser?.uid ?? null);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);

  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<RegisteredUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [relationMap, setRelationMap] = useState<Record<string, FriendRelation>>({});
  const [actionId, setActionId] = useState<string | null>(null);

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<PublicUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFriendBusy, setProfileFriendBusy] = useState(false);
  const [profileRelation, setProfileRelation] = useState<FriendRelation>("none");

  const profilePosts = useMemo(
    () => (profileUserId ? getPostsByAuthor(posts, profileUserId, currentUserId) : []),
    [posts, profileUserId, currentUserId]
  );

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid ?? null);
    });
    void resolveAdminUid().then(setAdminUid).catch(() => setAdminUid(null));
    const unsubPosts = subscribePosts(setPosts, () => {});
    return () => {
      unsubAuth();
      unsubPosts();
    };
  }, []);

  useEffect(() => {
    const trimmed = searchText.trim();
    if (trimmed.length < 1) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          setSearching(true);
          const results = await searchUsersForAdding(trimmed);
          setSearchResults(results);
          const relations: Record<string, FriendRelation> = {};
          await Promise.all(
            results.map(async (user) => {
              relations[user.id] = await getFriendRelation(user.id);
            })
          );
          setRelationMap(relations);
        } catch {
          setSearchResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 350);

    return () => clearTimeout(timer);
  }, [searchText]);

  const openUserProfile = useCallback(async (userId: string) => {
    setProfileUserId(userId);
    setProfileLoading(true);
    setProfileData(null);
    setProfileRelation("none");
    try {
      const profile = await getPublicUserProfile(userId);
      setProfileData(profile);
      if (userId !== auth.currentUser?.uid) {
        const relations = await loadFriendRelations([userId]);
        const relation = relations[userId] ?? "none";
        setProfileRelation(relation);
        setRelationMap((prev) => ({ ...prev, [userId]: relation }));
      }
    } catch (e: unknown) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not load profile."
      );
      setProfileUserId(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const closeProfile = () => {
    setProfileUserId(null);
    setProfileData(null);
    setProfileRelation("none");
  };

  const handleAddFriend = useCallback(async (user: RegisteredUser) => {
    try {
      setActionId(user.id);
      await sendFriendRequest(user.id);
      setRelationMap((prev) => ({ ...prev, [user.id]: "pending_outgoing" }));
      if (profileUserId === user.id) setProfileRelation("pending_outgoing");
      Alert.alert("Request sent", `Friend request sent to ${user.name}.`);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not send request.");
    } finally {
      setActionId(null);
    }
  }, [profileUserId]);

  const handleAddFromProfile = async () => {
    if (!profileUserId || profileUserId === adminUid) return;
    try {
      setProfileFriendBusy(true);
      await sendFriendRequest(profileUserId);
      setProfileRelation("pending_outgoing");
      setRelationMap((prev) => ({ ...prev, [profileUserId]: "pending_outgoing" }));
      Alert.alert("Friend request sent", "They will be notified.");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not send request.");
    } finally {
      setProfileFriendBusy(false);
    }
  };

  const handleAcceptFromProfile = async () => {
    if (!profileUserId) return;
    try {
      setProfileFriendBusy(true);
      const request = await getPendingIncomingFriendRequest(profileUserId);
      if (!request || request.status !== "pending") {
        Alert.alert("Unavailable", "This friend request is no longer pending.");
        const relations = await loadFriendRelations([profileUserId]);
        const relation = relations[profileUserId] ?? "none";
        setProfileRelation(relation);
        setRelationMap((prev) => ({ ...prev, [profileUserId]: relation }));
        return;
      }
      await acceptFriendRequest(request);
      await resolveFriendRequestNotificationByRequestId(request.id, "accepted");
      setProfileRelation("friends");
      setRelationMap((prev) => ({ ...prev, [profileUserId]: "friends" }));
      Alert.alert("Friend added", `You are now friends with ${profileData?.name ?? "this user"}.`);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not accept request.");
    } finally {
      setProfileFriendBusy(false);
    }
  };

  const handleDeclineFromProfile = async () => {
    if (!profileUserId) return;
    try {
      setProfileFriendBusy(true);
      const request = await getPendingIncomingFriendRequest(profileUserId);
      if (!request) {
        Alert.alert("Unavailable", "This friend request is no longer pending.");
        return;
      }
      await rejectFriendRequest(request.id);
      await resolveFriendRequestNotificationByRequestId(request.id, "rejected");
      setProfileRelation("none");
      setRelationMap((prev) => ({ ...prev, [profileUserId]: "none" }));
      closeProfile();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not decline request.");
    } finally {
      setProfileFriendBusy(false);
    }
  };

  const handleChatFromProfile = async () => {
    if (!profileUserId || profileUserId === currentUserId) return;
    if (profileRelation !== "friends") {
      Alert.alert("Add friend first", "You can chat after becoming friends.");
      return;
    }
    try {
      const chatId = await ensureDirectChat(profileUserId);
      const name = profileData?.name ?? "Friend";
      const image = profileData?.profileImage ?? "";
      closeProfile();
      router.push({
        pathname: "/community-chat" as any,
        params: {
          chatId,
          name,
          image,
          isSupport: "0",
          otherUserId: profileUserId,
        },
      });
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not open chat.");
    }
  };

  return (
    <ThemedScreen style={{ paddingTop: insets.top + 12 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="px-4">
          <ProfileScreenHeader title="Add Friend" onBack={() => router.back()} />
        </View>

        <View className="px-4 mt-2">
          <CommunitySearchBar
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search by name or email..."
            loading={searching}
            className="mb-3"
          />
        </View>

        <ScrollView
          className="flex-1 px-4"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {searchText.trim().length < 1 ? (
            <ThemedText variant="muted" className="text-sm text-center py-8">
              Search for an account to send a friend request.
            </ThemedText>
          ) : searchResults.length === 0 && !searching ? (
            <ThemedText variant="muted" className="text-sm text-center py-8">
              No matching accounts found.
            </ThemedText>
          ) : (
            searchResults.map((user) => {
              const relation = relationMap[user.id] ?? "none";
              const isFriend = relation === "friends";
              const isPending =
                relation === "pending_outgoing" || relation === "pending_incoming";
              return (
                <View
                  key={user.id}
                  className="flex-row items-center rounded-xl px-3 py-3 mb-2"
                  style={cardStyle}
                >
                  <Pressable onPress={() => void openUserProfile(user.id)}>
                    <ProfileAvatar uri={user.profileImage} size={40} />
                  </Pressable>
                  <Pressable onPress={() => void openUserProfile(user.id)} className="flex-1 ml-3">
                    <ThemedText className="text-sm font-extrabold">{user.name}</ThemedText>
                    <ThemedText variant="muted" className="text-xs mt-0.5">
                      {user.email}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (relation === "none") void handleAddFriend(user);
                      else if (relation === "pending_incoming") void openUserProfile(user.id);
                    }}
                    disabled={
                      isFriend || relation === "pending_outgoing" || actionId === user.id
                    }
                    className="rounded-full px-3 py-1.5"
                    style={isFriend || isPending ? rowStyle : { backgroundColor: "#52B69A" }}
                  >
                    {actionId === user.id ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text
                        className="text-xs font-extrabold"
                        style={{ color: isFriend || isPending ? theme.textMuted : "white" }}
                      >
                        {relationLabel(relation)}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <UserProfileModal
        visible={profileUserId !== null}
        profile={profileData}
        posts={profilePosts}
        relation={profileRelation}
        loading={profileLoading}
        isSelf={profileUserId === currentUserId}
        isSupportAdmin={profileUserId === adminUid}
        canAddFriend={profileUserId !== adminUid && profileUserId !== currentUserId}
        onClose={closeProfile}
        onAddFriend={() => void handleAddFromProfile()}
        onAcceptFriend={() => void handleAcceptFromProfile()}
        onDeclineFriend={() => void handleDeclineFromProfile()}
        friendActionBusy={profileFriendBusy}
        onChat={
          profileUserId &&
          profileUserId !== currentUserId &&
          profileRelation === "friends"
            ? () => void handleChatFromProfile()
            : undefined
        }
        onOpenPost={(postId) => {
          closeProfile();
          router.push({
            pathname: "/community-post" as any,
            params: { postId },
          });
        }}
      />
    </ThemedScreen>
  );
}
