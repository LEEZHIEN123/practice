import { Pressable } from "@/components/Pressable";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
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

type ReReviewReasonModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
};

export function ReReviewReasonModal({ visible, onClose, onSubmit }: ReReviewReasonModalProps) {
  const insets = useSafeAreaInsets();
  const { textPrimary, textMuted, textSecondary, theme } = useThemedScreen();
  const { modalCardStyle, inputStyle, placeholderColor } = useProfileCardStyles();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setReason("");
      setSubmitting(false);
    }
  }, [visible]);

  const handleClose = () => {
    setReason("");
    setSubmitting(false);
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      Alert.alert("Request check again", "Please explain why this post should be reviewed again.");
      return;
    }
    try {
      setSubmitting(true);
      await onSubmit(trimmed);
      Alert.alert(
        "Request sent",
        "Support Admin will check this post again. You will get a message in chat."
      );
      handleClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not send request.");
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
              Request check again
            </Text>
            <Text className="text-sm mb-4" style={textMuted}>
              Tell Support Admin why this post should be reviewed again.
            </Text>

            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Explain your reason..."
              multiline
              className="rounded-2xl px-4 py-3 text-sm min-h-[120px]"
              style={inputStyle}
              placeholderTextColor={placeholderColor}
              textAlignVertical="top"
              autoFocus
            />

            <View className="flex-row gap-3 mt-4">
              <Pressable
                onPress={handleClose}
                disabled={submitting}
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
