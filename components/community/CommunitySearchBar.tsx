import { Pressable } from "@/components/Pressable";
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
  return (
    <View className={className}>
      {label ? (
        <Text className="text-sm font-extrabold text-gray-900 mb-2">{label}</Text>
      ) : null}
      <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 border border-gray-200">
        <Ionicons name="search" size={18} color="#9ca3af" />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          className="flex-1 ml-2 text-sm text-gray-800"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
        />
        {loading ? (
          <ActivityIndicator size="small" color="#52B69A" />
        ) : value ? (
          <Pressable onPress={() => onChangeText("")}>
            <Ionicons name="close-circle" size={18} color="#9ca3af" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
