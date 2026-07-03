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
  className = "w-12 h-12",
  icon = "arrow-back",
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
      className={`${className} rounded-full items-center justify-center`}
      style={iconButtonStyle}
    >
      <Ionicons name={icon} size={size} color={theme.textPrimary} />
    </Pressable>
  );
}

/** Centered title header with profile-style back button on the left. */
export function ProfileScreenHeader({
  title,
  onBack,
  rightSlot,
  titleClassName = "text-2xl",
  className = "mb-2",
  backButtonClassName = "w-12 h-12",
  backIconSize = 24,
  headerHeightClassName = "h-12",
}: {
  title: string;
  onBack: () => void;
  rightSlot?: React.ReactNode;
  titleClassName?: string;
  className?: string;
  backButtonClassName?: string;
  backIconSize?: number;
  headerHeightClassName?: string;
}) {
  const { textPrimary } = useThemedScreen();
  return (
    <View className={`relative justify-center ${headerHeightClassName} ${className}`} pointerEvents="box-none">
      <View className="absolute left-0 top-0 h-full w-20 justify-center pl-2 z-10">
        <ThemedBackButton onPress={onBack} className={backButtonClassName} size={backIconSize} />
      </View>
      {rightSlot ? (
        <View className="absolute right-0 top-0 h-full justify-center pr-2 z-10">{rightSlot}</View>
      ) : null}
      <Text
        pointerEvents="none"
        numberOfLines={2}
        className={`absolute left-0 right-0 text-center font-extrabold px-16 ${titleClassName}`}
        style={textPrimary}
      >
        {title}
      </Text>
    </View>
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
