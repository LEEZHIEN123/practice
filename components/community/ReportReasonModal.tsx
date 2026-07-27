import { Pressable } from "@/components/Pressable";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import { REPORT_REASONS } from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
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
  const { textPrimary, textMuted, textSecondary, theme } = useThemedScreen();
  const { modalCardStyle, inputStyle, placeholderColor } = useProfileCardStyles();
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
      <View className="flex-1 justify-end" style={{ backgroundColor: theme.modalOverlay }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View
            className="rounded-t-[28px] px-5 pt-5"
            style={[modalCardStyle, { paddingBottom: insets.bottom + 20, borderBottomWidth: 0 }]}
          >
            <Text className="text-xl font-extrabold mb-1" style={textPrimary}>
              {title}
            </Text>
            <Text className="text-sm mb-4" style={textMuted}>
              Choose a reason or type your own.
            </Text>

            {REPORT_REASONS.map((reason) => (
              <Pressable
                key={reason}
                onPress={() => setSelectedReason(reason)}
                className="flex-row items-center rounded-2xl px-4 py-3 mb-2 border"
                style={
                  selectedReason === reason
                    ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
                    : { backgroundColor: theme.rowBg, borderColor: theme.cardBorder }
                }
              >
                <Ionicons
                  name={selectedReason === reason ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={selectedReason === reason ? theme.accentText : theme.iconMuted}
                />
                <Text className="ml-3 text-sm font-bold" style={textPrimary}>
                  {reason}
                </Text>
              </Pressable>
            ))}

            {selectedReason === "Other" ? (
              <TextInput
                value={customReason}
                onChangeText={setCustomReason}
                placeholder="Describe the issue..."
                multiline
                className="rounded-2xl px-4 py-3 text-sm min-h-[90px]"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
              />
            ) : null}

            <View className="flex-row gap-3 mt-4">
              <Pressable
                onPress={handleClose}
                className="flex-1 rounded-full py-3.5 items-center border"
                style={{ backgroundColor: theme.rowBg, borderColor: theme.cardBorder }}
              >
                <Text className="text-sm font-extrabold" style={textSecondary}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSubmit()}
                disabled={submitting}
                className="flex-1 rounded-full py-3.5 items-center"
                style={{ backgroundColor: theme.accent }}
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
