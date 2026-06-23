/** User-facing message for Firebase Auth failures (register / login). */
export function firebaseAuthErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === "auth/email-already-in-use") {
    return "This email is already registered.";
  }
  if (code === "auth/invalid-email") {
    return "Please enter a valid email address.";
  }
  if (code === "auth/weak-password") {
    return "Password must be at least 6 characters.";
  }
  if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
    return "Email or password is incorrect.";
  }
  if (code === "auth/network-request-failed") {
    return "Could not reach Firebase. Check your internet connection, then restart the app with a cleared cache (npx expo start --clear). If this keeps happening, rebuild the dev client (npx expo run:android).";
  }
  const msg = (e as { message?: string })?.message;
  return msg && msg.length > 0 ? msg : "Something went wrong. Please try again.";
}
