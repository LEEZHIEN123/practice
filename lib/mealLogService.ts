import { formatCalendarDayKey, getDeviceIanaTimezone } from "@/lib/calendarDay";
import { upsertMealHistory, descriptionsToLegacyString, normalizeMealDescriptions } from "@/lib/mealLogHistory";
import { isManualMealType } from "@/lib/manualMealTypes";
import { auth, db } from "../firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";

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
};

export async function logMealFood(input: LogMealInput): Promise<void> {
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

  await addDoc(collection(db, "users", user.uid, "mealLogs"), {
    title,
    calories,
    source: input.source,
    ...(description ? { description } : {}),
    ...(descriptionSections.length > 0 ? { descriptionSections } : {}),
    ...(input.photoUri ? { photoUri: input.photoUri } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.foodId ? { foodId: input.foodId } : {}),
    ...(input.barcode ? { barcode: input.barcode } : {}),
    ...(input.proteinG != null ? { proteinG: input.proteinG } : {}),
    ...(input.carbsG != null ? { carbsG: input.carbsG } : {}),
    ...(input.fatG != null ? { fatG: input.fatG } : {}),
    ...(input.servings != null ? { servings: input.servings } : {}),
    createdAt: serverTimestamp(),
    logDate: Timestamp.fromDate(day),
  });

  await setDoc(
    doc(db, "users", user.uid, "dailyStats", dayKey),
    {
      consumedKcal: increment(calories),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (input.saveToHistory !== false) {
    await upsertMealHistory(user.uid, {
      title,
      calories,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
      mealType: isManualMealType(input.category) ? input.category : undefined,
      description,
      descriptionSections,
      photoUri: input.photoUri,
    });
  }
}
