import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
  type CollectionReference,
} from "firebase/firestore";
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth";
import { auth, db } from "../firebaseConfig";

const USER_SUBCOLLECTIONS = [
  "weightLogs",
  "workoutLogs",
  "workoutSessions",
  "waterLogs",
  "mealLogs",
  "dailyStats",
  "friends",
] as const;

async function deleteCollectionDocs(colRef: CollectionReference): Promise<void> {
  const snap = await getDocs(colRef);
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

async function deleteUserSubcollections(uid: string): Promise<void> {
  for (const subcollection of USER_SUBCOLLECTIONS) {
    await deleteCollectionDocs(collection(db, "users", uid, subcollection));
  }
}

export async function deleteUserFirestoreProfile(uid: string): Promise<void> {
  await deleteUserSubcollections(uid);
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
