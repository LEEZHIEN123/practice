import { Pressable } from "@/components/Pressable";
import {
  PROGRESS_METRIC_CARD_IMAGE_POSITION,
  PROGRESS_METRIC_CARD_IMAGES,
  PROGRESS_METRIC_CARD_OVERLAY_OPACITY,
  type ProgressMetricCardKey,
} from "@/lib/progressCardImages";
import { imageCardOverlayOpacity } from "@/lib/appearance";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

type ProgressMetricCardProps = {
  cardKey: ProgressMetricCardKey;
  title: string;
  icon: ReactNode;
  onPress: () => void;
  children: ReactNode;
  className?: string;
};

export function ProgressMetricCard({
  cardKey,
  title,
  icon,
  onPress,
  children,
  className = "",
}: ProgressMetricCardProps) {
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
      className={`flex-1 self-stretch rounded-3xl overflow-hidden active:opacity-95 ${className}`}
    >
      <View className="flex-1 p-4 pb-5">
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

        <View className="flex-row items-center justify-between">
          <Text
            className="text-lg font-extrabold flex-1 mr-2"
            style={{ color: "#ffffff", ...textShadow }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {icon}
        </View>

        <View className="flex-1">{children}</View>
      </View>
    </Pressable>
  );
}

export function ProgressMetricLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      className="text-[10px] tracking-widest font-bold mt-2"
      style={{
        color: "#ffffff",
        textShadowColor: "rgba(0,0,0,0.45)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      }}
    >
      {children}
    </Text>
  );
}

export function ProgressMetricValue({ children }: { children: ReactNode }) {
  return (
    <Text
      className="text-3xl font-extrabold mt-1"
      style={{
        color: "#86efac",
        textShadowColor: "rgba(0,0,0,0.5)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
      }}
    >
      {children}
    </Text>
  );
}

export function ProgressMetricDetail({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <Text
      className={`text-sm mt-2 ${className}`}
      style={{
        color: "#ffffff",
        textShadowColor: "rgba(0,0,0,0.45)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      }}
    >
      {children}
    </Text>
  );
}

export function ProgressMetricLink({
  children,
  bright = false,
}: {
  children: ReactNode;
  bright?: boolean;
}) {
  return (
    <Text
      className="text-sm font-semibold mt-auto pt-1.5"
      style={{
        color: bright ? "#ff3333" : "#ef4444",
        textShadowColor: "rgba(0,0,0,0.45)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      }}
    >
      {children}
    </Text>
  );
}
