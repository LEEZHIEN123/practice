import { useAppearance } from "@/context/AppearanceContext";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { View } from "react-native";

export function normalizeProfileImageUri(uri: string | null | undefined): string | null {
  if (typeof uri !== "string") return null;
  const trimmed = uri.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Resolve live profile image first, then denormalized fallback from posts/comments. */
export function resolveProfileImageUri(
  liveByUserId: Record<string, string | null | undefined>,
  userId: string | null | undefined,
  fallback?: string | null
): string | null {
  if (!userId) return normalizeProfileImageUri(fallback);
  const live = liveByUserId[userId];
  if (live !== undefined) return normalizeProfileImageUri(live);
  return normalizeProfileImageUri(fallback);
}

type CommunityProfileAvatarProps = {
  uri: string | null | undefined;
  size?: number;
};

export function CommunityProfileAvatar({ uri, size = 48 }: CommunityProfileAvatarProps) {
  const { theme } = useThemedScreen();
  const { isAdminTheme } = useAppearance();
  const normalized = normalizeProfileImageUri(uri);
  const placeholderBg = isAdminTheme ? theme.accentSoft : theme.accent;
  const placeholderIcon = isAdminTheme ? theme.accentText : "#ffffff";

  return (
    <View
      className="rounded-full items-center justify-center overflow-hidden"
      style={{ width: size, height: size, backgroundColor: placeholderBg }}
    >
      {normalized ? (
        <Image source={{ uri: normalized }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Ionicons name="person" size={size * 0.42} color={placeholderIcon} />
      )}
    </View>
  );
}
