import { Pressable } from "@/components/Pressable";
import type { FavouriteItemInput } from "@/lib/favourites";
import { useFavourite } from "@/lib/useFavourite";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "react-native";

type FavouriteButtonProps = {
  item: FavouriteItemInput | null;
  compact?: boolean;
};

export function FavouriteButton({ item, compact = false }: FavouriteButtonProps) {
  const { iconButtonStyle, theme } = useThemedScreen();
  const { favourited, signedIn, toggle } = useFavourite(item);

  const handlePress = () => {
    if (!item) return;
    if (!signedIn) {
      Alert.alert("Sign in required", "Sign in to save favourites.");
      return;
    }
    void toggle();
  };

  if (compact) {
    return (
      <Pressable onPress={handlePress} hitSlop={8} className="p-2">
        <Ionicons
          name={favourited ? "heart" : "heart-outline"}
          size={22}
          color={favourited ? "#ef4444" : theme.iconMuted}
        />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      className="w-12 h-12 rounded-full items-center justify-center"
      style={iconButtonStyle}
    >
      <Ionicons
        name={favourited ? "heart" : "heart-outline"}
        size={22}
        color={favourited ? "#ef4444" : theme.textPrimary}
      />
    </Pressable>
  );
}
