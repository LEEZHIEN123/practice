import type { ImageSourcePropType } from "react-native";

/**
 * Instruction hero image per catalog workout name (`WORKOUT_DETAILS` keys).
 * Strength uses multi-frame GIFs so demos animate on the workout screen.
 * Workout-type cards stay on static PNGs in `workoutTypeCardImages.ts`.
 */
const WORKOUT_INSTRUCTION_IMAGES: Record<string, ImageSourcePropType> = {
  // Yoga
  "Restorative yoga": require("../assets/images/Restorative yoga.png"),
  "Yin yoga": require("../assets/images/Yin yoga.webp"),
  "Nadisodhana yoga": require("../assets/images/Nadisodhana yoga1.png"),
  "Hatha yoga": require("../assets/images/Hatha yoga.webp"),
  "Surya Namaskar": require("../assets/images/Surya Namaskar.png"),
  "Ashtanga yoga": require("../assets/images/Ashtanga yoga.jpg"),
  "Power yoga": require("../assets/images/power yoga.png"),
  "Iyengar Yoga": require("../assets/images/Iyengar Yoga.webp"),
  "Kundalini Yoga": require("../assets/images/Kundalini Yoga.png"),

  // Cardio — LiftManual GIFs for walk/jog/run/treadmill; animated demos for rope/battle/boxing
  "Walking, 2mph": require("../assets/images/Walking.gif"),
  "Walking, 3mph(20 min/mile)": require("../assets/images/Walking.gif"),
  "Walking, 17 min/mile": require("../assets/images/Walking.gif"),
  "Walking, 15min/mile": require("../assets/images/Walking.gif"),
  "Jogging, 12 min/mile": require("../assets/images/Jogging.gif"),
  "Cycling (12 mph)": require("../assets/images/Cycling (12 mph).webp"),
  "Rope jumping, slow pace, < 100 skips/min, 2 foot skip, rhythm bounce": require("../assets/images/Rope Jumping.gif"),
  Hooping: require("../assets/images/Hooping.webp"),
  "Stair treadmill ergometer": require("../assets/images/Stair Treadmill.webp"),
  "Running, 10 min/mile": require("../assets/images/Running.gif"),
  "Running, 9 min/mile": require("../assets/images/Running.gif"),
  "Running: 7 min. mile": require("../assets/images/Running.gif"),
  "Running, 8 min/mile": require("../assets/images/Running.gif"),
  Trampoline: require("../assets/images/Trampoline.webp"),
  "Walking up stairs": require("../assets/images/Walking.gif"),
  "Stationary cycling, 100 watts": require("../assets/images/Stationary Cycling (100 watts).webp"),
  "Stationary cycling, 50 watts": require("../assets/images/Stationary Cycling (50 watts).webp"),
  "Stationary cycling, 60 watts": require("../assets/images/Stationary Cycling (60 watts).webp"),
  "Boxing, punching bag, 60 b/min": require("../assets/images/Boxing Punching Bag.gif"),
  "Boxing, punching bag, 120 b/min": require("../assets/images/Boxing Punching Bag.gif"),
  "Boxing, punching bag, 180 b/min": require("../assets/images/Boxing Punching Bag.gif"),

  // HIIT — animated GIFs where available (LiftManual when hosted; else matched demo GIFs)
  "Mountain climbers": require("../assets/images/Mountain Climbers.gif"),
  "Jumping jacks": require("../assets/images/Jumping Jacks.gif"),
  Burpees: require("../assets/images/Burpees.gif"),
  "Jump squats": require("../assets/images/Jump Squats.gif"),
  "Running curved treadmill, 5.0 to 5.9 mph": require("../assets/images/Curved Treadmill.gif"),
  "Running curved treadmill, 7.0 to 7.9 mph": require("../assets/images/Curved Treadmill.gif"),
  "Running curved treadmill, 9.0 to 9.9 mph": require("../assets/images/Curved Treadmill.gif"),
  "Running curved treadmill, 8.0 to 8.9 mph": require("../assets/images/Curved Treadmill.gif"),
  "Battle ropes": require("../assets/images/Battle Ropes.gif"),
  "Stair running": require("../assets/images/Stair Running.avif"),
  "Rope jumping, moderate pace, general, 100 to 120 skips/min, 2 foot skip, plain bounce": require("../assets/images/Rope Jumping.gif"),
  "Rope jumping, fast pace, 120-160 skips/min": require("../assets/images/Rope Jumping.gif"),

  // Strength — LiftManual GIFs when available on the site; animated demos otherwise
  Squat: require("../assets/images/Squat.gif"),
  Deadlift: require("../assets/images/Deadlift.gif"),
  "Kettlebell swing": require("../assets/images/kettlebell swing.gif"),
  "Push-up": require("../assets/images/push ups.gif"),
  "Barbell Lunge": require("../assets/images/lunge.gif"),
  "Pull-up": require("../assets/images/pull up.gif"),
  Plank: require("../assets/images/plank.gif"),
  "Front squat": require("../assets/images/Barbell Front Squat.gif"),
  "Goblet squat": require("../assets/images/Goblet Squat.gif"),
  "Bulgarian split squat": require("../assets/images/Bulgarian Split Squat.gif"),
  "Leg press": require("../assets/images/leg press.gif"),
  "Romanian deadlift": require("../assets/images/Romanian Deadlift.gif"),
  "Barbell Incline Bench Press": require("../assets/images/Barbell Incline Bench Press.gif"),
  "Barbell Overhead Press (high)": require("../assets/images/Barbell Overhead Press.gif"),
  "Barbell Row": require("../assets/images/Barbell Row.gif"),
  "Barbell Snatch": require("../assets/images/Barbell Snatch.gif"),
  "Barbell Hip Thrust": require("../assets/images/Barbell Hip Thrust.gif"),
};

export function getWorkoutInstructionImage(workoutName: string | null | undefined): ImageSourcePropType | null {
  if (!workoutName) return null;
  return WORKOUT_INSTRUCTION_IMAGES[workoutName] ?? null;
}
