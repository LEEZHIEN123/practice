import {
  collection,
  collectionGroup,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

export type AchievementCategory = "workout" | "meal" | "community" | "streaks";
export type AchievementFilter = "all" | AchievementCategory;

export type AchievementStatePersisted = {
  lastOpenDate?: string;
  loginStreak?: number;
  lastWorkoutPlanDate?: string;
  workoutPlanDays?: number;
  unlockedAchievements?: string[];
};

export type AchievementRowModel = {
  id: string;
  title?: string;
  label: string;
  variant: "done" | "progress";
  rightLabel: string;
  isComplete: boolean;
};

export type AchievementSectionModel = {
  category: AchievementCategory;
  completedCount: number;
  totalCount: number;
  rows: AchievementRowModel[];
  /** Meal & community tracks are not live yet */
  comingSoon?: boolean;
};

export function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdAddDays(ymd: string, delta: number): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localYmd(dt);
}

function isProfileComplete(data: Record<string, unknown>): boolean {
  return Boolean(
    data.name &&
    typeof data.height === "number" &&
    data.height > 0 &&
    typeof data.weight === "number" &&
    data.weight > 0 &&
    data.activityLevel
  );
}

function mergeAchievementState(
  data: Record<string, unknown>
): AchievementStatePersisted {
  const raw = data.achievementState;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as AchievementStatePersisted) };
  }
  return {};
}

function computeLoginStreakUpdate(
  prev: AchievementStatePersisted,
  today: string
): { next: AchievementStatePersisted; shouldPersist: boolean } {
  const last = prev.lastOpenDate;
  if (last === today) {
    return { next: prev, shouldPersist: false };
  }
  const yesterday = ymdAddDays(today, -1);
  let loginStreak = prev.loginStreak ?? 0;
  if (last === yesterday) loginStreak = (prev.loginStreak ?? 0) + 1;
  else loginStreak = 1;
  return {
    next: { ...prev, lastOpenDate: today, loginStreak },
    shouldPersist: true,
  };
}

type AchievementMetrics = {
  weightLogCount: number;
  workoutLogCount: number;
  discoverWorkoutLogCount: number;
  completedSessionCount: number;
  waterLogCount: number;
  mealLogCount: number;
  stepDays3000Count: number;
  stepDays5000Count: number;
  stepDays8000Count: number;
  community: CommunityAchievementMetrics;
};

type CommunityAchievementMetrics = {
  postCount: number;
  commentCount: number;
  chatMessageCount: number;
  likeGivenCount: number;
  friendCount: number;
  activeDayCount: number;
  challengeEngaged: boolean;
  welcomed: boolean;
};

export type { CommunityAchievementMetrics };

const EMPTY_COMMUNITY_METRICS: CommunityAchievementMetrics = {
  postCount: 0,
  commentCount: 0,
  chatMessageCount: 0,
  likeGivenCount: 0,
  friendCount: 0,
  activeDayCount: 0,
  challengeEngaged: false,
  welcomed: false,
};

function hasChallengeTag(tags: unknown): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some(
    (tag) => typeof tag === "string" && tag.trim().toLowerCase().includes("challenge")
  );
}

function addActivityDay(days: Set<string>, createdAt: unknown) {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return;
  days.add(localYmd(new Date(createdAt)));
}

