import { Pressable } from "@/components/Pressable";
import { ThemedCard, ThemedText } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert, ActivityIndicator, Image, Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MealPhotoSectionProps = {
  imageUri: string | null;
  onImageChange: (uri: string | null) => void;
  analyzing?: boolean;
  aiAnalysisEnabled?: boolean;
  /** Render photo actions as rows inside a parent card instead of separate cards. */
  embedded?: boolean;
};

function PhotoActionRow({
  icon,
  title,
  subtitle,
  onPress,
  showDivider,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  showDivider?: boolean;
}) {
  const { theme } = useThemedScreen();

  return (
    <Pressable onPress={onPress}>
      <View
        className="flex-row items-center py-4"
        style={showDivider ? { borderBottomWidth: 1, borderBottomColor: theme.cardBorder } : undefined}
      >
        <View
          className="w-14 h-14 rounded-2xl items-center justify-center mr-4"
          style={{ backgroundColor: theme.accentSoft }}
        >
          <Ionicons name={icon} size={28} color={theme.accentText} />
        </View>
        <View className="flex-1">
          <ThemedText className="text-base font-extrabold">{title}</ThemedText>
          <ThemedText variant="muted" className="text-sm mt-0.5">
            {subtitle}
          </ThemedText>
        </View>
        <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
      </View>
    </Pressable>
  );
}

export function MealPhotoSection({
  imageUri,
  onImageChange,
  analyzing = false,
  aiAnalysisEnabled = false,
  embedded = false,
}: MealPhotoSectionProps) {
  const { theme } = useThemedScreen();
  const insets = useSafeAreaInsets();
  const [viewerOpen, setViewerOpen] = useState(false);

  const pickImage = async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow camera or photo access to attach a meal photo.");
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    onImageChange(result.assets[0].uri);
  };

  const confirmRemove = () => {
    Alert.alert("Remove photo?", "This will detach the photo from your meal.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => onImageChange(null) },
    ]);
  };

  const cameraSubtitle = aiAnalysisEnabled
    ? "Camera opens, then AI estimates calories from your meal photo"
    : "Tap to open camera and attach a meal photo";
  const gallerySubtitle = aiAnalysisEnabled
    ? "Pick a photo and auto-fill food name and calories"
    : "Tap to pick an existing photo from your library";

  if (imageUri) {
    return (
      <View className={embedded ? "mb-3" : "mb-4"}>
        <View className="relative">
          <Pressable onPress={() => setViewerOpen(true)} disabled={analyzing}>
            <Image
              source={{ uri: imageUri }}
              className="w-full rounded-2xl"
              style={{ height: 180, borderColor: theme.cardBorder, borderWidth: 1 }}
              resizeMode="cover"
            />
          </Pressable>
          {analyzing ? (
            <View
              className="absolute inset-0 rounded-2xl items-center justify-center"
              style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}
            >
              <ActivityIndicator color="#ffffff" size="large" />
              <ThemedText className="text-white text-sm font-extrabold mt-3">
                Analyzing nutrition…
              </ThemedText>
            </View>
          ) : null}
          <Pressable
            onPress={confirmRemove}
            hitSlop={8}
            disabled={analyzing}
            className="absolute top-2 right-2 w-7 h-7 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(239, 68, 68, 0.18)" }}
          >
            <Ionicons name="close" size={16} color="#ef4444" />
          </Pressable>
        </View>

        <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
          <View className="flex-1 bg-black">
            <Pressable className="flex-1" onPress={() => setViewerOpen(false)}>
              <Image source={{ uri: imageUri }} className="flex-1" resizeMode="contain" />
            </Pressable>
            <Pressable
              onPress={() => setViewerOpen(false)}
              className="absolute right-4 w-10 h-10 rounded-full items-center justify-center"
              style={{ top: insets.top + 12, backgroundColor: "rgba(0,0,0,0.5)" }}
            >
              <Ionicons name="close" size={24} color="#ffffff" />
            </Pressable>
          </View>
        </Modal>
      </View>
    );
  }

  if (embedded) {
    return (
      <View className="mb-3">
        <PhotoActionRow
          icon="camera-outline"
          title="Take photo"
          subtitle={cameraSubtitle}
          onPress={() => void pickImage(true)}
          showDivider
        />
        <PhotoActionRow
          icon="images-outline"
          title="Choose from gallery"
          subtitle={gallerySubtitle}
          onPress={() => void pickImage(false)}
        />
      </View>
    );
  }

  return (
    <View className="mb-4 gap-3">
      <Pressable onPress={() => void pickImage(true)}>
        <ThemedCard className="p-5 flex-row items-center">
          <View
            className="w-14 h-14 rounded-2xl items-center justify-center mr-4"
            style={{ backgroundColor: theme.accentSoft }}
          >
            <Ionicons name="camera-outline" size={28} color={theme.accentText} />
          </View>
          <View className="flex-1">
            <ThemedText className="text-base font-extrabold">Take photo</ThemedText>
            <ThemedText variant="muted" className="text-sm mt-0.5">
              {cameraSubtitle}
            </ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
        </ThemedCard>
      </Pressable>
      <Pressable onPress={() => void pickImage(false)}>
        <ThemedCard className="p-5 flex-row items-center">
          <View
            className="w-14 h-14 rounded-2xl items-center justify-center mr-4"
            style={{ backgroundColor: theme.accentSoft }}
          >
            <Ionicons name="images-outline" size={28} color={theme.accentText} />
          </View>
          <View className="flex-1">
            <ThemedText className="text-base font-extrabold">Choose from gallery</ThemedText>
            <ThemedText variant="muted" className="text-sm mt-0.5">
              {gallerySubtitle}
            </ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.iconMuted} />
        </ThemedCard>
      </Pressable>
    </View>
  );
}
