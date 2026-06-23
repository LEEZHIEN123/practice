import { AdminCommunityHub } from "@/components/community/AdminCommunityHub";
import { checkIsAdmin, isAdminEmail, syncAdminConfig } from "@/lib/communityService";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { auth } from "../firebaseConfig";

function canEnterAdminImmediately(): boolean {
  const user = auth.currentUser;
  return Boolean(user && isAdminEmail(user.email));
}

export default function AdminScreen() {
  const router = useRouter();
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
      <View className="flex-1 bg-[#f3f4f3] items-center justify-center">
        <ActivityIndicator size="large" color="#52B69A" />
        <Text className="text-sm text-gray-500 mt-3">Loading admin panel…</Text>
      </View>
    );
  }

  return <AdminCommunityHub />;
}