async function loadCommunityMetrics(uid: string): Promise<CommunityAchievementMetrics> {
  try {
  const [postsSnap, commentsSnap, likesSnap, messagesSnap, friendsSnap] = await Promise.all([
    getDocs(query(collection(db, "communityPosts"), where("authorId", "==", uid))),
    getDocs(query(collectionGroup(db, "comments"), where("authorId", "==", uid))),
    getDocs(query(collection(db, "communityPosts"), where("likedBy", "array-contains", uid))),
    getDocs(query(collectionGroup(db, "messages"), where("senderId", "==", uid))),
    getCountFromServer(collection(db, "users", uid, "friends")),
  ]);

  const postCount = postsSnap.size;
  const commentCount = commentsSnap.size;
  const chatMessageCount = messagesSnap.size;
  const likeGivenCount = likesSnap.size;
  const friendCount = friendsSnap.data().count;

  const activeDays = new Set<string>();
  let challengeEngaged = false;

  postsSnap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    addActivityDay(activeDays, data.createdAt);
    if (hasChallengeTag(data.tags)) challengeEngaged = true;
  });

  commentsSnap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    addActivityDay(activeDays, data.createdAt);
  });

  messagesSnap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    addActivityDay(activeDays, data.createdAt);
  });

  likesSnap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    if (hasChallengeTag(data.tags)) challengeEngaged = true;
  });

  if (!challengeEngaged && commentCount > 0) {
    const commentPostIds = [
      ...new Set(
        commentsSnap.docs
          .map((docSnap) => {
            const data = docSnap.data() as { postId?: string };
            return data.postId ?? docSnap.ref.parent.parent?.id ?? "";
          })
          .filter(Boolean)
      ),
    ];
    for (let i = 0; i < commentPostIds.length; i += 10) {
      const batch = commentPostIds.slice(i, i + 10);
      const snaps = await Promise.all(
        batch.map((postId) => getDoc(doc(db, "communityPosts", postId)))
      );
      if (snaps.some((snap) => snap.exists() && hasChallengeTag(snap.data().tags))) {
        challengeEngaged = true;
        break;
      }
    }
  }

  const welcomed =
    friendCount >= 1 || postCount >= 1 || commentCount >= 1 || chatMessageCount >= 1;

  return {
    postCount,
    commentCount,
    chatMessageCount,
    likeGivenCount,
    friendCount,
    activeDayCount: activeDays.size,
    challengeEngaged,
    welcomed,
  };
  } catch (e) {
    console.log("Community achievement metrics unavailable:", e);
    return { ...EMPTY_COMMUNITY_METRICS };
  }
}

/** Load community stats used by community achievement rows. */
export async function loadCommunityAchievementMetrics(
  uid: string
): Promise<CommunityAchievementMetrics> {
  return loadCommunityMetrics(uid);
}

function progressRow(
  id: string,
  label: string,
  current: number,
  target: number
): AchievementRowModel {
  const isComplete = current >= target;
  return {
    id,
    label,
    variant: isComplete ? "done" : "progress",
    rightLabel: isComplete ? "DONE" : `${Math.min(current, target)} / ${target}`,
    isComplete,
  };
}

function doneRow(id: string, label: string, isComplete: boolean): AchievementRowModel {
  return {
    id,
    label,
    variant: "done",
    rightLabel: isComplete ? "DONE" : "—",
    isComplete,
  };
}

function titleFromId(id: string): string {
  const titles: Record<string, string> = {
    wo_profile: "Profile Complete",
    wo_goal: "Goal Set",
    wo_plan_generated: "Plan Generated",
    wo_plan_days: "Plan Explorer",
    wo_first_complete: "First Workout",
    wo_complete_10: "Workout Regular",
    wo_complete_25: "Workout Champion",
    wo_complete_50: "Workout Legend",
    wo_discover_5: "Workout Explorer",
    wo_weight_first: "First Weigh-In",
    ml_water_first: "First Hydration Log",
    ml_water_5: "Hydration Habit",
    ml_water_20: "Hydration Pro",
    ml_meal_reminder: "Meal Reminder Set",
    ml_water_reminder: "Water Reminder Set",
    ml_repeat_days: "Repeat Days Enabled",
    ml_water_50: "Hydration Master",
    ml_meal_first: "Meal Starter",
    ml_meal_10: "Meal Tracker",
    ml_meal_25: "Nutrition Builder",
    cm_welcome: "Community Welcome",
    cm_first_chat: "First Chat",
    cm_first_reply: "Helpful Reply",
    cm_challenge: "Challenge Junior",
    cm_likes_10: "Supportive Member",
    cm_active_7: "Active Voice",
    cm_first_post: "First Post",
    cm_friend_3: "Social Circle",
    cm_posts_5: "Content Creator",
    cm_champion: "Community Legend",
    st_steps_first: "First Step Day",
    st_steps_3: "Step Starter",
    st_steps_7: "Daily Walker",
    st_steps_14: "Step Explorer",
    st_water_first: "First Water Check-In",
    st_water_10: "Water Habit",
    st_water_30: "Hydration Champion",
    st_login_7: "Weekly Login",
    st_weight_first: "First Weigh-In",
    st_weight_10: "Weight Watcher",
  };
  return titles[id] ?? "Achievement";
}

