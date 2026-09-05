import { formatCalendarDayKey, getDeviceIanaTimezone } from "@/lib/calendarDay";
import {
  upsertMealHistory,
  descriptionsToLegacyString,
  normalizeMealDescriptions,
  type MealHistoryEntry,
} from "@/lib/mealLogHistory";
import { isManualMealType } from "@/lib/manualMealTypes";
import { auth, db, storage } from "../firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentReference,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import * as ImageManipulator from "expo-image-manipulator";

export type MealLogSource = "dataset" | "barcode" | "search" | "manual";

export type LogMealInput = {
  title: string;
  calories: number;
  source: MealLogSource;
  category?: string;
  foodId?: string;
  barcode?: string;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  servings?: number;
  description?: string;
  descriptionSections?: string[];
  photoUri?: string;
  logDate?: Date;
  calendarTz?: string | null;
  saveToHistory?: boolean;
  /** Personalized nutrition guidance: plan day + plan identity for progress / Done state. */
  planDay?: number;
  planCreatedAt?: string | null;
  origin?: "nutritionPlan";
  /**
   * When true (default), local photos upload in the background after the meal is saved
   * so Log Meal does not wait on Storage.
   */
  deferPhotoUpload?: boolean;
};

export type LogMealResult = {
  history: MealHistoryEntry[] | null;
};

function isRemotePhotoUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri.trim());
}

async function localUriToBlob(uri: string): Promise<Blob> {
  if (uri.startsWith("file://") || uri.startsWith("content://") || uri.startsWith("ph://")) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
          resolve(xhr.response as Blob);
          return;
        }
        reject(new Error("Could not read meal photo."));
      };
      xhr.onerror = () => reject(new Error("Could not read meal photo."));
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  }

  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read meal photo.");
  return response.blob();
}

async function compressLocalPhoto(localUri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 1280 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri || localUri;
  } catch {
    return localUri;
  }
}

/** Upload a local meal photo to Firebase Storage; returns the download URL. */
export async function uploadMealPhoto(localUri: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to upload meal photos.");

  const trimmed = localUri.trim();
  if (!trimmed) throw new Error("Meal photo is missing.");
  if (isRemotePhotoUri(trimmed)) return trimmed;

  const compressedUri = await compressLocalPhoto(trimmed);
  const blob = await localUriToBlob(compressedUri);
  if (blob.size < 1) throw new Error("Could not read meal photo.");
  if (blob.size > 10 * 1024 * 1024) {
    throw new Error("Meal photo must be smaller than 10 MB.");
  }

  const objectRef = ref(storage, `users/${user.uid}/mealPhotos/${Date.now()}.jpg`);
  await uploadBytes(objectRef, blob, {
    contentType: blob.type || "image/jpeg",
  });
  return getDownloadURL(objectRef);
}

/** Resolve photoUri to a Storage download URL when it is still a local device path. */
export async function resolveMealPhotoUri(photoUri?: string | null): Promise<string | undefined> {
  const trimmed = photoUri?.trim();
  if (!trimmed) return undefined;
  return uploadMealPhoto(trimmed);
}

function attachPhotoInBackground(
  mealRef: DocumentReference,
  uid: string,
  localUri: string,
  historyTitle: string,
  calories: number,
  macros: { proteinG?: number; carbsG?: number; fatG?: number },
  mealType: string | undefined,
  description: string | undefined,
  descriptionSections: string[]
) {
  void (async () => {
    try {
      const remoteUrl = await uploadMealPhoto(localUri);
      await updateDoc(mealRef, { photoUri: remoteUrl });
      await upsertMealHistory(uid, {
        title: historyTitle,
        calories,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
        mealType: isManualMealType(mealType) ? mealType : undefined,
        description,
        descriptionSections,
        photoUri: remoteUrl,
      });
    } catch (e) {
      console.log("Background meal photo upload failed:", e);
    }
  })();
}

