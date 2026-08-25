import { Pressable } from "@/components/Pressable";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible) {
      setReason("");
      setSubmitting(false);
      setKeyboardHeight(0);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const handleClose = () => {
    Keyboard.dismiss();
    setReason("");
    setSubmitting(false);
    setKeyboardHeight(0);
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

  const sheetBottomPad = Math.max(insets.bottom, 12) + (keyboardHeight > 0 ? keyboardHeight : 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: theme.modalOverlay }}>
        <Pressable className="flex-1" onPress={handleClose} />
        <View
          className="rounded-t-[28px] px-5 pt-5"
          style={[
            modalCardStyle,
            {
              borderBottomWidth: 0,
              paddingBottom: sheetBottomPad,
            },
          ]}
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
      </View>
    </Modal>
  );
}
