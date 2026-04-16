import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { auth, db } from "../firebaseConfig";

export default function DiscoverScreen() {
  const router = useRouter();
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

  return (
    <View className="flex-1 bg-[#f3f4f3]">
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <View className="px-3 pt-10">
          {/* Header */}
          <View className="flex-row justify-between items-center mb-8">
            <Text className="text-4xl font-extrabold text-gray-900">
              Discover
            </Text>
            <Pressable
              onPress={() => router.push("/profile")}
              className="w-12 h-12 rounded-full border-2 border-[#b7ead1] overflow-hidden bg-white items-center justify-center"
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={{ width: 48, height: 48 }} resizeMode="cover" />
              ) : (
                <Ionicons name="person-outline" size={22} color="#76C893" />
              )}
            </Pressable>
          </View>

          {/* Explore Workouts */}
          <Text className="text-2xl font-extrabold text-gray-900 mb-3">
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
          <Text className="text-2xl font-extrabold text-gray-900 mb-3">
            Explore Nutrition
          </Text>

          <Pressable
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
          <Text className="text-2xl font-extrabold text-gray-900 mb-3">
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
          <Text className="text-2xl font-extrabold text-gray-900 mb-4">
            Connect & Help
          </Text>

          <View className="flex-row justify-between">
            <Pressable
              onPress={() => router.push("/community" as any)}
              className="bg-[#76C893] rounded-[28px] w-[48%] py-8 items-center shadow-sm"
            >
              <View className="w-14 h-14 rounded-full bg-[#9fdfb6] items-center justify-center mb-5">
                <Ionicons name="people" size={24} color="white" />
              </View>

              <Text className="text-white text-2xl font-extrabold">
                Community
              </Text>
              <Text className="text-[#d9f4e2] text-sm font-bold tracking-[2px] mt-2">
                JOIN CHAT
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
                AI Coach
              </Text>
              <Text className="text-[#d9f4e2] text-sm font-bold tracking-[2px] mt-2">
                GET ADVICE
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex-row justify-around py-3">
        <Pressable onPress={() => router.replace("/home")} className="items-center">
          <Ionicons name="home-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">HOME</Text>
        </Pressable>

        

        <Pressable className="items-center">
          <Ionicons name="compass" size={20} color="#76C893" />
          <Text className="text-[10px] text-[#76C893] font-bold mt-1">
            DISCOVER
          </Text>
        </Pressable>

          <Pressable onPress={() => router.replace("/progress")} className="items-center">
                  <Ionicons name="stats-chart-outline" size={20} color="#9ca3af" />
                  <Text className="text-[10px] text-gray-400 font-bold mt-1">PROGRESS</Text>
                </Pressable>
        
                <Pressable
                onPress={() => router.push("/profile")}
                className="items-center"
              >
                <Ionicons name="person-outline" size={20} color="#9ca3af" />
                <Text className="text-[10px] text-gray-400 font-bold mt-1">
                  PROFILE
                </Text>
              </Pressable>
      </View>
    </View>
  );
}