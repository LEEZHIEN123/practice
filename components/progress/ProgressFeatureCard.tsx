import { Pressable } from "@/components/Pressable";
import { imageCardOverlayOpacity } from "@/lib/appearance";
import {
  PROGRESS_METRIC_CARD_IMAGE_POSITION,
  PROGRESS_METRIC_CARD_IMAGES,
  PROGRESS_METRIC_CARD_OVERLAY_OPACITY,
  type ProgressMetricCardKey,
} from "@/lib/progressCardImages";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

type ProgressFeatureCardProps = {
  cardKey: ProgressMetricCardKey;
  title: string;
  subtitle: string;
  icon: ReactNode;
  onPress: () => void;
  large?: boolean;
};

export function ProgressFeatureCard({
  cardKey,
  title,
  subtitle,
  icon,
  onPress,
  large = false,
}: ProgressFeatureCardProps) {
  const { isDark } = useThemedScreen();
  const overlayOpacity = imageCardOverlayOpacity(
    PROGRESS_METRIC_CARD_OVERLAY_OPACITY[cardKey],
    isDark
  );
  const textShadow = {
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 } as const,
    textShadowRadius: 4,
  };

  return (
    <Pressable
      onPress={onPress}
      className="rounded-3xl overflow-hidden active:opacity-95 shadow-sm shadow-black/5"
    >
      <View
        className={large ? "px-5 py-6" : "px-5 py-5"}
        style={large ? { minHeight: 132, justifyContent: "center" } : undefined}
      >
        <Image
          source={PROGRESS_METRIC_CARD_IMAGES[cardKey]}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          contentPosition={PROGRESS_METRIC_CARD_IMAGE_POSITION[cardKey] ?? "center"}
          transition={200}
        />
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(15, 23, 42, ${overlayOpacity})` },
          ]}
        />

        <View className="flex-row items-center">
          <View
            className="rounded-2xl bg-white/90 items-center justify-center shrink-0"
            style={large ? { width: 52, height: 52 } : { width: 56, height: 56 }}
          >
            {icon}
          </View>

          <View className="flex-1 min-w-0 ml-4 pr-2 justify-center">
            <Text
              className={`${large ? "text-lg" : "text-xl"} font-extrabold`}
              style={{ color: "#ffffff", ...textShadow }}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text
              className="text-sm mt-1 leading-[18px]"
              style={{
                color: "#ffffff",
                textShadowColor: "rgba(0,0,0,0.45)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 3,
              }}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          </View>

          <View className="shrink-0 pl-1 justify-center">
            <Ionicons name="chevron-forward" size={large ? 24 : 22} color="#ffffff" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
