import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebaseConfig";
import { checkIsAdmin, COMMUNITY_ADMIN_EMAIL } from "./communityService";
import { deleteUserFirestoreProfile } from "./deleteUserAccount";

export async function adminResendPasswordResetEmail(email: string): Promise<void> {
  if (!(await checkIsAdmin())) throw new Error("Admin only");

  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("Please enter a valid email address.");
  }

  await sendPasswordResetEmail(auth, cleanEmail);
}

export async function adminDeleteUserAccount(
  targetUserId: string,
  targetEmail: string
): Promise<void> {
  if (!(await checkIsAdmin())) throw new Error("Admin only");

  const cleanEmail = targetEmail.trim().toLowerCase();
  if (cleanEmail === COMMUNITY_ADMIN_EMAIL.toLowerCase()) {
    throw new Error("Cannot delete the admin account.");
  }

  const currentUid = auth.currentUser?.uid;
  if (currentUid === targetUserId) {
    throw new Error("You cannot delete your own account here. Use Profile settings instead.");
  }

  await deleteUserFirestoreProfile(targetUserId);
}
