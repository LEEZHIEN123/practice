import { checkIsAdmin } from "@/lib/communityService";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

export type TermsSection = {
  title: string;
  body: string;
  bullets?: string[];
};

export type TermsOfServiceDocument = {
  sections: TermsSection[];
  updatedAtMs: number;
  updatedBy?: string;
};

const DOC_PATH = ["appConfig", "termsOfService"] as const;

export const DEFAULT_TERMS_SECTIONS: TermsSection[] = [
  {
    title: "1. Acceptance of Terms",
    body:
      "By accessing or using Personalised Workout and Nutrition Guidance System, you agree to be bound by these Terms of Service.",
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
      "Misuse the app, servers, or other users' data",
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

function parseSections(raw: unknown): TermsSection[] | null {
  if (!Array.isArray(raw)) return null;
  const sections: TermsSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const body = typeof row.body === "string" ? row.body.trim() : "";
    if (!title || !body) continue;
    const bullets = Array.isArray(row.bullets)
      ? row.bullets.filter((b): b is string => typeof b === "string" && b.trim().length > 0)
      : undefined;
    sections.push({ title, body, bullets: bullets?.length ? bullets : undefined });
  }
  return sections.length ? sections : null;
}

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const maybe = (value as { toMillis?: () => number })?.toMillis?.();
  if (typeof maybe === "number" && Number.isFinite(maybe)) return maybe;
  return Date.now();
}

function mapDoc(data: Record<string, unknown>): TermsOfServiceDocument | null {
  const sections = parseSections(data.sections);
  if (!sections) return null;
  return {
    sections,
    updatedAtMs: toMillis(data.updatedAt),
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : undefined,
  };
}

export function defaultTermsDocument(): TermsOfServiceDocument {
  return {
    sections: DEFAULT_TERMS_SECTIONS.map((s) => ({ ...s, bullets: s.bullets ? [...s.bullets] : undefined })),
    updatedAtMs: Date.parse("2026-04-05T00:00:00"),
  };
}

export async function fetchTermsOfService(): Promise<TermsOfServiceDocument> {
  try {
    const snap = await getDoc(doc(db, ...DOC_PATH));
    if (!snap.exists()) return defaultTermsDocument();
    const mapped = mapDoc(snap.data() as Record<string, unknown>);
    return mapped ?? defaultTermsDocument();
  } catch {
    return defaultTermsDocument();
  }
}

export function subscribeTermsOfService(
  onData: (doc: TermsOfServiceDocument) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, ...DOC_PATH),
    (snap) => {
      if (!snap.exists()) {
        onData(defaultTermsDocument());
        return;
      }
      const mapped = mapDoc(snap.data() as Record<string, unknown>);
      onData(mapped ?? defaultTermsDocument());
    },
    (error) => {
      onError?.(error);
      onData(defaultTermsDocument());
    }
  );
}

export async function publishTermsOfService(sections: TermsSection[]): Promise<void> {
  for (let i = 0; i < sections.length; i++) {
    const title = sections[i]?.title?.trim() ?? "";
    const body = sections[i]?.body?.trim() ?? "";
    if (!title || !body) {
      throw new Error(`Section ${i + 1}: Title and Body are required.`);
    }
  }

  const cleaned = sections.map((s) => ({
    title: s.title.trim(),
    body: s.body.trim(),
    bullets: s.bullets?.map((b) => b.trim()).filter(Boolean),
  }));

  if (!cleaned.length) {
    throw new Error("Add at least one section with a title and body.");
  }

  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Admin only");

  const user = auth.currentUser;
  await setDoc(
    doc(db, ...DOC_PATH),
    {
      sections: cleaned.map((s) => ({
        title: s.title,
        body: s.body,
        ...(s.bullets?.length ? { bullets: s.bullets } : {}),
      })),
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid ?? null,
    },
    { merge: true }
  );
}

export function formatTermsUpdatedAt(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(ms));
}
