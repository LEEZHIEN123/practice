import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { auth, db } from "../firebaseConfig";
import { bumpWorkoutPlanDay } from "@/lib/achievements";
import { doc, getDoc } from "firebase/firestore";

type IoniconName = keyof typeof Ionicons.glyphMap;

function HomeSectionHeading({
  label,
  icon,
  tintClass,
  iconColor,
}: {
  label: string;
  icon: IoniconName;
  tintClass: string;
  iconColor: string;
}) {
  return (
    <View className="mt-5 flex-row items-center">
      <View
        className={`w-11 h-11 rounded-2xl items-center justify-center border border-white shadow-sm shadow-black/10 ${tintClass}`}
      >
        <Ionicons name={icon} size={21} color={iconColor} />
      </View>
      <Text className="flex-1 ml-3 text-lg font-extrabold text-gray-900 tracking-[0.06em]">
        {label}
      </Text>
      <View className="flex-row items-end gap-0.5 h-5 pl-1">
        <View className="w-[3px] h-2 rounded-full bg-[#76C893] opacity-35" />
        <View className="w-[3px] h-3 rounded-full bg-[#76C893] opacity-55" />
        <View className="w-[3px] h-5 rounded-full bg-[#52B69A] opacity-90" />
      </View>
    </View>
  );
}

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
        <View className="px-6 pt-12">
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
          <View className="mt-4 bg-[#f3f4f3] rounded-3xl p-4 border border-gray-200">
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

                <View className="mt-2">
                  <View className="flex-row items-center mb-1.5">
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
          <HomeSectionHeading
            label="YOUR RECOMMENDED PLAN"
            icon="flash-outline"
            tintClass="bg-[#eaf7f0]"
            iconColor="#52B69A"
          />

          <View className="mt-2 bg-[#f3f4f3] rounded-3xl p-4 border border-gray-200">
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

            <Pressable
              className="mt-3 rounded-full overflow-hidden"
              onPress={() => {
                const u = auth.currentUser;
                if (u) void bumpWorkoutPlanDay(u.uid);
              }}
            >
              <LinearGradient
                colors={["#76C893", "#69c58c"]}
                className="py-3.5 rounded-full items-center"
              >
                <Text className="text-white font-bold text-base">
                  View Full Plan
                </Text>
              </LinearGradient>
            </Pressable>
          </View>

          {/* Meal Suggestions */}
          <HomeSectionHeading
            label="MEAL SUGGESTIONS"
            icon="nutrition-outline"
            tintClass="bg-[#fff4e6]"
            iconColor="#c2410c"
          />

          <View className="flex-row justify-between mt-2">
            <View className="bg-[#f3f4f3] rounded-3xl w-[31%] py-4 items-center border border-gray-200">
              <View className="w-10 h-10 rounded-full bg-[#fde8db] items-center justify-center">
                <MaterialCommunityIcons
                  name="food-croissant"
                  size={18}
                  color="#c78a5a"
                />
              </View>
              <Text className="mt-2 text-sm font-bold text-gray-900">
                Breakfast
              </Text>
              <Text className="text-xs text-gray-400 mt-1">320 kcal</Text>
            </View>

            <View className="bg-[#f3f4f3] rounded-3xl w-[31%] py-4 items-center border border-gray-200">
              <View className="w-10 h-10 rounded-full bg-[#e7f0fb] items-center justify-center">
                <Ionicons name="restaurant" size={18} color="#6b8db3" />
              </View>
              <Text className="mt-2 text-sm font-bold text-gray-900">Lunch</Text>
              <Text className="text-xs text-gray-400 mt-1">580 kcal</Text>
            </View>

            <View className="bg-[#f3f4f3] rounded-3xl w-[31%] py-4 items-center border border-gray-200">
              <View className="w-10 h-10 rounded-full bg-[#efe4fa] items-center justify-center">
                <Ionicons name="fast-food" size={18} color="#8f6ab3" />
              </View>
              <Text className="mt-2 text-sm font-bold text-gray-900">
                Dinner
              </Text>
              <Text className="text-xs text-gray-400 mt-1">450 kcal</Text>
            </View>
          </View>

          {/* Achievements — single entry to full screen */}
          <HomeSectionHeading
            label="ACHIEVEMENTS"
            icon="trophy-outline"
            tintClass="bg-[#fef9c3]"
            iconColor="#ca8a04"
          />

          <Pressable
            onPress={() => router.push("/achievements")}
            className="mt-2 bg-white rounded-3xl border border-gray-200 px-5 py-4 flex-row items-center active:bg-gray-50 mb-1"
          >
            <View className="w-14 h-14 rounded-2xl bg-[#eaf7f0] items-center justify-center">
              <Ionicons name="trophy-outline" size={30} color="#76C893" />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-xl font-extrabold text-gray-900">Achievements</Text>
              <Text className="text-sm text-gray-500 mt-1 leading-5">
                Workout, meal, community & streak badges
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#9ca3af" />
          </Pressable>
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