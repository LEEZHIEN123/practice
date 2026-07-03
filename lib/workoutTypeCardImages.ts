import type { WorkoutType } from "@/lib/workoutCatalog";
import type { ImageContentPosition } from "expo-image";
import type { ImageSourcePropType, ImageStyle } from "react-native";

export const WORKOUT_TYPE_CARD_IMAGES: Record<WorkoutType, ImageSourcePropType> = {
  Yoga: require("../assets/images/workout-type-yoga.png"),
  Strength: require("../assets/images/workout-type-strength.png"),
  HIIT: require("../assets/images/workout-type-hiit.png"),
  Cardio: require("../assets/images/workout-type-cardio.png"),
};

export const WORKOUT_TYPE_CARD_IMAGE_POSITION: Partial<Record<WorkoutType, ImageContentPosition>> = {
  Cardio: "right center",
  HIIT: { top: "26%", left: "50%" },
};

export const WORKOUT_TYPE_CARD_IMAGE_STYLE: Partial<Record<WorkoutType, ImageStyle>> = {
  HIIT: { transform: [{ translateY: 2 }, { scale: 1.06 }] },
};
