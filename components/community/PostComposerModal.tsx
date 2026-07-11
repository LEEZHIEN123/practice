import { Pressable } from "@/components/Pressable";
import { ProfileScreenHeader, ThemedText, useProfileCardStyles } from "@/components/themed/ThemedUi";
import {
  listCompletedAchievementsForShare,
  type ShareableAchievement,
} from "@/lib/achievements";
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
  achievementIds: string[];
};

type PostComposerModalProps = {
  visible: boolean;
  title: string;
  initial?: Partial<PostComposerValues>;
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
  const [achievementIds, setAchievementIds] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [completedAchievements, setCompletedAchievements] = useState<ShareableAchievement[]>([]);
  const [loadingAchievements, setLoadingAchievements] = useState(false);
  const [achievementsExpanded, setAchievementsExpanded] = useState(false);

  useEffect(() => {
    if (!visible) {
      setBusy(false);
      return;
    }
    setContent(initial?.content ?? "");
    setTags(initial?.tags ?? []);
    setAchievementIds(initial?.achievementIds ?? []);
    setCustomTag("");
    setAchievementsExpanded(false);

    let cancelled = false;
    setLoadingAchievements(true);
    void listCompletedAchievementsForShare()
      .then((rows) => {
        if (!cancelled) setCompletedAchievements(rows);
      })
      .catch(() => {
        if (!cancelled) setCompletedAchievements([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAchievements(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, initial]);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? prev.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...prev, tag]
    );
  };

  const toggleAchievement = (id: string) => {
    setAchievementIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setTags((tagsPrev) => {
        const hasAchievementTag = tagsPrev.some((t) => t.toLowerCase() === "achievement");
        if (next.length > 0 && !hasAchievementTag) return [...tagsPrev, "Achievement"];
        if (next.length === 0 && hasAchievementTag) {
          return tagsPrev.filter((t) => t.toLowerCase() !== "achievement");
        }
        return tagsPrev;
      });
      return next;
    });
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
      await onSubmit({ content, tags, achievementIds });
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

            <Text className="text-base font-extrabold mt-5 mb-1" style={{ color: theme.textPrimary }}>
              Share achievements
            </Text>
            <ThemedText variant="muted" className="text-xs mb-2">
              Choose unlocked achievements to show on your post.
            </ThemedText>
            {loadingAchievements ? (
              <View className="py-3">
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : completedAchievements.length === 0 ? (
              <ThemedText variant="muted" className="text-sm mb-2">
                No completed achievements yet. Keep going!
              </ThemedText>
            ) : (
              <View className="gap-2 mb-1">
                {(achievementsExpanded
                  ? completedAchievements
                  : completedAchievements.slice(0, 3)
                ).map((item) => {
                  const selected = achievementIds.includes(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => toggleAchievement(item.id)}
                      className="flex-row items-center rounded-2xl px-3 py-3 border"
                      style={
                        selected
                          ? { backgroundColor: "#fff7ed", borderColor: "#fdba74" }
                          : cardStyle
                      }
                    >
                      <Ionicons
                        name={selected ? "checkbox" : "square-outline"}
                        size={20}
                        color={selected ? "#ea580c" : theme.iconMuted}
                      />
                      <View className="flex-1 ml-3">
                        <Text
                          className="text-sm font-extrabold"
                          style={{ color: selected ? "#c2410c" : theme.textPrimary }}
                        >
                          {item.title}
                        </Text>
                        <Text
                          className="text-xs mt-0.5"
                          style={{ color: selected ? "#9a3412" : theme.textMuted }}
                          numberOfLines={2}
                        >
                          {item.description}
                        </Text>
                      </View>
                      <Ionicons name="trophy" size={16} color={selected ? "#ea580c" : theme.iconMuted} />
                    </Pressable>
                  );
                })}
                {completedAchievements.length > 3 ? (
                  <Pressable
                    onPress={() => setAchievementsExpanded((v) => !v)}
                    className="flex-row items-center justify-center py-2 active:opacity-70"
                  >
                    <ThemedText variant="accent" className="text-sm font-extrabold">
                      {achievementsExpanded
                        ? "Show less"
                        : `Show ${completedAchievements.length - 3} more`}
                    </ThemedText>
                    <Ionicons
                      name={achievementsExpanded ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={theme.accentText}
                      style={{ marginLeft: 4 }}
                    />
                  </Pressable>
                ) : null}
              </View>
            )}
            {achievementIds.length > 0 ? (
              <ThemedText variant="muted" className="text-xs mt-1 mb-2">
                {achievementIds.length} selected
              </ThemedText>
            ) : null}

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
