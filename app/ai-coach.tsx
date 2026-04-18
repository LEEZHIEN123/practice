import { Pressable } from "@/components/Pressable";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PROMPTS = [
  "Suggest today’s workout routine",
  "Recommend a balanced meal",
  "How can I improve my sleep recovery?",
];

export default function AICoachScreen() {
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
          <Text className="text-2xl font-extrabold text-gray-900 flex-1">AI Chatbot</Text>
        </View>

        <View className="bg-white rounded-[28px] p-5 border border-gray-200">
          <View className="flex-row items-start bg-[#f3f4f3] rounded-2xl px-4 py-4 border border-gray-200 mb-5">
            <View className="w-11 h-11 rounded-full bg-[#76C893] items-center justify-center mr-3">
              <MaterialCommunityIcons name="robot-happy-outline" size={22} color="white" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-extrabold text-gray-900">Fitness Assistant</Text>
              <Text className="text-sm text-gray-600 mt-1 leading-6">
                Hi, I am your fitness assistant. I can help you with workout ideas, recovery tips, meal guidance and daily motivation.
              </Text>
            </View>
          </View>

          <Text className="text-lg font-extrabold text-gray-900">Suggested Prompts</Text>
          <View className="mt-4 gap-3">
            {PROMPTS.map((prompt) => (
              <View key={prompt} className="bg-[#f3f4f3] rounded-2xl px-4 py-4 border border-gray-200">
                <Text className="text-sm font-semibold text-gray-700">{prompt}</Text>
              </View>
            ))}
          </View>

          <View className="mt-5 bg-[#f9fafb] rounded-2xl border border-dashed border-gray-300 px-4 py-5">
            <Text className="text-sm text-gray-500">Ask something...</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
