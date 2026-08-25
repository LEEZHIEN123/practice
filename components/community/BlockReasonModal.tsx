import { Pressable } from "@/components/Pressable";
import { useProfileCardStyles } from "@/components/themed/ThemedUi";
import { ADMIN_BLOCK_POST_REASONS } from "@/lib/communityTypes";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
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

const OTHER_LABEL = "Other";

export function BlockReasonModal({
  visible,
  title,
  description,
  presetReasons = ADMIN_BLOCK_POST_REASONS,
  onClose,
  onConfirm,
}: BlockReasonModalProps) {
  const insets = useSafeAreaInsets();
  const { textPrimary, textMuted, textSecondary, theme } = useThemedScreen();
  const { modalCardStyle, inputStyle, placeholderColor } = useProfileCardStyles();
  const reasons = presetReasons.length > 0 ? presetReasons : ADMIN_BLOCK_POST_REASONS;
  const [selectedReason, setSelectedReason] = useState(reasons[0]);
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const otherInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      setCustomReason("");
      setSubmitting(false);
      setSelectedReason(reasons[0]);
      setKeyboardHeight(0);
      return;
    }
    setCustomReason("");
    setSubmitting(false);
    setSelectedReason(reasons[0]);
  }, [visible, reasons]);

  useEffect(() => {
    if (!visible) return;

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      // Keep the Other textbox visible just above the keyboard.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 220);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || selectedReason !== OTHER_LABEL) return;
    const t = setTimeout(() => {
      otherInputRef.current?.focus();
      scrollRef.current?.scrollToEnd({ animated: true });
    }, Platform.OS === "ios" ? 50 : 120);
    return () => clearTimeout(t);
  }, [visible, selectedReason]);

  const handleClose = () => {
    Keyboard.dismiss();
    setCustomReason("");
    setSubmitting(false);
    setSelectedReason(reasons[0]);
    setKeyboardHeight(0);
    onClose();
  };

  const resolveReason = (): string => {
    return selectedReason === OTHER_LABEL ? customReason.trim() : selectedReason;
  };

  const handleConfirm = async () => {
    const trimmed = resolveReason();
    if (!trimmed) {
      Alert.alert(
        "Reason required",
        selectedReason === OTHER_LABEL
          ? "Please type a reason in the text box."
          : "Please provide a reason for blocking this content."
      );
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
              maxHeight: keyboardHeight > 0 ? "78%" : "88%",
              paddingBottom: sheetBottomPad,
            },
          ]}
        >
          <Text className="text-xl font-extrabold mb-1" style={textPrimary}>
            {title}
          </Text>
          <Text className="text-sm mb-4" style={textMuted}>
            {description}
          </Text>

          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {reasons.map((option) => (
              <Pressable
                key={option}
                onPress={() => setSelectedReason(option)}
                className="flex-row items-center rounded-2xl px-4 py-3 mb-2 border"
                style={
                  selectedReason === option
                    ? { backgroundColor: theme.dangerSoft, borderColor: theme.danger }
                    : { backgroundColor: theme.rowBg, borderColor: theme.cardBorder }
                }
              >
                <Ionicons
                  name={selectedReason === option ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={selectedReason === option ? theme.danger : theme.iconMuted}
                />
                <Text className="ml-3 text-sm font-bold" style={textPrimary}>
                  {option}
                </Text>
              </Pressable>
            ))}

            {selectedReason === OTHER_LABEL ? (
              <TextInput
                ref={otherInputRef}
                value={customReason}
                onChangeText={setCustomReason}
                onFocus={() => {
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
                }}
                placeholder="Describe the reason..."
                multiline
                textAlignVertical="top"
                className="rounded-2xl px-4 py-3 text-sm min-h-[100px] mt-1"
                style={inputStyle}
                placeholderTextColor={placeholderColor}
              />
            ) : null}
          </ScrollView>

          <View className="flex-row gap-3 mt-3">
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
              onPress={() => void handleConfirm()}
              disabled={submitting}
              className="flex-1 rounded-full py-3.5 items-center"
              style={{ backgroundColor: theme.danger }}
            >
              {submitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-sm font-extrabold text-white">Block</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