export function achievementTitleFromId(id: string): string {
  return titleFromId(id);
}

function descriptionFromId(id: string): string {
  const descriptions: Record<string, string> = {
    wo_profile: "Complete your fitness profile",
    wo_goal: "Get your BMI analysis and goal",
    wo_plan_generated: "Generate your first workout plan",
    wo_plan_days: 'Open "View Full Plan" on 5 different days',
    wo_first_complete: "Complete your first workout",
    wo_complete_10: "Complete 10 workouts",
    wo_complete_25: "Complete 25 workouts",
    wo_complete_50: "Complete 50 workouts",
    wo_discover_5: "Complete 5 discover workouts",
    wo_weight_first: "Log your first weight",
    ml_water_first: "Log your first water intake",
    ml_water_5: "Log water intake 5 times",
    ml_water_20: "Log water intake 20 times",
    ml_meal_reminder: "Set at least 1 meal reminder",
    ml_water_reminder: "Set at least 1 water reminder",
    ml_repeat_days: "Enable reminders on 3+ repeat days",
    ml_water_50: "Log water intake 50 times",
    ml_meal_first: "Log your first meal",
    ml_meal_10: "Log 10 meals",
    ml_meal_25: "Log 25 meals",
    cm_welcome: "Post, chat, comment, or add a friend to get started",
    cm_first_chat: "Send your first message",
    cm_first_reply: "Reply to a community post",
    cm_challenge: "Join a weekly challenge with the challenge tag",
    cm_likes_10: "React to 10 messages",
    cm_active_7: "Participate for 7 days",
    cm_first_post: "Share your first post",
    cm_friend_3: "Add 3 friends",
    cm_posts_5: "Share 5 community posts",
    cm_champion: "Complete every community milestone",
    st_steps_first: "Reach 3,000 steps in a day",
    st_steps_3: "Reach 5,000 steps on 3 days",
    st_steps_7: "Reach 5,000 steps on 7 days",
    st_steps_14: "Reach 8,000 steps on 14 days",
    st_water_first: "Log your first water intake",
    st_water_10: "Log water intake 10 times",
    st_water_30: "Log water intake 30 times",
    st_login_7: "Open the app 7 days in a row",
    st_weight_first: "Log your first weight",
    st_weight_10: "Log your weight 10 times",
  };
  return descriptions[id] ?? "";
}

export function achievementDescriptionFromId(id: string): string {
  return descriptionFromId(id);
}

