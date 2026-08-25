/** Registered by WorkoutSessionProvider to finish an active workout before sign-out. */
let workoutLogoutCleanup: (() => Promise<void>) | null = null;

export function registerWorkoutLogoutCleanup(fn: (() => Promise<void>) | null) {
  workoutLogoutCleanup = fn;
}

/** Call before Firebase signOut so Firestore writes still have a valid auth token. */
export async function completeWorkoutBeforeLogout(): Promise<void> {
  if (!workoutLogoutCleanup) return;
  try {
    await workoutLogoutCleanup();
  } catch {
    /* ignore — logout should still proceed */
  }
}