export async function logMealFood(input: LogMealInput): Promise<LogMealResult> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to log meals.");

  const calories = Math.round(input.calories);
  if (!Number.isFinite(calories) || calories <= 0 || calories > 20000) {
    throw new Error("Enter a valid calorie amount.");
  }

  const title = input.title.trim();
  if (!title) throw new Error("Enter a food name.");

  const logDate = input.logDate ?? new Date();
  const day = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate());
  const dayKey = formatCalendarDayKey(logDate, input.calendarTz ?? getDeviceIanaTimezone());
  const descriptionSections = normalizeMealDescriptions({
    descriptionSections: input.descriptionSections,
    description: input.description,
  });
  const description = descriptionsToLegacyString(descriptionSections);

  const planDay =
    typeof input.planDay === "number" && Number.isFinite(input.planDay) && input.planDay >= 1
      ? Math.floor(input.planDay)
      : null;
  const planCreatedAt =
    typeof input.planCreatedAt === "string" && input.planCreatedAt.trim().length > 0
      ? input.planCreatedAt.trim()
      : null;
  const fromNutritionPlan = input.origin === "nutritionPlan" && planDay != null;

  const rawPhoto = input.photoUri?.trim() || "";
  const deferPhoto = input.deferPhotoUpload !== false;
  const remoteReady = rawPhoto && isRemotePhotoUri(rawPhoto) ? rawPhoto : undefined;
  const localPending = rawPhoto && !isRemotePhotoUri(rawPhoto) ? rawPhoto : undefined;

  // Wait for photo only when caller opts out of deferred upload.
  let photoUri: string | undefined = remoteReady;
  if (localPending && !deferPhoto) {
    photoUri = await uploadMealPhoto(localPending);
  }

  const mealRef = await addDoc(collection(db, "users", user.uid, "mealLogs"), {
    title,
    calories,
    source: input.source,
    ...(description ? { description } : {}),
    ...(descriptionSections.length > 0 ? { descriptionSections } : {}),
    ...(photoUri ? { photoUri } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.foodId ? { foodId: input.foodId } : {}),
    ...(input.barcode ? { barcode: input.barcode } : {}),
    ...(input.proteinG != null ? { proteinG: input.proteinG } : {}),
    ...(input.carbsG != null ? { carbsG: input.carbsG } : {}),
    ...(input.fatG != null ? { fatG: input.fatG } : {}),
    ...(input.servings != null ? { servings: input.servings } : {}),
    ...(fromNutritionPlan ? { origin: "nutritionPlan", planDay } : {}),
    ...(fromNutritionPlan && planCreatedAt ? { planCreatedAt } : {}),
    createdAt: serverTimestamp(),
    logDate: Timestamp.fromDate(day),
  });

  const historyPhoto = photoUri || localPending;

  const statsPromise = setDoc(
    doc(db, "users", user.uid, "dailyStats", dayKey),
    {
      consumedKcal: increment(calories),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  const planPromise = fromNutritionPlan
    ? (async () => {
        try {
          const userRef = doc(db, "users", user.uid);
          const uSnap = await getDoc(userRef);
          const prevLcd = Number((uSnap.data() as any)?.activeNutritionPlanLastCompletedDay);
          const prevOk = Number.isFinite(prevLcd) && prevLcd >= 2;
          const repeatDay1AfterProgress = planDay === 1 && prevOk;
          if (!repeatDay1AfterProgress) {
            await updateDoc(userRef, {
              activeNutritionPlanLastCompletedDay: planDay,
              activeNutritionPlanLastCompletedAt: serverTimestamp(),
            } as any);
          }
        } catch (e) {
          console.log("Failed to advance nutrition plan day:", e);
        }
      })()
    : Promise.resolve();

  const historyPromise =
    input.saveToHistory !== false
      ? upsertMealHistory(user.uid, {
          title,
          calories,
          proteinG: input.proteinG,
          carbsG: input.carbsG,
          fatG: input.fatG,
          mealType: isManualMealType(input.category) ? input.category : undefined,
          description,
          descriptionSections,
          photoUri: historyPhoto,
        })
      : Promise.resolve(null as MealHistoryEntry[] | null);

  const [, , history] = await Promise.all([statsPromise, planPromise, historyPromise]);

  if (localPending && deferPhoto && !photoUri) {
    attachPhotoInBackground(
      mealRef,
      user.uid,
      localPending,
      title,
      calories,
      { proteinG: input.proteinG, carbsG: input.carbsG, fatG: input.fatG },
      input.category,
      description,
      descriptionSections
    );
  }

  return { history };
}
