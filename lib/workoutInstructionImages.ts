import type { ImageSourcePropType } from "react-native";

/**
 * Instruction hero image per catalog workout name (`WORKOUT_DETAILS` keys).
 * Paths match filenames in `assets/images/`.
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

  // Cardio
  "Walking, 2mph": require("../assets/images/walking-on-treadmill.jpg"),
  "Walking, 3mph(20 min/mile)": require("../assets/images/walking-on-treadmill.jpg"),
  "Walking, 17 min/mile": require("../assets/images/walking-on-treadmill.jpg"),
  "Walking, 15min/mile": require("../assets/images/walking-on-treadmill.jpg"),
  "Jogging, 12 min/mile": require("../assets/images/walking-on-treadmill.jpg"),
  "Cycling (12 mph)": require("../assets/images/Cycling (12 mph).webp"),
  "Rope jumping, slow pace, < 100 skips/min, 2 foot skip, rhythm bounce": require("../assets/images/Rope Jumping.png"),
  Hooping: require("../assets/images/Hooping.webp"),
  "Stair treadmill ergometer": require("../assets/images/Stair Treadmill.webp"),
  "Running, 10 min/mile": require("../assets/images/run-on-treadmill.jpg"),
  "Running, 9 min/mile": require("../assets/images/run-on-treadmill.jpg"),
  "Running: 7 min. mile": require("../assets/images/run-on-treadmill.jpg"),
  "Running, 8 min/mile": require("../assets/images/run-on-treadmill.jpg"),
  Trampoline: require("../assets/images/Trampoline.webp"),
  "Walking up stairs": require("../assets/images/Walking Up Stairs.jpg"),
  "Stationary cycling, 100 watts": require("../assets/images/Stationary Cycling (100 watts).webp"),
  "Stationary cycling, 50 watts": require("../assets/images/Stationary Cycling (50 watts).webp"),
  "Stationary cycling, 60 watts": require("../assets/images/Stationary Cycling (60 watts).webp"),
  "Boxing, punching bag, 60 b/min": require("../assets/images/boxing 60b.png"),
  "Boxing, punching bag, 120 b/min": require("../assets/images/boxing 120b.avif"),
  "Boxing, punching bag, 180 b/min": require("../assets/images/boxing 180b.jpeg"),

  // HIIT
  "Mountain climbers": require("../assets/images/Mountain Climbers.webp"),
  "Jumping jacks": require("../assets/images/Jumping Jacks.webp"),
  Burpees: require("../assets/images/Burpees.webp"),
  "Jump squats": require("../assets/images/Squat.webp"),
  "Running curved treadmill, 5.0 to 5.9 mph": require("../assets/images/walking-on-incline-treadmill.jpg"),
  "Running curved treadmill, 7.0 to 7.9 mph": require("../assets/images/walking-on-incline-treadmill.jpg"),
  "Running curved treadmill, 9.0 to 9.9 mph": require("../assets/images/walking-on-incline-treadmill.jpg"),
  "Running curved treadmill, 8.0 to 8.9 mph": require("../assets/images/walking-on-incline-treadmill.jpg"),
  "Battle ropes": require("../assets/images/Battle Ropes.png"),
  "Stair running": require("../assets/images/Stair Running.avif"),
  "Rope jumping, moderate pace, general, 100 to 120 skips/min, 2 foot skip, plain bounce": require("../assets/images/Rope Jumping Moderate Pace.webp"),
  "Rope jumping, fast pace, 120-160 skips/min": require("../assets/images/Rope Jumping Fast Pace.webp"),

  // Strength
  Squat: require("../assets/images/Squat.webp"),
  Deadlift: require("../assets/images/deadlift.webp"),
  "Kettlebell swing": require("../assets/images/kettlebell swing.png"),
  "Push-up": require("../assets/images/push ups.png"),
  "Barbell Lunge": require("../assets/images/lunge.webp"),
  "Pull-up": require("../assets/images/pull up.webp"),
  Plank: require("../assets/images/plank.png"),
  "Front squat": require("../assets/images/Barbell Front Squat.webp"),
  "Goblet squat": require("../assets/images/Goblet Squat.webp"),
  "Bulgarian split squat": require("../assets/images/Bulgarian Split Squat.webp"),
  "Leg press": require("../assets/images/leg press.avif"),
  "Romanian deadlift": require("../assets/images/Romanian Deadlift.webp"),
  "Barbell Incline Bench Press": require("../assets/images/Barbell Incline Bench Press.webp"),
  "Barbell Overhead Press (high)": require("../assets/images/Barbell Overhead Press.webp"),
  "Barbell Row": require("../assets/images/Barbell Row.webp"),
  "Barbell Snatch": require("../assets/images/Barbell Snatch.webp"),
  "Barbell Hip Thrust": require("../assets/images/Barbell Hip Thrust.png"),
};

export function getWorkoutInstructionImage(workoutName: string | null | undefined): ImageSourcePropType | null {
  if (!workoutName) return null;
  return WORKOUT_INSTRUCTION_IMAGES[workoutName] ?? null;
}
