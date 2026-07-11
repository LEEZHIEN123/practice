import { FavouriteButton } from "@/components/FavouriteButton";
import { Pressable } from "@/components/Pressable";
import { ThemedCard, ThemedText } from "@/components/themed/ThemedUi";
import type { FoodListItem } from "@/lib/foodDataset";
import { FOOD_IMAGE_FALLBACK, resolveFoodImageSource, resolveFoodImageUrl } from "@/lib/foodImages";
import { buildNutritionFavouriteItem } from "@/lib/favourites";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useEffect, useMemo, useState } from "react";
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

  const primarySource = useMemo(
    () => resolveFoodImageSource(food.name, food.imageUrl),
    [food.imageUrl, food.name]
  );
  const primaryUri = useMemo(
    () => resolveFoodImageUrl(food.name, food.imageUrl),
    [food.imageUrl, food.name]
  );
  const [source, setSource] = useState(primarySource);
  const [failedOnce, setFailedOnce] = useState(false);

  useEffect(() => {
    setSource(primarySource);
    setFailedOnce(false);
  }, [primarySource]);

  return (
    <Pressable onPress={() => onPress(food.id)}>
      <ThemedCard className="p-3 flex-row items-center">
        <Image
          source={source}
          style={{ width: 72, height: 72, borderRadius: 12, marginRight: 12, backgroundColor: rowBg }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={`${food.id}-${primaryUri}`}
          onError={() => {
            if (!failedOnce && primaryUri !== FOOD_IMAGE_FALLBACK) {
              setFailedOnce(true);
              setSource({ uri: FOOD_IMAGE_FALLBACK });
            }
          }}
        />
        <View className="flex-1 flex-row items-start min-w-0 pr-1">
          <View className="flex-1 min-w-0">
            <ThemedText
              className="text-base font-extrabold"
              numberOfLines={2}
              style={{ lineHeight: 20 }}
            >
              {food.name}
            </ThemedText>
            {food.servingSize?.trim() ? (
              <ThemedText
                variant="muted"
                className="text-xs"
                numberOfLines={1}
                style={{ lineHeight: 16, marginTop: 0 }}
              >
                {food.servingSize}
              </ThemedText>
            ) : null}
            <ThemedText
              className="text-sm font-extrabold"
              style={{ color: accentText, lineHeight: 18, marginTop: 4 }}
            >
              {food.nutrition.calories} kcal
            </ThemedText>
          </View>
          <FavouriteButton compact item={favouriteItem} />
        </View>
        <Ionicons name="chevron-forward" size={18} color={iconMuted} />
      </ThemedCard>
    </Pressable>
  );
}

export const FoodLibraryRowMemo = memo(FoodLibraryRow);
export default FoodLibraryRowMemo;
