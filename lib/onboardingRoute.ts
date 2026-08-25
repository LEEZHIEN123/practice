import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

const ONBOARDING_ROUTES = new Set([
  "/register",
  "/profiledetails",
  "/activitylevel",
  "/dietary-preference",
  "/BMIanalysis",
  "/schedule-plan",
]);

export function isOnboardingPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return ONBOARDING_ROUTES.has(pathname);
}

/** Continue incomplete registration, or go Home when profile is ready. */
export function resolvePostAuthRouteFromData(
  data: Record<string, unknown> | null | undefined
): string {
  const profile = data ?? {};
  const hasGender = profile.gender === "male" || profile.gender === "female";
  const hasActivity =
    typeof profile.activityLevel === "string" && profile.activityLevel.length > 0;
  const hasDietary =
    profile.dietaryPreference === "omnivore" ||
    profile.dietaryPreference === "vegetarian" ||
    profile.dietaryPreference === "vegan";
  const hasPlanDuration =
    profile.planDuration === "week" ||
    profile.planDuration === "biweekly" ||
    profile.planDuration === "monthly";

  if (!hasGender) return "/profiledetails";
  if (!hasActivity) return "/activitylevel";
  if (!hasDietary) return "/dietary-preference";
  if (!hasPlanDuration) return "/schedule-plan";
  if (profile.bmiAnalysisComplete === false) return "/BMIanalysis";
  return "/home";
}

export async function resolvePostAuthRoute(uid: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
    return resolvePostAuthRouteFromData(data);
  } catch {
    // Prefer onboarding over Home if profile lookup fails mid-registration.
    return "/profiledetails";
  }
}
