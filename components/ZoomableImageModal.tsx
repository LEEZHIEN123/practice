import { Pressable } from "@/components/Pressable";
import { Image } from "expo-image";
import { useEffect } from "react";
import { Dimensions, Modal, StatusBar, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ZoomableImageModalProps = {
  visible: boolean;
  uri: string;
  onClose: () => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const IMAGE_H = SCREEN_H * 0.72;

export function ZoomableImageModal({ visible, uri, onClose }: ZoomableImageModalProps) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedX.value = 0;
      savedY.value = 0;
    }
  }, [visible, savedScale, savedX, savedY, scale, translateX, translateY]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = Math.min(4, Math.max(1, savedScale.value * e.scale));
      scale.value = next;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.01) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.2) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      } else {
        scale.value = withTiming(2.2);
        savedScale.value = 2.2;
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />
        <Pressable className="flex-1 bg-black" onPress={onClose}>
          <View
            className="z-10 flex-row justify-end px-4"
            style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
          >
            <Pressable
              onPress={onClose}
              className="px-4 py-2 rounded-full bg-white/20 active:opacity-80"
            >
              <Text className="text-white font-extrabold text-base">Close</Text>
            </Pressable>
          </View>

          <View className="flex-1 items-center justify-center">
            <Pressable onPress={() => {}}>
              <GestureDetector gesture={composed}>
                <Animated.View style={[{ width: SCREEN_W, height: IMAGE_H, alignItems: "center", justifyContent: "center" }, imageStyle]}>
                  <Image
                    source={{ uri }}
                    style={{ width: SCREEN_W, height: IMAGE_H }}
                    contentFit="contain"
                  />
                </Animated.View>
              </GestureDetector>
            </Pressable>
          </View>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
