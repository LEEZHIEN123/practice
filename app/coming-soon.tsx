import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ComingSoonScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ title?: string }>();
  const title = typeof params.title === "string" && params.title.trim() ? params.title : "Coming Soon";

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <View style={{ paddingTop: insets.top + 8 }} className="px-6 pb-4 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <Text className="text-3xl font-extrabold text-gray-900">{title}</Text>
      </View>

      <View className="flex-1 items-center justify-center px-8">
        <View className="w-20 h-20 rounded-3xl bg-white border border-gray-200 items-center justify-center">
          <Ionicons name="time-outline" size={34} color="#76C893" />
        </View>
        <Text className="text-2xl font-extrabold text-gray-900 mt-5 text-center">Coming soon</Text>
        <Text className="text-gray-500 mt-2 text-center leading-6">
          We’re working on this feature. Check back in a future update.
        </Text>
      </View>
    </View>
  );
}

