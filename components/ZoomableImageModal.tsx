import { Pressable } from "@/components/Pressable";
import { Image } from "expo-image";
import { useEffect } from "react";
import {
  Dimensions,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ZoomableImageModalProps = {
  visible: boolean;
  /** Remote URL — used when `source` is not provided. */
  uri?: string;
  /** Local or remote image source (preferred when set). */
  source?: ImageSourcePropType;
  onClose: () => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const IMAGE_H = SCREEN_H * 0.72;

export function ZoomableImageModal({ visible, uri, source, onClose }: ZoomableImageModalProps) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const imageSource = source ?? (uri ? { uri } : null);

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

  if (!imageSource) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <StatusBar barStyle="light-content" />

        {/* Full-screen backdrop — tap anywhere empty to close */}
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityLabel="Close profile photo"
        />

        <View pointerEvents="box-none" style={styles.content}>
          <View
            pointerEvents="box-none"
            style={[styles.header, { paddingTop: insets.top + 8 }]}
          >
            <Pressable
              onPress={onClose}
              className="px-4 py-2 rounded-full bg-white/20 active:opacity-80"
            >
              <Text className="text-white font-extrabold text-base">Close</Text>
            </Pressable>
          </View>

          <View pointerEvents="box-none" style={styles.imageWrap}>
            <GestureDetector gesture={composed}>
              <Animated.View style={[{ width: SCREEN_W, height: IMAGE_H }, imageStyle]}>
                <Image
                  source={imageSource}
                  style={{ width: SCREEN_W, height: IMAGE_H }}
                  contentFit="contain"
                />
              </Animated.View>
            </GestureDetector>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  content: {
    flex: 1,
  },
  header: {
    zIndex: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  imageWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
