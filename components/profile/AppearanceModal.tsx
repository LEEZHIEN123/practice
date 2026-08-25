import { useAppearance } from "@/context/AppearanceContext";
import type { AppearanceMode } from "@/lib/appearance";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, Text, View } from "react-native";

type AppearanceModalProps = {
  visible: boolean;
  onClose: () => void;
};

const OPTIONS: { mode: AppearanceMode; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  {
    mode: "light",
    title: "Light mode",
    subtitle: "Bright backgrounds and dark text",
    icon: "sunny-outline",
  },
  {
    mode: "dark",
    title: "Dark mode",
    subtitle: "Dark backgrounds and light text",
    icon: "moon-outline",
  },
];

export function AppearanceModal({ visible, onClose }: AppearanceModalProps) {
  const { mode, theme, setAppearance } = useAppearance();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 justify-center px-6"
        style={{ backgroundColor: theme.modalOverlay }}
        onPress={onClose}
      >
        <Pressable
          className="rounded-3xl p-6"
          style={{ backgroundColor: theme.modalBg, borderColor: theme.cardBorder, borderWidth: 1 }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-xl font-extrabold" style={{ color: theme.textPrimary }}>
            Appearance
          </Text>
          <Text className="text-sm mt-2 leading-5" style={{ color: theme.textMuted }}>
            Choose how the app looks on your device.
          </Text>

          <View className="mt-5 gap-3">
            {OPTIONS.map((option) => {
              const active = mode === option.mode;
              return (
                <Pressable
                  key={option.mode}
                  onPress={() => {
                    if (option.mode !== mode) void setAppearance(option.mode);
                  }}
                  className="rounded-2xl border p-4"
                  style={{
                    borderColor: active ? theme.accent : theme.cardBorder,
                    backgroundColor: active ? theme.accentSoft : theme.rowBg,
                  }}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1 pr-3">
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: active ? theme.cardBg : theme.accentSoft }}
                      >
                        <Ionicons
                          name={option.icon}
                          size={20}
                          color={active ? theme.accent : theme.iconMuted}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-base font-extrabold" style={{ color: theme.textPrimary }}>
                          {option.title}
                        </Text>
                        <Text className="text-sm mt-1" style={{ color: theme.textMuted }}>
                          {option.subtitle}
                        </Text>
                      </View>
                    </View>
                    <View
                      className="w-6 h-6 rounded-full border-2 items-center justify-center"
                      style={{ borderColor: active ? theme.accent : theme.iconMuted }}
                    >
                      {active ? (
                        <View className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.accent }} />
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row justify-end mt-6">
            <Pressable onPress={onClose} className="px-4 py-3">
              <Text className="font-extrabold" style={{ color: theme.textMuted }}>
                Close
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
