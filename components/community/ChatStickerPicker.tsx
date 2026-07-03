import { Pressable } from "@/components/Pressable";
import { ThemedText } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { CHAT_STICKERS, CHAT_STICKER_PICKER_SIZE, type ChatSticker } from "@/lib/chatStickers";
import { Image } from "expo-image";
import { ScrollView, View } from "react-native";

type ChatStickerPickerProps = {
  onSelect: (sticker: ChatSticker) => void;
};

const VISIBLE_ROWS = 2.5;
const STICKER_ROW_HEIGHT = CHAT_STICKER_PICKER_SIZE + 16;
const STICKER_PICKER_MAX_HEIGHT = STICKER_ROW_HEIGHT * VISIBLE_ROWS;

export function ChatStickerPicker({ onSelect }: ChatStickerPickerProps) {
  const { cardStyle } = useThemedScreen();

  return (
    <View className="rounded-2xl p-3 mt-2" style={cardStyle}>
      <ThemedText variant="muted" className="text-xs font-extrabold mb-2 px-1">
        Stickers
      </ThemedText>
      <ScrollView
        style={{ maxHeight: STICKER_PICKER_MAX_HEIGHT }}
        contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap" }}
        showsVerticalScrollIndicator
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {CHAT_STICKERS.map((sticker) => (
          <Pressable
            key={sticker.id}
            onPress={() => onSelect(sticker)}
            className="w-[25%] items-center justify-center rounded-xl p-1 active:opacity-80"
            style={{ height: STICKER_ROW_HEIGHT }}
            accessibilityLabel={sticker.label}
          >
            <Image
              source={sticker.source}
              style={{ width: CHAT_STICKER_PICKER_SIZE, height: CHAT_STICKER_PICKER_SIZE }}
              contentFit="contain"
            />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
