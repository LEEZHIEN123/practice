import type { ImageSource } from "expo-image";

export type ChatSticker = {
  id: string;
  label: string;
  source: ImageSource;
};

export const CHAT_STICKERS: ChatSticker[] = [
  { id: "muscle", label: "Strong", source: require("../assets/stickers/muscle.png") },
  { id: "fire", label: "On fire", source: require("../assets/stickers/fire.png") },
  { id: "runner", label: "Running", source: require("../assets/stickers/runner.png") },
  { id: "yoga", label: "Yoga", source: require("../assets/stickers/yoga.png") },
  { id: "weights", label: "Lift", source: require("../assets/stickers/weights.png") },
  { id: "trophy", label: "Champion", source: require("../assets/stickers/trophy.png") },
  { id: "medal", label: "Winner", source: require("../assets/stickers/medal.png") },
  { id: "heart", label: "Love", source: require("../assets/stickers/heart.png") },
  { id: "star", label: "Star", source: require("../assets/stickers/star.png") },
  { id: "water", label: "Hydrate", source: require("../assets/stickers/water.png") },
  { id: "salad", label: "Healthy", source: require("../assets/stickers/salad.png") },
  { id: "thumbs", label: "Nice", source: require("../assets/stickers/thumbs.png") },
];

export function getChatSticker(id: string): ChatSticker | undefined {
  return CHAT_STICKERS.find((sticker) => sticker.id === id);
}