function buildSections(
  data: Record<string, unknown>,
  state: AchievementStatePersisted,
  metrics: AchievementMetrics
): AchievementSectionModel[] {
  const profileOk = isProfileComplete(data);
  const completedSessionCount = metrics.completedSessionCount;
  const waterLogCount = metrics.waterLogCount;
  const workoutDays = state.workoutPlanDays ?? 0;
  const stepDays3000Count = metrics.stepDays3000Count;
  const stepDays5000Count = metrics.stepDays5000Count;
  const stepDays8000Count = metrics.stepDays8000Count;
  const planGenerated = Boolean(
    (data as any)?.activeWorkoutPlan ||
      (data as any)?.planDuration ||
      ((data as any)?.workoutPlansByGoal &&
        typeof (data as any).workoutPlansByGoal === "object" &&
        Object.keys((data as any).workoutPlansByGoal).length > 0) ||
      ((data as any)?.workoutPlansByBmiGoal &&
        typeof (data as any).workoutPlansByBmiGoal === "object" &&
        Object.keys((data as any).workoutPlansByBmiGoal).length > 0)
  );
  const hasGoalAndBmi =
    typeof (data as any)?.bmi === "number" &&
    Number.isFinite((data as any)?.bmi) &&
    ((data as any)?.recommendedPlan === "gain" ||
      (data as any)?.recommendedPlan === "maintain" ||
      (data as any)?.recommendedPlan === "lose");
  const reminders = ((data as any)?.reminders ?? {}) as Record<string, any>;
  const reminderRepeatDays = Array.isArray((data as any)?.reminderRepeatDays)
    ? ((data as any).reminderRepeatDays as unknown[])
    : [];
  const reminderActiveDays = reminderRepeatDays.filter(Boolean).length;
  const mealReminderCount = Array.isArray(reminders?.meal?.times)
    ? reminders.meal.times.length
    : 0;
  const waterReminderCount = Array.isArray(reminders?.water?.times)
    ? reminders.water.times.length
    : 0;
  const community = metrics.community;
  const loginStreak = state.loginStreak ?? 0;
  const weightLogCount = metrics.weightLogCount;
  const mealLogCount = metrics.mealLogCount;
  const discoverWorkoutLogCount = metrics.discoverWorkoutLogCount;

  const welcomeDone = community.welcomed;
  const firstChatDone = community.chatMessageCount >= 1;
  const firstReplyDone = community.commentCount >= 1;
  const challengeDone = community.challengeEngaged;
  const likesDone = community.likeGivenCount >= 10;
  const activeDone = community.activeDayCount >= 7;
  const firstPostDone = community.postCount >= 1;
  const friendDone = community.friendCount >= 3;
  const postsDone = community.postCount >= 5;
  const championMilestonesDone = [
    welcomeDone,
    firstChatDone,
    firstReplyDone,
    challengeDone,
    likesDone,
    activeDone,
    firstPostDone,
    friendDone,
    postsDone,
  ].filter(Boolean).length;

  const workoutRows: AchievementRowModel[] = [
    doneRow("wo_profile", "Complete your fitness profile", profileOk),
    doneRow("wo_goal", "Get your BMI analysis and goal", hasGoalAndBmi),
    doneRow("wo_plan_generated", "Generate your first workout plan", planGenerated),
    progressRow("wo_plan_days", 'Open "View Full Plan" on 5 different days', workoutDays, 5),
    progressRow("wo_first_complete", "Complete your first workout", completedSessionCount, 1),
    progressRow("wo_complete_10", "Complete 10 workouts", completedSessionCount, 10),
    progressRow("wo_complete_25", "Complete 25 workouts", completedSessionCount, 25),
    progressRow("wo_complete_50", "Complete 50 workouts", completedSessionCount, 50),
    progressRow("wo_discover_5", "Complete 5 discover workouts", discoverWorkoutLogCount, 5),
    doneRow("wo_weight_first", "Log your first weight", weightLogCount >= 1),
  ];

  const mealRows: AchievementRowModel[] = [
    progressRow("ml_water_first", "Log your first water intake", waterLogCount, 1),
    progressRow("ml_water_5", "Log water intake 5 times", waterLogCount, 5),
    progressRow("ml_water_20", "Log water intake 20 times", waterLogCount, 20),
    progressRow("ml_meal_reminder", "Set at least 1 meal reminder", mealReminderCount, 1),
    progressRow("ml_water_reminder", "Set at least 1 water reminder", waterReminderCount, 1),
    progressRow("ml_repeat_days", "Enable reminders on 3+ repeat days", reminderActiveDays, 3),
    progressRow("ml_water_50", "Log water intake 50 times", waterLogCount, 50),
    progressRow("ml_meal_first", "Log your first meal", mealLogCount, 1),
    progressRow("ml_meal_10", "Log 10 meals", mealLogCount, 10),
    progressRow("ml_meal_25", "Log 25 meals", mealLogCount, 25),
  ];

  const communityRows: AchievementRowModel[] = [
    progressRow(
      "cm_welcome",
      "Post, chat, comment, or add a friend to get started",
      welcomeDone ? 1 : 0,
      1
    ),
    progressRow("cm_first_chat", "Send your first message", community.chatMessageCount, 1),
    progressRow("cm_first_reply", "Reply to a community post", community.commentCount, 1),
    progressRow(
      "cm_challenge",
      "Join a weekly challenge with the challenge tag",
      challengeDone ? 1 : 0,
      1
    ),
    progressRow("cm_likes_10", "React to 10 messages", community.likeGivenCount, 10),
    progressRow("cm_active_7", "Participate for 7 days", community.activeDayCount, 7),
    progressRow("cm_first_post", "Share your first post", community.postCount, 1),
    progressRow("cm_friend_3", "Add 3 friends", community.friendCount, 3),
    progressRow("cm_posts_5", "Share 5 community posts", community.postCount, 5),
    progressRow(
      "cm_champion",
      "Complete every community milestone",
      championMilestonesDone,
      9
    ),
  ];

  const streakRows: AchievementRowModel[] = [
    progressRow("st_steps_first", "Reach 3,000 steps in a day", stepDays3000Count, 1),
    progressRow("st_steps_3", "Reach 5,000 steps on 3 days", stepDays5000Count, 3),
    progressRow("st_steps_7", "Reach 5,000 steps on 7 days", stepDays5000Count, 7),
    progressRow("st_steps_14", "Reach 8,000 steps on 14 days", stepDays8000Count, 14),
    progressRow("st_water_first", "Log your first water intake", waterLogCount, 1),
    progressRow("st_water_10", "Log water intake 10 times", waterLogCount, 10),
    progressRow("st_water_30", "Log water intake 30 times", waterLogCount, 30),
    progressRow("st_login_7", "Open the app 7 days in a row", loginStreak, 7),
    doneRow("st_weight_first", "Log your first weight", weightLogCount >= 1),
    progressRow("st_weight_10", "Log your weight 10 times", weightLogCount, 10),
  ];

  const pack = (category: AchievementCategory, rows: AchievementRowModel[]): AchievementSectionModel => {
    const titledRows = rows.map((r) => ({ ...r, title: titleFromId(r.id) }));
    return {
      category,
      rows: titledRows,
      completedCount: titledRows.filter((r) => r.isComplete).length,
      totalCount: titledRows.length,
    };
  };

  return [
    pack("workout", workoutRows),
    pack("meal", mealRows),
    pack("community", communityRows),
    pack("streaks", streakRows),
  ];
}

