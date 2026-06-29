import { Pressable } from "@/components/Pressable";
import { ThemedText } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { CHAT_STICKERS, type ChatSticker } from "@/lib/chatStickers";
import { Image } from "expo-image";
import { View } from "react-native";

type ChatStickerPickerProps = {
  onSelect: (sticker: ChatSticker) => void;
};

export function ChatStickerPicker({ onSelect }: ChatStickerPickerProps) {
  const { cardStyle, theme } = useThemedScreen();

  return (
    <View className="rounded-2xl p-3 mb-2" style={cardStyle}>
      <ThemedText variant="muted" className="text-xs font-extrabold mb-2 px-1">
        Stickers
      </ThemedText>
      <View className="flex-row flex-wrap">
        {CHAT_STICKERS.map((sticker) => (
          <Pressable
            key={sticker.id}
            onPress={() => onSelect(sticker)}
            className="w-[25%] aspect-square items-center justify-center rounded-xl p-1"
            style={({ pressed }) => (pressed ? { backgroundColor: theme.accentSoft } : undefined)}
            accessibilityLabel={sticker.label}
          >
            <Image
              source={sticker.source}
              style={{ width: 56, height: 56 }}
              contentFit="contain"
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
