import { fetchSignInMethodsForEmail } from "firebase/auth";
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

/** Registry lookup with Firebase Auth fallback for older accounts. */
export async function isRegisteredAccountEmailWithFallback(
  email: string
): Promise<boolean> {
  const cleanEmail = normalizeAccountEmail(email);
  if (!cleanEmail) return false;

  try {
    if (await isRegisteredAccountEmail(cleanEmail)) return true;
  } catch {
    // Fall through to Auth lookup.
  }

  try {
    const methods = await fetchSignInMethodsForEmail(auth, cleanEmail);
    return methods.length > 0;
  } catch {
    return false;
  }
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

export type UserLoginFailureKind = "wrong-password" | "unregistered";

/** Decide whether a failed user login is a bad password or an unknown email. */
export async function resolveUserLoginFailureKind(
  email: string,
  authErrorCode: string | undefined
): Promise<UserLoginFailureKind> {
  const cleanEmail = normalizeAccountEmail(email);
  if (!cleanEmail) return "unregistered";

  let inRegistry = false;
  try {
    inRegistry = await isRegisteredAccountEmail(cleanEmail);
  } catch {
    inRegistry = false;
  }

  // Known app account → failed login means wrong password.
  if (inRegistry) {
    return "wrong-password";
  }

  // Legacy accounts may exist in Firebase Auth but not in accountEmails yet.
  try {
    const methods = await fetchSignInMethodsForEmail(auth, cleanEmail);
    if (methods.length > 0) {
      return "wrong-password";
    }
  } catch {
    // Auth lookup unavailable — fall through.
  }

  // Firebase returns invalid-credential for wrong passwords on existing Auth
  // accounts, including users not yet written to accountEmails.
  if (
    authErrorCode === "auth/invalid-credential" ||
    authErrorCode === "auth/wrong-password"
  ) {
    return "wrong-password";
  }

  if (authErrorCode === "auth/user-not-found") {
    return "unregistered";
  }

  return "wrong-password";
}
