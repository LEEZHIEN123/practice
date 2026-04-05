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

const SUPPORT_EMAIL = "support@glowapp.com";

export default function ContactUsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const sendMessage = () => {
    const sub = subject.trim();
    const msg = message.trim();
    if (!sub || !msg) {
      Alert.alert("Missing info", "Please enter a subject and a message.");
      return;
    }
    const body = encodeURIComponent(msg);
    const subj = encodeURIComponent(sub);
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subj}&body=${body}`;
    Linking.openURL(url).catch(() => {
      Alert.alert(
        "Email",
        `Copy this address to reach us: ${SUPPORT_EMAIL}`,
        [{ text: "OK" }]
      );
    });
  };

  const openHelp = () => {
    Alert.alert(
      "Help Center",
      "The help center is coming soon. For now, email us at support@glowapp.com."
    );
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
            onPress={() => router.back()}
            hitSlop={12}
            className="absolute left-0 top-0 h-12 w-14 justify-center"
          >
            <Ionicons name="chevron-back" size={28} color="#1f2937" />
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

        <Text className="text-xs font-bold text-gray-400 tracking-[0.15em] mb-3 ml-1">
          OTHER WAYS TO REACH US
        </Text>

        <Pressable
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          className="bg-white rounded-2xl p-4 border border-gray-100 flex-row items-center mb-3 active:bg-gray-50"
        >
          <View className="w-11 h-11 rounded-full bg-[#eaf7f0] items-center justify-center">
            <Ionicons name="mail-outline" size={22} color="#76C893" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-sm text-gray-500">Email Support</Text>
            <Text className="text-base font-bold text-gray-900">{SUPPORT_EMAIL}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </Pressable>

        <Pressable
          onPress={openHelp}
          className="bg-white rounded-2xl p-4 border border-gray-100 flex-row items-center mb-6 active:bg-gray-50"
        >
          <View className="w-11 h-11 rounded-full bg-[#eaf7f0] items-center justify-center">
            <Ionicons name="help-circle-outline" size={24} color="#76C893" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-sm text-gray-500">Knowledge Base</Text>
            <Text className="text-base font-bold text-gray-900">Visit Help Center</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </Pressable>

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
