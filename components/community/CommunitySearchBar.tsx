import { Pressable } from "@/components/Pressable";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Text, TextInput, View } from "react-native";

type CommunitySearchBarProps = {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  loading?: boolean;
  className?: string;
};

export function CommunitySearchBar({
  label,
  value,
  onChangeText,
  placeholder,
  loading = false,
  className = "mx-4 mb-4",
}: CommunitySearchBarProps) {
  const { cardStyle, textPrimary, theme } = useThemedScreen();

  return (
    <View className={className}>
      {label ? (
        <Text className="text-sm font-extrabold mb-2" style={textPrimary}>{label}</Text>
      ) : null}
      <View className="flex-row items-center rounded-2xl px-4 py-3" style={cardStyle}>
        <Ionicons name="search" size={18} color={theme.iconMuted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          className="flex-1 ml-2 text-sm"
          style={{ color: theme.textPrimary }}
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
        />
        {loading ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : value ? (
          <Pressable onPress={() => onChangeText("")}>
            <Ionicons name="close-circle" size={18} color={theme.iconMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
