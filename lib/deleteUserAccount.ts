import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  type CollectionReference,
  type Query,
} from "firebase/firestore";
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth";
import { db } from "../firebaseConfig";

const USER_SUBCOLLECTIONS = [
  "weightLogs",
  "workoutLogs",
  "workoutSessions",
  "waterLogs",
  "mealLogs",
  "dailyStats",
  "friends",
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

async function deleteUserCommunityData(uid: string): Promise<void> {
  await safe(async () => {
    const postsSnap = await getDocs(
      query(collection(db, "communityPosts"), where("authorId", "==", uid))
    );
    for (const postDoc of postsSnap.docs) {
      await deleteCollectionDocs(collection(db, "communityPosts", postDoc.id, "comments"));
      await deleteDoc(postDoc.ref);
    }
  });

  await safe(() =>
    deleteQueryDocs(
      query(collectionGroup(db, "comments"), where("authorId", "==", uid))
    )
  );

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
      query(collection(db, "communityReports"), where("reporterId", "==", uid))
    )
  );
  await safe(() =>
    deleteQueryDocs(
      query(collection(db, "communityReports"), where("targetAuthorId", "==", uid))
    )
  );

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

export async function deleteUserFirestoreProfile(uid: string): Promise<void> {
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
  await deleteUserFirestoreProfile(user.uid);
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
