 
 import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBRgSUWNUgTOf4uGrR1yn8XmfvXf5-YCyg",
  authDomain: "fitnessapplication-25add.firebaseapp.com",
  projectId: "fitnessapplication-25add",
  storageBucket: "fitnessapplication-25add.firebasestorage.app",
  messagingSenderId: "809477205543",
  appId: "1:809477205543:web:a8a2ba672cf967e1bee802",
  measurementId: "G-CL3V4QZC15"
};

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
