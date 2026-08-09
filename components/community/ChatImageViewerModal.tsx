import { Pressable } from "@/components/Pressable";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useCallback, useEffect } from "react";
import { Dimensions, Modal, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  uri: string | null;
  onClose: () => void;
  canRecall?: boolean;
  onRecall?: () => void;
};

export function ChatImageViewerModal({ uri, onClose, canRecall = false, onRecall }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = Dimensions.get("window");

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);

  const resetTransforms = useCallback(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTX.value = 0;
    savedTY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTX, savedTY]);

  useEffect(() => {
    if (!uri) resetTransforms();
  }, [uri, resetTransforms]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = Math.min(Math.max(savedScale.value * e.scale, 1), 5);
      scale.value = next;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.01) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTX.value = 0;
        savedTY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      translateX.value = savedTX.value + e.translationX;
      translateY.value = savedTY.value + e.translationY;
    })
    .onEnd(() => {
      savedTX.value = translateX.value;
      savedTY.value = translateY.value;
      if (scale.value <= 1.01) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTX.value = 0;
        savedTY.value = 0;
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.01) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTX.value = 0;
        savedTY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal visible={Boolean(uri)} animationType="fade" transparent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.root}>
          <View
            style={[
              styles.topBar,
              { paddingTop: insets.top + 8, paddingBottom: 10 },
            ]}
          >
            <View className="w-11 h-11" />
            <Text className="text-white text-base font-extrabold">Photo</Text>
            <Pressable onPress={onClose} hitSlop={10} className="w-11 h-11 items-center justify-center">
              <Ionicons name="close" size={28} color="white" />
            </Pressable>
          </View>

          <GestureDetector gesture={composed}>
            <Animated.View style={styles.stage}>
              {uri ? (
                <Animated.View style={imageStyle}>
                  <Image
                    source={{ uri }}
                    style={{ width: screenW, height: Math.max(280, screenH * 0.72) }}
                    contentFit="contain"
                  />
                </Animated.View>
              ) : null}
            </Animated.View>
          </GestureDetector>

          <View style={{ paddingBottom: insets.bottom + 16, paddingHorizontal: 16 }}>
            <Text className="text-center text-white/70 text-xs font-semibold mb-3">
              Pinch to zoom · Double tap to zoom
            </Text>
            {canRecall && onRecall ? (
              <Pressable
                onPress={onRecall}
                className="rounded-full py-3.5 items-center active:opacity-90"
                style={{ backgroundColor: "#dc2626" }}
              >
                <Text className="text-white font-extrabold text-base">Recall photo</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
