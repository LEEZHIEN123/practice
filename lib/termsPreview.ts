import type { TermsSection } from "@/lib/termsOfService";

let draftSections: TermsSection[] | null = null;

export function setTermsPreview(sections: TermsSection[]) {
  draftSections = sections.map((s) => ({
    title: s.title.trim(),
    body: s.body.trim(),
    bullets: s.bullets?.map((b) => b.trim()).filter(Boolean),
  }));
}

export function getTermsPreview(): TermsSection[] | null {
  return draftSections;
}

export function clearTermsPreview() {
  draftSections = null;
}
