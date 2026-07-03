import type { ImageSource } from "expo-image";

export type ChatSticker = {
  id: string;
  label: string;
  emoji: string;
  source: ImageSource;
};

export const CHAT_STICKER_PICKER_SIZE = 72;
export const CHAT_STICKER_MESSAGE_SIZE = 148;
export const CHAT_STICKER_QUOTE_SIZE = 52;

export const CHAT_STICKERS: ChatSticker[] = [
  { id: "smile", label: "Smile", emoji: "😊", source: require("../assets/stickers/smile.png") },
  { id: "happy", label: "Happy", emoji: "😄", source: require("../assets/stickers/happy.png") },
  { id: "laugh", label: "Laugh", emoji: "😂", source: require("../assets/stickers/laugh.png") },
  { id: "love", label: "Love", emoji: "🥰", source: require("../assets/stickers/love.png") },
  {
    id: "heart_eyes",
    label: "Heart eyes",
    emoji: "😍",
    source: require("../assets/stickers/heart_eyes.png"),
  },
  { id: "wink", label: "Wink", emoji: "😉", source: require("../assets/stickers/wink.png") },
  { id: "cool", label: "Cool", emoji: "😎", source: require("../assets/stickers/cool.png") },
  {
    id: "thinking",
    label: "Thinking",
    emoji: "🤔",
    source: require("../assets/stickers/thinking.png"),
  },
  { id: "sad", label: "Sad", emoji: "😢", source: require("../assets/stickers/sad.png") },
  { id: "angry", label: "Angry", emoji: "😤", source: require("../assets/stickers/angry.png") },
  { id: "wow", label: "Wow", emoji: "😮", source: require("../assets/stickers/wow.png") },
  { id: "thumbs", label: "Thumbs up", emoji: "👍", source: require("../assets/stickers/thumbs.png") },
  { id: "party", label: "Party", emoji: "🎉", source: require("../assets/stickers/party.png") },
  { id: "sleepy", label: "Sleepy", emoji: "😴", source: require("../assets/stickers/sleepy.png") },
  { id: "hug", label: "Hug", emoji: "🤗", source: require("../assets/stickers/hug.png") },
  { id: "clap", label: "Clap", emoji: "👏", source: require("../assets/stickers/clap.png") },
  { id: "kiss", label: "Kiss", emoji: "😘", source: require("../assets/stickers/kiss.png") },
  {
    id: "starstruck",
    label: "Starstruck",
    emoji: "🤩",
    source: require("../assets/stickers/starstruck.png"),
  },
  { id: "shy", label: "Shy", emoji: "😳", source: require("../assets/stickers/shy.png") },
  {
    id: "pleading",
    label: "Pleading",
    emoji: "🥺",
    source: require("../assets/stickers/pleading.png"),
  },
];

const LEGACY_CHAT_STICKERS: ChatSticker[] = [
  { id: "muscle", label: "Strong", emoji: "💪", source: require("../assets/stickers/muscle.png") },
  { id: "fire", label: "On fire", emoji: "🔥", source: require("../assets/stickers/fire.png") },
  { id: "runner", label: "Running", emoji: "🏃", source: require("../assets/stickers/runner.png") },
  { id: "yoga", label: "Yoga", emoji: "🧘", source: require("../assets/stickers/yoga.png") },
  { id: "weights", label: "Lift", emoji: "🏋️", source: require("../assets/stickers/weights.png") },
  { id: "trophy", label: "Champion", emoji: "🏆", source: require("../assets/stickers/trophy.png") },
  { id: "medal", label: "Winner", emoji: "🥇", source: require("../assets/stickers/medal.png") },
  { id: "heart", label: "Love", emoji: "❤️", source: require("../assets/stickers/heart.png") },
  { id: "star", label: "Star", emoji: "⭐", source: require("../assets/stickers/star.png") },
  { id: "water", label: "Hydrate", emoji: "💧", source: require("../assets/stickers/water.png") },
  { id: "salad", label: "Healthy", emoji: "🥗", source: require("../assets/stickers/salad.png") },
];

export function getChatSticker(id: string): ChatSticker | undefined {
  return (
    CHAT_STICKERS.find((sticker) => sticker.id === id) ??
    LEGACY_CHAT_STICKERS.find((sticker) => sticker.id === id)
  );
}
