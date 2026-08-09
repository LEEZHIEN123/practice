import "./lib/firebasePolyfills";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

 
export const firebaseConfig = {
  apiKey: "AIzaSyBRgSUWNUgTOf4uGrR1yn8XmfvXf5-YCyg",
  authDomain: "fitnessapplication-25add.firebaseapp.com",
  projectId: "fitnessapplication-25add",
  storageBucket: "fitnessapplication-25add.firebasestorage.app",
  messagingSenderId: "809477205543",
  appId: "1:809477205543:web:a8a2ba672cf967e1bee802",
  measurementId: "G-CL3V4QZC15",
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.warn("Firebase is not configured. Set values in firebaseConfig.js.");
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function createAuth() {
  if (Platform.OS === "web") {
    return getAuth(app);
  }
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } catch (e) {
    const code = e?.code ?? "";
    if (code === "auth/already-initialized") {
      return getAuth(app);
    }
    throw e;
  }
}

export const auth = createAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
