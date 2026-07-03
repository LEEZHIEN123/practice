import { auth, db, storage } from "../firebaseConfig";
import { doc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

export async function uploadAndSaveProfilePhoto(localUri: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Sign in to update your profile photo.");
  }

  const blob = await (await fetch(localUri)).blob();
  const objectRef = ref(storage, `users/${user.uid}/profile.jpg`);
  await uploadBytes(objectRef, blob, { contentType: "image/jpeg" });
  const profileImageUrl = await getDownloadURL(objectRef);

  await updateDoc(doc(db, "users", user.uid), {
    profileImage: profileImageUrl,
  });

  return profileImageUrl;
}
