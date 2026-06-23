import { Pressable } from "@/components/Pressable";
import { CHAT_STICKERS, type ChatSticker } from "@/lib/chatStickers";
import { Image } from "expo-image";
import { Text, View } from "react-native";

type ChatStickerPickerProps = {
  onSelect: (sticker: ChatSticker) => void;
};

export function ChatStickerPicker({ onSelect }: ChatStickerPickerProps) {
  return (
    <View className="bg-white border border-gray-200 rounded-2xl p-3 mb-2">
      <Text className="text-xs font-extrabold text-gray-500 mb-2 px-1">Stickers</Text>
      <View className="flex-row flex-wrap">
        {CHAT_STICKERS.map((sticker) => (
          <Pressable
            key={sticker.id}
            onPress={() => onSelect(sticker)}
            className="w-[25%] aspect-square items-center justify-center rounded-xl active:bg-[#e8f8ef] p-1"
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
