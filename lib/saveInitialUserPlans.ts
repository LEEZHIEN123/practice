import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { writeNutritionPlanCache } from "./nutritionPlanCache";
import {
  expandNutritionPlanText,
  generateActiveNutritionPlan,
  normalizeNutritionActivity,
  normalizeNutritionDietary,
  nutritionIntakeTargetKcal,
} from "./nutritionPlan";
import {
  bmiBandKey,
  buildWorkoutPlanArchiveEntry,
  pickOrGenerateWorkoutPlanForBand,
  workoutPlansByBmiGoalField,
  type PlanDuration,
} from "./workoutPlan";

export type RecommendedPlan = "gain" | "maintain" | "lose";

export async function saveInitialUserPlans(params: {
  uid: string;
  duration: PlanDuration;
  bmi: number;
  recommendedPlan: RecommendedPlan;
  userData: Record<string, unknown>;
}): Promise<void> {
  const { uid, duration, bmi, recommendedPlan, userData } = params;
  const plan = pickOrGenerateWorkoutPlanForBand(userData, bmi, recommendedPlan, duration).plan;
  const band = bmiBandKey(bmi);

  const mult =
    typeof userData.activityMultiplier === "number" && userData.activityMultiplier > 0
      ? userData.activityMultiplier
      : 1.2;
  const activityKey = normalizeNutritionActivity(
    typeof userData.activityLevel === "string" ? userData.activityLevel : null,
    mult
  );
  const dietaryKey = normalizeNutritionDietary(
    typeof userData.dietaryPreference === "string" ? userData.dietaryPreference : null
  );
  const weightKg = typeof userData.weight === "number" ? userData.weight : 0;
  const heightCm = typeof userData.height === "number" ? userData.height : 0;
  const age = typeof userData.age === "number" ? userData.age : 0;
  const gender =
    userData.gender === "male" || userData.gender === "female" ? userData.gender : null;

  const dailyCalorieTarget = nutritionIntakeTargetKcal({
    weightKg,
    heightCm,
    age,
    gender,
    activityMultiplier: mult,
    goal: recommendedPlan,
  });

  const nutritionPlan = expandNutritionPlanText(
    generateActiveNutritionPlan({
      duration,
      bmi,
      goal: recommendedPlan,
      dietaryPreference: dietaryKey,
      activityLevel: activityKey,
      dailyCalorieTarget,
    })
  );

  writeNutritionPlanCache(uid, {
    plan: nutritionPlan,
    duration,
    lastCompletedDay: null,
    lastCompletedAtMs: null,
    dailyCalorieTarget,
  });

  await updateDoc(doc(db, "users", uid), {
    planDuration: duration,
    planDurationChosenAt: serverTimestamp(),
    nutritionPlanDuration: duration,
    nutritionPlanDurationChosenAt: serverTimestamp(),
    homePlanSchedulePrompted: true,
    onboardingComplete: true,
    bmiAnalysisComplete: false,
    bmi: Number(bmi.toFixed(2)),
    recommendedPlan,
    activeWorkoutPlan: plan,
    activeNutritionPlan: nutritionPlan,
    activePlanLastCompletedDay: null,
    activePlanLastCompletedAt: null,
    activeNutritionPlanLastCompletedDay: null,
    activeNutritionPlanLastCompletedAt: null,
    [workoutPlansByBmiGoalField(band, recommendedPlan, duration)]: buildWorkoutPlanArchiveEntry(
      plan,
      null,
      null
    ),
  } as Record<string, unknown>);
}
