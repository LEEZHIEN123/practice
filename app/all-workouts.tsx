import { WORKOUT_DETAILS, type WorkoutType } from "@/lib/workoutCatalog";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TYPES: WorkoutType[] = ["Yoga", "Strength", "HIIT", "Cardio"];

function typeIonIcon(type: WorkoutType): keyof typeof Ionicons.glyphMap {
  if (type === "Yoga") return "leaf-outline";
  if (type === "HIIT") return "flash-outline";
  if (type === "Cardio") return "walk-outline";
  return "barbell-outline";
}

export default function AllWorkoutsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<WorkoutType | null>(null);

  const names = useMemo(() => {
    if (!selected) return [];
    return Object.keys(WORKOUT_DETAILS[selected]).sort((a, b) => a.localeCompare(b));
  }, [selected]);

  if (selected) {
    return (
      <View className="flex-1 bg-[#f3f4f3]">
        <View style={{ paddingTop: insets.top + 8 }} className="px-3 pb-4 flex-row items-center">
          <Pressable
            onPress={() => setSelected(null)}
            hitSlop={12}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <View className="flex-1 min-w-0">
            <Text className="text-lg font-extrabold text-gray-500 tracking-wide">ALL WORKOUTS</Text>
            <Text className="text-2xl font-extrabold text-gray-900 mt-0.5">{selected}</Text>
          </View>
        </View>

        <FlatList
          data={names}
          keyExtractor={(item) => item}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 32, paddingTop: 4 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push(
                  `/free-workout?type=${encodeURIComponent(selected)}&name=${encodeURIComponent(item)}` as any
                )
              }
              className="bg-[#bdeccf] rounded-[28px] p-6 mb-4 flex-row items-center justify-between active:opacity-90"
            >
              <Text className="text-xl font-extrabold text-gray-900 flex-1 pr-3" numberOfLines={3}>
                {item}
              </Text>
              <Ionicons name="chevron-forward" size={28} color="#76C893" />
            </Pressable>
          )}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f3f4f3]">
      <View style={{ paddingTop: insets.top + 8 }} className="px-3 pb-4 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <Text className="text-2xl font-extrabold text-gray-900 flex-1">All Workouts</Text>
      </View>

      <View className="px-3 pb-8">
        <Text className="text-gray-600 font-semibold mb-4 leading-6">
          Choose a workout type, then pick an exercise to start. Discover workouts count toward today’s burn on Home and
          Progress, and stay separate from your plan days.
        </Text>

        {TYPES.map((t) => (
          <Pressable
            key={t}
            onPress={() => setSelected(t)}
            className="bg-[#bdeccf] rounded-[28px] p-6 mb-5 flex-row items-center justify-between active:opacity-90"
          >
            <View className="flex-row items-center flex-1 min-w-0">
              <View className="w-14 h-14 rounded-full bg-white items-center justify-center mr-4">
                <Ionicons name={typeIonIcon(t)} size={24} color="#76C893" />
              </View>
              <Text className="text-2xl font-extrabold text-gray-900">{t}</Text>
            </View>
            <Ionicons name="chevron-forward" size={28} color="#76C893" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
