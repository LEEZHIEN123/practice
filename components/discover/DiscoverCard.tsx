import { Pressable } from "@/components/Pressable";
import { imageCardOverlayOpacity } from "@/lib/appearance";
import {
  DISCOVER_CARD_IMAGES,
  DISCOVER_CARD_IMAGE_POSITION,
  DISCOVER_CARD_OVERLAY_OPACITY,
  DISCOVER_ROW_CARD_MIN_HEIGHT,
  DISCOVER_STACK_CARD_HEIGHT,
  type DiscoverCardKey,
} from "@/lib/discoverCardImages";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

type DiscoverCardProps = {
  cardKey: DiscoverCardKey;
  title: string;
  subtitle?: string;
  onPress: () => void;
  onPressIn?: () => void;
  layout?: "row" | "stack";
  icon?: ReactNode;
  className?: string;
};

function defaultIcon(cardKey: DiscoverCardKey) {
  if (cardKey === "allWorkouts") {
    return <MaterialCommunityIcons name="dumbbell" size={22} color="#76C893" />;
  }
  if (cardKey === "allNutrition") {
    return <Ionicons name="restaurant" size={22} color="#76C893" />;
  }
  if (cardKey === "allMusic") {
    return <Ionicons name="musical-notes" size={22} color="#76C893" />;
  }
  if (cardKey === "community") {
    return <Ionicons name="people" size={30} color="white" />;
  }
  return <MaterialCommunityIcons name="robot-happy-outline" size={24} color="white" />;
}

export function DiscoverCard({
  cardKey,
  title,
  subtitle,
  onPress,
  onPressIn,
  layout = "row",
  icon,
  className = "",
}: DiscoverCardProps) {
  const { isDark } = useThemedScreen();
  const isStack = layout === "stack";
  const overlayOpacity = imageCardOverlayOpacity(
    DISCOVER_CARD_OVERLAY_OPACITY[cardKey][isStack ? "stack" : "row"],
    isDark
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      className={`rounded-[28px] overflow-hidden active:opacity-95 ${className}`}
      style={isStack ? { height: DISCOVER_STACK_CARD_HEIGHT } : undefined}
    >
      <View
        style={
          isStack
            ? { height: DISCOVER_STACK_CARD_HEIGHT }
            : { minHeight: DISCOVER_ROW_CARD_MIN_HEIGHT, justifyContent: "center" }
        }
      >
        <Image
          source={DISCOVER_CARD_IMAGES[cardKey]}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          contentPosition={DISCOVER_CARD_IMAGE_POSITION[cardKey] ?? "center"}
          transition={200}
        />
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(15, 23, 42, ${overlayOpacity})` },
          ]}
        />

        {isStack ? (
          <View className="flex-1 justify-end px-4 pb-10 pt-14">
            {icon ? <View className="absolute top-4 right-4 z-10">{icon}</View> : null}
            <Text
              className="text-white text-2xl font-extrabold text-center"
              style={{ textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                className="text-white/90 text-lg font-bold tracking-[1px] mt-2 text-center leading-7"
                style={{ textShadowColor: "rgba(0,0,0,0.45)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : (
          <View className="px-6 py-5 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 min-w-0 pr-3">
              <View className="w-14 h-14 rounded-full bg-white items-center justify-center mr-4">
                {icon ?? defaultIcon(cardKey)}
              </View>
              <Text
                className="text-2xl font-extrabold text-white flex-1"
                numberOfLines={2}
                style={{ textShadowColor: "rgba(0,0,0,0.45)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}
              >
                {title}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={28} color="#ffffff" />
          </View>
        )}
      </View>
    </Pressable>
  );
}
