export type GoalKey = "gain" | "maintain" | "lose";
export type PlanDuration = "week" | "biweekly" | "monthly";
export type WorkoutType = "Yoga" | "Strength" | "HIIT" | "Cardio";

export type ActiveWorkoutPlan = {
  duration: PlanDuration;
  createdAt: string;
  bmi: number | null;
  goal: GoalKey | null;
  suggestedTypes: WorkoutType[];
  schedule: { day: number; type: WorkoutType; workout: string }[];
};

export const WORKOUTS_BY_TYPE: Record<WorkoutType, readonly string[]> = {
  Yoga: [
    "Restorative yoga",
    "Yin yoga",
    "Nadisodhana yoga",
    "Hatha yoga",
    "General yoga",
    "Vinyasa flow",
    "Hot yoga",
    "Surya Namaskar",
    "Ashtanga yoga",
    "Power yoga",
    "Iyengar Yoga",
    "Kundalini Yoga",
    "Sivananda Yoga",
    "Bikram Yoga",
    "Stretching, Yoga",
  ],
  Strength: [
    "Squat",
    "Deadlift",
    "Kettlebell swing",
    "Push-up",
    "Push-up, high intensity",
    "Lunge",
    "Lunge, high intensity",
    "Pull-up",
    "Pull-up, vigorous",
    "Plank",
    "Front squat",
    "Goblet squat",
    "Bulgarian split squat",
    "Leg press",
    "Romanian deadlift",
    "Exercise",
    "Barbell Incline Bench Press",
    "Barbell Overhead Press (high)",
    "Barbell Row",
    "Barbell Snatch",
    "Barbell Hip Thrust",
  ],
  HIIT: [
    "Mountain climbers",
    "Jumping jacks",
    "Burpees",
    "Jump squats",
    "Indoor cycling",
    "Running curved treadmill, 5.0 to 5.9 mph",
    "Running curved treadmill, 7.0 to 7.9 mph",
    "Running curved treadmill, 9.0 to 9.9 mph",
    "Running curved treadmill, 8.0 to 8.9 mph",
    "Battle ropes",
    "Stair running",
    "Rope jumping, moderate pace, general, 100 to 120 skips/min, 2 foot skip, plain bounce",
    "Rope jumping, fast pace, 120-160 skips/min",
  ],
  Cardio: [
    "Walking, 2mph",
    "Walking, 3mph(20 min/mile)",
    "Walking, 17 min/mile",
    "Walking, 15min/mile",
    "Jogging, 12 min/mile",
    "Cycling (12 mph)",
    "Rope jumping, slow pace, < 100 skips/min, 2 foot skip, rhythm bounce",
    "Hooping",
    "Stair treadmill ergometer",
    "Walking, 2mph",
    "Running, 10 min/mile",
    "Running, 9 min/mile",
    "Running: 7 min. mile",
    "Running, 8 min/mile",
    "Trampoline",
    "Walking up stairs",
    "Stationary cycling, 100 watts",
    "Stationary cycling, 50 watts",
    "Stationary cycling, 60 watts",
    "Boxing, punching bag, 60 b/min",
    "Boxing, punching bag, 120 b/min",
    "Boxing, punching bag, 180 b/min",
  ],
};

export function calcBmi(weightKg: number, heightCm: number) {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  if (!h) return null;
  const v = weightKg / (h * h);
  return Number.isFinite(v) ? v : null;
}

export function suggestWorkoutTypes(bmi: number, goal: GoalKey): WorkoutType[] {
  if (bmi < 18.5) {
    if (goal === "gain") return ["Strength", "Yoga"];
    if (goal === "maintain") return ["Strength", "Cardio", "Yoga"];
    return ["Yoga"];
  }
  if (bmi <= 24.5) {
    if (goal === "gain") return ["Strength", "Yoga"];
    if (goal === "maintain") return ["Strength", "Cardio"];
    return ["Cardio", "HIIT", "Strength"];
  }
  // bmi > 24.5
  if (goal === "lose") return ["Cardio", "HIIT", "Strength"];
  if (goal === "maintain") return ["Cardio"];
  return ["Strength"];
}

export function durationDays(duration: PlanDuration) {
  if (duration === "week") return 7;
  if (duration === "biweekly") return 14;
  return 30;
}

export function generateActiveWorkoutPlan(params: {
  duration: PlanDuration;
  bmi: number;
  goal: GoalKey;
}): ActiveWorkoutPlan {
  const { duration, bmi, goal } = params;
  const days = durationDays(duration);
  const types = suggestWorkoutTypes(bmi, goal);
  const pick = (arr: readonly string[]) => arr[Math.floor(Math.random() * arr.length)];

  const schedule = Array.from({ length: days }).map((_, i) => {
    const type = types[i % types.length];
    const workout = pick(WORKOUTS_BY_TYPE[type]);
    return { day: i + 1, type, workout };
  });

  return {
    duration,
    createdAt: new Date().toISOString(),
    bmi: Math.round(bmi * 10) / 10,
    goal,
    suggestedTypes: types,
    schedule,
  };
}

