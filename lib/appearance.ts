import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppearanceMode = "light" | "dark";

export function appearanceStorageKey(uid: string): string {
  return `app_appearance_v1:${uid}`;
}

export async function loadAppearanceMode(uid: string | null): Promise<AppearanceMode> {
  if (!uid) return "light";
  try {
    const raw = await AsyncStorage.getItem(appearanceStorageKey(uid));
    return raw === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export async function saveAppearanceMode(
  uid: string | null,
  mode: AppearanceMode
): Promise<void> {
  if (!uid) return;
  await AsyncStorage.setItem(appearanceStorageKey(uid), mode);
}

export type AppearanceTheme = {
  screenBg: string;
  cardBg: string;
  cardBorder: string;
  rowBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  iconMuted: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  danger: string;
  dangerSoft: string;
  modalOverlay: string;
  modalBg: string;
  statCardBg: string;
  navBg: string;
  navBorder: string;
};

export const appearanceThemes: Record<AppearanceMode, AppearanceTheme> = {
  light: {
    screenBg: "#eef2f1",
    cardBg: "#ffffff",
    cardBorder: "#e5e7eb",
    rowBg: "#f7f7f7",
    textPrimary: "#111827",
    textSecondary: "#4b5563",
    textMuted: "#6b7280",
    iconMuted: "#9ca3af",
    accent: "#76C893",
    accentSoft: "#eef7f1",
    accentText: "#52B69A",
    danger: "#ef4444",
    dangerSoft: "#fef2f2",
    modalOverlay: "rgba(0,0,0,0.5)",
    modalBg: "#ffffff",
    statCardBg: "#ffffff",
    navBg: "#ffffff",
    navBorder: "#e5e7eb",
  },
  dark: {
    screenBg: "#0b1220",
    cardBg: "#111827",
    cardBorder: "#334155",
    rowBg: "#1e293b",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#94a3b8",
    iconMuted: "#64748b",
    accent: "#76C893",
    accentSoft: "#163328",
    accentText: "#86efac",
    danger: "#f87171",
    dangerSoft: "#3f1d1d",
    modalOverlay: "rgba(0,0,0,0.72)",
    modalBg: "#111827",
    statCardBg: "#1e293b",
    navBg: "#0f172a",
    navBorder: "#334155",
  },
};
