import { Pressable } from "@/components/Pressable";
import { TermsOfServiceContent } from "@/components/terms/TermsOfServiceContent";
import { ProfileScreenHeader } from "@/components/themed/ThemedUi";
import {
    defaultTermsDocument,
    subscribeTermsOfService,
    type TermsOfServiceDocument,
} from "@/lib/termsOfService";
import { clearTermsPreview, getTermsPreview } from "@/lib/termsPreview";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TermsOfServiceScreen() {
  const router = useRouter();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreview = preview === "1";
  const previewSections = isPreview ? getTermsPreview() : null;

  const insets = useSafeAreaInsets();
  const { screenStyle, textPrimary, theme } = useThemedScreen();
  const [terms, setTerms] = useState<TermsOfServiceDocument>(defaultTermsDocument());
  const [loading, setLoading] = useState(!isPreview || !previewSections);

  useEffect(() => {
    if (isPreview) return;
    const unsub = subscribeTermsOfService(
      (doc) => {
        setTerms(doc);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [isPreview]);

  const handleBack = () => {
    if (isPreview) clearTermsPreview();
    router.back();
  };

  return (
    <View className="flex-1" style={screenStyle}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + (isPreview ? 24 : 100),
        }}
      >
        <ProfileScreenHeader
          title={isPreview ? "Preview Terms" : "Terms of Service"}
          onBack={handleBack}
          titleClassName="text-xl"
        />

        {loading ? (
          <ActivityIndicator color={theme.accent} className="my-8" />
        ) : (
          <TermsOfServiceContent
            sections={isPreview && previewSections ? previewSections : terms.sections}
            updatedAtMs={isPreview ? undefined : terms.updatedAtMs}
            isPreview={isPreview}
          />
        )}
      </ScrollView>

      {!isPreview ? (
        <View
          className="absolute left-0 right-0 px-3 pt-3 border-t"
          style={{
            bottom: 0,
            paddingBottom: insets.bottom + 12,
            backgroundColor: theme.navBg,
            borderTopColor: theme.navBorder,
          }}
        >
          <Pressable
            onPress={handleBack}
            className="bg-[#76C893] py-4 rounded-full items-center active:opacity-90"
          >
            <Text className="text-white font-bold text-base">I Agree to the Terms</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
