import { checkIsAdmin, isAdminEmail } from "@/lib/communityService";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect } from "react";
import { auth } from "../firebaseConfig";

/** Redirect admin accounts away from regular user screens. */
export function useAdminRedirect() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return;

      if (isAdminEmail(user.email)) {
        router.replace("/admin" as any);
        return;
      }

      void checkIsAdmin(user, { skipReload: true })
        .then((admin) => {
          if (admin) router.replace("/admin" as any);
        })
        .catch(() => {});
    });
    return unsub;
  }, [router]);
}
