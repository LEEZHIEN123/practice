import { ThemedCard, ThemedText } from "@/components/themed/ThemedUi";
import { formatTermsUpdatedAt, type TermsSection } from "@/lib/termsOfService";
import { View } from "react-native";

type TermsOfServiceContentProps = {
  sections: TermsSection[];
  updatedAtMs?: number;
  isPreview?: boolean;
};

export function TermsOfServiceContent({
  sections,
  updatedAtMs,
  isPreview = false,
}: TermsOfServiceContentProps) {
  const visibleSections = sections.filter((s) => s.title.trim() && s.body.trim());

  return (
    <ThemedCard className="p-5">
      {isPreview ? (
        <ThemedText variant="muted" className="text-sm mb-6">
          Draft preview — not published yet
        </ThemedText>
      ) : updatedAtMs != null ? (
        <ThemedText variant="muted" className="text-sm mb-6">
          Last updated: {formatTermsUpdatedAt(updatedAtMs)}
        </ThemedText>
      ) : null}

      {visibleSections.length === 0 ? (
        <ThemedText variant="secondary" className="text-[15px] leading-6">
          Add at least one section with a title and body to preview.
        </ThemedText>
      ) : (
        visibleSections.map((s, index) => (
          <View key={`${s.title}-${index}`} className="mb-6">
            <ThemedText className="text-base font-extrabold mb-2">{s.title}</ThemedText>
            <ThemedText variant="secondary" className="text-[15px] leading-6">
              {s.body}
            </ThemedText>
            {s.bullets?.map((b) => (
              <ThemedText key={b} variant="secondary" className="text-[15px] leading-6 mt-2 ml-1">
                {"\u2022 "} {b}
              </ThemedText>
            ))}
          </View>
        ))
      )}
    </ThemedCard>
  );
}
