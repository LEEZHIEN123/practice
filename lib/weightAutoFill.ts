import { addDaysToYmd, formatCalendarDayKey, localDateFromYmd } from "@/lib/calendarDay";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";

export type WeightLogRow = { weight: number; createdAt: Date };

export function weightLogDayKey(date: Date, calendarTz: string | null): string {
  return formatCalendarDayKey(date, calendarTz ?? "UTC");
}

/** Latest weight per calendar day (rows should be newest-first). */
export function buildLatestWeightByDay(
  rows: WeightLogRow[],
  calendarTz: string | null
): Map<string, number> {
  const latestByDay = new Map<string, number>();
  for (const row of rows) {
    const key = weightLogDayKey(row.createdAt, calendarTz);
    if (!latestByDay.has(key)) latestByDay.set(key, row.weight);
  }
  return latestByDay;
}

/**
 * Build daily weight series:
 * - Past days without a log: carry forward last known, else current profile weight
 * - Today without a log: 0 (not filled until user logs)
 * - Future days: 0
 */
export function buildWeightSeriesForDays(
  dayKeys: string[],
  latestByDay: Map<string, number>,
  currentWeightKg: number,
  todayKey: string
): number[] {
  let lastKnown = 0;
  return dayKeys.map((key) => {
    if (key > todayKey) return 0;

    const logged = latestByDay.get(key);
    if (typeof logged === "number" && logged > 0) {
      lastKnown = logged;
      return logged;
    }

    if (key < todayKey) {
      if (lastKnown > 0) return lastKnown;
      return currentWeightKg > 0 ? currentWeightKg : 0;
    }

    return 0;
  });
}

/**
 * Build week/month/year bucket series with the same rules as daily:
 * slots after the current period index stay 0; past gaps carry forward.
 */
export function buildWeightBucketSeries(
  bucketValues: (number | null)[],
  currentSlotIndex: number | null,
  currentWeightKg: number
): number[] {
  let lastKnown = 0;
  return bucketValues.map((value, index) => {
    if (currentSlotIndex != null && index > currentSlotIndex) return 0;

    if (typeof value === "number" && value > 0) {
      lastKnown = value;
      return value;
    }

    if (currentSlotIndex != null && index < currentSlotIndex) {
      if (lastKnown > 0) return lastKnown;
      return currentWeightKg > 0 ? currentWeightKg : 0;
    }

    return 0;
  });
}

/** Bar height scaled to weight differences (ignores zero slots for range). */
export function weightBarHeight(
  value: number,
  series: number[],
  minHeight = 10,
  maxHeight = 50
): number {
  if (value <= 0) return minHeight;

  const dataValues = series.filter((v) => v > 0);
  if (!dataValues.length) return minHeight;

  const min = Math.min(...dataValues);
  const max = Math.max(...dataValues);
  const padding = Math.max(0.5, (max - min) * 0.15, max === min ? 1 : 0);
  const floor = min - padding;
  const ceiling = max + padding;
  const span = ceiling - floor || 1;

  return minHeight + Math.round(((value - floor) / span) * (maxHeight - minHeight));
}

export function hasWeightLogForDay(
  rows: WeightLogRow[],
  dayKey: string,
  calendarTz: string | null
): boolean {
  return rows.some((row) => weightLogDayKey(row.createdAt, calendarTz) === dayKey);
}

/** Write a midnight auto-fill entry when the user did not log weight for that past day. */
export async function ensureWeightAutoFilledForDay(params: {
  uid: string;
  dayKey: string;
  weightKg: number;
  calendarTz: string | null;
  existingRows: WeightLogRow[];
  todayKey: string;
}): Promise<boolean> {
  const { uid, dayKey, weightKg, calendarTz, existingRows, todayKey } = params;
  if (weightKg <= 0) return false;
  if (dayKey >= todayKey) return false;
  if (hasWeightLogForDay(existingRows, dayKey, calendarTz)) return false;

  const midnight = localDateFromYmd(dayKey);
  const ts = Timestamp.fromDate(midnight);

  await addDoc(collection(db, "users", uid, "weightLogs"), {
    weight: weightKg,
    createdAt: ts,
    logDate: ts,
    autoFilled: true,
  });
  return true;
}

/** Auto-fill missed past days only (not today or future) with current profile weight at midnight. */
export async function syncWeightAutoFillAtMidnight(params: {
  uid: string;
  weightKg: number;
  calendarTz: string | null;
  existingRows: WeightLogRow[];
}): Promise<void> {
  const { uid, weightKg, calendarTz, existingRows } = params;
  if (weightKg <= 0) return;

  const todayKey = formatCalendarDayKey(new Date(), calendarTz ?? "UTC");
  const yesterdayKey = addDaysToYmd(todayKey, -1);

  await ensureWeightAutoFilledForDay({
    uid,
    dayKey: yesterdayKey,
    weightKg,
    calendarTz,
    existingRows,
    todayKey,
  });
}
