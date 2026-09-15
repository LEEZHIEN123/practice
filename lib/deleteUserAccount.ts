import {
  arrayRemove,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
  type Query,
} from "firebase/firestore";
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth";
import { removeAccountEmail } from "@/lib/accountEmailRegistry";
import { addDaysToYmd, formatCalendarDayKey, getDeviceIanaTimezone } from "@/lib/calendarDay";
import { db } from "../firebaseConfig";

const USER_SUBCOLLECTIONS = [
  "weightLogs",
  "workoutLogs",
  "workoutSessions",
  "waterLogs",
  "mealLogs",
  "dailyStats",
  "friends",
  "commentedPosts",
  "aiCoach",
  "aiCoachSessions",
] as const;

async function deleteQueryDocs(q: Query | CollectionReference): Promise<void> {
  const snap = await getDocs(q);
  let batch = writeBatch(db);
  let n = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    n++;
    if (n >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

async function deleteCollectionDocs(colRef: CollectionReference): Promise<void> {
  await deleteQueryDocs(colRef);
}

async function safe(step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch {
    // Best-effort cleanup; continue with remaining steps.
  }
}

async function deleteUserSubcollections(uid: string): Promise<void> {
  await safe(async () => {
    const friendsSnap = await getDocs(collection(db, "users", uid, "friends"));
    let batch = writeBatch(db);
    let n = 0;
    for (const friendDoc of friendsSnap.docs) {
      batch.delete(doc(db, "users", friendDoc.id, "friends", uid));
      n++;
      if (n >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        n = 0;
      }
    }
    if (n > 0) await batch.commit();
  });

  for (const subcollection of USER_SUBCOLLECTIONS) {
    await safe(() =>
      deleteCollectionDocs(collection(db, "users", uid, subcollection))
    );
  }
}

async function removeUserLikesFromPosts(uid: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, "communityPosts"), where("likedBy", "array-contains", uid))
  );
  for (const postDoc of snap.docs) {
    const data = postDoc.data() as { likedBy?: unknown; likeCount?: unknown };
    const likedBy = Array.isArray(data.likedBy) ? data.likedBy.map(String) : [];
    if (!likedBy.includes(uid)) continue;
    await updateDoc(postDoc.ref, {
      likedBy: arrayRemove(uid),
      likeCount: Math.max(0, (Number(data.likeCount) || likedBy.length) - 1),
    }).catch(() => {});
  }
}

async function deleteUserCommunityData(uid: string): Promise<void> {
  // Posts authored by this user (and their comments).
  await safe(async () => {
    const postsSnap = await getDocs(
      query(collection(db, "communityPosts"), where("authorId", "==", uid))
    );
    for (const postDoc of postsSnap.docs) {
      await deleteCollectionDocs(collection(db, "communityPosts", postDoc.id, "comments"));
      await deleteDoc(postDoc.ref);
    }
  });

  // Comments left on other people's posts.
  await safe(() =>
    deleteQueryDocs(
      query(collectionGroup(db, "comments"), where("authorId", "==", uid))
    )
  );

  await safe(() => removeUserLikesFromPosts(uid));

  await safe(() =>
    deleteQueryDocs(
      query(collection(db, "communityPendingPosts"), where("authorId", "==", uid))
    )
  );
  await safe(() =>
    deleteQueryDocs(
      query(collection(db, "communityPendingComments"), where("authorId", "==", uid))
    )
  );
  await safe(() => deleteDoc(doc(db, "communityPendingAuthorReports", uid)));
  await safe(() =>
    deleteQueryDocs(
      query(collection(db, "communitySupportAutoMessages"), where("recipientId", "==", uid))
    )
  );
  await safe(() =>
    deleteQueryDocs(
      query(collection(db, "communitySupportAutoMessages"), where("createdBy", "==", uid))
    )
  );

  await safe(() =>
    deleteQueryDocs(
      query(collection(db, "friendRequests"), where("fromUserId", "==", uid))
    )
  );
  await safe(() =>
    deleteQueryDocs(
      query(collection(db, "friendRequests"), where("toUserId", "==", uid))
    )
  );

  await safe(() =>
    deleteQueryDocs(
      query(collection(db, "communityNotifications"), where("userId", "==", uid))
    )
  );
  await safe(() =>
    deleteQueryDocs(
      query(collection(db, "communityNotifications"), where("fromUserId", "==", uid))
    )
  );

  await safe(() =>
    deleteQueryDocs(
      query(collection(db, "communityReports"), where("reporterId", "==", uid))
    )
  );
  await safe(() =>
    deleteQueryDocs(
      query(collection(db, "communityReports"), where("targetAuthorId", "==", uid))
    )
  );

  // All direct / support chats involving this user.
  await safe(async () => {
    const chatsSnap = await getDocs(
      query(
        collection(db, "communityChats"),
        where("participants", "array-contains", uid)
      )
    );
    for (const chatDoc of chatsSnap.docs) {
      await deleteCollectionDocs(
        collection(db, "communityChats", chatDoc.id, "messages")
      );
      await deleteDoc(chatDoc.ref);
    }
  });
}

