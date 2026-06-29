import { Pressable } from "@/components/Pressable";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import type { LikerProfile } from "@/lib/communityService";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ActivityIndicator, Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PostLikesModalProps = {
  visible: boolean;
  likers: LikerProfile[];
  loading: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
};

export function PostLikesModal({
  visible,
  likers,
  loading,
  onClose,
  onOpenProfile,
}: PostLikesModalProps) {
  const insets = useSafeAreaInsets();
  const { textPrimary, textSecondary, theme } = useThemedScreen();
  const { modalCardStyle, rowStyle } = useProfileCardStyles();

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
                likers.map((liker) => (
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
                    <Text className="ml-3 text-base font-extrabold" style={textPrimary}>
                      {liker.name}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          )}
          <Pressable
            onPress={onClose}
            className="mx-5 mt-2 rounded-full py-3.5 items-center"
            style={rowStyle}
          >
            <Text className="text-sm font-extrabold" style={textSecondary}>
              Close
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
