import { DiscoverCard } from "@/components/discover/DiscoverCard";
import { BottomTabBar, useBottomTabBarScrollPadding } from "@/components/navigation/BottomTabBar";
import { ProfileScreenHeader } from "@/components/themed/ThemedUi";
import { rememberBottomTabRoute } from "@/lib/bottomTabHistory";
import { prefetchFoodDataset } from "@/lib/foodDataset";
import { useAdminRedirect } from "@/lib/useAdminRedirect";
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
    void prefetchFoodDataset();
  }, []);

  return (
    <View style={screenStyle}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarPadding }}>
        <View className="px-3 pt-10">
          <ProfileScreenHeader
            title="Discover"
            titleClassName="text-3xl"
            showBackButton={false}
            className="mb-4"
            rightSlot={
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
            }
          />

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

          <Text className="text-2xl font-extrabold mb-3" style={textPrimary}>
            AI Coach
          </Text>
          <DiscoverCard
            cardKey="aiCoach"
            title="AI Chatbot"
            onPress={() => router.push("/ai-coach" as any)}
            className="mb-5"
          />
        </View>
      </ScrollView>

      <BottomTabBar active="discover" />
    </View>
  );
}
