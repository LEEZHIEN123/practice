import { DiscoverCard } from "@/components/discover/DiscoverCard";
import { BottomTabBar, useBottomTabBarScrollPadding } from "@/components/navigation/BottomTabBar";
import { rememberBottomTabRoute } from "@/lib/bottomTabHistory";
import { prefetchCommunityScreen } from "@/lib/communityBootstrap";
import { prefetchFoodDataset } from "@/lib/foodDataset";
import { useAdminRedirect } from "@/lib/useAdminRedirect";
import { useCommunityUnread } from "@/lib/useCommunityUnread";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { auth, db } from "../firebaseConfig";

export default function DiscoverScreen() {
  const router = useRouter();
  useAdminRedirect();
  const { screenStyle, textPrimary, iconButtonStyle } = useThemedScreen();
  const tabBarPadding = useBottomTabBarScrollPadding();
  const { totalUnread } = useCommunityUnread();
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
              onPress={() => {
                rememberBottomTabRoute("/discover");
                router.push("/profile");
              }}
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
          <DiscoverCard
            cardKey="allWorkouts"
            title="All Workouts"
            onPress={() => router.push("/all-workouts" as any)}
            className="mb-5"
          />

          <Text className="text-2xl font-extrabold mb-3" style={textPrimary}>
            Explore Nutrition
          </Text>
          <DiscoverCard
            cardKey="allNutrition"
            title="All Nutrition"
            onPressIn={() => void prefetchFoodDataset()}
            onPress={() => router.push("/all-nutrition" as any)}
            className="mb-5"
          />

          <Text className="text-2xl font-extrabold mb-3" style={textPrimary}>
            Explore Mind
          </Text>
          <DiscoverCard
            cardKey="allMusic"
            title="All Music"
            onPress={() => router.push("/all-music")}
            className="mb-5"
          />

          <Text className="text-2xl font-extrabold mb-4" style={textPrimary}>
            Connect & Help
          </Text>

          <View className="flex-row gap-2 items-stretch">
            <DiscoverCard
              cardKey="community"
              title="Community"
              subtitle={"Share Anything &\nConnect Others"}
              layout="stack"
              onPressIn={() => void prefetchCommunityScreen()}
              onPress={() => router.push("/community" as any)}
              className="flex-1"
              icon={
                totalUnread > 0 ? (
                  <View className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#ef4444] items-center justify-center border-2 border-white">
                    <Text className="text-[10px] font-extrabold text-white">
                      {totalUnread > 9 ? "9+" : totalUnread}
                    </Text>
                  </View>
                ) : undefined
              }
            />

            <DiscoverCard
              cardKey="aiCoach"
              title="AI Chatbot"
              subtitle={"Any Questions?\nAsk Me!"}
              layout="stack"
              onPress={() => router.push("/ai-coach" as any)}
              className="flex-1"
            />
          </View>
        </View>
      </ScrollView>

      <BottomTabBar active="discover" />
    </View>
  );
}
