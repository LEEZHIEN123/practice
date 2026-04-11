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
