import { auth, storage } from "../firebaseConfig";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

export function isRemoteImageUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri.trim());
}

async function localUriToBlob(uri: string): Promise<Blob> {
  if (uri.startsWith("file://") || uri.startsWith("content://")) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
          resolve(xhr.response as Blob);
          return;
        }
        reject(new Error("Could not read the photo."));
      };
      xhr.onerror = () => reject(new Error("Could not read the photo."));
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  }

  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read the photo.");
  return response.blob();
}

/** Upload a local AI coach chat photo to Firebase Storage; returns a download URL. */
export async function uploadAiCoachImage(localUri: string, messageId: string): Promise<string> {
  const trimmed = localUri.trim();
  if (!trimmed) throw new Error("No photo selected.");
  if (isRemoteImageUri(trimmed)) return trimmed;

  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to attach photos to your chat.");

  const blob = await localUriToBlob(trimmed);
  if (blob.size < 1) throw new Error("The selected photo is empty.");
  if (blob.size > 10 * 1024 * 1024) {
    throw new Error("The photo must be smaller than 10 MB.");
  }

  const safeId = messageId.replace(/[^\w.-]/g, "_");
  const objectRef = ref(storage, `users/${user.uid}/aiCoach/${safeId}.jpg`);
  await uploadBytes(objectRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(objectRef);
}
