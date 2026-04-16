import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FEED_ROWS = [
  { name: "Alicia", post: "Just finished my cardio session. Feeling great!", stats: "24 likes • 8 comments • Add friend" },
  { name: "Ben", post: "Meal prep for the week is ready. Sharing my healthy lunch ideas.", stats: "19 likes • 5 comments • Add friend" },
  { name: "Chloe", post: "Reached my weight goal this month. Keep going everyone!", stats: "31 likes • 12 comments • Add friend" },
];

const CHAT_ROWS = [
  { name: "Daniel", preview: "Do you want to train together tomorrow?", unreadCount: 2 },
  { name: "Emma", preview: "Thanks for the meal suggestion!", unreadCount: 0 },
  { name: "Farah", preview: "Can you share your workout split?", unreadCount: 0 },
];

export default function CommunityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<"feed" | "chat">("feed");

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
          <Text className="text-2xl font-extrabold text-gray-900 flex-1">Community</Text>
          <Pressable className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200">
            <Ionicons name="notifications-outline" size={22} color="#111827" />
          </Pressable>
        </View>

        <View className="bg-white rounded-[28px] p-5 border border-gray-200">
          <View className="flex-row mb-4">
            <Pressable
              onPress={() => setActiveTab("feed")}
              className={`flex-1 rounded-full py-3 items-center mr-2 ${activeTab === "feed" ? "bg-[#eaf7f0]" : "bg-[#f3f4f3]"}`}
            >
              <Text className={`text-sm font-extrabold ${activeTab === "feed" ? "text-[#52B69A]" : "text-gray-500"}`}>Community</Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab("chat")}
              className={`flex-1 rounded-full py-3 items-center ml-2 flex-row justify-center ${activeTab === "chat" ? "bg-[#eaf7f0]" : "bg-[#f3f4f3]"}`}
            >
              <Text className={`text-sm font-extrabold ${activeTab === "chat" ? "text-[#52B69A]" : "text-gray-500"}`}>Chat</Text>
              <View className="ml-2 min-w-[20px] h-5 px-1 rounded-full bg-[#ef4444] items-center justify-center">
                <Text className="text-[10px] font-extrabold text-white">2</Text>
              </View>
            </Pressable>
          </View>

          {activeTab === "feed" ? (
            <>
              <View className="mt-4 bg-[#f3f4f3] rounded-2xl px-4 py-4 border border-gray-200">
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-full bg-[#9fdfb6] items-center justify-center mr-3">
                    <Ionicons name="sparkles-outline" size={20} color="white" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-extrabold text-gray-900">Share Your Progress</Text>
                    <Text className="text-sm text-gray-500 mt-1">
                      Post your workout, meal update, weight progress or daily achievement here.
                    </Text>
                  </View>
                </View>
                <View className="mt-4 bg-white rounded-2xl px-4 py-4 border border-gray-200">
                  <Text className="text-sm text-gray-400">What progress would you like to share today?</Text>
                </View>
                <View className="mt-3 flex-row gap-2">
                  <View className="flex-1 bg-white rounded-full px-4 py-3 border border-gray-200">
                    <Text className="text-xs font-bold text-[#52B69A] text-center">Workout</Text>
                  </View>
                  <View className="flex-1 bg-white rounded-full px-4 py-3 border border-gray-200">
                    <Text className="text-xs font-bold text-[#52B69A] text-center">Meal</Text>
                  </View>
                  <View className="flex-1 bg-white rounded-full px-4 py-3 border border-gray-200">
                    <Text className="text-xs font-bold text-[#52B69A] text-center">Weight</Text>
                  </View>
                </View>
              </View>
              <View className="mt-4 gap-3">
                {FEED_ROWS.map((row) => (
                  <View key={row.name} className="bg-[#f3f4f3] rounded-2xl px-4 py-4 border border-gray-200">
                    <View className="flex-row items-center">
                      <View className="w-12 h-12 rounded-full bg-[#9fdfb6] items-center justify-center mr-3">
                        <Ionicons name="person" size={20} color="white" />
                      </View>
                      <Text className="text-base font-extrabold text-gray-900">{row.name}</Text>
                    </View>
                    <Text className="text-sm text-gray-700 mt-3 leading-6">{row.post}</Text>
                    <Text className="text-xs text-[#52B69A] font-bold mt-3">{row.stats}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <>
              <View className="mt-1 gap-3">
                {CHAT_ROWS.map((row) => (
                  <Pressable
                    key={row.name}
                    onPress={() => router.push({ pathname: "/community-chat" as any, params: { name: row.name, preview: row.preview } })}
                    className="flex-row items-center bg-[#f3f4f3] rounded-2xl px-4 py-4 border border-gray-200"
                  >
                    <View className="w-12 h-12 rounded-full bg-[#9fdfb6] items-center justify-center mr-3">
                      <Ionicons name="chatbubble-ellipses-outline" size={20} color="white" />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Text className="text-base font-extrabold text-gray-900">{row.name}</Text>
                        {row.unreadCount > 0 ? (
                          <View className="ml-2 min-w-[20px] h-5 px-1 rounded-full bg-[#ef4444] items-center justify-center">
                            <Text className="text-[10px] font-extrabold text-white">{row.unreadCount}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className="text-sm text-gray-500 mt-1">{row.preview}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#76C893" />
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
