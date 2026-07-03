import { Pressable } from "@/components/Pressable";
import { ProfileScreenHeader, ThemedCard, ThemedText, useProfileCardStyles } from "@/components/themed/ThemedUi";
import { checkIsAdmin } from "@/lib/communityService";
import {
  DEFAULT_TERMS_SECTIONS,
  fetchTermsOfService,
  formatTermsUpdatedAt,
  publishTermsOfService,
  type TermsSection,
} from "@/lib/termsOfService";
import { setTermsPreview } from "@/lib/termsPreview";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function bulletsToText(bullets?: string[]) {
  return bullets?.join("\n") ?? "";
}

function textToBullets(text: string): string[] | undefined {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : undefined;
}

export default function AdminEditTermsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { screenStyle, textPrimary, textMuted, theme } = useThemedScreen();
  const { inputStyle, placeholderColor } = useProfileCardStyles();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [sections, setSections] = useState<TermsSection[]>([]);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    void (async () => {
      const isAdmin = await checkIsAdmin();
      if (!isAdmin) {
        router.replace("/home");
        return;
      }
      setAuthorized(true);
      try {
        const doc = await fetchTermsOfService();
        setSections(doc.sections);
        setLastUpdatedMs(doc.updatedAtMs);
      } catch {
        setSections(DEFAULT_TERMS_SECTIONS.map((s) => ({ ...s, bullets: s.bullets ? [...s.bullets] : undefined })));
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const updateSection = (index: number, patch: Partial<TermsSection>) => {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      { title: `${prev.length + 1}. New Section`, body: "", bullets: undefined },
    ]);
  };

  const removeSection = (index: number) => {
    if (sections.length <= 1) {
      Alert.alert("Terms", "Keep at least one section.");
      return;
    }
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePreview = () => {
    setTermsPreview(sections);
    router.push("/terms-of-service?preview=1");
  };

  const handlePost = () => {
    Alert.alert(
      "Publish Terms of Service",
      "This will replace the live terms that all users see. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Post",
          onPress: () => {
            void (async () => {
              try {
                setPosting(true);
                await publishTermsOfService(sections);
                Alert.alert("Posted", "The latest Terms of Service are now live for all users.");
                router.back();
              } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Could not publish terms.");
              } finally {
                setPosting(false);
              }
            })();
          },
        },
      ]
    );
  };

  if (!authorized || loading) {
    return (
      <View className="flex-1 items-center justify-center" style={screenStyle}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View className="flex-1" style={screenStyle}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12 }}>
        <ProfileScreenHeader
          title="Edit Terms of Service"
          onBack={() => router.back()}
          titleClassName="text-xl"
          rightSlot={
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={handlePreview}
                className="rounded-full px-3 py-2 flex-row items-center justify-center gap-1 border-2"
                style={{
                  borderColor: theme.accent,
                  backgroundColor: theme.accentSoft,
                }}
              >
                <Ionicons name="eye-outline" size={16} color={theme.accent} />
                <Text className="text-sm font-extrabold" style={{ color: theme.accent }}>
                  Preview
                </Text>
              </Pressable>
              <Pressable
                onPress={handlePost}
                disabled={posting}
                className="rounded-full px-3 py-2 items-center justify-center bg-[#52B69A]"
              >
                {posting ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="text-sm font-extrabold text-white">Post</Text>
                )}
              </Pressable>
            </View>
          }
        />
        {lastUpdatedMs ? (
          <ThemedText variant="muted" className="text-xs text-center -mt-1 mb-2">
            Last posted: {formatTermsUpdatedAt(lastUpdatedMs)}
          </ThemedText>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {sections.map((section, index) => (
          <ThemedCard key={`section-${index}`} className="p-4 mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <ThemedText className="text-sm font-extrabold">Section {index + 1}</ThemedText>
              <Pressable onPress={() => removeSection(index)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={theme.danger} />
              </Pressable>
            </View>

            <ThemedText variant="muted" className="text-xs mb-1">
              Title
            </ThemedText>
            <TextInput
              value={section.title}
              onChangeText={(title) => updateSection(index, { title })}
              className="rounded-xl px-3 py-3 mb-3 text-base"
              style={inputStyle}
              placeholderTextColor={placeholderColor}
            />

            <ThemedText variant="muted" className="text-xs mb-1">
              Body
            </ThemedText>
            <TextInput
              value={section.body}
              onChangeText={(body) => updateSection(index, { body })}
              multiline
              textAlignVertical="top"
              className="rounded-xl px-3 py-3 mb-3 text-base min-h-[100px]"
              style={inputStyle}
              placeholderTextColor={placeholderColor}
            />

            <ThemedText variant="muted" className="text-xs mb-1">
              Bullet points (one per line, optional)
            </ThemedText>
            <TextInput
              value={bulletsToText(section.bullets)}
              onChangeText={(text) => updateSection(index, { bullets: textToBullets(text) })}
              multiline
              textAlignVertical="top"
              className="rounded-xl px-3 py-3 text-base min-h-[80px]"
              style={inputStyle}
              placeholderTextColor={placeholderColor}
              placeholder={"Line 1\nLine 2"}
            />
          </ThemedCard>
        ))}

        <Pressable
          onPress={addSection}
          className="rounded-3xl py-3.5 items-center border mb-4"
          style={{ borderColor: theme.cardBorder, backgroundColor: theme.rowBg }}
        >
          <Text className="font-bold" style={textPrimary}>
            + Add section
          </Text>
        </Pressable>

        <ThemedText variant="muted" className="text-sm text-center leading-5">
          Tap Post when you are ready. Users will see the updated terms immediately.
        </ThemedText>
      </ScrollView>
    </View>
  );
}
