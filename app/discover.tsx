import { CommunityUnreadBadge } from "@/components/community/CommunityUnreadBadge";
import { BottomTabBar, useBottomTabBarScrollPadding } from "@/components/navigation/BottomTabBar";
import { prefetchCommunityScreen } from "@/lib/communityBootstrap";
import { prefetchFoodDataset } from "@/lib/foodDataset";
import { useAdminRedirect } from "@/lib/useAdminRedirect";
import { useCommunityUnread } from "@/lib/useCommunityUnread";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { auth, db } from "../firebaseConfig";

export default function DiscoverScreen() {
  const router = useRouter();
  useAdminRedirect();
  const { totalUnread } = useCommunityUnread();
  const { cardStyle, screenStyle, textPrimary, iconButtonStyle } = useThemedScreen();
  const tabBarPadding = useBottomTabBarScrollPadding();
  const [profileImage, setProfileImage] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as { profileImage?: string };
        if (typeof data?.profileImage === "string" && data.profileImage.length > 0) setProfileImage(data.profileImage);
        else setProfileImage(null);
      },
      () => {}
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    void prefetchCommunityScreen();
    void prefetchFoodDataset();
  }, []);

  return (
    <View style={screenStyle}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarPadding }}>
        <View className="px-3 pt-10">
          <View className="flex-row justify-between items-center mb-8">
            <Text className="text-4xl font-extrabold" style={textPrimary}>
              Discover
            </Text>
            <Pressable
              onPress={() => router.push("/profile")}
              className="w-12 h-12 rounded-full border-2 border-[#b7ead1] overflow-hidden items-center justify-center"
              style={iconButtonStyle}
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={{ width: 48, height: 48 }} resizeMode="cover" />
              ) : (
                <Ionicons name="person-outline" size={22} color="#76C893" />
              )}
            </Pressable>
          </View>

          <Text className="text-2xl font-extrabold mb-3" style={textPrimary}>
            Explore Workouts
          </Text>

          <Pressable
            onPress={() => router.push("/all-workouts" as any)}
            className="bg-[#bdeccf] rounded-[28px] p-6 mb-5 flex-row items-center justify-between active:opacity-90"
          >
            <View className="flex-row items-center">
              <View className="w-14 h-14 rounded-full bg-white items-center justify-center mr-4">
                <MaterialCommunityIcons
                  name="dumbbell"
                  size={22}
                  color="#76C893"
                />
              </View>

              <Text className="text-2xl font-extrabold text-gray-900">
                All Workouts
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={28} color="#76C893" />
          </Pressable>

          {/* Explore Nutrition */}
          <Text className="text-2xl font-extrabold mb-3" style={textPrimary}>
            Explore Nutrition
          </Text>

          <Pressable
            onPressIn={() => void prefetchFoodDataset()}
            onPress={() => router.push("/all-nutrition" as any)}
            className="bg-[#bdeccf] rounded-[28px] p-6 mb-5 flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <View className="w-14 h-14 rounded-full bg-white items-center justify-center mr-4">
                <Ionicons name="restaurant" size={22} color="#76C893" />
              </View>

              <Text className="text-2xl font-extrabold text-gray-900">
                All Nutrition
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={28} color="#76C893" />
          </Pressable>

          {/* Explore Mind */}
          <Text className="text-2xl font-extrabold mb-3" style={textPrimary}>
            Explore Mind
          </Text>

          <Pressable
            onPress={() => router.push("/all-music")}
            className="bg-[#bdeccf] rounded-[28px] p-6 mb-5 flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <View className="w-14 h-14 rounded-full bg-white items-center justify-center mr-4">
                <Ionicons name="musical-notes" size={22} color="#76C893" />
              </View>

              <Text className="text-2xl font-extrabold text-gray-900">
                All Music
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={28} color="#76C893" />
          </Pressable>

          {/* Connect & Help */}
          <Text className="text-2xl font-extrabold mb-4" style={textPrimary}>
            Connect & Help
          </Text>

          <View className="flex-row justify-between">
            <Pressable
              onPressIn={() => void prefetchCommunityScreen()}
              onPress={() => router.push("/community" as any)}
              className="bg-[#76C893] rounded-[28px] w-[48%] py-8 items-center shadow-sm"
            >
              <CommunityUnreadBadge count={totalUnread}>
                <View className="w-16 h-16 rounded-full bg-[#9fdfb6] items-center justify-center mb-5">
                  <Ionicons name="people" size={30} color="white" />
                </View>
              </CommunityUnreadBadge>

              <Text className="text-white text-2xl font-extrabold">
                Community
              </Text>
              <Text className="text-[#d9f4e2] text-lg font-bold tracking-[2px] mt-2">
                 Share Anything &{"\n"}  Connect Others
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/ai-coach" as any)}
              className="bg-[#76C893] rounded-[28px] w-[48%] py-8 items-center shadow-sm"
            >
              <View className="w-14 h-14 rounded-full bg-[#9fdfb6] items-center justify-center mb-5">
                <MaterialCommunityIcons
                  name="robot-happy-outline"
                  size={24}
                  color="white"
                />
              </View>

              <Text className="text-white text-2xl font-extrabold">
                AI Chatbot
              </Text>
              <Text className="text-[#d9f4e2] text-lg font-bold tracking-[2px] mt-2">
                Any Questions? {"\n"}      Ask Me!
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <BottomTabBar active="discover" />
    </View>
  );
}