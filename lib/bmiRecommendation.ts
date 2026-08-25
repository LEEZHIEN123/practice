export type BmiPlanKey = "gain" | "maintain" | "lose";

/** Display / plan BMI bands used across Home, Progress, and nutrition plans. */
export type BmiCategoryKey = "under" | "normal" | "over" | "obese";

export type BmiRecommendation = {
  planKey: BmiPlanKey;
  titleTop: string;
  status: string;
  recommendationTitle: string;
  recommendationSubtitle: string;
  description: string;
};

export function getBmiCategoryKey(bmi: number): BmiCategoryKey | null {
  if (!Number.isFinite(bmi) || bmi <= 0) return null;
  if (bmi < 18.5) return "under";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "over";
  return "obese";
}

/** True when old and new BMI fall into different UNDER / NORMAL / OVER / OBESE bands. */
export function didBmiCategoryChange(
  previousBmi: number | null | undefined,
  nextBmi: number | null | undefined
): boolean {
  const prev =
    previousBmi != null && Number.isFinite(previousBmi) ? getBmiCategoryKey(previousBmi) : null;
  const next = nextBmi != null && Number.isFinite(nextBmi) ? getBmiCategoryKey(nextBmi) : null;
  if (!prev || !next) return false;
  return prev !== next;
}

export const BMI_CATEGORY_PLAN_CHANGE_TITLE = "Plans updated";
export const BMI_CATEGORY_PLAN_CHANGE_MESSAGE =
  "Your BMI category changed, so your personalized workout and nutrition plans have been updated to match.";

export function getBmiRecommendation(bmi: number): BmiRecommendation {
  if (bmi < 18.5) {
    return {
      planKey: "gain",
      titleTop: "Your BMI is",
      status: "Underweight",
      recommendationTitle: "Gain Weight",
      recommendationSubtitle: "Reach a healthier BMI range",
      description:
        "A BMI of {BMI} is below the ideal range.\n" +
        "Gaining weight gradually with a balanced diet and strength training can help you reach a healthier range.",
    };
  }

  if (bmi < 25) {
    return {
      planKey: "maintain",
      titleTop: "Your BMI is",
      status: "Normal",
      recommendationTitle: "Maintain Weight",
      recommendationSubtitle: "Stay within a healthy BMI range",
      description:
        "A BMI of {BMI} is within the ideal range.\n" +
        "Having the balanced meals and regular activity helps keep you healthy.",
    };
  }

  return {
    planKey: "lose",
    titleTop: "Your BMI is",
    status: "Overweight",
    recommendationTitle: "Lose Weight",
    recommendationSubtitle: "Achieve a healthier BMI range",
    description:
      "A BMI of {BMI} is above the ideal range.\n" +
      "Reducing your weight can significantly reduce the risk of chronic illnesses and improve your quality of life.",
  };
}
