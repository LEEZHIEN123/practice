import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

/** Map legacy Extra Active profiles to Very Active. */
export async function migrateExtraActiveActivityLevel(uid: string): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;
  if (data.activityLevel !== "extra_active") return;
  await updateDoc(ref, {
    activityLevel: "very_active",
    activityMultiplier: 1.725,
  });
}

export function normalizeActivityLevel(
  level: string | null | undefined
): "sedentary" | "light" | "moderate" | "very_active" | "super_active" | null {
  if (!level) return null;
  if (level === "extra_active") return "very_active";
  if (
    level === "sedentary" ||
    level === "light" ||
    level === "moderate" ||
    level === "very_active" ||
    level === "super_active"
  ) {
    return level;
  }
  return null;
}
