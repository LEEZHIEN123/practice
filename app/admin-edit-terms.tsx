import { Pressable } from "@/components/Pressable";
import {
  ThemedBackButton,
  ThemedCard,
  ThemedText,
  useProfileCardStyles,
} from "@/components/themed/ThemedUi";
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
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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

function cloneSections(sections: TermsSection[]): TermsSection[] {
  return sections.map((s) => ({
    title: s.title,
    body: s.body,
    bullets: s.bullets ? [...s.bullets] : undefined,
  }));
}

function normalizeSectionsForCompare(sections: TermsSection[]) {
  return sections.map((s) => ({
    title: s.title.trim(),
    body: s.body.trim(),
    bullets: (s.bullets ?? []).map((b) => b.trim()).filter(Boolean),
  }));
}

function sectionsEqual(a: TermsSection[], b: TermsSection[]) {
  return JSON.stringify(normalizeSectionsForCompare(a)) === JSON.stringify(normalizeSectionsForCompare(b));
}

export default function AdminEditTermsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { screenStyle, textPrimary, textMuted, theme } = useThemedScreen();
  const { inputStyle, placeholderColor } = useProfileCardStyles();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [sections, setSections] = useState<TermsSection[]>([]);
  const [initialSections, setInitialSections] = useState<TermsSection[]>([]);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Record<number, { title?: string; body?: string }>
  >({});
  const allowLeaveRef = useRef(false);

  const isDirty = useMemo(
    () => !sectionsEqual(sections, initialSections),
    [sections, initialSections]
  );

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
        const next = cloneSections(doc.sections);
        setSections(next);
        setInitialSections(cloneSections(next));
        setLastUpdatedMs(doc.updatedAtMs);
      } catch {
        const next = DEFAULT_TERMS_SECTIONS.map((s) => ({
          ...s,
          bullets: s.bullets ? [...s.bullets] : undefined,
        }));
        setSections(next);
        setInitialSections(cloneSections(next));
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const requestLeave = (onLeave: () => void) => {
    if (!isDirty) {
      onLeave();
      return;
    }
    Alert.alert(
      "Discard changes?",
      "You have unsaved edits. Leave without posting?",
      [
        { text: "Stay", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: onLeave,
        },
      ]
    );
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (allowLeaveRef.current || !isDirty) return;
      e.preventDefault();
      Alert.alert(
        "Discard changes?",
        "You have unsaved edits. Leave without posting?",
        [
          { text: "Stay", style: "cancel" },
          {
            text: "Leave",
            style: "destructive",
            onPress: () => {
              allowLeaveRef.current = true;
              navigation.dispatch(e.data.action);
            },
          },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, isDirty]);

  const handleBack = () => {
    requestLeave(() => {
      allowLeaveRef.current = true;
      router.back();
    });
  };

  const updateSection = (index: number, patch: Partial<TermsSection>) => {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setFieldErrors((prev) => {
      const current = prev[index];
      if (!current) return prev;
      const next = { ...current };
      if ("title" in patch) delete next.title;
      if ("body" in patch) delete next.body;
      if (!next.title && !next.body) {
        const { [index]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [index]: next };
    });
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

    const section = sections[index];
    const hasContent =
      Boolean(section?.title?.trim()) ||
      Boolean(section?.body?.trim()) ||
      Boolean(section?.bullets?.some((line) => line.trim()));

    const doRemove = () => {
      setSections((prev) => prev.filter((_, i) => i !== index));
      setFieldErrors((prev) => {
        const next: Record<number, { title?: string; body?: string }> = {};
        Object.entries(prev).forEach(([key, value]) => {
          const i = Number(key);
          if (i < index) next[i] = value;
          else if (i > index) next[i - 1] = value;
        });
        return next;
      });
    };

    if (!hasContent) {
      doRemove();
      return;
    }

    Alert.alert(
      "Delete section?",
      "This section has content. Delete it from your draft?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doRemove },
      ]
    );
  };

  const validateRequiredFields = (): boolean => {
    const nextErrors: Record<number, { title?: string; body?: string }> = {};
    let ok = true;
    sections.forEach((section, index) => {
      const titleMissing = !section.title.trim();
      const bodyMissing = !section.body.trim();
      if (titleMissing || bodyMissing) {
        ok = false;
        nextErrors[index] = {
          ...(titleMissing ? { title: "Title is required." } : {}),
          ...(bodyMissing ? { body: "Body is required." } : {}),
        };
      }
    });
    setFieldErrors(nextErrors);
    return ok;
  };

  const handlePreview = () => {
    if (!validateRequiredFields()) {
      Alert.alert("Required fields", "Please fill in the Title and Body for every section.");
      return;
    }
    setTermsPreview(sections);
    router.push("/terms-of-service?preview=1");
  };

  const handlePost = () => {
    if (!validateRequiredFields()) {
      Alert.alert("Required fields", "Please fill in the Title and Body for every section.");
      return;
    }
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
                setInitialSections(cloneSections(sections));
                allowLeaveRef.current = true;
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
        <View className="flex-row items-center gap-2 mb-2 min-h-12">
          <ThemedBackButton onPress={handleBack} />
          <ThemedText
            className="flex-1 text-lg font-extrabold"
            numberOfLines={2}
            style={{ flexShrink: 1 }}
          >
            Edit Terms of Service
          </ThemedText>
          <Pressable
            onPress={handlePreview}
            className="rounded-full px-3 py-2 flex-row items-center justify-center gap-1 shrink-0"
            style={{ backgroundColor: theme.accent }}
          >
            <Ionicons name="eye-outline" size={16} color="#ffffff" />
            <Text className="text-sm font-extrabold" style={{ color: "#ffffff" }}>
              Preview
            </Text>
          </Pressable>
          <Pressable
            onPress={handlePost}
            disabled={posting}
            className="rounded-full px-3 py-2 items-center justify-center shrink-0"
            style={{ backgroundColor: theme.accent }}
          >
            {posting ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-sm font-extrabold text-white">Post</Text>
            )}
          </Pressable>
        </View>
        {lastUpdatedMs ? (
          <ThemedText variant="muted" className="text-xs text-center mb-2">
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
        {sections.map((section, index) => {
          const errors = fieldErrors[index];
          return (
          <ThemedCard key={`section-${index}`} className="p-4 mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <ThemedText className="text-sm font-extrabold">Section {index + 1}</ThemedText>
              <Pressable onPress={() => removeSection(index)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={theme.danger} />
              </Pressable>
            </View>

            <ThemedText variant="muted" className="text-xs mb-1">
              Title <Text style={{ color: theme.danger }}>*</Text>
            </ThemedText>
            <TextInput
              value={section.title}
              onChangeText={(title) => updateSection(index, { title })}
              className="rounded-xl px-3 py-3 text-base"
              style={[
                inputStyle,
                errors?.title ? { borderColor: theme.danger, borderWidth: 1 } : null,
              ]}
              placeholderTextColor={placeholderColor}
              placeholder="Section title"
            />
            {!!errors?.title && (
              <Text className="text-red-500 text-xs mt-1.5 ml-1 mb-2">{errors.title}</Text>
            )}
            {!errors?.title ? <View className="mb-3" /> : null}

            <ThemedText variant="muted" className="text-xs mb-1">
              Body <Text style={{ color: theme.danger }}>*</Text>
            </ThemedText>
            <TextInput
              value={section.body}
              onChangeText={(body) => updateSection(index, { body })}
              multiline
              textAlignVertical="top"
              className="rounded-xl px-3 py-3 text-base min-h-[100px]"
              style={[
                inputStyle,
                errors?.body ? { borderColor: theme.danger, borderWidth: 1 } : null,
              ]}
              placeholderTextColor={placeholderColor}
              placeholder="Section body"
            />
            {!!errors?.body && (
              <Text className="text-red-500 text-xs mt-1.5 ml-1 mb-2">{errors.body}</Text>
            )}
            {!errors?.body ? <View className="mb-3" /> : null}

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
          );
        })}

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
