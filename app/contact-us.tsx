import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Linking from "expo-linking";

const SUPPORT_EMAIL = "leezhien@1utar.my";

export default function ContactUsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

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
        `We’ll reply as soon as possible via email (${SUPPORT_EMAIL}).`
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
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 20,
          paddingTop: insets.top + 12,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="relative mb-6 h-12 justify-center">
          <Pressable
            onPress={() => {
              try {
                router.back();
              } catch {
                router.replace("/profile");
              }
            }}
            hitSlop={12}
            className="absolute left-0 top-0 h-14 w-20 justify-center pl-2"
          >
            <View className="h-12 w-12 items-center justify-center rounded-full bg-white">
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </View>
          </Pressable>
          <Text className="text-center text-xl font-extrabold text-gray-900">
            Contact Us
          </Text>
        </View>

        <View className="items-center mb-6">
          <View className="w-20 h-20 rounded-full bg-[#dff5e8] items-center justify-center border-2 border-[#b7ead1]">
            <MaterialCommunityIcons name="face-agent" size={40} color="#76C893" />
          </View>
          <Text className="text-2xl font-extrabold text-gray-900 mt-4">
            How can we help?
          </Text>
          <Text className="text-base text-gray-500 mt-2 text-center px-2">
            Our team usually responds within 24 hours.
          </Text>
        </View>

        <View className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm mb-6">
          <Text className="text-xs font-bold text-[#52B69A] tracking-[0.15em] mb-4">
            SEND US A MESSAGE
          </Text>
          <Text className="text-sm font-semibold text-gray-700 mb-2">Subject</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="e.g. Subscription issue"
            placeholderTextColor="#9ca3af"
            className="border border-gray-200 rounded-2xl px-4 py-3 text-base text-gray-900 mb-4 bg-[#fafafa]"
          />
          <Text className="text-sm font-semibold text-gray-700 mb-2">Message</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your issue or feedback here..."
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
            className="border border-gray-200 rounded-2xl px-4 py-3 text-base text-gray-900 min-h-[120px] bg-[#fafafa]"
          />
        </View>

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
