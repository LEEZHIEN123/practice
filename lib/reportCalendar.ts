import { addDaysToYmd, formatCalendarDayKey, localDateFromYmd } from "@/lib/calendarDay";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function startOfWeekMonday(d: Date): Date {
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const out = startOfDay(d);
  out.setDate(out.getDate() - diff);
  return out;
}

export function getWeekDayKeys(anchor: Date, calendarTz: string): string[] {
  const weekStart = startOfWeekMonday(anchor);
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    keys.push(formatCalendarDayKey(date, calendarTz));
  }
  return keys;
}

export function formatReportDayLabel(dayKey: string): string {
  const date = localDateFromYmd(dayKey);
  try {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dayKey;
  }
}

export function formatWeekRangeLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const startText = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
  const endText = `${weekEnd.getMonth() + 1}/${weekEnd.getDate()}/${weekEnd.getFullYear()}`;
  return `${startText} – ${endText}`;
}

export function dayKeysInRange(startDayKey: string, endDayKey: string): string[] {
  const keys: string[] = [];
  let current = startDayKey;
  while (current <= endDayKey) {
    keys.push(current);
    if (current === endDayKey) break;
    current = addDaysToYmd(current, 1);
  }
  return keys;
}
