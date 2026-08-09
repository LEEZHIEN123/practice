import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Record that this email belongs to an app account (for forgot-password checks). */
export async function registerAccountEmail(uid: string, email: string): Promise<void> {
  const cleanEmail = normalizeAccountEmail(email);
  if (!uid || !cleanEmail) return;
  await setDoc(
    doc(db, "accountEmails", cleanEmail),
    {
      uid,
      email: cleanEmail,
      createdAt: Date.now(),
    },
    { merge: true }
  );
}

/** Returns true when this email is registered in the app. */
export async function isRegisteredAccountEmail(email: string): Promise<boolean> {
  const cleanEmail = normalizeAccountEmail(email);
  if (!cleanEmail) return false;
  const snap = await getDoc(doc(db, "accountEmails", cleanEmail));
  return snap.exists();
}

export async function removeAccountEmail(email: string | null | undefined): Promise<void> {
  const cleanEmail = normalizeAccountEmail(email ?? "");
  if (!cleanEmail) return;
  await deleteDoc(doc(db, "accountEmails", cleanEmail));
}

/** Best-effort backfill for older accounts created before the registry existed. */
export async function backfillAccountEmailIfSignedIn(): Promise<void> {
  const user = auth.currentUser;
  if (!user?.email || !user.uid) return;
  try {
    await registerAccountEmail(user.uid, user.email);
  } catch {
    // Non-blocking.
  }
}
