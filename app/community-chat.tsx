import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MESSAGES = [
  { id: "1", from: "them", text: "Hi! Are you free for a workout tomorrow?" },
  { id: "2", from: "me", text: "Yes, I am available after 6 PM." },
  { id: "3", from: "them", text: "Nice, let us do a light cardio session first." },
];

export default function CommunityChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ name?: string; preview?: string }>();
  const chatName = params.name ?? "Friend";
  const preview = params.preview ?? "Start your conversation here.";

  return (
    <View className="flex-1 bg-[#f3f4f3]">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 12, paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center mb-5">
          <Pressable
            onPress={() => router.back()}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <Text className="text-2xl font-extrabold text-gray-900 flex-1">{chatName}</Text>
        </View>

        <View className="bg-white rounded-[28px] p-5 border border-gray-200">
          <View className="flex-row items-center pb-4 border-b border-gray-100">
            <View className="w-12 h-12 rounded-full bg-[#9fdfb6] items-center justify-center mr-3">
              <Ionicons name="person" size={20} color="white" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-extrabold text-gray-900">{chatName}</Text>
              <Text className="text-sm text-gray-500 mt-1">{preview}</Text>
            </View>
          </View>

          <View className="mt-4 gap-3">
            {MESSAGES.map((message) => (
              <View
                key={message.id}
                className={message.from === "me"
                  ? "self-end max-w-[80%] bg-[#76C893] rounded-2xl px-4 py-3"
                  : "self-start max-w-[80%] bg-[#f3f4f3] rounded-2xl px-4 py-3 border border-gray-200"}
              >
                <Text className={message.from === "me" ? "text-white text-sm leading-6" : "text-gray-700 text-sm leading-6"}>
                  {message.text}
                </Text>
              </View>
            ))}
          </View>

          <View className="mt-5 bg-[#f9fafb] rounded-2xl border border-dashed border-gray-300 px-4 py-5">
            <Text className="text-sm text-gray-500">Type a message...</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
