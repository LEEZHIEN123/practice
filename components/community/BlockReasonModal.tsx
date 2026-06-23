import { Pressable } from "@/components/Pressable";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type BlockReasonModalProps = {
  visible: boolean;
  title: string;
  description: string;
  presetReasons?: readonly string[];
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

export function BlockReasonModal({
  visible,
  title,
  description,
  presetReasons,
  onClose,
  onConfirm,
}: BlockReasonModalProps) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState("");
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const usePresets = Boolean(presetReasons && presetReasons.length > 0);
  const otherLabel = "Other";

  useEffect(() => {
    if (!visible) {
      setReason("");
      setCustomReason("");
      setSubmitting(false);
      if (presetReasons?.length) {
        setSelectedReason(presetReasons[0]);
      } else {
        setSelectedReason("");
      }
    }
  }, [visible, presetReasons]);

  const handleClose = () => {
    setReason("");
    setCustomReason("");
    setSubmitting(false);
    if (presetReasons?.length) {
      setSelectedReason(presetReasons[0]);
    } else {
      setSelectedReason("");
    }
    onClose();
  };

  const resolveReason = (): string => {
    if (usePresets) {
      return selectedReason === otherLabel ? customReason.trim() : selectedReason;
    }
    return reason.trim();
  };

  const handleConfirm = async () => {
    const trimmed = resolveReason();
    if (!trimmed) {
      Alert.alert("Reason required", "Please provide a reason for blocking this content.");
      return;
    }
    try {
      setSubmitting(true);
      await onConfirm(trimmed);
      handleClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not block content.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View className="flex-1 bg-black/40 justify-end">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View
            className="bg-white rounded-t-[28px] px-5 pt-5 border border-gray-200"
            style={{ paddingBottom: insets.bottom + 20 }}
          >
            <Text className="text-xl font-extrabold text-gray-900 mb-1">{title}</Text>
            <Text className="text-sm text-gray-500 mb-4">{description}</Text>

            {usePresets ? (
              <>
                {presetReasons!.map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setSelectedReason(option)}
                    className={`flex-row items-center rounded-2xl px-4 py-3 mb-2 border ${
                      selectedReason === option
                        ? "bg-[#fef2f2] border-[#ef4444]"
                        : "bg-[#f9fafb] border-gray-200"
                    }`}
                  >
                    <Ionicons
                      name={selectedReason === option ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={selectedReason === option ? "#ef4444" : "#9ca3af"}
                    />
                    <Text className="ml-3 text-sm font-bold text-gray-800">{option}</Text>
                  </Pressable>
                ))}

                {selectedReason === otherLabel ? (
                  <TextInput
                    value={customReason}
                    onChangeText={setCustomReason}
                    placeholder="Describe the reason..."
                    multiline
                    textAlignVertical="top"
                    className="bg-[#f9fafb] rounded-2xl px-4 py-3 border border-gray-200 text-sm text-gray-800 min-h-[90px]"
                    placeholderTextColor="#9ca3af"
                  />
                ) : null}
              </>
            ) : (
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Enter the reason..."
                multiline
                textAlignVertical="top"
                className="bg-[#f9fafb] rounded-2xl px-4 py-3 border border-gray-200 text-sm text-gray-800 min-h-[100px]"
                placeholderTextColor="#9ca3af"
              />
            )}

            <View className="flex-row gap-3 mt-4">
              <Pressable
                onPress={handleClose}
                className="flex-1 rounded-full py-3.5 items-center bg-[#f3f4f3] border border-gray-200"
              >
                <Text className="text-sm font-extrabold text-gray-600">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleConfirm()}
                disabled={submitting}
                className="flex-1 rounded-full py-3.5 items-center bg-[#ef4444]"
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-sm font-extrabold text-white">Block</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
