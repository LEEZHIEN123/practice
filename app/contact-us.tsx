import { Pressable } from "@/components/Pressable";
import { ProfileScreenHeader, ThemedCard, ThemedText } from "@/components/themed/ThemedUi";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SUPPORT_EMAIL = "leezhien@1utar.my";

export default function ContactUsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { screenStyle, textPrimary, textSecondary, theme } = useThemedScreen();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const inputStyle = {
    backgroundColor: theme.rowBg,
    borderColor: theme.cardBorder,
    borderWidth: 1,
    color: theme.textPrimary,
  };

  const sendMessage = async () => {
    const sub = subject.trim();
    const msg = message.trim();
    if (!sub || !msg) {
      Alert.alert("Missing info", "Please enter a subject and a message.");
      return;
    }
    const body = encodeURIComponent(msg);
    const subj = encodeURIComponent(sub);
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subj}&body=${body}`;

    try {
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert(
          "Email not available",
          `Please email us at: ${SUPPORT_EMAIL}`,
          [{ text: "OK" }]
        );
        return;
      }

      await Linking.openURL(url);
      Alert.alert(
        "Opening email",
        `We'll reply as soon as possible via email (${SUPPORT_EMAIL}).`
      );
      setSubject("");
      setMessage("");
    } catch {
      Alert.alert(
        "Email",
        `Please email us at: ${SUPPORT_EMAIL}`,
        [{ text: "OK" }]
      );
    }
  };

  return (
    <View className="flex-1" style={screenStyle}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <ProfileScreenHeader
          title="Contact Us"
          onBack={() => {
            try {
              router.back();
            } catch {
              router.replace("/profile");
            }
          }}
          titleClassName="text-xl"
        />

        <View className="items-center mb-6">
          <View className="w-20 h-20 rounded-full bg-[#dff5e8] items-center justify-center border-2 border-[#b7ead1]">
            <MaterialCommunityIcons name="face-agent" size={40} color="#76C893" />
          </View>
          <ThemedText className="text-2xl font-extrabold mt-4">How can we help?</ThemedText>
          <ThemedText variant="muted" className="text-base mt-2 text-center px-2">
            Our team usually responds within 24 hours.
          </ThemedText>
        </View>

        <ThemedCard className="p-5 mb-6">
          <ThemedText variant="accent" className="text-xs font-bold tracking-[0.15em] mb-4">
            SEND US A MESSAGE
          </ThemedText>
          <Text className="text-sm font-semibold mb-2" style={textSecondary}>
            Subject
          </Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="e.g. Subscription issue"
            placeholderTextColor={theme.textMuted}
            className="rounded-2xl px-4 py-3 text-base mb-4"
            style={inputStyle}
          />
          <Text className="text-sm font-semibold mb-2" style={textSecondary}>
            Message
          </Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your issue or feedback here..."
            placeholderTextColor={theme.textMuted}
            multiline
            textAlignVertical="top"
            className="rounded-2xl px-4 py-3 text-base min-h-[120px]"
            style={inputStyle}
          />
        </ThemedCard>

        <Pressable
          onPress={sendMessage}
          className="bg-[#76C893] py-4 rounded-full flex-row items-center justify-center active:opacity-90"
        >
          <Text className="text-white font-bold text-base mr-2">Send Message</Text>
          <Ionicons name="send" size={18} color="white" />
        </Pressable>
      </ScrollView>
    </View>
  );
}
