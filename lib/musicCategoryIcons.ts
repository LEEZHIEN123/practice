import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";

export type MusicCategoryIconName = ComponentProps<typeof Ionicons>["name"];

/** Single music note icon for every genre (same as former Jazz icon). */
export function getMusicCategoryIcon(_categoryId?: string): MusicCategoryIconName {
  return "musical-notes";
}
