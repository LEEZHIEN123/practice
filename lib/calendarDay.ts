/**
 * Calendar day keys (YYYY-MM-DD) for Firestore dailyStats, aligned across devices.
 * Uses an IANA timezone (e.g. from the user profile) so emulator + phone share the same "today".
 */

/** Device timezone from Intl (fallback UTC). */
export function getDeviceIanaTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === "string" && tz.length > 0) return tz;
  } catch {
    /* ignore */
  }
  return "UTC";
}

/** Format `date` as YYYY-MM-DD in `timeZone` (e.g. Asia/Singapore). */
export function formatCalendarDayKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return formatLocalDayKey(date);
  }
}

function formatLocalDayKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Previous/next calendar day as YYYY-MM-DD (Gregorian; matches string todayKey from formatCalendarDayKey). */
export function addDaysToYmd(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split("-").map((x) => parseInt(x, 10));
  const utc = Date.UTC(y, m - 1, d);
  const next = new Date(utc + delta * 86400000);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Local calendar Date at midnight for a YYYY-MM-DD key (for pickers / labels). */
export function localDateFromYmd(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date();
  return new Date(y, m - 1, d);
}

/** Hour (0–23) and minute in an IANA timezone. */
export function getLocalTimeParts(
  date: Date,
  timeZone: string
): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    return {
      hour: Number.isFinite(hour) ? hour : 0,
      minute: Number.isFinite(minute) ? minute : 0,
    };
  } catch {
    return { hour: date.getHours(), minute: date.getMinutes() };
  }
}

export function getLocalMinutesSinceMidnight(date: Date, timeZone: string): number {
  const { hour, minute } = getLocalTimeParts(date, timeZone);
  return hour * 60 + minute;
}

/** True when local time on `dayKey` is before 6:00 AM. */
export function isBeforeLocalSixAm(date: Date, timeZone: string, dayKey: string): boolean {
  if (formatCalendarDayKey(date, timeZone) !== dayKey) {
    return formatCalendarDayKey(date, timeZone) < dayKey;
  }
  return getLocalMinutesSinceMidnight(date, timeZone) < 6 * 60;
}

/** Whole calendar days from `earlierYmd` to `laterYmd` (YYYY-MM-DD, UTC date parts). */
export function diffCalendarDays(earlierYmd: string, laterYmd: string): number {
  const [y1, m1, d1] = earlierYmd.split("-").map((x) => parseInt(x, 10));
  const [y2, m2, d2] = laterYmd.split("-").map((x) => parseInt(x, 10));
  if (![y1, m1, d1, y2, m2, d2].every((n) => Number.isFinite(n))) return 0;
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000);
}
