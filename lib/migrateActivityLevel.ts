import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

/**
 * Rename legacy Super Active profiles to Extra Active.
 * (Older builds briefly used extra_active as an alias for Very Active —
 * those users already sit on very_active and are left alone.)
 */
export async function migrateExtraActiveActivityLevel(uid: string): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;
  if (data.activityLevel !== "super_active") return;
  await updateDoc(ref, {
    activityLevel: "extra_active",
    activityMultiplier: 1.9,
  });
}

export function normalizeActivityLevel(
  level: string | null | undefined
): "sedentary" | "light" | "moderate" | "very_active" | "extra_active" | null {
  if (!level) return null;
  if (level === "super_active") return "extra_active";
  if (
    level === "sedentary" ||
    level === "light" ||
    level === "moderate" ||
    level === "very_active" ||
    level === "extra_active"
  ) {
    return level;
  }
  return null;
}
