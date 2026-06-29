import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { Pressable, Text, View, type TextProps, type ViewProps } from "react-native";

type TextVariant = "primary" | "secondary" | "muted" | "accent";

export function ThemedScreen({ children, className = "", style, ...props }: ViewProps) {
  const { screenStyle } = useThemedScreen();
  return (
    <View className={`flex-1 ${className}`} style={[screenStyle, style as StyleProp<ViewStyle>]} {...props}>
      {children}
    </View>
  );
}

export function ThemedBackButton({
  onPress,
  className = "w-11 h-11",
  icon = "chevron-back",
  size = 24,
}: {
  onPress: () => void;
  className?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: number;
}) {
  const { iconButtonStyle, theme } = useThemedScreen();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      className={`${className} rounded-full items-center justify-center border`}
      style={iconButtonStyle}
    >
      <Ionicons name={icon} size={size} color={theme.textPrimary} />
    </Pressable>
  );
}

export function useProfileCardStyles() {
  const { cardStyle, surfaceStyle, theme } = useThemedScreen();
  return {
    cardStyle,
    rowStyle: surfaceStyle,
    rowBorderStyle: {
      backgroundColor: theme.rowBg,
      borderColor: theme.cardBorder,
      borderWidth: 1,
    },
    inputStyle: {
      backgroundColor: theme.rowBg,
      borderColor: theme.cardBorder,
      borderWidth: 1,
      color: theme.textPrimary,
    },
    modalCardStyle: {
      backgroundColor: theme.modalBg,
      borderColor: theme.cardBorder,
      borderWidth: 1,
    },
    placeholderColor: theme.textMuted,
    theme,
  };
}

export function ThemedCard({
  children,
  className = "",
  style,
  rounded = "3xl",
  ...props
}: ViewProps & { rounded?: "2xl" | "3xl" | "full" }) {
  const { cardStyle } = useThemedScreen();
  const radius =
    rounded === "full" ? "rounded-full" : rounded === "2xl" ? "rounded-2xl" : "rounded-3xl";
  return (
    <View className={`${radius} ${className}`} style={[cardStyle, style]} {...props}>
      {children}
    </View>
  );
}

export function ThemedText({
  children,
  variant = "primary",
  className = "",
  style,
  ...props
}: TextProps & { variant?: TextVariant }) {
  const { textPrimary, textSecondary, textMuted, theme } = useThemedScreen();
  const colorStyle =
    variant === "secondary"
      ? textSecondary
      : variant === "muted"
        ? textMuted
        : variant === "accent"
          ? { color: theme.accentText }
          : textPrimary;

  return (
    <Text className={className} style={[colorStyle, style as StyleProp<TextStyle>]} {...props}>
      {children}
    </Text>
  );
}

export function ThemedRow({
  children,
  className = "",
  style,
  ...props
}: ViewProps) {
  const { surfaceStyle, theme } = useThemedScreen();
  return (
    <View
      className={`rounded-3xl ${className}`}
      style={[
        { backgroundColor: theme.rowBg, borderColor: theme.cardBorder, borderWidth: 1 },
        style as StyleProp<ViewStyle>,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}
