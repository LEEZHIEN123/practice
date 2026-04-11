import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../firebaseConfig";
import { getDeviceIanaTimezone } from "./calendarDay";

/**
 * IANA timezone used for dailyStats day keys. Persisted on `users/{uid}.timezone`
 * (first device wins — typically the phone — so emulator matches the same calendar day).
 */
export function useUserCalendarTimezone(): string {
  const [tz, setTz] = useState(getDeviceIanaTimezone);

  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        if (!cancelled) setTz(getDeviceIanaTimezone());
        return;
      }
      void (async () => {
        try {
          const ref = doc(db, "users", user.uid);
          const snap = await getDoc(ref);
          const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
          const stored = typeof data.timezone === "string" && data.timezone.length > 0 ? data.timezone : null;
          if (!stored) {
            const device = getDeviceIanaTimezone();
            await setDoc(ref, { timezone: device }, { merge: true });
            if (!cancelled) setTz(device);
          } else if (!cancelled) {
            setTz(stored);
          }
        } catch {
          if (!cancelled) setTz(getDeviceIanaTimezone());
        }
      })();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return tz;
}
