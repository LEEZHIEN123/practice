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
  centerSlot,
  titleClassName = "text-2xl",
  titleBadgeCount,
  className = "mb-2",
  backButtonClassName = "w-12 h-12",
  backIcon = "arrow-back",
  backIconSize = 24,
  headerHeightClassName = "min-h-12",
  showBackButton = true,
}: {
  title: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  centerSlot?: React.ReactNode;
  titleClassName?: string;
  titleBadgeCount?: number;
  className?: string;
  backButtonClassName?: string;
  backIcon?: keyof typeof Ionicons.glyphMap;
  backIconSize?: number;
  headerHeightClassName?: string;
  showBackButton?: boolean;
}) {
  const { textPrimary } = useThemedScreen();
  const badgeLabel =
    titleBadgeCount && titleBadgeCount > 0
      ? titleBadgeCount > 9
        ? "9+"
        : String(titleBadgeCount)
      : null;
  return (
    <View
      className={`relative flex-row items-center ${headerHeightClassName} ${className}`}
      pointerEvents="box-none"
    >
        {centerSlot ? (
          <View
            pointerEvents="box-none"
            className="absolute left-0 right-0 top-0 bottom-0 items-center justify-center px-16"
          >
            <View pointerEvents="box-none" className="w-full flex-row items-center justify-center">
              {centerSlot}
            </View>
          </View>
        ) : (
          <View
            pointerEvents="none"
            className="absolute left-0 right-0 top-0 bottom-0 items-center justify-center px-16"
          >
            <View className="w-full flex-row items-center justify-center">
              <Text
                numberOfLines={3}
                className={`text-center font-extrabold ${titleClassName}`}
                style={[textPrimary, { flexShrink: 1, maxWidth: "100%" }]}
              >
                {title}
              </Text>
              {badgeLabel ? (
                <View
                  style={{
                    marginLeft: 8,
                    minWidth: 20,
                    height: 20,
                    paddingHorizontal: 5,
                    borderRadius: 10,
                    backgroundColor: "#ef4444",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#ffffff" }}>{badgeLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

      <View className="shrink-0 justify-center" style={{ zIndex: 2, elevation: 2 }}>
        {showBackButton ? (
          <ThemedBackButton
            onPress={onBack ?? (() => {})}
            className={backButtonClassName}
            icon={backIcon}
            size={backIconSize}
          />
        ) : (
          <View className={backButtonClassName} />
        )}
      </View>

      <View className="flex-1" pointerEvents="none" />
      <View
        className="shrink-0 justify-center items-end"
        style={{ minWidth: 48, zIndex: 2, elevation: 2 }}
        pointerEvents="box-none"
      >
        {rightSlot ?? null}
      </View>
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
