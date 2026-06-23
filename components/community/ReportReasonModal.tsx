import { Pressable } from "@/components/Pressable";
import { REPORT_REASONS } from "@/lib/communityTypes";
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

type ReportReasonModalProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
};

export function ReportReasonModal({ visible, title, onClose, onSubmit }: ReportReasonModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedReason, setSelectedReason] = useState<string>(REPORT_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSelectedReason(REPORT_REASONS[0]);
      setCustomReason("");
      setSubmitting(false);
    }
  }, [visible]);

  const handleClose = () => {
    setSelectedReason(REPORT_REASONS[0]);
    setCustomReason("");
    setSubmitting(false);
    onClose();
  };

  const handleSubmit = async () => {
    const reason = selectedReason === "Other" ? customReason.trim() : selectedReason;
    if (!reason) {
      Alert.alert("Report", "Please provide a reason.");
      return;
    }
    try {
      setSubmitting(true);
      await onSubmit(reason);
      Alert.alert("Report submitted", "Thank you. Our team will review this.");
      handleClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not submit report.");
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
            <Text className="text-sm text-gray-500 mb-4">Choose a reason or type your own.</Text>

            {REPORT_REASONS.map((reason) => (
              <Pressable
                key={reason}
                onPress={() => setSelectedReason(reason)}
                className={`flex-row items-center rounded-2xl px-4 py-3 mb-2 border ${
                  selectedReason === reason
                    ? "bg-[#eaf7f0] border-[#52B69A]"
                    : "bg-[#f9fafb] border-gray-200"
                }`}
              >
                <Ionicons
                  name={selectedReason === reason ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={selectedReason === reason ? "#52B69A" : "#9ca3af"}
                />
                <Text className="ml-3 text-sm font-bold text-gray-800">{reason}</Text>
              </Pressable>
            ))}

            {selectedReason === "Other" ? (
              <TextInput
                value={customReason}
                onChangeText={setCustomReason}
                placeholder="Describe the issue..."
                multiline
                className="bg-[#f9fafb] rounded-2xl px-4 py-3 border border-gray-200 text-sm text-gray-800 min-h-[90px]"
                placeholderTextColor="#9ca3af"
              />
            ) : null}

            <View className="flex-row gap-3 mt-4">
              <Pressable
                onPress={handleClose}
                className="flex-1 rounded-full py-3.5 items-center bg-[#f3f4f3] border border-gray-200"
              >
                <Text className="text-sm font-extrabold text-gray-600">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSubmit()}
                disabled={submitting}
                className="flex-1 rounded-full py-3.5 items-center bg-[#52B69A]"
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-sm font-extrabold text-white">Submit</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
