import { Pressable } from "@/components/Pressable";
import { ThemedBackButton, ThemedCard, ThemedText } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import type { PostEditSnapshot } from "@/lib/communityTypes";
import { Image } from "expo-image";
import { Modal, ScrollView, View } from "react-native";
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
  const { screenStyle } = useThemedScreen();
  const sorted = [...history].sort((a, b) => b.editedAt - a.editedAt);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1" style={[screenStyle, { paddingTop: insets.top }]}>
        <View className="flex-row items-center px-4 py-3">
          <ThemedBackButton onPress={onClose} className="w-11 h-11 mr-3" />
          <ThemedText className="text-xl font-extrabold flex-1">Edit history</ThemedText>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          <ThemedText variant="muted" className="text-sm mb-4">
            Previous versions of {authorName}&apos;s post
          </ThemedText>
          {sorted.length === 0 ? (
            <ThemedText variant="muted" className="text-sm text-center py-8">
              No edit history.
            </ThemedText>
          ) : (
            sorted.map((entry, index) => (
              <ThemedCard key={`${entry.editedAt}-${index}`} rounded="2xl" className="p-4 mb-3">
                <ThemedText variant="muted" className="text-[10px] font-bold mb-2">
                  {new Date(entry.editedAt).toLocaleString()}
                </ThemedText>
                <ThemedText variant="secondary" className="text-sm leading-6">
                  {entry.content}
                </ThemedText>
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
                      <ThemedText key={tag} variant="accent" className="text-[10px] font-bold">
                        #{tag}
                      </ThemedText>
                    ))}
                  </View>
                ) : null}
              </ThemedCard>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
