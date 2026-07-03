import { FavouriteButton } from "@/components/FavouriteButton";
import { Pressable } from "@/components/Pressable";
import { ThemedCard, ThemedText } from "@/components/themed/ThemedUi";
import type { FoodListItem } from "@/lib/foodDataset";
import { buildNutritionFavouriteItem } from "@/lib/favourites";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useMemo } from "react";
import { View } from "react-native";

type FoodLibraryRowProps = {
  food: FoodListItem;
  accentText: string;
  iconMuted: string;
  rowBg: string;
  onPress: (id: string) => void;
};

function FoodLibraryRow({
  food,
  accentText,
  iconMuted,
  rowBg,
  onPress,
}: FoodLibraryRowProps) {
  const favouriteItem = useMemo(
    () =>
      buildNutritionFavouriteItem(
        food.id,
        food.name,
        food.servingSize?.trim() || food.category || "Recipe"
      ),
    [food.category, food.id, food.name, food.servingSize]
  );

  return (
    <Pressable onPress={() => onPress(food.id)}>
      <ThemedCard className="p-3 flex-row items-center">
        {food.imageUrl ? (
          <Image
            source={{ uri: food.imageUrl }}
            style={{ width: 72, height: 72, borderRadius: 12, marginRight: 12 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={food.id}
          />
        ) : (
          <View
            className="items-center justify-center rounded-xl mr-3"
            style={{ width: 72, height: 72, backgroundColor: rowBg }}
          >
            <Ionicons name="restaurant-outline" size={28} color={iconMuted} />
          </View>
        )}
        <View className="flex-1 pr-2">
          <View className="flex-row items-start">
            <ThemedText className="text-base font-extrabold flex-1 pr-2" numberOfLines={2}>
              {food.name}
            </ThemedText>
            <FavouriteButton compact item={favouriteItem} />
          </View>
          {food.servingSize?.trim() ? (
            <ThemedText variant="muted" className="text-xs mt-1" numberOfLines={1}>
              {food.servingSize}
            </ThemedText>
          ) : null}
          <ThemedText variant="secondary" className="text-xs mt-1">
            P {food.nutrition.proteinG}g · C {food.nutrition.carbsG}g · F {food.nutrition.fatG}g
          </ThemedText>
        </View>
        <View className="items-end">
          <ThemedText className="text-lg font-extrabold" style={{ color: accentText }}>
            {food.nutrition.calories}
          </ThemedText>
          <ThemedText variant="muted" className="text-[10px] font-bold">
            KCAL
          </ThemedText>
          <Ionicons name="chevron-forward" size={18} color={iconMuted} style={{ marginTop: 4 }} />
        </View>
      </ThemedCard>
    </Pressable>
  );
}

export const FoodLibraryRowMemo = memo(FoodLibraryRow);
