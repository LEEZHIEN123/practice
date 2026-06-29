import { useAppearance } from "@/context/AppearanceContext";
import type { AppearanceTheme } from "@/lib/appearance";
import { useMemo } from "react";

export function useThemedScreen() {
  const { theme, isDark, mode } = useAppearance();

  return useMemo(
    () => ({
      theme,
      isDark,
      mode,
      screenStyle: { flex: 1 as const, backgroundColor: theme.screenBg },
      cardStyle: {
        backgroundColor: theme.cardBg,
        borderColor: theme.cardBorder,
        borderWidth: 1,
      },
      surfaceStyle: { backgroundColor: theme.rowBg },
      navStyle: {
        backgroundColor: theme.navBg,
        borderTopColor: theme.navBorder,
        borderTopWidth: 1,
      },
      textPrimary: { color: theme.textPrimary },
      textSecondary: { color: theme.textSecondary },
      textMuted: { color: theme.textMuted },
      iconButtonStyle: { backgroundColor: theme.cardBg },
      segmentTrackStyle: {
        backgroundColor: theme.cardBg,
        borderColor: theme.cardBorder,
        borderWidth: 1,
      },
      segmentActiveStyle: { backgroundColor: theme.accentSoft },
    }),
    [theme, isDark, mode]
  );
}

export function themedCard(theme: AppearanceTheme) {
  return {
    backgroundColor: theme.cardBg,
    borderColor: theme.cardBorder,
    borderWidth: 1,
  };
}
