import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

const ONBOARDING_ROUTES = new Set([
  "/register",
  "/profiledetails",
  "/activitylevel",
  "/dietary-preference",
  "/BMIanalysis",
]);

export function isOnboardingPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return ONBOARDING_ROUTES.has(pathname);
}

/** Continue incomplete registration, or go Home when profile is ready. */
export async function resolvePostAuthRoute(uid: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
    const hasGender = data.gender === "male" || data.gender === "female";
    const hasActivity = typeof data.activityLevel === "string" && data.activityLevel.length > 0;
    const hasDietary =
      data.dietaryPreference === "omnivore" ||
      data.dietaryPreference === "vegetarian" ||
      data.dietaryPreference === "vegan";
    const onboardingIncomplete = data.onboardingComplete === false;

    if (!hasGender) return "/profiledetails";
    if (!hasActivity) return "/activitylevel";
    // New registrations must finish dietary preference; older accounts stay on Home.
    if (onboardingIncomplete && !hasDietary) return "/dietary-preference";
    if (onboardingIncomplete) return "/BMIanalysis";
    return "/home";
  } catch {
    // Prefer onboarding over Home if profile lookup fails mid-registration.
    return "/profiledetails";
  }
}
