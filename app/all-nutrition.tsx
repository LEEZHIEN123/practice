import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NUTRITION_SECTIONS = [
  {
    title: "Breakfast Ideas",
    items: ["High-protein breakfast", "Balanced breakfast", "Quick breakfast"],
  },
  {
    title: "Lunch Ideas",
    items: ["Lean protein lunch", "Rice bowl lunch", "Wrap and salad lunch"],
  },
  {
    title: "Dinner Ideas",
    items: ["Light dinner", "Recovery dinner", "Family dinner"],
  },
  {
    title: "Healthy Snacks",
    items: ["Fruit snack", "Protein snack", "Low-calorie snack"],
  },
];

export default function AllNutritionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-[#f3f4f3]">
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
          <Text className="text-2xl font-extrabold text-gray-900 flex-1">All Nutrition</Text>
        </View>

        <View className="gap-4">
          {NUTRITION_SECTIONS.map((section) => (
            <View key={section.title} className="bg-white rounded-[28px] p-5 border border-gray-200">
              <Text className="text-lg font-extrabold text-gray-900">{section.title}</Text>
              <View className="mt-3 gap-2">
                {section.items.map((item) => (
                  <View key={item} className="flex-row items-center justify-between bg-[#f3f4f3] rounded-2xl px-4 py-3">
                    <Text className="text-sm font-semibold text-gray-700">{item}</Text>
                    <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
