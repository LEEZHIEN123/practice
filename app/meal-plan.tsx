import { Pressable } from "@/components/Pressable";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
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
  tint,
}: {
  title: string;
  items: { name: string; recipe: string; kcal: number }[];
  tint: string;
}) {
  return (
    <View className="bg-white rounded-2xl p-4 border border-gray-100">
      <View className="flex-row items-center justify-between">
        <Text className={`text-xs font-extrabold tracking-widest ${tint}`}>{title}</Text>
        <Text className="text-xs font-bold text-gray-500">Choose 1 of 3</Text>
      </View>
      <View className="mt-2 gap-2">
        {items.map((item) => (
          <View key={item.name} className="bg-[#fff7ed] rounded-2xl px-3 py-3 border border-[#fed7aa]">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-gray-800 font-extrabold flex-1 pr-3">{item.name}</Text>
              <Text className="text-xs font-bold text-[#c2410c]">{item.kcal} kcal</Text>
            </View>
            <Text className="text-xs text-gray-600 mt-1 leading-5">{item.recipe}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function MealPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 12, paddingTop: insets.top + 12 }}
      >
          <View className="flex-row items-center mb-5">
          <Pressable
            onPress={() => router.back()}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
            <Text className="text-2xl font-extrabold text-gray-900 flex-1">Nutrition Guidance</Text>
        </View>

        <View className="bg-[#fff7ed] rounded-3xl p-5 border border-[#fed7aa]">
          <Text className="text-2xl font-extrabold text-gray-900">Personalised Nutrition Guidance</Text>
          <Text className="text-sm text-gray-600 mt-2 leading-6">
            Choose one meal from each breakfast, lunch and dinner group.
          </Text>
        </View>

        <View className="mt-5 gap-4">
          {DAYS.map((row) => (
            <View key={row.day} className="bg-[#fff7ed] rounded-3xl p-5 border border-[#fed7aa]">
              <Text className="text-lg font-extrabold text-gray-900 mb-3">{row.day}</Text>
              <View className="gap-3">
                <MealBlock title="BREAKFAST" items={row.breakfast} tint="text-[#c2410c]" />
                <MealBlock title="LUNCH" items={row.lunch} tint="text-[#c2410c]" />
                <MealBlock title="DINNER" items={row.dinner} tint="text-[#c2410c]" />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
