import { Pressable } from "@/components/Pressable";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { type RefObject } from "react";
import { ActivityIndicator, Text, TextInput, View, type View as RNView } from "react-native";

type CommunitySearchBarProps = {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  loading?: boolean;
  className?: string;
  wrapRef?: RefObject<RNView | null>;
  onFocus?: () => void;
};

export function CommunitySearchBar({
  label,
  value,
  onChangeText,
  placeholder,
  loading = false,
  className = "mx-4 mb-4",
  wrapRef,
  onFocus,
}: CommunitySearchBarProps) {
  const { cardStyle, textPrimary, theme } = useThemedScreen();

  return (
    <View className={className}>
      {label ? (
        <Text className="text-sm font-extrabold mb-2" style={textPrimary}>{label}</Text>
      ) : null}
      <View ref={wrapRef} className="flex-row items-center rounded-2xl px-3.5 py-2" style={cardStyle}>
        <Ionicons name="search" size={16} color={theme.iconMuted} style={{ marginLeft: 8 }} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder={placeholder}
          className="flex-1 ml-2 text-sm"
          style={{ color: theme.textPrimary }}
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
        />
        {loading ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : value ? (
          <Pressable onPress={() => onChangeText("")} style={{ marginRight: 8 }}>
            <Ionicons name="close-circle" size={16} color={theme.iconMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
