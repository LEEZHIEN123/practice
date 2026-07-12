import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebaseConfig";
import { checkIsAdmin } from "./communityService";

export async function adminResendPasswordResetEmail(email: string): Promise<void> {
  if (!(await checkIsAdmin())) throw new Error("Admin only");

  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("Please enter a valid email address.");
  }

  await sendPasswordResetEmail(auth, cleanEmail);
}
