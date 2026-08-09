import { Pressable } from "@/components/Pressable";
import { ProfileScreenHeader, ThemedText, useProfileCardStyles } from "@/components/themed/ThemedUi";
import {
  listCompletedAchievementsForShare,
  type ShareableAchievement,
} from "@/lib/achievements";
import { DEFAULT_POST_TAGS } from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { ImageEditor } from "expo-dynamic-image-crop";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
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
  imageUris: string[];
};

type PostComposerModalProps = {
  visible: boolean;
  title: string;
  initial?: Partial<PostComposerValues>;
  submitting: boolean;
  /** When false, hides the share-achievements picker (e.g. admin posts). Default true. */
  showAchievements?: boolean;
  /** Accent for Post button and + actions. Defaults to app green. */
  accentColor?: string;
  onClose: () => void;
  onSubmit: (values: PostComposerValues) => Promise<void>;
};

const MAX_POST_IMAGES = 6;
const MAX_POST_CONTENT_LENGTH = 5000;
const DEFAULT_COMPOSER_ACCENT = "#52B69A";

export function PostComposerModal({
  visible,
  title,
  initial,
  submitting,
  showAchievements = true,
  accentColor = DEFAULT_COMPOSER_ACCENT,
  onClose,
  onSubmit,
}: PostComposerModalProps) {
  const insets = useSafeAreaInsets();
  const { screenStyle, cardStyle, theme } = useThemedScreen();
  const { inputStyle, placeholderColor } = useProfileCardStyles();
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [achievementIds, setAchievementIds] = useState<string[]>([]);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null);
  const [editingImageUri, setEditingImageUri] = useState<string | null>(null);
  const [cropperVisible, setCropperVisible] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [completedAchievements, setCompletedAchievements] = useState<ShareableAchievement[]>([]);
  const [loadingAchievements, setLoadingAchievements] = useState(false);
  const [achievementsExpanded, setAchievementsExpanded] = useState(false);

  useEffect(() => {
    if (!visible) {
      setBusy(false);
      setEditingImageIndex(null);
      setEditingImageUri(null);
      setCropperVisible(false);
      setProcessingImage(false);
      return;
    }
    setContent(initial?.content ?? "");
    setTags(initial?.tags ?? []);
    setAchievementIds(showAchievements ? initial?.achievementIds ?? [] : []);
    setImageUris(initial?.imageUris ?? []);
    setCustomTag("");
    setAchievementsExpanded(false);

    if (!showAchievements) {
      setCompletedAchievements([]);
      setLoadingAchievements(false);
      return;
    }

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
  }, [visible, initial, showAchievements]);

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

  const appendImages = (uris: string[]) => {
    if (uris.length === 0) return;
    setImageUris((prev) => {
      const merged = [...prev];
      for (const uri of uris) {
        if (merged.length >= MAX_POST_IMAGES) break;
        if (!merged.includes(uri)) merged.push(uri);
      }
      return merged;
    });
  };

  const removeImageAt = (index: number) => {
    setImageUris((prev) => prev.filter((_, idx) => idx !== index));
  };

  const openImageEditor = (index: number) => {
    setEditingImageIndex(index);
    setEditingImageUri(imageUris[index]);
  };

  const closeImageEditor = () => {
    if (processingImage) return;
    setEditingImageIndex(null);
    setEditingImageUri(null);
    setCropperVisible(false);
  };

  const rotateEditingImage = async (degrees: -90 | 90) => {
    if (!editingImageUri || processingImage) return;
    try {
      setProcessingImage(true);
      const result = await ImageManipulator.manipulateAsync(
        editingImageUri,
        [{ rotate: degrees }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      setEditingImageUri(result.uri);
    } catch {
      Alert.alert("Photo editing", "Could not rotate this photo.");
    } finally {
      setProcessingImage(false);
    }
  };

  const applyImageEdits = () => {
    if (editingImageIndex === null || !editingImageUri || processingImage) return;
    setImageUris((prev) =>
      prev.map((uri, index) => (index === editingImageIndex ? editingImageUri : uri))
    );
    closeImageEditor();
  };

  const pickImages = async (source: "camera" | "library") => {
    const remaining = MAX_POST_IMAGES - imageUris.length;
    if (remaining <= 0) {
      Alert.alert("Photo limit", `You can attach up to ${MAX_POST_IMAGES} photos per post.`);
      return;
    }

    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        source === "camera"
          ? "Allow camera access to take a photo for your post."
          : "Allow photo access to choose images for your post."
      );
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            selectionLimit: remaining,
            quality: 0.8,
          });

    if (result.canceled) return;
    const picked = result.assets.map((asset) => asset.uri).filter(Boolean);
    if (picked.length === 0) return;

    // Camera uses the same in-app editor as gallery (rotate / crop), not the system crop UI.
    if (source === "camera") {
      const uri = picked[0];
      if (imageUris.length >= MAX_POST_IMAGES || imageUris.includes(uri)) return;
      const nextIndex = imageUris.length;
      setImageUris((prev) => {
        if (prev.length >= MAX_POST_IMAGES || prev.includes(uri)) return prev;
        return [...prev, uri];
      });
      setEditingImageIndex(nextIndex);
      setEditingImageUri(uri);
      return;
    }

    appendImages(picked);
  };

  const hasUnsavedDraft = () => {
    const initialContent = (initial?.content ?? "").trim();
    const initialTags = initial?.tags ?? [];
    const initialAchievementIds = showAchievements ? initial?.achievementIds ?? [] : [];
    const initialImages = initial?.imageUris ?? [];

    const tagsChanged =
      tags.length !== initialTags.length ||
      tags.some((tag) => !initialTags.includes(tag));
    const achievementsChanged =
      achievementIds.length !== initialAchievementIds.length ||
      achievementIds.some((id) => !initialAchievementIds.includes(id));
    const imagesChanged =
      imageUris.length !== initialImages.length ||
      imageUris.some((uri, index) => uri !== initialImages[index]);

    return (
      content.trim() !== initialContent ||
      tagsChanged ||
      achievementsChanged ||
      imagesChanged ||
      customTag.trim().length > 0
    );
  };

  const requestClose = () => {
    if (busy || submitting) return;
    if (!hasUnsavedDraft()) {
      onClose();
      return;
    }
    const isEditingExisting = Boolean(initial?.content?.trim() || (initial?.imageUris?.length ?? 0) > 0);
    Alert.alert(
      isEditingExisting ? "Discard changes?" : "Discard post?",
      isEditingExisting
        ? "You have unsaved changes. Close without saving?"
        : "You have unsaved content. Close without posting?",
      [
        { text: "Keep writing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onClose },
      ]
    );
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
      await onSubmit({
        content,
        tags,
        achievementIds: showAchievements ? achievementIds : [],
        imageUris,
      });
    } finally {
      setBusy(false);
    }
  };

  const isSubmitting = submitting || busy;
  const canAddMorePhotos = imageUris.length < MAX_POST_IMAGES;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={requestClose}>
      <KeyboardAvoidingView
        className="flex-1"
        style={screenStyle}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ paddingTop: insets.top + 12 }} className="flex-1">
          <View className="px-4 mb-4">
            <ProfileScreenHeader
              title={title}
              onBack={requestClose}
              backIcon="close"
              titleClassName="text-2xl"
              rightSlot={
                <Pressable
                  onPress={() => void handleSubmit()}
                  disabled={isSubmitting}
                  hitSlop={8}
                  className="rounded-full px-5 py-2.5"
                  style={{ backgroundColor: accentColor, opacity: isSubmitting ? 0.7 : 1 }}
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
              onChangeText={(text) => setContent(text.slice(0, MAX_POST_CONTENT_LENGTH))}
              placeholder="Share your progress, meal, workout, or thoughts..."
              multiline
              maxLength={MAX_POST_CONTENT_LENGTH}
              className="rounded-2xl px-4 py-4 text-sm min-h-[120px]"
              style={inputStyle}
              placeholderTextColor={placeholderColor}
            />
            <ThemedText variant="muted" className="mt-1.5 text-right text-xs">
              {content.length}/{MAX_POST_CONTENT_LENGTH}
            </ThemedText>

            <View className="flex-row items-center justify-between mt-5 mb-2">
              <ThemedText className="text-sm font-extrabold">
                Photos{imageUris.length > 0 ? ` (${imageUris.length}/${MAX_POST_IMAGES})` : ""}
              </ThemedText>
            </View>

            {imageUris.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
              >
                {imageUris.map((uri, index) => (
                  <View key={`${uri}-${index}`} className="relative overflow-hidden rounded-2xl" style={cardStyle}>
                    <Pressable
                      onPress={() => openImageEditor(index)}
                      disabled={isSubmitting}
                      accessibilityLabel={`View and edit photo ${index + 1}`}
                    >
                      <Image
                        source={{ uri }}
                        style={{ width: 132, height: 132 }}
                        contentFit="cover"
                      />
                    </Pressable>
                    <View
                      className="absolute top-2 right-2 min-w-[28px] h-7 px-2 rounded-full items-center justify-center border-2 border-white"
                      style={{ backgroundColor: accentColor }}
                    >
                      <Text className="text-xs font-extrabold text-white">{index + 1}</Text>
                    </View>
                    <Pressable
                      onPress={() => removeImageAt(index)}
                      disabled={isSubmitting}
                      accessibilityLabel={`Remove photo ${index + 1}`}
                      className="absolute bottom-2 right-2 w-8 h-8 rounded-full items-center justify-center"
                      style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
                    >
                      <Ionicons name="close" size={18} color="white" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            {canAddMorePhotos ? (
              <View className={`flex-row gap-3 ${imageUris.length > 0 ? "mt-3" : ""}`}>
                <Pressable
                  onPress={() => void pickImages("library")}
                  disabled={isSubmitting}
                  className="flex-1 flex-row items-center justify-center rounded-2xl border py-3"
                  style={cardStyle}
                >
                  <Ionicons name="images-outline" size={20} color={theme.accentText} />
                  <ThemedText variant="accent" className="font-extrabold ml-2">
                    Gallery
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => void pickImages("camera")}
                  disabled={isSubmitting}
                  className="flex-1 flex-row items-center justify-center rounded-2xl border py-3"
                  style={cardStyle}
                >
                  <Ionicons name="camera-outline" size={20} color={theme.accentText} />
                  <ThemedText variant="accent" className="font-extrabold ml-2">
                    Camera
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}

            {showAchievements ? (
              <>
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
              </>
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
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: accentColor }}
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

      <Modal
        visible={editingImageIndex !== null}
        animationType="slide"
        onRequestClose={closeImageEditor}
      >
        <View className="flex-1 bg-black">
          <View
            className="flex-row items-center justify-between px-4 pb-3"
            style={{ paddingTop: insets.top + 10 }}
          >
            <Pressable
              onPress={closeImageEditor}
              disabled={processingImage}
              hitSlop={8}
              accessibilityLabel="Close photo editor"
            >
              <Ionicons name="close" size={28} color="white" />
            </Pressable>
            <Text className="text-lg font-extrabold text-white">
              {editingImageIndex === null ? "Photo" : `Photo ${editingImageIndex + 1}`}
            </Text>
            <Pressable
              onPress={applyImageEdits}
              disabled={processingImage || !editingImageUri}
              hitSlop={8}
              accessibilityLabel="Apply photo edits"
            >
              <Text
                className="text-base font-extrabold"
                style={{ color: processingImage ? "#6b7280" : "#52B69A" }}
              >
                Apply
              </Text>
            </Pressable>
          </View>

          <View className="flex-1 items-center justify-center px-3">
            {editingImageUri ? (
              <Image
                source={{ uri: editingImageUri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
              />
            ) : null}
            {processingImage ? (
              <View className="absolute inset-0 items-center justify-center bg-black/40">
                <ActivityIndicator color="white" size="large" />
              </View>
            ) : null}
          </View>

          <View
            className="flex-row gap-3 px-4 pt-4"
            style={{ paddingBottom: insets.bottom + 16, backgroundColor: theme.navBg }}
          >
            <Pressable
              onPress={() => void rotateEditingImage(-90)}
              disabled={processingImage || !editingImageUri}
              className="flex-1 items-center rounded-2xl py-3"
              style={{ backgroundColor: theme.rowBg }}
            >
              <Ionicons name="refresh-outline" size={22} color={theme.textPrimary} />
              <Text className="mt-1 text-xs font-bold" style={{ color: theme.textPrimary }}>
                Rotate left
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setCropperVisible(true)}
              disabled={processingImage || !editingImageUri}
              className="flex-1 items-center rounded-2xl py-3"
              style={{ backgroundColor: theme.rowBg }}
            >
              <Ionicons name="crop-outline" size={22} color={theme.textPrimary} />
              <Text className="mt-1 text-xs font-bold" style={{ color: theme.textPrimary }}>
                Crop
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void rotateEditingImage(90)}
              disabled={processingImage || !editingImageUri}
              className="flex-1 items-center rounded-2xl py-3"
              style={{ backgroundColor: theme.rowBg }}
            >
              <Ionicons name="reload-outline" size={22} color={theme.textPrimary} />
              <Text className="mt-1 text-xs font-bold" style={{ color: theme.textPrimary }}>
                Rotate right
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {editingImageUri ? (
        <ImageEditor
          isVisible={cropperVisible}
          imageUri={editingImageUri}
          onEditingComplete={(croppedImageData) => {
            setEditingImageUri(croppedImageData.uri);
            setCropperVisible(false);
          }}
          onEditingCancel={() => setCropperVisible(false)}
          dynamicCrop
        />
      ) : null}
    </Modal>
  );
}