function applyPersistedUnlocks(
  sections: AchievementSectionModel[],
  unlocked: Set<string>
): AchievementSectionModel[] {
  return sections.map((section) => {
    const rows = section.rows.map((row) => {
      const isComplete = row.isComplete || unlocked.has(row.id);
      return {
        ...row,
        isComplete,
        rightLabel: isComplete ? "DONE" : row.rightLabel,
        variant: isComplete ? "done" : row.variant,
      } as AchievementRowModel;
    });
    return {
      ...section,
      rows,
      completedCount: rows.filter((row) => row.isComplete).length,
      totalCount: rows.length,
    };
  });
}

/** Load user achievement data, sync login streak when opening Achievements, return UI models. */
export async function loadAndSyncAchievements(): Promise<AchievementSectionModel[] | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as Record<string, unknown>;
  let state = mergeAchievementState(data);
  const today = localYmd(new Date());
  const loginUpdate = computeLoginStreakUpdate(state, today);
  state = loginUpdate.next;

  const weightLogCountPromise = getCountFromServer(
    collection(db, "users", user.uid, "weightLogs")
  );
  const workoutLogCountPromise = getCountFromServer(
    collection(db, "users", user.uid, "workoutLogs")
  );
  const discoverWorkoutLogCountPromise = getCountFromServer(
    query(collection(db, "users", user.uid, "workoutLogs"), where("origin", "==", "discover"))
  );
  const completedSessionCountPromise = getCountFromServer(
    query(collection(db, "users", user.uid, "workoutSessions"), where("status", "==", "completed"))
  );
  const waterLogCountPromise = getCountFromServer(
    collection(db, "users", user.uid, "waterLogs")
  );
  const mealLogCountPromise = getCountFromServer(
    collection(db, "users", user.uid, "mealLogs")
  );
  const dailyStatsSnapPromise = getDocs(collection(db, "users", user.uid, "dailyStats"));
  const communityMetricsPromise = loadCommunityMetrics(user.uid);

  const [
    weightLogCountSnap,
    workoutLogCountSnap,
    discoverWorkoutLogCountSnap,
    completedSessionCountSnap,
    waterLogCountSnap,
    mealLogCountSnap,
    dailyStatsSnap,
    communityMetrics,
  ] = await Promise.all([
    weightLogCountPromise,
    workoutLogCountPromise,
    discoverWorkoutLogCountPromise,
    completedSessionCountPromise,
    waterLogCountPromise,
    mealLogCountPromise,
    dailyStatsSnapPromise,
    communityMetricsPromise,
  ]);

  let stepDays3000Count = 0;
  let stepDays5000Count = 0;
  let stepDays8000Count = 0;
  dailyStatsSnap.forEach((docSnap) => {
    const stats = docSnap.data() as { stepsAuto?: unknown; stepsManual?: unknown };
    const manual =
      typeof stats.stepsManual === "number" && Number.isFinite(stats.stepsManual)
        ? Math.max(0, Math.round(stats.stepsManual))
        : null;
    const auto =
      typeof stats.stepsAuto === "number" && Number.isFinite(stats.stepsAuto)
        ? Math.max(0, Math.round(stats.stepsAuto))
        : 0;
    const steps = manual != null ? manual : auto;
    if (steps >= 3000) stepDays3000Count += 1;
    if (steps >= 5000) stepDays5000Count += 1;
    if (steps >= 8000) stepDays8000Count += 1;
  });

  const rawSections = buildSections(data, state, {
    weightLogCount: weightLogCountSnap.data().count,
    workoutLogCount: workoutLogCountSnap.data().count,
    discoverWorkoutLogCount: discoverWorkoutLogCountSnap.data().count,
    completedSessionCount: completedSessionCountSnap.data().count,
    waterLogCount: waterLogCountSnap.data().count,
    mealLogCount: mealLogCountSnap.data().count,
    stepDays3000Count,
    stepDays5000Count,
    stepDays8000Count,
    community: communityMetrics,
  });

  const unlocked = new Set(state.unlockedAchievements ?? []);
  let unlocksGrew = false;
  for (const section of rawSections) {
    for (const row of section.rows) {
      if (row.isComplete && !unlocked.has(row.id)) {
        unlocked.add(row.id);
        unlocksGrew = true;
      }
    }
  }

  if (loginUpdate.shouldPersist || unlocksGrew) {
    state = { ...state, unlockedAchievements: [...unlocked] };
    await updateDoc(ref, { achievementState: state });
  }

  return applyPersistedUnlocks(rawSections, unlocked);
}

/** Record today's app open for login-streak achievements (safe to call on home focus). */
export async function syncDailyLoginStreak(uid: string): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;
  const prev = mergeAchievementState(data);
  const today = localYmd(new Date());
  const { next, shouldPersist } = computeLoginStreakUpdate(prev, today);
  if (!shouldPersist) return;
  await updateDoc(ref, { achievementState: next });
}

async function readMergeWrite(
  uid: string,
  mutator: (prev: AchievementStatePersisted) => AchievementStatePersisted | null
): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;
  const prev = mergeAchievementState(data);
  const next = mutator(prev);
  if (next == null) return;
  await updateDoc(ref, { achievementState: next });
}

export async function bumpWorkoutPlanDay(uid: string): Promise<void> {
  const today = localYmd(new Date());
  await readMergeWrite(uid, (prev) => {
    if (prev.lastWorkoutPlanDate === today) return null;
    return {
      ...prev,
      lastWorkoutPlanDate: today,
      workoutPlanDays: (prev.workoutPlanDays ?? 0) + 1,
    };
  });
}

