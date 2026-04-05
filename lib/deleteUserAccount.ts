import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth";
import { auth, db } from "../firebaseConfig";

async function deleteUserSubcollections(uid: string): Promise<void> {
  const logsRef = collection(db, "users", uid, "weightLogs");
  const snap = await getDocs(logsRef);
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
