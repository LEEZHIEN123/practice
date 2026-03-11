import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { auth, db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

export default function HomeScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const loadUserName = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          if (data.name) {
            setUserName(data.name);
          }
        }
      } catch (error) {
        console.log("Failed to load user name:", error);
      }
    };

    loadUserName();
  }, []);

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <View className="px-6 pt-14">
          {/* Header */}
          <View className="flex-row justify-between items-center">
            <View>
                
              <Text className="text-3xl font-extrabold text-gray-900 mt-1">
                Hello, {userName }
              </Text>
            </View>

            <Pressable className="w-12 h-12 rounded-full border-2 border-[#b7ead1] items-center justify-center bg-white">
              <Ionicons name="person-outline" size={22} color="#76C893" />
            </Pressable>
          </View>

          {/* Remaining Calories Card */}
          <View className="mt-6 bg-[#f3f4f3] rounded-3xl p-5 border border-gray-200">
            <View className="flex-row items-center justify-between">
              <View className="w-28 h-28 rounded-full border-[8px] border-[#76C893] items-center justify-center bg-white">
                <Text className="text-3xl font-extrabold text-gray-900">1,240</Text>
                <Text className="text-[10px] text-gray-400 font-semibold mt-1">
                  KCAL LEFT
                </Text>
              </View>

              <View className="flex-1 ml-5">
                <Text className="text-2xl font-extrabold text-gray-900 leading-7">
                  Remaining{"\n"}Calories
                </Text>

                <View className="mt-3">
                  <View className="flex-row items-center mb-2">
                    <View className="w-2 h-2 rounded-full bg-[#76C893] mr-2" />
                    <Text className="text-gray-500 text-sm">Consumed: 860</Text>
                  </View>

                  <View className="flex-row items-center">
                    <View className="w-2 h-2 rounded-full bg-[#b7ead1] mr-2" />
                    <Text className="text-gray-500 text-sm">Burned: 550</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Recommended Plan */}
          <Text className="mt-8 text-xs tracking-[2px] text-gray-400 font-bold">
            YOUR RECOMMENDED PLAN
          </Text>

          <View className="mt-4 bg-[#f3f4f3] rounded-3xl p-4 border border-gray-200">
            <View className="flex-row justify-between items-start">
              <View className="flex-row items-center">
                <View className="w-12 h-12 rounded-2xl bg-[#dff5e8] items-center justify-center">
                  <Ionicons name="flash" size={20} color="#76C893" />
                </View>

                <View className="ml-3">
                  <Text className="text-[10px] text-[#76C893] font-bold">HIIT</Text>
                  <Text className="text-xl font-extrabold text-gray-900">
                    Full Body Burn
                  </Text>
                  <Text className="text-gray-400 text-xs mt-1">
                    Intermediate • 350 kcal
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center">
                <Ionicons name="time-outline" size={14} color="#9ca3af" />
                <Text className="text-xs text-gray-400 font-semibold ml-1">
                  25 min
                </Text>
              </View>
            </View>

            <Pressable className="mt-5 rounded-full overflow-hidden">
              <LinearGradient
                colors={["#76C893", "#69c58c"]}
                className="py-4 rounded-full items-center"
              >
                <Text className="text-white font-bold text-base">
                  View Full Plan
                </Text>
              </LinearGradient>
            </Pressable>
          </View>

          {/* Meal Suggestions */}
          <Text className="mt-8 text-xs tracking-[2px] text-gray-400 font-bold">
            MEAL SUGGESTIONS
          </Text>

          <View className="flex-row justify-between mt-4">
            <View className="bg-[#f3f4f3] rounded-3xl w-[31%] py-5 items-center border border-gray-200">
              <View className="w-10 h-10 rounded-full bg-[#fde8db] items-center justify-center">
                <MaterialCommunityIcons
                  name="food-croissant"
                  size={18}
                  color="#c78a5a"
                />
              </View>
              <Text className="mt-3 text-sm font-bold text-gray-900">
                Breakfast
              </Text>
              <Text className="text-xs text-gray-400 mt-1">320 kcal</Text>
            </View>

            <View className="bg-[#f3f4f3] rounded-3xl w-[31%] py-5 items-center border border-gray-200">
              <View className="w-10 h-10 rounded-full bg-[#e7f0fb] items-center justify-center">
                <Ionicons name="restaurant" size={18} color="#6b8db3" />
              </View>
              <Text className="mt-3 text-sm font-bold text-gray-900">Lunch</Text>
              <Text className="text-xs text-gray-400 mt-1">580 kcal</Text>
            </View>

            <View className="bg-[#f3f4f3] rounded-3xl w-[31%] py-5 items-center border border-gray-200">
              <View className="w-10 h-10 rounded-full bg-[#efe4fa] items-center justify-center">
                <Ionicons name="fast-food" size={18} color="#8f6ab3" />
              </View>
              <Text className="mt-3 text-sm font-bold text-gray-900">
                Dinner
              </Text>
              <Text className="text-xs text-gray-400 mt-1">450 kcal</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex-row justify-around py-3">
        <Pressable className="items-center">
          <Ionicons name="home" size={20} color="#76C893" />
          <Text className="text-[10px] text-[#76C893] font-bold mt-1">HOME</Text>
        </Pressable>

         
        <Pressable
          onPress={() => router.push("/discover")}
          className="items-center"
        >
          <Ionicons name="compass-outline" size={20} color="#9ca3af" />
          <Text className="text-[10px] text-gray-400 font-bold mt-1">
            DISCOVER
          </Text>
        </Pressable>

        <Pressable className="items-center">
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