import { appearanceThemes } from "@/lib/appearance";
import { useMemo } from "react";

const lightTheme = appearanceThemes.light;

/** Fixed light theme for login, register, and other pre-auth screens. */
export function useLightScreen() {
  const theme = lightTheme;

  return useMemo(
    () => ({
      theme,
      isDark: false,
      screenStyle: { flex: 1 as const, backgroundColor: theme.screenBg },
      cardStyle: {
        backgroundColor: theme.cardBg,
        borderColor: theme.cardBorder,
        borderWidth: 1,
      },
      textPrimary: { color: theme.textPrimary },
      textSecondary: { color: theme.textSecondary },
      textMuted: { color: theme.textMuted },
      textAccent: { color: theme.accentText },
      iconButtonStyle: { backgroundColor: theme.cardBg },
      inputStyle: {
        backgroundColor: theme.rowBg,
        borderColor: theme.cardBorder,
        borderWidth: 1,
        color: theme.textPrimary,
      },
      modalCardStyle: {
        backgroundColor: theme.modalBg,
        borderColor: theme.cardBorder,
        borderWidth: 1,
      },
      placeholderColor: theme.textMuted,
    }),
    []
  );
}
