import { Pressable } from "@/components/Pressable";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Modal, ScrollView, Text, useWindowDimensions, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MIN_ZOOM_SCALE = 1;
const MAX_ZOOM_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

type ZoomableImageProps = {
  uri: string;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
};

function ZoomableImage({ uri, width, height, onZoomChange }: ZoomableImageProps) {
  const [zoomed, setZoomed] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const reportZoom = (value: boolean) => {
    setZoomed(value);
    onZoomChange(value);
  };

  const clampTranslation = (value: number, axisSize: number, currentScale: number) => {
    "worklet";
    const maxOffset = (axisSize * (currentScale - 1)) / 2;
    return Math.max(-maxOffset, Math.min(maxOffset, value));
  };

  const resetZoom = () => {
    "worklet";
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    runOnJS(reportZoom)(false);
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.max(
        MIN_ZOOM_SCALE,
        Math.min(MAX_ZOOM_SCALE, savedScale.value * event.scale)
      );
      translateX.value = clampTranslation(translateX.value, width, scale.value);
      translateY.value = clampTranslation(translateY.value, height, scale.value);
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        resetZoom();
        return;
      }
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      runOnJS(reportZoom)(true);
    });

  const panGesture = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((event) => {
      translateX.value = clampTranslation(
        savedTranslateX.value + event.translationX,
        width,
        scale.value
      );
      translateY.value = clampTranslation(
        savedTranslateY.value + event.translationY,
        height,
        scale.value
      );
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      if (scale.value > 1) {
        resetZoom();
        return;
      }
      scale.value = withTiming(DOUBLE_TAP_SCALE);
      savedScale.value = DOUBLE_TAP_SCALE;
      const targetX = clampTranslation(
        (width / 2 - event.x) * (DOUBLE_TAP_SCALE - 1),
        width,
        DOUBLE_TAP_SCALE
      );
      const targetY = clampTranslation(
        (height / 2 - event.y) * (DOUBLE_TAP_SCALE - 1),
        height,
        DOUBLE_TAP_SCALE
      );
      translateX.value = withTiming(targetX);
      translateY.value = withTiming(targetY);
      savedTranslateX.value = targetX;
      savedTranslateY.value = targetY;
      runOnJS(reportZoom)(true);
    });

  const composedGesture = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[{ width, height }, animatedStyle]}>
        <Image source={{ uri }} style={{ width, height }} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

type PostImagesGalleryProps = {
  imageUrls: string[];
  className?: string;
  maxHeight?: number;
};

export function PostImagesGallery({
  imageUrls,
  className = "",
  maxHeight = 220,
}: PostImagesGalleryProps) {
  const { cardStyle } = useThemedScreen();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [pagingEnabled, setPagingEnabled] = useState(true);
  const urls = imageUrls.filter(Boolean);
  if (urls.length === 0) return null;

  const openViewer = (index: number) => {
    setPagingEnabled(true);
    setSelectedImageIndex(index);
  };

  return (
    <>
      {urls.length === 1 ? (
        <View className={`mt-3 overflow-hidden rounded-2xl ${className}`} style={cardStyle}>
          <Pressable
            onPress={() => openViewer(0)}
            accessibilityLabel="View full image"
          >
            <Image
              source={{ uri: urls[0] }}
              style={{ width: "100%", height: maxHeight }}
              contentFit="cover"
            />
          </Pressable>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className={`mt-3 ${className}`}
          contentContainerStyle={{ gap: 10, paddingRight: 4 }}
        >
          {urls.map((uri, index) => (
            <View
              key={`${uri}-${index}`}
              className="relative overflow-hidden rounded-2xl"
              style={cardStyle}
            >
              <Pressable
                onPress={() => openViewer(index)}
                accessibilityLabel={`View photo ${index + 1} full screen`}
              >
                <Image
                  source={{ uri }}
                  style={{ width: 180, height: maxHeight }}
                  contentFit="cover"
                />
              </Pressable>
              <View
                pointerEvents="none"
                className="absolute top-2 right-2 min-w-[24px] h-6 px-2 rounded-full items-center justify-center"
                style={{ backgroundColor: "rgba(15, 23, 42, 0.78)" }}
              >
                <Text className="text-[11px] font-extrabold text-white">{index + 1}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal
        visible={selectedImageIndex !== null}
        animationType="fade"
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => setSelectedImageIndex(null)}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View className="flex-1 bg-black">
            <View
              className="absolute left-0 right-0 top-0 z-10 flex-row items-center justify-between px-4 pb-3"
              style={{ paddingTop: insets.top + 10, backgroundColor: "rgba(0,0,0,0.55)" }}
            >
              <View className="h-10 w-10" />
              <Text className="font-bold text-white">
                {selectedImageIndex === null ? "" : `${selectedImageIndex + 1} / ${urls.length}`}
              </Text>
              <Pressable
                onPress={() => setSelectedImageIndex(null)}
                hitSlop={10}
                accessibilityLabel="Close full image"
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
              >
                <Ionicons name="close" size={26} color="white" />
              </Pressable>
            </View>

            {selectedImageIndex !== null ? (
              <ScrollView
                key={selectedImageIndex}
                horizontal
                pagingEnabled
                scrollEnabled={pagingEnabled}
                showsHorizontalScrollIndicator={false}
                contentOffset={{ x: selectedImageIndex * width, y: 0 }}
                onMomentumScrollEnd={(event) => {
                  const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
                  setSelectedImageIndex(Math.max(0, Math.min(nextIndex, urls.length - 1)));
                }}
              >
                {urls.map((uri, index) => (
                  <View
                    key={`full-${uri}-${index}`}
                    style={{ width, height }}
                    className="items-center justify-center"
                  >
                    <ZoomableImage
                      uri={uri}
                      width={width}
                      height={height}
                      onZoomChange={(zoomed) => setPagingEnabled(!zoomed)}
                    />
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}
