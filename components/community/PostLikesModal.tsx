import { Pressable } from "@/components/Pressable";
import { PersonNameSuffix } from "@/components/community/PersonNameSuffix";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import type { LikerProfile } from "@/lib/communityService";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ActivityIndicator, Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PostLikesModalProps = {
  visible: boolean;
  likers: LikerProfile[];
  loading: boolean;
  currentUserId?: string | null;
  friendIds?: Set<string> | string[];
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
};

export function PostLikesModal({
  visible,
  likers,
  loading,
  currentUserId = null,
  friendIds,
  onClose,
  onOpenProfile,
}: PostLikesModalProps) {
  const insets = useSafeAreaInsets();
  const { textPrimary, textSecondary, theme } = useThemedScreen();
  const { modalCardStyle, rowStyle } = useProfileCardStyles();
  const friendSet =
    friendIds instanceof Set ? friendIds : new Set(Array.isArray(friendIds) ? friendIds : []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: theme.modalOverlay }}>
        <View
          className="rounded-t-[28px]"
          style={[modalCardStyle, { paddingBottom: insets.bottom + 16, maxHeight: "70%", borderBottomWidth: 0 }]}
        >
          <View className="px-5 pt-5 pb-3 border-b" style={{ borderBottomColor: theme.cardBorder }}>
            <Text className="text-xl font-extrabold" style={textPrimary}>
              Likes
            </Text>
          </View>
          {loading ? (
            <View className="py-12 items-center">
              <ActivityIndicator color={theme.accentText} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {likers.length === 0 ? (
                <Text className="text-sm text-center py-8" style={{ color: theme.textMuted }}>
                  No likes yet.
                </Text>
              ) : (
                likers.map((liker) => {
                  const isMe = Boolean(currentUserId && liker.id === currentUserId);
                  const isFriend = !isMe && friendSet.has(liker.id);
                  return (
                    <Pressable
                      key={liker.id}
                      onPress={() => onOpenProfile(liker.id)}
                      className="flex-row items-center rounded-2xl px-4 py-3 mb-2"
                      style={rowStyle}
                    >
                      <View className="w-10 h-10 rounded-full bg-[#9fdfb6] items-center justify-center overflow-hidden">
                        {liker.profileImage ? (
                          <Image
                            source={{ uri: liker.profileImage }}
                            style={{ width: 40, height: 40 }}
                            contentFit="cover"
                          />
                        ) : (
                          <Ionicons name="person" size={18} color="white" />
                        )}
                      </View>
                      <View className="flex-1 ml-3 flex-row items-center flex-wrap">
                        <Text className="text-base font-extrabold" style={textPrimary}>
                          {liker.name}
                        </Text>
                        <PersonNameSuffix
                          isMe={isMe}
                          isFriend={isFriend}
                          accentColor={theme.accentText}
                        />
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          )}
          <Pressable
            onPress={onClose}
            className="mx-5 mt-2 rounded-full py-4 items-center border-2"
            style={[rowStyle, { borderColor: theme.cardBorder }]}
          >
            <Text className="text-base font-extrabold tracking-wide" style={textSecondary}>
              Close
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
