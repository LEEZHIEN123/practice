export type WorkoutType = "Yoga" | "Strength" | "HIIT" | "Cardio";

/** Same shape as ActiveWorkoutPlan from workoutPlan (avoid circular imports). */
export type ActiveWorkoutPlanLike = {
  duration: string;
  createdAt: string;
  bmi: number | null;
  goal: string | null;
  suggestedTypes: string[];
  schedule: { day: number; type: string; workout: string }[];
};

/** Calories = (MET × 3.5 × duration(min) × weight(kg)) / 200 */
export function calcExerciseKcal(met: number, durationMin: number, weightKg: number): number {
  if (!Number.isFinite(met) || met <= 0 || !Number.isFinite(durationMin) || durationMin <= 0) return 0;
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  return (met * 3.5 * durationMin * weightKg) / 200;
}

export type WorkoutDetail = { instruction: string; met: number };

/** Full catalog: only these names are valid for plans and calorie lookup. */
export const WORKOUT_DETAILS: Record<WorkoutType, Record<string, WorkoutDetail>> = {
  Yoga: {
    "Restorative yoga": {
      met: 2,
      instruction: `1. Sit on the floor next to a wall with one hip touching the wall.
2. Lie on your back and gently swing your legs up the wall so they rest vertically.
3. Adjust your bum as close to the wall as comfortable.
4. Let your arms rest beside you with palms relaxed.
5. Close your eyes and breathe slowly and deeply.
6. Rest in this position. Focus on deep breathing and releasing the tension in your muscles.`,
    },
    "Yin yoga": {
      met: 2,
      instruction: `1. Sit on the floor with legs straight in front of you.
2. Inhale, lengthen your spine.
3. Exhale, fold forward from the hips, resting your torso on your thighs or knees.
4. Let your head and arms relax toward the floor.
5. Hold for 3–5 minutes (or longer), breathing slowly and deeply.
Optional: Use a bolster or pillow under your chest or head for support.`,
    },
    "Nadisodhana yoga": {
      met: 2,
      instruction: `1. Sit comfortably with a straight spine (cross-legged or on a chair).
2. Relax your shoulders and place your left hand on your knee.
3. Use your right thumb to close your right nostril.
4. Inhale slowly through your left nostril.
5. Close the left nostril with your right ring finger, and exhale through the right nostril.
6. Inhale through the right nostril, then close it and exhale through the left nostril.
7. This completes one round.
8. Repeat for 5–10 rounds, focusing on slow, deep breathing.`,
    },
    "Hatha yoga": {
      met: 2.3,
      instruction: `1. Start on your hands and knees (tabletop position) with wrists under shoulders and knees under hips.
2. Inhale, drop your belly, lift your chest and tailbone (Cow Pose).
3. Exhale, round your spine, tuck your chin to your chest (Cat Pose).
4. Continue moving slowly with your breath for 5–10 rounds.`,
    },
    "Surya Namaskar": {
      met: 3.5,
      instruction: `1. Start in Samasthiti (Tadasana), with the toes together and heels slightly apart. Keep your arms by your side, spine long.
2. Inhale, raise your arms overhead in line with your forehead with palms together and gaze at your thumbs in Angushthamadhyam Drishti.
3. Exhale, opening the arms sideways and bend forward with a flat back. Bring the hands to the ground next to your feet, reaching the crown of your head toward the floor.
4. Inhale and lift your chest, gazing forward.
5. Exhale and step or lightly hop into High Plank. Then, lower down into Chaturanga Dandasana (Four-Limbed Staff Pose).
6. Inhale, point your feet, and open your chest. Shoulders should be wide and gaze ahead or diagonally up (Upward-Facing Dog).
7. Exhale, curl your toes, and push your hips back and up (you may walk your feet slightly in). Find a steady position in Adho Mukha Svanasana (Downward Facing Dog) and hold for 5 breaths (—1—2—3—4—5—). As you exhale, bend your knees and gaze between your hands.
8. Inhale, step forward with your feet in between your hands, and gaze forward with your chest lifted.
9. Exhale, fold down with hands next to your feet and the crown of your head reaching toward the floor.
10. Inhale and reach your arms wide to the side. Come up with a flat back and bring your hands overhead. Gaze toward the ceiling at your thumbs.`,
    },
    "Ashtanga yoga": {
      met: 4,
      instruction: `1. Mountain Pose (Tadasana)
1. Stand tall with feet hip-width apart.
2. Distribute weight evenly across both feet.
3. Engage thighs, lengthen spine, relax shoulders.
4. Hold for 5 deep breaths.
2. Forward Fold (Uttanasana)
1. From standing, hinge forward at the hips.
2. Let arms hang naturally toward the floor.
3. Soften the knees as needed.
4. Hold for 5 steady breaths.
3. Downward-Facing Dog (Adho Mukha Svanasana)
1. Start on hands and knees.
2. Lift hips up and back, forming an inverted “V”.
3. Press palms firmly into the mat
4. Hold for 5 breaths
4. Plank Pose (Phalakasana)
1. Step back from Downward Dog.
2. Align shoulders directly over wrists.
3. Keep the body in one straight line.
4. Hold for 3–5 breaths.
5. Upward-Facing Dog (Urdhva Mukha Svanasana)
1. From plank, lower down and press into hands.
2. Lift chest and thighs off the mat.
3. Gaze slightly upward.
4. Hold for 1 breath in flow or 3–5 breaths when holding.
6. Warrior I (Virabhadrasana I)
1. Step one foot forward, back heel grounded.
2. Bend front knee, hips facing forward.
3. Raise arms overhead.
4. Hold for 5 breaths per side.
7. Staff Pose (Dandasana)
1. Sit with legs extended straight.
2. Flex feet and engage thighs.
3. Sit tall on sit bones.
4. Hold for 5 breaths.
8. Seated Forward Bend (Paschimottanasana)
1. From Staff Pose, hinge forward from the hips.
2. Hold shins, ankles, or feet.
3. Breathe steadily for at least 5 breaths.
9. Boat Pose (Navasana)
1. Sit with knees bent.
2. Lift feet and balance on sit bones.
3. Keep chest lifted.
4. Hold for 5 breaths.
10. Corpse Pose (Savasana)
1. Lie flat on your back.
2. Let arms and legs relax naturally.
3. Breathe freely for 5–10 minutes`,
    },
    "Power yoga": {
      met: 4,
      instruction: `1. Crow Pose (Bakasana): From a squat, place the hands shoulder-width apart, lean forward, and rest the knees on your upper arms. Shift your weight into the hands, lifting one foot at a time until both feet are off the floor.

2. Boat Pose (Navasana): Sit on the mat, bend your knees, and lift your feet so your shins are parallel to the floor. Engage your core, straighten legs if possible, and keep your chest lifted.
3. Eagle Pose (Garudasana): Stand tall, cross one thigh over the other, and hook the foot behind the calf if possible. Wrap the arms so one elbow is stacked over the other and the palms press together.
4. Twisted Triangle (Parivrtta Trikonasana): Step one foot forward and the other back, keeping legs straight. Hinge at the hips, take the opposite hand to the front foot and place it on the floor or a block, and twist the torso upward.
5. Camel Pose (Ustrasana): Kneel on the mat with hips stacked over the knees. Place your hands on the lower back for support, lift the chest, and gently arch backward.`,
    },
    "Iyengar Yoga": {
      met: 2.3,
      instruction: `1. Lie on your back with knees bent and feet flat on the floor, hip-width apart.
2. Place a yoga block under your sacrum for support.
3. Let your arms rest alongside your body, palms facing down.
4. Relax your shoulders and neck, ensuring no strain.
5. Focus on gentle breath and alignment, feeling supported by the block.
6. Slowly release the pose when ready, lowering your sacrum onto the floor and stretching out.`,
    },
    "Kundalini Yoga": {
      met: 3,
      instruction: `1. Firstly align to Mountain Pose Namaste (Pranamasana). Collect your mind and body to initiate the practise. Stay here for a couple of breaths.
2. Inhale and squat to Utkata Konasana Variation Namaste. Keep the knees aligned perpendicular to the legs. Position the feet at 45-degree angles outwards. Tuck the pelvis and core to maintain the neutral spine. A strong core prevents anterior tilting of the pelvis and helps to tone the glutes and align perfectly.
3. Exhale and take a forward stretch to Bear Pose. Extend the arms ahead and feel the spine stretch. Gaze down but don't hand the head. Keep the head engaged.
4. Inhale and place the palms on the thighs, closer to the knees. Don't place it on the knees. Keep the spine neutral, head engaged, and core strong. Align to Utkata Konasana Variation Hands Forward Bend.
5. Exhaling place the hands on the floor. Look at the floor and keep the arms straight. Do not bend the elbows and keep the head engaged. This Utkata Konasana Uttanasana Hasta Floor.
6. Inhale and rise up. Keep the core engaged and raise the arms in namaskar mudra. Don't shift the legs. This is (Urdhva Namaskarasana) with wide-legged alignment.
7. Exhale, bring the feet close to each other and place the hands in namaskar mudra on the center of the chest. Inhale and Exhale, close your eyes and stay in Pranamasana.
8. Continue with stability two to three times as per capacity.
9. Finally relax in Three Part Breath Mountain Pose (Dirga Pranayama Tadasana), or Three Part Breath Corpse Pose (Dirga Pranayama Savasana).`,
    },
  },
  Cardio: {
    "Walking, 2mph": {
      met: 2.5,
      instruction: `1. Stand tall with feet hip-width apart, shoulders relaxed, and gaze forward.
2. Begin walking at a steady, moderate pace of approximately 2 miles per hour.
3. Swing your arms naturally at your sides in coordination with your steps.
4. Maintain an upright posture, engaging your core and keeping your back straight.
5. Take steady, even breaths, inhaling through the nose and exhaling through the mouth or nose.
6. Continue walking at this pace for your desired duration.`,
    },
    "Walking, 3mph(20 min/mile)": {
      met: 3.3,
      instruction: `1. Stand tall with feet hip-width apart, shoulders relaxed, and gaze forward.
2. Begin walking at a steady pace of approximately 3 miles per hour (roughly 20 minutes per mile).
3. Swing your arms naturally at your sides in coordination with your steps.
4. Maintain an upright posture, engaging your core and keeping your back straight.
5. Take steady, even breaths, inhaling through the nose and exhaling through the mouth or nose.
6. Keep a consistent rhythm and pace, adjusting stride length slightly if needed to maintain speed.
7. Continue walking at this pace for your desired duration, focusing on endurance and comfort.`,
    },
    "Walking, 17 min/mile": {
      met: 3.8,
      instruction: `1. Stand tall with feet hip-width apart, shoulders relaxed, and gaze forward.
2. Begin walking at a pace of approximately 17 minutes per mile.
3. Swing your arms naturally in coordination with your steps.
4. Maintain upright posture, engaging your core.
5. Take steady breaths, inhaling through the nose and exhaling through the mouth.
6. Keep a consistent rhythm, focusing on comfort and endurance.
7. Gradually slow down before stopping.`,
    },
    "Walking, 15min/mile": {
      met: 5,
      instruction: `1. Stand tall with feet hip-width apart, shoulders relaxed, gaze forward.
2. Walk at approximately 15 minutes per mile.
3. Swing arms naturally in coordination with steps.
4. Keep upright posture, core engaged.
5. Breathe steadily.
6. Maintain a consistent pace, adjusting stride as needed.
7. Slow down gradually before stopping.`,
    },
    "Jogging, 12 min/mile": {
      met: 8,
      instruction: `1. Stand tall, shoulders relaxed, gaze forward.
2. Begin jogging at approximately 12 minutes per mile pace.
3. Swing arms naturally, slightly bent at elbows.
4. Maintain upright posture and engage core muscles.
5. Take steady, rhythmic breaths.
6. Focus on stride length and cadence for a smooth jog.
7. Gradually slow down before stopping.`,
    },
    "Cycling (12 mph)": {
      met: 8,
      instruction: `1. Adjust the bike seat and handlebars for comfort and proper posture.
2. Start pedaling at a steady pace of approximately 12 miles per hour.
3. Keep back straight and shoulders relaxed.
4. Engage core muscles and maintain smooth pedal strokes.
5. Breathe evenly and deeply.
6. Maintain cadence and monitor effort.
7. Gradually slow down before stopping.`,
    },
    "Rope jumping, slow pace, < 100 skips/min, 2 foot skip, rhythm bounce": {
      met: 8.3,
      instruction: `1. Stand upright, feet together, holding the rope handles lightly.
2. Begin jumping with both feet together, keeping the pace under 100 skips per minute.
3. Use a gentle rhythm bounce from your knees and ankles.
4. Swing the rope with wrists, not arms.
5. Keep shoulders relaxed and core engaged.
6. Continue at a steady, controlled pace.
7. Stop gradually and lower the rope safely.`,
    },
    Hooping: {
      met: 5.8,
      instruction: `1. Stand tall with feet hip-width apart, hoop around waist or target area.
2. Rotate your hips in a circular motion to keep the hoop spinning.
3. Keep arms relaxed by your sides.
4. Engage your core for balance and rhythm.
5. Maintain steady breathing and fluid movement.
6. Adjust body motion to sustain hoop rotation.
7. Stop slowly when finished.`,
    },
    "Stair treadmill ergometer": {
      met: 9.3,
      instruction: `1. Adjust step height and speed to a comfortable level.
2. Step on the treadmill, gripping rails lightly if needed.
3. Maintain upright posture, core engaged, shoulders relaxed.
4. Take steady steps, pushing through the balls of your feet.
5. Breathe evenly and maintain rhythm.
6. Adjust pace as needed for comfort and endurance.
7. Slow down gradually before stopping.`,
    },
    "Running, 10 min/mile": {
      met: 10,
      instruction: `1. Stand tall, shoulders relaxed, gaze forward.
2. Begin running at approximately 10 minutes per mile pace.
3. Swing arms naturally, elbows bent at ~90 degrees.
4. Maintain upright posture, core engaged.
5. Take steady, rhythmic breaths.
6. Focus on stride length and cadence.
7. Gradually slow down before stopping.`,
    },
    "Running, 9 min/mile": {
      met: 11,
      instruction: `1. Stand tall, shoulders relaxed, gaze forward.
2. Run at approximately 9 minutes per mile pace.
3. Swing arms naturally, elbows bent.
4. Engage core, maintain upright posture.
5. Breathe rhythmically.
6. Focus on stride and cadence for consistency.
7. Slow down gradually before stopping.`,
    },
    "Running: 7 min. mile": {
      met: 14,
      instruction: `1. Stand tall, shoulders relaxed, gaze forward.
2. Run at approximately 7 minutes per mile pace.
3. Swing arms naturally, elbows bent.
4. Engage core, keep upright posture.
5. Breathe rhythmically, matching pace.
6. Focus on maintaining stride and cadence.
7. Slow down gradually before stopping.`,
    },
    "Running, 8 min/mile": {
      met: 12.5,
      instruction: `1. Stand tall, shoulders relaxed, gaze forward.
2. Run at approximately 8 minutes per mile pace.
3. Swing arms naturally, elbows bent.
4. Engage core, maintain upright posture.
5. Breathe steadily and evenly.
6. Maintain consistent stride and rhythm.
7. Gradually slow down before stopping.`,
    },
    Trampoline: {
      met: 3.5,
      instruction: `1. Stand on the trampoline with feet shoulder-width apart.
2. Begin small, controlled bounces using legs and core.
3. Keep arms relaxed or out for balance.
4. Land softly with knees slightly bent.
5. Maintain steady breathing and rhythm.
6. Adjust bounce height based on comfort and control.
7. Stop by slowing bounces gradually.`,
    },
    "Walking up stairs": {
      met: 8,
      instruction: `1. Stand at the base of the stairs with feet hip-width apart.
2. Step up one stair at a time, alternating feet naturally.
3. Keep upright posture, core engaged, shoulders relaxed.
4. Swing arms naturally to assist momentum.
5. Take steady, even breaths.
6. Maintain consistent pace for safety and endurance.`,
    },
    "Stationary cycling, 100 watts": {
      met: 5.5,
      instruction: `1. Adjust the bike seat and handlebars for comfort and proper posture.
2. Begin pedaling at a steady resistance of 100 watts.
3. Keep your back straight and shoulders relaxed.
4. Engage your core muscles and maintain smooth, consistent pedal strokes.
5. Take steady, even breaths, inhaling through the nose and exhaling through the mouth.
6. Maintain cadence and monitor effort.
7. Gradually reduce resistance and slow down before stopping.`,
    },
    "Stationary cycling, 50 watts": {
      met: 4,
      instruction: `1. Adjust the bike seat and handlebars for comfort.
2. Pedal at a light resistance of 50 watts, maintaining a smooth rhythm.
3. Keep back straight, shoulders relaxed, core engaged.
4. Breathe evenly and maintain comfortable pace.
5. Focus on smooth pedal strokes and posture.
6. Gradually slow down before stopping.`,
    },
    "Stationary cycling, 60 watts": {
      met: 5,
      instruction: `1. Adjust the bike seat and handlebars for comfort.
2. Pedal at a moderate resistance of 60 watts.
3. Maintain upright posture, core engaged, shoulders relaxed.
4. Keep pedal strokes smooth and consistent.
5. Breathe steadily and evenly.
6. Maintain cadence for desired duration.
7. Gradually reduce resistance and stop.`,
    },
    "Boxing, punching bag, 60 b/min": {
      met: 7,
      instruction: `1. Stand with feet shoulder-width apart, dominant foot slightly back.
2. Keep hands in guard position near your face.
3. Begin punching the bag at a pace of 60 beats per minute (slow, controlled rhythm).
4. Rotate torso slightly with each punch, using core for power.
5. Maintain relaxed shoulders and steady breathing.
6. Focus on rhythm and technique rather than speed.
7. Stop gradually when finished.`,
    },
    "Boxing, punching bag, 120 b/min": {
      met: 8.5,
      instruction: `1. Stand with proper boxing stance, feet shoulder-width apart.
2. Keep hands in guard position near face.
3. Punch the bag at a pace of 120 beats per minute, maintaining control.
4. Engage core and rotate torso with each punch.
5. Keep shoulders relaxed and breathe rhythmically.
6. Focus on speed and technique balance.
7. Gradually slow punches before stopping.`,
    },
    "Boxing, punching bag, 180 b/min": {
      met: 10.8,
      instruction: `1. Stand in a proper boxing stance with feet shoulder-width apart.
2. Maintain hands in guard position.
3. Punch the bag at a pace of 180 beats per minute, using fast, controlled movements.
4. Rotate torso with punches, engaging core.
5. Maintain relaxed shoulders and steady breathing.
6. Focus on technique while maintaining speed.
7. Gradually slow down punches before stopping.`,
    },
  },
  HIIT: {
    "Mountain climbers": {
      met: 11,
      instruction: `1. Start in a high plank position, hands directly under shoulders, body in a straight line.
2. Engage your core and keep hips low.
3. Bring one knee toward your chest while keeping the other leg extended.
4. Quickly alternate legs in a running motion.
5. Maintain steady breathing and controlled movements.
6. Keep shoulders relaxed and wrists aligned under shoulders.
7. Stop gradually when finished.`,
    },
    "Jumping jacks": {
      met: 7.5,
      instruction: `1. Stand tall with feet together and arms at your sides.
2. Jump feet out to the sides while raising arms overhead.
3. Jump back to the starting position with feet together and arms down.
4. Keep movements controlled and rhythmic.
5. Breathe steadily throughout the exercise.
6. Continue for desired repetitions or duration.`,
    },
    Burpees: {
      met: 11,
      instruction: `1. Stand with your feet shoulder-width apart. Keep your arms at your sides.
2. Lower into a squat position. Place your hands on the floor in front of you, just inside your feet.
3. Kick your feet back behind you, landing in a plank position. Keep your body in a straight line from head to heels. Engage your core to prevent your hips from sagging.
4. Lower your chest to the ground by bending your elbows. Push back up to the plank position.
5. Jump your feet back towards your hands, returning to the squat position. Land softly to reduce impact on your joints.
6. From the squat position, jump into the air as high as you can. Reach your arms overhead during the jump. Land softly with your knees slightly bent to absorb the impact.
7. Return to the starting standing position to complete one repetition.`,
    },
    "Jump squats": {
      met: 8,
      instruction: `1. Stand with your feet shoulder-width apart and your arms at your sides.
2. Bend your knees and lower your hips down into a squat position.
3. As you come up from the squat, jump up explosively, extending your arms above your head.
4. Land softly back into the squat position and repeat for the desired number of reps.`,
    },
    "Running curved treadmill, 5.0 to 5.9 mph": {
      met: 11,
      instruction: `1. Stand tall with shoulders relaxed and gaze forward.
2. Begin running at a speed of 5.0 to 5.9 mph.
3. Swing arms naturally with elbows slightly bent.
4. Maintain upright posture and engage your core.
5. Take steady, rhythmic breaths.
6. Focus on stride consistency and cadence.
7. Gradually slow down before stopping.`,
    },
    "Running curved treadmill, 7.0 to 7.9 mph": {
      met: 12,
      instruction: `1. Stand tall with shoulders relaxed and gaze forward.
2. Run at a speed of 7.0 to 7.9 mph.
3. Swing arms naturally, elbows bent.
4. Maintain upright posture and engage core muscles.
5. Breathe steadily and evenly.
6. Focus on consistent stride and cadence.
7. Gradually slow down before stopping.`,
    },
    "Running curved treadmill, 9.0 to 9.9 mph": {
      met: 16.8,
      instruction: `1. Stand tall with shoulders relaxed, gaze forward.
2. Run at 9.0 to 9.9 mph.
3. Swing arms naturally with elbows bent.
4. Maintain upright posture and core engagement.
5. Take steady breaths and maintain rhythm.
6. Focus on stride length and consistency.
7. Gradually slow down before stopping.`,
    },
    "Running curved treadmill, 8.0 to 8.9 mph": {
      met: 14,
      instruction: `1. Stand tall with shoulders relaxed, gaze forward.
2. Run at 8.0 to 8.9 mph.
3. Swing arms naturally, elbows bent.
4. Keep upright posture and core engaged.
5. Maintain steady, rhythmic breathing.
6. Focus on stride length and cadence.
7. Gradually slow down before stopping.`,
    },
    "Battle ropes": {
      met: 11,
      instruction: `1. Stand with feet shoulder-width apart, knees slightly bent.
2. Hold a rope in each hand with a firm grip.
3. Perform alternating waves, slams, or circles with the ropes.
4. Keep core engaged and back straight.
5. Maintain steady breathing and controlled movements.
6. Continue for desired duration or repetitions.`,
    },
    "Stair running": {
      met: 15,
      instruction: `1. Stand at the base of the stairs with feet hip-width apart.
2. Run or walk quickly up the stairs, alternating feet naturally.
3. Keep upright posture, shoulders relaxed, core engaged.
4. Swing arms naturally to aid momentum.
5. Take steady, rhythmic breaths.
6. Carefully walk down stairs to recover, repeating as desired.`,
    },
    "Rope jumping, moderate pace, general, 100 to 120 skips/min, 2 foot skip, plain bounce": {
      met: 11.8,
      instruction: `1. Stand upright, feet together, holding rope handles lightly.
2. Jump with both feet together, bouncing gently.
3. Keep a rhythm of 100–120 skips per minute.
4. Use wrists to turn rope, not arms.
5. Maintain core engagement and relaxed shoulders.
6. Continue at a controlled pace, adjusting as needed.
7. Stop gradually when finished.`,
    },
    "Rope jumping, fast pace, 120-160 skips/min": {
      met: 12.3,
      instruction: `1. Stand upright, feet together, holding rope handles lightly.
2. Jump with both feet together at a pace of 120–160 skips per minute.
3. Keep arms relaxed and use wrists to turn rope.
4. Engage core and maintain soft landings.
5. Focus on rhythm and endurance.
6. Adjust pace as needed for control.
7. Stop gradually and safely.`,
    },
  },
  Strength: {
    Squat: {
      met: 5,
      instruction: `1. Stand with feet shoulder-width apart, toes slightly turned out.
2. Engage your core and keep chest upright.
3. Bend knees and hips to lower into a squat, keeping weight on your heels.
4. Lower until thighs are parallel to the floor (or as comfortable).
5. Press through heels to return to standing.
6. Maintain steady breathing throughout.`,
    },
    Deadlift: {
      met: 5,
      instruction: `1. Stand with feet shoulder-width apart and toes pointing forward.
2. Place a barbell on the ground in front of you.
3. Bend down and grip the barbell with both hands, palms facing down and hands shoulder-width apart.
4. Engage your core and lift the barbell off the ground, keeping your back straight and your arms fully extended.
5. As you lift the barbell, push your hips forward and stand up straight.
6. Hold the barbell at the top of the lift for a few seconds, then slowly lower it back down to the ground.
7. Repeat for desired number of reps.`,
    },
    "Kettlebell swing": {
      met: 9.8,
      instruction: `1. Stand with your feet shoulder-width apart and place the kettlebell on the ground in front of you.
2. Bend your knees slightly and hinge at the hips to grab the kettlebell with both hands.
3. Engage your core and swing the kettlebell back between your legs.
4. Drive your hips forward and swing the kettlebell up to shoulder height, keeping your arms straight.
5. Allow the kettlebell to swing back down between your legs and repeat for desired number of reps.
6. When finished, gently place the kettlebell back on the ground in front of you.`,
    },
    "Push-up": {
      met: 3,
      instruction: `1. Start in a plank position with your hands placed slightly wider than shoulder-width apart, and your feet together. Make sure your body forms a straight line from your head to your heels, with your core engaged.
2. Begin lowering your body by bending your elbows, keeping them close to your torso, as you maintain a straight body alignment.
3. Continue lowering your body until your chest is close to or lightly touches the ground.
4. Push yourself back up by straightening your arms and returning to the starting plank position, while maintaining proper body alignment.
5. Repeat the push-up for the desired number of repetitions, maintaining proper form throughout the exercise.`,
    },
    Lunge: {
      met: 3,
      instruction: `1. Stand tall, feet hip-width apart.
2. Step one leg forward, bending both knees to ~90 degrees.
3. Keep front knee above ankle, back knee hovering above floor.
4. Push through front heel to return to standing.
5. Repeat on other leg.`,
    },
    "Pull-up": {
      met: 3.8,
      instruction: `1. Find a sturdy pull-up bar that can support your weight.
2. Stand underneath the bar and reach up to grab it with both hands, palms facing away from you and hands shoulder-width apart.
3. Hang from the bar with your arms fully extended and your feet off the ground.
4. Engage your core and pull your shoulder blades down and back.
5. Bend your elbows and pull your chest towards the bar, keeping your elbows close to your body.
6. Continue pulling until your chin is above the bar.
7. Pause briefly at the top of the movement, then slowly lower yourself back down to the starting position.
8. Repeat for desired number of reps.`,
    },
    Plank: {
      met: 2.8,
      instruction: `1. Lie face down on an exercise mat with your elbows to your sides, your head facing forward, and palms flat on the floor.
2. Engaging your core and glutes, raise your body from the floor, supporting your weight on your forearms and toes while breathing freely. Concentrate on maintaining a straight line through your core and legs.
3. Hold the plank position, maintaining good form and keeping your glutes tensed, then return to the start position slowly and with good control.`,
    },
    "Front squat": {
      met: 5,
      instruction: `1. Start by standing with your feet shoulder-width apart and your toes pointing slightly outward.
2. Grasp the barbell with an overhand grip, with your hands slightly wider than shoulder-width apart.
3. Bring the barbell up to your shoulders, resting it on your collarbone and front deltoids.
4. Engage your core and keep your chest up as you lower your body into a squat, bending at the knees and hips.
5. Lower your body until your thighs are parallel to the ground, or as low as you can comfortably go.
6. Pause briefly at the bottom of the squat, then push through your heels to stand back up to the starting position.
7. Repeat for the desired number of repetitions.`,
    },
    "Goblet squat": {
      met: 5,
      instruction: `1. Stand with your feet shoulder-width apart and hold a dumbbell vertically with both hands at chest level.
2. Squat down by bending your knees and pushing your hips back, keeping your chest up and your back straight.
3. Lower yourself until your thighs are parallel to the ground.
4. Pause for a moment, then push through your heels to stand back up to the starting position.
5. Repeat for the desired number of repetitions.`,
    },
    "Bulgarian split squat": {
      met: 3.5,
      instruction: `1. Stand with your back facing the chair and place your left foot on the seat of the chair.
2. Step your right foot forward and lower your body down into a lunge position, keeping your left foot elevated on the chair.
3. Make sure your right knee is directly above your ankle and your left knee is hovering just above the chair.
4. Push through your right heel to stand back up to the starting position.
5. Repeat for the desired number of reps on one side before switching to the other side.`,
    },
    "Leg press": {
      met: 3.5,
      instruction: `1. Sit on the seat with your back against the backrest and your feet resting flat on the platform. Your knees should be bent at a 90-degree angle.
2. Add weight plates to the machine according to your desired intensity level. Start with a weight that you can comfortably handle and gradually increase it as you progress.
3. Position your feet hip-width apart on the platform, with toes pointing forward or slightly outward. Ensure your feet are placed firmly and securely on the platform.
4. Grip the handles or side supports of the machine for stability. Take a deep breath and brace your core muscles.
5. Push against the platform with your feet and extend your legs, driving the platform away from your body. Keep your back against the seat throughout the movement and avoid locking your knees at the top of the movement.
6. Slowly bend your knees and lower the weight back down, allowing your knees to reach a 90-degree angle or slightly beyond without letting the weight touch down completely.
7. Complete the desired number of repetitions, maintaining control and proper form throughout the exercise.`,
    },
    "Romanian deadlift": {
      met: 5,
      instruction: `1. Stand with your feet shoulder-width apart and hold a dumbbell in each hand with an overhand grip.
2. Keeping your back straight, hinge at the hips and lower the dumbbells towards the ground, keeping them close to your legs.
3. Lower the dumbbells until you feel a stretch in your hamstrings, then slowly return to the starting position.
4. Repeat for the desired number of reps.`,
    },
    "Barbell Incline Bench Press": {
      met: 3.5,
      instruction: `1. Set up the bench at a 45-degree angle.
2. Lie down on the bench with your feet flat on the ground and your back pressed firmly against the bench.
3. Grasp the barbell with an overhand grip, hands slightly wider than shoulder-width apart.
4. Lift the barbell off the rack and hold it directly above your chest with your arms fully extended.
5. Lower the barbell slowly and under control until it touches your chest.
6. Push the barbell back up to the starting position, exhaling as you lift.
7. Repeat for the desired number of repetitions.
8. When finished, carefully rack the barbell back on the rack.`,
    },
    "Barbell Overhead Press (high)": {
      met: 3.5,
      instruction: `1. Start by sitting on a bench with your feet flat on the ground and your back straight.
2. Grasp the barbell with an overhand grip, slightly wider than shoulder-width apart.
3. Lift the barbell up to shoulder height, keeping your elbows bent and close to your body.
4. Press the barbell up and overhead, extending your arms fully.
5. Lower the barbell back down to shoulder height, keeping your elbows close to your body.
6. Repeat for the desired number of repetitions.`,
    },
    "Barbell Row": {
      met: 3.5,
      instruction: `1. Stand about shoulder-width apart in front of a barbell lying on the ground.
2. Bend your knees slightly, keep your back straight (not rounded), and grip the barbell using your preferred grip.
3. Lift the barbell with a straight back and stand up. The barbell should be in front of your thighs.
4. Bend your upper body forward as described above and stick your butt out. Maintain a straight back with a slight arch. The barbell should still be securely in your hands and in front of your shins.
5. Tighten your abdominal muscles and pull your shoulders back slightly. You are now in the starting position.
6. Pull the barbell up towards your stomach in a controlled movement without momentum. Keep your back straight throughout the exercise.
7. Hold this position briefly before lowering the weight back to the starting position in a controlled manner.`,
    },
    "Barbell Snatch": {
      met: 6,
      instruction: `1. Start with the barbell on the ground in front of you, with your feet shoulder-width apart and your toes pointing forward.
2. Bend down and grip the barbell with your hands slightly wider than shoulder-width apart, palms facing down.
3. Stand up, keeping your back straight and your arms extended.
4. Bend your knees slightly and explosively pull the barbell up towards your chest, keeping it close to your body.
5. As the barbell reaches chest height, quickly rotate your elbows underneath the bar and press it overhead, locking out your arms.
6. Lower the barbell back down to the starting position, keeping it close to your body and bending your knees slightly to absorb the impact.
7. Repeat for the desired number of reps.`,
    },
    "Barbell Hip Thrust": {
      met: 3.5,
      instruction: `1. Start by sitting on the ground with your back against a bench or box and a barbell resting on your lap.
2. Place your feet flat on the ground with your knees bent and your heels close to your glutes.
3. Engage your core and glutes, and lift the barbell up so that it is resting on your hips.
4. Slowly lower your hips towards the ground, keeping your core and glutes engaged.
5. Once your hips are just above the ground, push through your heels and lift your hips back up to the starting position.
6. Repeat for the desired number of reps.`,
    },
  },
};

