import { Pressable } from "@/components/Pressable";
import {
  ProfileScreenHeader,
  ThemedCard,
  ThemedScreen,
  ThemedText,
  useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DAYS = [
  {
    day: "Day 1",
    breakfast: [
      { name: "Oatmeal with berries", recipe: "Rolled oats, milk, berries and chia seeds", kcal: 320 },
      { name: "Boiled eggs toast", recipe: "2 eggs, wholegrain toast and avocado slices", kcal: 340 },
      { name: "Greek yogurt bowl", recipe: "Greek yogurt, granola and banana", kcal: 300 },
    ],
    lunch: [
      { name: "Chicken rice bowl", recipe: "Grilled chicken, rice and mixed vegetables", kcal: 520 },
      { name: "Turkey pasta bowl", recipe: "Whole wheat pasta with turkey strips", kcal: 560 },
      { name: "Tuna wrap set", recipe: "Tuna wrap with salad and fruit cup", kcal: 480 },
    ],
    dinner: [
      { name: "Grilled salmon plate", recipe: "Salmon, sweet potato and green salad", kcal: 540 },
      { name: "Lean beef stir-fry", recipe: "Beef, broccoli and brown rice", kcal: 510 },
      { name: "Soup and toast set", recipe: "Vegetable soup with garlic toast", kcal: 430 },
    ],
  },
  {
    day: "Day 2",
    breakfast: [
      { name: "Wholegrain toast set", recipe: "Toast, peanut butter and banana smoothie", kcal: 360 },
      { name: "Egg muffin", recipe: "Egg muffin with spinach and low-fat cheese", kcal: 310 },
      { name: "Fruit cereal bowl", recipe: "Cereal, skim milk and strawberries", kcal: 290 },
    ],
    lunch: [
      { name: "Turkey sandwich", recipe: "Turkey, cheese, lettuce and tomato", kcal: 450 },
      { name: "Chicken soup combo", recipe: "Chicken soup with crackers and apple slices", kcal: 410 },
      { name: "Rice bento", recipe: "Steamed rice, chicken and vegetables", kcal: 530 },
    ],
    dinner: [
      { name: "Beef stir-fry", recipe: "Beef, brown rice and broccoli", kcal: 520 },
      { name: "Chicken noodles", recipe: "Chicken noodles with bok choy", kcal: 500 },
      { name: "Tofu vegetable bowl", recipe: "Tofu, quinoa and roasted vegetables", kcal: 460 },
    ],
  },
  {
    day: "Day 3",
    breakfast: [
      { name: "Pancake set", recipe: "Pancakes, scrambled eggs and milk", kcal: 390 },
      { name: "Fruit toast combo", recipe: "Toast, jam and fruit slices", kcal: 280 },
      { name: "Protein yogurt cup", recipe: "Yogurt, oats and honey", kcal: 310 },
    ],
    lunch: [
      { name: "Pasta bowl", recipe: "Creamy pasta with chicken strips", kcal: 570 },
      { name: "Chicken salad box", recipe: "Chicken breast, greens and dressing", kcal: 440 },
      { name: "Rice and tofu set", recipe: "Rice, tofu cubes and side salad", kcal: 470 },
    ],
    dinner: [
      { name: "Tofu quinoa bowl", recipe: "Tofu, quinoa and roasted carrots", kcal: 450 },
      { name: "Fish and vegetables", recipe: "White fish, potatoes and greens", kcal: 500 },
      { name: "Chicken stew plate", recipe: "Chicken stew with steamed vegetables", kcal: 520 },
    ],
  },
];

function MealBlock({
  title,
  items,
}: {
  title: string;
  items: { name: string; recipe: string; kcal: number }[];
}) {
  const { rowBorderStyle } = useProfileCardStyles();
  const { isDark } = useThemedScreen();

  return (
    <ThemedCard rounded="2xl" className="p-4">
      <View className="flex-row items-center justify-between">
        <ThemedText variant="accent" className="text-xs font-extrabold tracking-widest">
          {title}
        </ThemedText>
        <ThemedText variant="muted" className="text-xs font-bold">
          Choose 1 of 3
        </ThemedText>
      </View>
      <View className="mt-2 gap-2">
        {items.map((item) => (
          <View key={item.name} className="rounded-2xl px-3 py-3" style={rowBorderStyle}>
            <View className="flex-row items-center justify-between">
              <ThemedText className="text-sm font-extrabold flex-1 pr-3">{item.name}</ThemedText>
              <ThemedText
                className="text-xs font-bold"
                style={{ color: isDark ? "#fb923c" : "#c2410c" }}
              >
                {item.kcal} kcal
              </ThemedText>
            </View>
            <ThemedText variant="secondary" className="text-xs mt-1 leading-5">
              {item.recipe}
            </ThemedText>
          </View>
        ))}
      </View>
    </ThemedCard>
  );
}

export default function MealPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ThemedScreen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 12, paddingTop: insets.top + 12 }}
      >
        <ProfileScreenHeader title="Nutrition Guidance" onBack={() => router.back()} />

        <ThemedCard className="p-5">
          <ThemedText className="text-2xl font-extrabold">Personalised Nutrition Guidance</ThemedText>
          <ThemedText variant="secondary" className="text-sm mt-2 leading-6">
            Choose one meal from each breakfast, lunch and dinner group.
          </ThemedText>
        </ThemedCard>

        <View className="mt-5 gap-4">
          {DAYS.map((row) => (
            <ThemedCard key={row.day} className="p-5">
              <ThemedText className="text-lg font-extrabold mb-3">{row.day}</ThemedText>
              <View className="gap-3">
                <MealBlock title="BREAKFAST" items={row.breakfast} />
                <MealBlock title="LUNCH" items={row.lunch} />
                <MealBlock title="DINNER" items={row.dinner} />
              </View>
            </ThemedCard>
          ))}
        </View>
      </ScrollView>
    </ThemedScreen>
  );
}
