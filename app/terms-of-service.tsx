import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SECTIONS: { title: string; body: string; bullets?: string[] }[] = [
  {
    title: "1. Acceptance of Terms",
    body:
      "By accessing or using Personalised Workout and Nutrition Guidance System, you agree to be bound by these Terms of Service. ",
  },
  {
    title: "2. Privacy Policy",
    body:
      "We collect and process personal information as described in our privacy practices to provide fitness tracking, reminders, and related features. You are responsible for the accuracy of information you provide.",
  },
  {
    title: "3. Health and Medical Disclaimer",
    body:
      "Personalised Workout and Nutrition Guidance System is for general wellness and informational purposes only. It is not medical advice, diagnosis, or treatment. Always consult a qualified professional before changing diet, exercise, or health plans.",
  },
  {
    title: "4. User Accounts",
    body:
      "You must provide accurate registration information and keep your credentials secure. You are responsible for activity under your account. Notify us if you suspect unauthorized access.",
  },
  {
    title: "5. Prohibited Conduct",
    body: "You agree not to:",
    bullets: [
      "Misuse the app, servers, or other users’ data",
      "Attempt to reverse engineer or circumvent security",
      "Upload unlawful, harmful, or infringing content",
    ],
  },
  {
    title: "6. Limitation of Liability",
    body:
      "To the fullest extent permitted by law, Personalised Workout and Nutrition Guidance System and its team are not liable for indirect, incidental, or consequential damages arising from your use of the app. Some jurisdictions do not allow certain limitations; in those cases, our liability is limited to the maximum permitted by law.",
  },
];

export default function TermsOfServiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-[#eef2f1]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 100,
        }}
      >
        <View className="relative mb-6 h-12 justify-center">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="absolute left-0 top-0 h-14 w-20 justify-center pl-2 z-10"
          >
            <View className="h-12 w-12 items-center justify-center rounded-full bg-white">
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </View>
          </Pressable>
          <Text className="text-center text-xl font-extrabold text-gray-900">
            Terms of Service
          </Text>
        </View>

        <View className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
        <Text className="text-sm text-gray-500 mb-6">
          Last updated: April 5, 2026
        </Text>

        {SECTIONS.map((s) => (
          <View key={s.title} className="mb-6">
            <Text className="text-base font-extrabold text-gray-900 mb-2">
              {s.title}
            </Text>
            <Text className="text-[15px] text-gray-700 leading-6">{s.body}</Text>
            {s.bullets?.map((b) => (
              <Text key={b} className="text-[15px] text-gray-700 leading-6 mt-2 ml-1">
                {"\u2022 "} {b}
              </Text>
            ))}
          </View>
        ))}
        </View>
      </ScrollView>

      <View
        className="absolute left-0 right-0 bg-white border-t border-gray-100 px-3 pt-3"
        style={{ bottom: 0, paddingBottom: insets.bottom + 12 }}
      >
        <Pressable
          onPress={() => router.back()}
          className="bg-[#76C893] py-4 rounded-full items-center active:opacity-90"
        >
          <Text className="text-white font-bold text-base">I Agree to the Terms</Text>
        </Pressable>
      </View>
    </View>
  );
}
