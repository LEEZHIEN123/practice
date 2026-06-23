import { Pressable } from "@/components/Pressable";
import type { PostEditSnapshot } from "@/lib/communityTypes";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PostEditHistoryModalProps = {
  visible: boolean;
  authorName: string;
  history: PostEditSnapshot[];
  onClose: () => void;
};

export function PostEditHistoryModal({
  visible,
  authorName,
  history,
  onClose,
}: PostEditHistoryModalProps) {
  const insets = useSafeAreaInsets();
  const sorted = [...history].sort((a, b) => b.editedAt - a.editedAt);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-[#f3f4f3]" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={onClose}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <Text className="text-xl font-extrabold text-gray-900 flex-1">Edit history</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          <Text className="text-sm text-gray-500 mb-4">
            Previous versions of {authorName}&apos;s post
          </Text>
          {sorted.length === 0 ? (
            <Text className="text-sm text-gray-500 text-center py-8">No edit history.</Text>
          ) : (
            sorted.map((entry, index) => (
              <View
                key={`${entry.editedAt}-${index}`}
                className="bg-white rounded-2xl p-4 border border-gray-200 mb-3"
              >
                <Text className="text-[10px] font-bold text-gray-400 mb-2">
                  {new Date(entry.editedAt).toLocaleString()}
                </Text>
                <Text className="text-sm text-gray-700 leading-6">{entry.content}</Text>
                {entry.imageUrl ? (
                  <Image
                    source={{ uri: entry.imageUrl }}
                    style={{ width: "100%", height: 140, borderRadius: 12, marginTop: 8 }}
                    contentFit="cover"
                  />
                ) : null}
                {entry.tags.length > 0 ? (
                  <View className="flex-row flex-wrap gap-1.5 mt-2">
                    {entry.tags.map((tag) => (
                      <Text key={tag} className="text-[10px] font-bold text-[#52B69A]">
                        #{tag}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
