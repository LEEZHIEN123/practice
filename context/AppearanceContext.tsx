import { auth } from "@/firebaseConfig";
import {
    adminAppearanceThemes,
    appearanceThemes,
    loadAppearanceMode,
    saveAppearanceMode,
    type AppearanceMode,
    type AppearanceTheme,
} from "@/lib/appearance";
import { isAdminEmail } from "@/lib/communityService";
import { onAuthStateChanged } from "firebase/auth";
import { useColorScheme } from "nativewind";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

type AppearanceContextValue = {
  mode: AppearanceMode;
  isDark: boolean;
  theme: AppearanceTheme;
  ready: boolean;
  isAdminTheme: boolean;
  setAppearance: (mode: AppearanceMode) => Promise<void>;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const { setColorScheme } = useColorScheme();
  const [mode, setMode] = useState<AppearanceMode>("light");
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [isAdminTheme, setIsAdminTheme] = useState(() =>
    isAdminEmail(auth.currentUser?.email)
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setIsAdminTheme(isAdminEmail(user?.email));
    });
    return unsub;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!uid) {
        setMode("light");
        setColorScheme("light");
        setReady(true);
        return;
      }
      setReady(false);
      const stored = await loadAppearanceMode(uid);
      if (cancelled) return;
      setMode(stored);
      setColorScheme(stored);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, setColorScheme]);

  const setAppearance = useCallback(
    async (next: AppearanceMode) => {
      setMode(next);
      setColorScheme(next);
      await saveAppearanceMode(uid, next);
    },
    [setColorScheme, uid]
  );

  const value = useMemo<AppearanceContextValue>(
    () => ({
      mode,
      isDark: mode === "dark",
      theme: isAdminTheme ? adminAppearanceThemes[mode] : appearanceThemes[mode],
      ready,
      isAdminTheme,
      setAppearance,
    }),
    [mode, ready, setAppearance, isAdminTheme]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance must be used within AppearanceProvider");
  }
  return ctx;
}
