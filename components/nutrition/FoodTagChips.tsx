import { Pressable } from "@/components/Pressable";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { ScrollView, Text, View } from "react-native";

type FoodTagChipsProps = {
  tags: string[];
  onTagPress: (tag: string) => void;
};

export function FoodTagChips({ tags, onTagPress }: FoodTagChipsProps) {
  const { theme } = useThemedScreen();

  if (!tags.length) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
      <View className="flex-row gap-3 pr-4">
        {tags.map((tag) => (
          <Pressable
            key={tag}
            onPress={() => onTagPress(tag)}
            className="rounded-full px-5 py-2 border active:opacity-80"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.accent }}
          >
            <Text
              className="text-sm font-bold text-[#52B69A]"
              numberOfLines={1}
              style={{ letterSpacing: 0.4 }}
            >
              {tag}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
