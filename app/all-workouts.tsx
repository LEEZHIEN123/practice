import { Pressable } from "@/components/Pressable";
import { ProfileScreenHeader } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { imageCardOverlayOpacity } from "@/lib/appearance";
import { WORKOUT_DETAILS, type WorkoutType } from "@/lib/workoutCatalog";
import {
  WORKOUT_TYPE_CARD_IMAGE_POSITION,
  WORKOUT_TYPE_CARD_IMAGES,
  WORKOUT_TYPE_CARD_IMAGE_STYLE,
} from "@/lib/workoutTypeCardImages";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TYPES: WorkoutType[] = ["Yoga", "Strength", "HIIT", "Cardio"];

function typeIonIcon(type: WorkoutType): keyof typeof Ionicons.glyphMap {
  if (type === "Yoga") return "leaf-outline";
  if (type === "HIIT") return "flash-outline";
  if (type === "Cardio") return "walk-outline";
  return "barbell-outline";
}

function workoutTypeCardLabel(type: WorkoutType): string {
  if (type === "HIIT") return "HIIT (High-Intensity\nInterval Training)";
  return type;
}

function workoutTypeHeaderLabel(type: WorkoutType): string {
  if (type === "HIIT") return "HIIT (High-Intensity Interval Training)";
  return type;
}

function workoutCountForType(type: WorkoutType): number {
  return Object.keys(WORKOUT_DETAILS[type]).length;
}

function workoutCountLabel(type: WorkoutType): string {
  const count = workoutCountForType(type);
  return `${count} workout${count === 1 ? "" : "s"}`;
}

function WorkoutTypeCard({ type, onPress }: { type: WorkoutType; onPress: () => void }) {
  const { isDark } = useThemedScreen();
  const overlayOpacity = imageCardOverlayOpacity(0.52, isDark);

  return (
    <Pressable onPress={onPress} className="rounded-[28px] mb-5 overflow-hidden active:opacity-95">
      <View className="min-h-[148px] justify-center">
        <Image
          source={WORKOUT_TYPE_CARD_IMAGES[type]}
          style={[StyleSheet.absoluteFillObject, WORKOUT_TYPE_CARD_IMAGE_STYLE[type]]}
          contentFit="cover"
          contentPosition={WORKOUT_TYPE_CARD_IMAGE_POSITION[type] ?? "center"}
          transition={200}
        />
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: `rgba(15, 23, 42, ${overlayOpacity})` }]}
        />
        <View className="px-6 py-5 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 min-w-0 pr-3">
            <View className="w-14 h-14 rounded-full bg-white/90 items-center justify-center mr-4">
              <Ionicons name={typeIonIcon(type)} size={24} color="#76C893" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-2xl font-extrabold text-white leading-8">{workoutTypeCardLabel(type)}</Text>
              <Text className="text-base font-bold text-white/85 mt-1">{workoutCountLabel(type)}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={28} color="#ffffff" />
        </View>
      </View>
    </Pressable>
  );
}

export default function AllWorkoutsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { screenStyle, textSecondary } = useThemedScreen();
  const [selected, setSelected] = useState<WorkoutType | null>(null);

  const names = useMemo(() => {
    if (!selected) return [];
    return Object.keys(WORKOUT_DETAILS[selected]).sort((a, b) => a.localeCompare(b));
  }, [selected]);

  if (selected) {
    return (
      <View className="flex-1" style={screenStyle}>
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12 }}>
          <ProfileScreenHeader
            title={workoutTypeHeaderLabel(selected)}
            onBack={() => setSelected(null)}
            titleClassName="text-xl"
          />
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
              className="bg-[#bdeccf] rounded-[28px] p-6 mb-3 flex-row items-center justify-between active:opacity-90"
            >
              <View className="flex-1 pr-3">
                <Text className="text-xl font-extrabold text-gray-900" numberOfLines={3}>
                  {item}
                </Text>
                <Text className="text-base font-semibold text-gray-600 mt-1">
                  MET: {WORKOUT_DETAILS[selected][item].met}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={28} color="#76C893" />
            </Pressable>
          )}
        />
      </View>
    );
  }

  return (
    <View className="flex-1" style={screenStyle}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12 }}>
        <ProfileScreenHeader title="All Workouts" onBack={() => router.back()} />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="ml-2 font-extrabold text-lg mb-4 leading-6" style={textSecondary}>
          Choose any workout type from the below lists, then pick an exercise to start.
        </Text>

        {TYPES.map((t) => (
          <WorkoutTypeCard key={t} type={t} onPress={() => setSelected(t)} />
        ))}
      </ScrollView>
    </View>
  );
}
