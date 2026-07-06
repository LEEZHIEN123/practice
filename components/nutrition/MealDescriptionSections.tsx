import { Pressable } from "@/components/Pressable";
import { ThemedText } from "@/components/themed/ThemedUi";
import type { AppearanceTheme } from "@/lib/appearance";
import { Ionicons } from "@expo/vector-icons";
import { TextInput, View } from "react-native";

type MealDescriptionSectionsProps = {
  sections: string[];
  onChange: (sections: string[]) => void;
  onFocus?: () => void;
  inputStyle: object;
  placeholderColor: string;
  theme: AppearanceTheme;
};

export function MealDescriptionSections({
  sections,
  onChange,
  onFocus,
  inputStyle,
  placeholderColor,
  theme,
}: MealDescriptionSectionsProps) {
  const rows = sections.length > 0 ? sections : [""];

  const updateSection = (index: number, text: string) => {
    const next = [...rows];
    next[index] = text;
    onChange(next);
  };

  const removeSection = (index: number) => {
    if (rows.length <= 1) {
      onChange([""]);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  };

  const addSection = () => {
    onChange([...rows, ""]);
  };

  return (
    <View className="mb-4">
      <ThemedText variant="muted" className="text-xs mb-2">
        Description (optional)
      </ThemedText>
      {rows.map((section, index) => (
        <View key={index} className="mb-2">
          <View className="flex-row items-center justify-between mb-1">
            <ThemedText variant="muted" className="text-[10px] font-bold">
              Section {index + 1}
            </ThemedText>
            {rows.length > 1 ? (
              <Pressable onPress={() => removeSection(index)} hitSlop={8} className="p-1">
                <Ionicons name="close-circle" size={18} color={theme.iconMuted} />
              </Pressable>
            ) : null}
          </View>
          <TextInput
            value={section}
            onChangeText={(text) => updateSection(index, text)}
            onFocus={onFocus}
            multiline
            textAlignVertical="top"
            className="rounded-xl px-3 py-3 text-base min-h-[72px]"
            style={inputStyle}
            placeholderTextColor={placeholderColor}
            placeholder={
              index === 0
                ? "Notes about portions, ingredients, etc."
                : "Add another note or detail..."
            }
          />
        </View>
      ))}
      <Pressable
        onPress={addSection}
        className="flex-row items-center self-start rounded-full px-3 py-2 active:opacity-80"
        style={{ backgroundColor: theme.accentSoft }}
      >
        <Ionicons name="add" size={16} color={theme.accentText} />
        <ThemedText variant="accent" className="text-xs font-extrabold ml-1">
          Add section
        </ThemedText>
      </Pressable>
    </View>
  );
}
