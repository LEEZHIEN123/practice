import type { ImageContentPosition } from "expo-image";
import type { ImageSourcePropType } from "react-native";

export type ProgressMetricCardKey = "dailySteps" | "waterIntake" | "achievements";

export const PROGRESS_METRIC_CARD_IMAGES: Record<ProgressMetricCardKey, ImageSourcePropType> = {
  dailySteps: require("../assets/images/progress-daily-steps.png"),
  waterIntake: require("../assets/images/progress-water-intake.png"),
  achievements: require("../assets/images/progress-achievements.png"),
};

export const PROGRESS_METRIC_CARD_IMAGE_POSITION: Partial<
  Record<ProgressMetricCardKey, ImageContentPosition>
> = {
  dailySteps: "center",
  waterIntake: "center",
  achievements: { left: "78%", top: "65%" },
};

export const PROGRESS_METRIC_CARD_OVERLAY_OPACITY: Record<ProgressMetricCardKey, number> = {
  dailySteps: 0.34,
  waterIntake: 0.32,
  achievements: 0.20,
};
