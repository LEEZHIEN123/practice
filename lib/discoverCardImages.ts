import type { ImageContentPosition } from "expo-image";
import type { ImageSourcePropType } from "react-native";

export type DiscoverCardKey =
  | "allWorkouts"
  | "allNutrition"
  | "allMusic"
  | "community"
  | "aiCoach";

export const DISCOVER_CARD_IMAGES: Record<DiscoverCardKey, ImageSourcePropType> = {
  allWorkouts: require("../assets/images/discover-all-workouts.png"),
  allNutrition: require("../assets/images/discover-all-nutrition.png"),
  allMusic: require("../assets/images/discover-all-music.png"),
  community: require("../assets/images/discover-community.png"),
  aiCoach: require("../assets/images/discover-ai-coach.png"),
};

/** Keep the hero subject visible under text overlays. */
export const DISCOVER_CARD_IMAGE_POSITION: Partial<Record<DiscoverCardKey, ImageContentPosition>> = {
  allWorkouts: { left: "80%", top: "55%" },
  allNutrition: "center",
  allMusic: { left: "65%", top: "60%" },
  community: "center",
  aiCoach: "center",
};

export const DISCOVER_CARD_OVERLAY_OPACITY: Record<DiscoverCardKey, { row: number; stack: number }> = {
  allWorkouts: { row: 0.28, stack: 0.20 },
  allNutrition: { row: 0.28, stack: 0.34 },
  allMusic: { row: 0.22, stack: 0.20 },
  community: { row: 0.34, stack: 0.35 },
  aiCoach: { row: 0.22, stack: 0.35 },
};

/** Fixed height for Community / AI Chatbot stack cards on Discover. */
export const DISCOVER_STACK_CARD_HEIGHT = 180;

/** Min height for row-style discover cards (Workouts, Nutrition, Music). */
export const DISCOVER_ROW_CARD_MIN_HEIGHT = 100;
