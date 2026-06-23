import { Pressable } from "@/components/Pressable";
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/40 justify-end">
        <View
          className="bg-white rounded-t-[28px] border border-gray-200"
          style={{ paddingBottom: insets.bottom + 16, maxHeight: "70%" }}
        >
          <View className="px-5 pt-5 pb-3 border-b border-gray-100">
            <Text className="text-xl font-extrabold text-gray-900">Likes</Text>
          </View>
          {loading ? (
            <View className="py-12 items-center">
              <ActivityIndicator color="#52B69A" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {likers.length === 0 ? (
                <Text className="text-sm text-gray-500 text-center py-8">No likes yet.</Text>
              ) : (
                likers.map((liker) => (
                  <Pressable
                    key={liker.id}
                    onPress={() => onOpenProfile(liker.id)}
                    className="flex-row items-center bg-[#f3f4f3] rounded-2xl px-4 py-3 mb-2 border border-gray-200 active:bg-[#ececec]"
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
                    <Text className="ml-3 text-base font-extrabold text-gray-900">{liker.name}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          )}
          <Pressable onPress={onClose} className="mx-5 mt-2 rounded-full py-3.5 items-center bg-[#f3f4f3]">
            <Text className="text-sm font-extrabold text-gray-600">Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
