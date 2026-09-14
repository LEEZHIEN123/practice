import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { normalizeNutritionActivity, normalizeNutritionDietary } from "./nutritionPlan";

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
    normalizeNutritionActivity(
      typeof profile.activityLevel === "string" ? profile.activityLevel : null,
      typeof profile.activityMultiplier === "number" ? profile.activityMultiplier : null
    ) != null;
  const hasDietary =
    normalizeNutritionDietary(
      typeof profile.dietaryPreference === "string" ? profile.dietaryPreference : null
    ) != null;
  const hasPlanDuration =
    profile.planDuration === "week" ||
    profile.planDuration === "biweekly" ||
    profile.planDuration === "monthly";
  const bmiAnalysisDone = profile.bmiAnalysisComplete === true;
  const bmiAnalysisPending = profile.bmiAnalysisComplete === false;

  if (!hasGender) return "/profiledetails";
  if (!hasActivity) return "/activitylevel";
  if (!hasDietary) return "/dietary-preference";
  if (!hasPlanDuration) return "/schedule-plan";
  if (bmiAnalysisDone) return "/home";
  if (bmiAnalysisPending) return "/BMIanalysis";
  // Older accounts finished onboarding before the BMI step existed.
  if (profile.onboardingComplete === true) return "/home";
  return "/BMIanalysis";
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
