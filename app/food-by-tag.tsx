import { FoodLibraryRowMemo } from "@/components/nutrition/FoodLibraryRow";
import { ProfileScreenHeader, ThemedText } from "@/components/themed/ThemedUi";
import { foodsByTag } from "@/lib/foodDataset";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function FoodByTagScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { screenStyle, textPrimary, theme } = useThemedScreen();
  const { tag } = useLocalSearchParams<{ tag?: string }>();

  const tagLabel = typeof tag === "string" ? tag : Array.isArray(tag) ? tag[0] ?? "" : "";
  const foods = useMemo(() => foodsByTag(tagLabel), [tagLabel]);

  const handleSelectFood = useCallback(
    (foodId: string) => {
      router.push({ pathname: "/food-detail", params: { id: foodId } });
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof foods)[number] }) => (
      <FoodLibraryRowMemo
        food={item}
        accentText={theme.accentText}
        iconMuted={theme.iconMuted}
        rowBg={theme.rowBg}
        onPress={handleSelectFood}
      />
    ),
    [handleSelectFood, theme.accentText, theme.iconMuted, theme.rowBg]
  );

  return (
    <View className="flex-1" style={screenStyle}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12, paddingBottom: 4 }}>
        <ProfileScreenHeader
          title={tagLabel || "Recipes"}
          onBack={() => router.back()}
          titleClassName="text-xl"
        />
        <ThemedText variant="muted" className="text-xs text-center mb-2">
          {foods.length} recipe{foods.length === 1 ? "" : "s"}
        </ThemedText>
      </View>

      <FlatList
        data={foods}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24 }}
        ItemSeparatorComponent={TagListSeparator}
        ListEmptyComponent={
          <ThemedText variant="muted" className="text-sm text-center py-8">
            No recipes found for this tag.
          </ThemedText>
        }
      />
    </View>
  );
}

function TagListSeparator() {
  return <View className="h-3" />;
}