function buildWorkoutsByType(): Record<WorkoutType, readonly string[]> {
  return {
    Yoga: Object.keys(WORKOUT_DETAILS.Yoga) as readonly string[],
    Cardio: Object.keys(WORKOUT_DETAILS.Cardio) as readonly string[],
    HIIT: Object.keys(WORKOUT_DETAILS.HIIT) as readonly string[],
    Strength: Object.keys(WORKOUT_DETAILS.Strength) as readonly string[],
  };
}

/** Canonical list per type (only catalogued workouts). */
export const WORKOUTS_BY_TYPE: Record<WorkoutType, readonly string[]> = buildWorkoutsByType();

export function getWorkoutDetail(type: string, name: string): WorkoutDetail | null {
  const t = type as WorkoutType;
  const byType = WORKOUT_DETAILS[t];
  if (!byType) return null;
  return byType[name] ?? null;
}

export function getWorkoutMet(type: string, name: string): number | null {
  const d = getWorkoutDetail(type, name);
  return d ? d.met : null;
}

export function isCatalogWorkout(type: string, name: string): boolean {
  return getWorkoutDetail(type, name) != null;
}

export function replacementWorkoutForDay(type: WorkoutType, day: number): string {
  const pool = WORKOUTS_BY_TYPE[type];
  if (!pool.length) return "";
  return pool[(Math.max(1, day) - 1) % pool.length];
}

/** Replace unknown workout names with a deterministic valid one; returns null if unchanged. */
export function sanitizeActiveWorkoutPlan(plan: ActiveWorkoutPlanLike | null): ActiveWorkoutPlanLike | null {
  if (!plan?.schedule?.length) return plan;
  let changed = false;
  const schedule = plan.schedule.map((row) => {
    const wt = row.type as WorkoutType;
    if (isCatalogWorkout(row.type, row.workout)) return row;
    changed = true;
    const next = replacementWorkoutForDay(wt, row.day);
    return { ...row, workout: next || row.workout };
  });
  if (!changed) return plan;
  return { ...plan, schedule };
}

export function plansEqual(a: ActiveWorkoutPlanLike | null, b: ActiveWorkoutPlanLike | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
