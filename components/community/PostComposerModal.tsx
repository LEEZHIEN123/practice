import { Pressable } from "@/components/Pressable";
import { DEFAULT_POST_TAGS } from "@/lib/communityTypes";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
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

export type PostComposerValues = {
  content: string;
  tags: string[];
};

type PostComposerModalProps = {
  visible: boolean;
  title: string;
  initial?: PostComposerValues;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: PostComposerValues) => Promise<void>;
};

export function PostComposerModal({
  visible,
  title,
  initial,
  submitting,
  onClose,
  onSubmit,
}: PostComposerModalProps) {
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");

  useEffect(() => {
    if (!visible) return;
    setContent(initial?.content ?? "");
    setTags(initial?.tags ?? []);
    setCustomTag("");
  }, [visible, initial]);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? prev.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...prev, tag]
    );
  };

  const addCustomTag = () => {
    const trimmed = customTag.trim();
    if (!trimmed) return;
    if (!tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setTags((prev) => [...prev, trimmed]);
    }
    setCustomTag("");
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert("Post", "Add some text to your post.");
      return;
    }
    await onSubmit({ content, tags });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1 bg-[#f3f4f3]"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ paddingTop: insets.top + 8 }} className="flex-1">
          <View className="flex-row items-center px-4 mb-4">
            <Pressable
              onPress={onClose}
              className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
            >
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
            <Text className="text-xl font-extrabold text-gray-900 flex-1">{title}</Text>
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={submitting}
              className="rounded-full px-5 py-2.5 bg-[#52B69A]"
            >
              {submitting ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-sm font-extrabold text-white">Post</Text>
              )}
            </Pressable>
          </View>

          <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 24 }}>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="Share your progress, meal, workout, or thoughts..."
              multiline
              className="bg-white rounded-2xl px-4 py-4 border border-gray-200 text-sm text-gray-800 min-h-[120px]"
              placeholderTextColor="#9ca3af"
            />

            <Text className="text-sm font-extrabold text-gray-900 mt-5 mb-2">Tags</Text>
            <View className="flex-row flex-wrap gap-2">
              {DEFAULT_POST_TAGS.map((tag) => {
                const active = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
                return (
                  <Pressable
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    className={`rounded-full px-3 py-1.5 border ${
                      active ? "bg-[#eaf7f0] border-[#52B69A]" : "bg-white border-gray-200"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${active ? "text-[#52B69A]" : "text-gray-600"}`}
                    >
                      #{tag}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="flex-row items-center mt-3 gap-2">
              <TextInput
                value={customTag}
                onChangeText={setCustomTag}
                placeholder="Custom tag"
                className="flex-1 bg-white rounded-full px-4 py-2.5 border border-gray-200 text-sm"
                placeholderTextColor="#9ca3af"
                onSubmitEditing={addCustomTag}
              />
              <Pressable
                onPress={addCustomTag}
                className="w-10 h-10 rounded-full bg-[#52B69A] items-center justify-center"
              >
                <Ionicons name="add" size={20} color="white" />
              </Pressable>
            </View>

            {tags.length > 0 ? (
              <View className="flex-row flex-wrap gap-2 mt-3">
                {tags.map((tag) => (
                  <Pressable
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    className="flex-row items-center rounded-full px-3 py-1.5 bg-[#eaf7f0] border border-[#52B69A]"
                  >
                    <Text className="text-xs font-bold text-[#52B69A]">#{tag}</Text>
                    <Ionicons name="close" size={14} color="#52B69A" style={{ marginLeft: 4 }} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
