import { Pressable } from "@/components/Pressable";
import { ProfileScreenHeader, ThemedText, useProfileCardStyles } from "@/components/themed/ThemedUi";
import { DEFAULT_POST_TAGS } from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
  const { screenStyle, cardStyle, theme } = useThemedScreen();
  const { inputStyle, placeholderColor } = useProfileCardStyles();
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setBusy(false);
      return;
    }
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
    if (submitting || busy) return;
    if (!content.trim()) {
      Alert.alert("Post", "Add some text to your post.");
      return;
    }
    setBusy(true);
    Keyboard.dismiss();
    try {
      await onSubmit({ content, tags });
    } finally {
      setBusy(false);
    }
  };

  const isSubmitting = submitting || busy;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1"
        style={screenStyle}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ paddingTop: insets.top + 12 }} className="flex-1">
          <View className="px-4 mb-4">
            <ProfileScreenHeader
              title={title}
              onBack={onClose}
              backIcon="close"
              titleClassName="text-2xl"
              rightSlot={
                <Pressable
                  onPress={() => void handleSubmit()}
                  disabled={isSubmitting}
                  hitSlop={8}
                  className="rounded-full px-5 py-2.5"
                  style={{ backgroundColor: "#52B69A", opacity: isSubmitting ? 0.7 : 1 }}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text className="text-sm font-extrabold text-white">Post</Text>
                  )}
                </Pressable>
              }
            />
          </View>

          <ScrollView
            className="flex-1 px-4"
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="Share your progress, meal, workout, or thoughts..."
              multiline
              className="rounded-2xl px-4 py-4 text-sm min-h-[120px]"
              style={inputStyle}
              placeholderTextColor={placeholderColor}
            />

            <ThemedText className="text-sm font-extrabold mt-5 mb-2">Tags</ThemedText>
            <View className="flex-row flex-wrap gap-2">
              {DEFAULT_POST_TAGS.map((tag) => {
                const active = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
                return (
                  <Pressable
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    className="rounded-full px-3 py-1.5 border"
                    style={
                      active
                        ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
                        : cardStyle
                    }
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{ color: active ? theme.accentText : theme.textSecondary }}
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
                className="flex-1 rounded-full px-4 py-2.5 text-sm"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
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
                    className="flex-row items-center rounded-full px-3 py-1.5 border"
                    style={{ backgroundColor: theme.accentSoft, borderColor: theme.accent }}
                  >
                    <Text className="text-xs font-bold" style={{ color: theme.accentText }}>
                      #{tag}
                    </Text>
                    <Ionicons name="close" size={14} color={theme.accentText} style={{ marginLeft: 4 }} />
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