async function commitDeletes(refs: DocumentReference[]): Promise<void> {
  let batch = writeBatch(db);
  let n = 0;
  for (const ref of refs) {
    batch.delete(ref);
    n++;
    if (n >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

/** Remove this user from daily step ranking before dailyStats is deleted. */
async function deleteUserStepRankingEntries(uid: string): Promise<void> {
  const dayKeys = new Set<string>();

  await safe(async () => {
    const statsSnap = await getDocs(collection(db, "users", uid, "dailyStats"));
    for (const statsDoc of statsSnap.docs) {
      if (statsDoc.id) dayKeys.add(statsDoc.id);
    }
  });

  await safe(async () => {
    const userSnap = await getDoc(doc(db, "users", uid));
    const data = userSnap.data() as { timezone?: unknown } | undefined;
    const tz =
      typeof data?.timezone === "string" && data.timezone.trim()
        ? data.timezone.trim()
        : getDeviceIanaTimezone();
    const today = formatCalendarDayKey(new Date(), tz);
    dayKeys.add(today);
    dayKeys.add(addDaysToYmd(today, -1));
    dayKeys.add(formatCalendarDayKey(new Date(), "UTC"));
  });

  await safe(async () => {
    await commitDeletes(
      [...dayKeys].map((dayKey) => doc(db, "dailyStepRankings", dayKey, "entries", uid))
    );
  });
}

async function deleteUserRankingEntries(uid: string): Promise<void> {
  await deleteUserStepRankingEntries(uid);
  await safe(() => deleteDoc(doc(db, "achievementRankings", uid)));
  await safe(async () => {
    const snap = await getDocs(
      query(collectionGroup(db, "entries"), where("uid", "==", uid))
    );
    await commitDeletes(snap.docs.map((d) => d.ref));
  });
}

/** Deletes Firestore profile + community data for a user (posts, chats, friends, etc.). */
export async function deleteUserFirestoreProfile(uid: string): Promise<void> {
  // Rankings first: step entries are keyed by dailyStats day ids.
  await deleteUserRankingEntries(uid);
  await deleteUserSubcollections(uid);
  await deleteUserCommunityData(uid);
  await deleteDoc(doc(db, "users", uid));
}

export async function reauthenticateWithPassword(
  user: User,
  password: string
): Promise<void> {
  const email = user.email;
  if (!email) {
    throw new Error("This account has no email on file.");
  }
  const cred = EmailAuthProvider.credential(email, password);
  await reauthenticateWithCredential(user, cred);
}

/** Call only after a recent reauthenticateWithPassword (or other reauth). */
export async function deleteAccountAfterReauth(user: User): Promise<void> {
  const email = user.email;
  await deleteUserFirestoreProfile(user.uid);
  await safe(() => removeAccountEmail(email));
  await deleteUser(user);
}

/** One-shot: password reauth + delete all user data + delete Auth user. */
export async function deleteAccountWithPassword(
  user: User,
  password: string
): Promise<void> {
  await reauthenticateWithPassword(user, password);
  await deleteAccountAfterReauth(user);
}
