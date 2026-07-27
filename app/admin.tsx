import { AdminCommunityHub } from "@/components/community/AdminCommunityHub";
import { ThemedScreen, ThemedText } from "@/components/themed/ThemedUi";
import { checkIsAdmin, isAdminEmail, syncAdminConfig } from "@/lib/communityService";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { auth } from "../firebaseConfig";

function canEnterAdminImmediately(): boolean {
  const user = auth.currentUser;
  return Boolean(user && isAdminEmail(user.email));
}

export default function AdminScreen() {
  const router = useRouter();
  const { theme } = useThemedScreen();
  const [ready, setReady] = useState(canEnterAdminImmediately);

  useEffect(() => {
    const enterAdmin = () => {
      setReady(true);
      void syncAdminConfig().catch(() => {});
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      if (isAdminEmail(user.email)) {
        enterAdmin();
        return;
      }

      void checkIsAdmin(user, { skipReload: true })
        .then((admin) => {
          if (!admin) {
            router.replace("/home");
            return;
          }
          enterAdmin();
        })
        .catch(() => {
          router.replace("/home");
        });
    });

    return unsub;
  }, [router]);

  if (!ready) {
    return (
      <ThemedScreen className="items-center justify-center">
        <ActivityIndicator size="large" color={theme.accent} />
        <ThemedText variant="muted" className="text-sm mt-3">
          Loading admin panel…
        </ThemedText>
      </ThemedScreen>
    );
  }

  return <AdminCommunityHub />;
}
