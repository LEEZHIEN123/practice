import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBRgSUWNUgTOf4uGrR1yn8XmfvXf5-YCyg",
  authDomain: "fitnessapplication-25add.firebaseapp.com",
  projectId: "fitnessapplication-25add",
  storageBucket: "fitnessapplication-25add.firebasestorage.app",
  messagingSenderId: "809477205543",
  appId: "1:809477205543:web:a8a2ba672cf967e1bee802",
  measurementId: "G-CL3V4QZC15",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Persist auth session on React Native (keeps users signed in)
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
