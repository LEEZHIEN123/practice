const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const startOfWeekMon = (d: Date) => {
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const out = startOfDay(d);
  out.setDate(out.getDate() - diff);
  return out;
};

/**
 * Index of the slot matching "today" within week (0–6), month (0–3 week buckets), or year (0–11 months)
 * for the selected period anchor. Null if the viewed window does not include today's bucket.
 */
export function getCurrentPeriodSlotIndex(period: "week" | "month" | "year", anchor: Date): number | null {
  const now = new Date();
  if (period === "week") {
    if (startOfWeekMon(anchor).getTime() !== startOfWeekMon(now).getTime()) return null;
    const weekStart = startOfWeekMon(anchor);
    const diff = Math.round((startOfDay(now).getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
    if (diff < 0 || diff > 6) return null;
    return diff;
  }
  if (period === "month") {
    if (anchor.getFullYear() !== now.getFullYear() || anchor.getMonth() !== now.getMonth()) return null;
    return Math.min(3, Math.floor((now.getDate() - 1) / 7));
  }
  if (period === "year") {
    if (anchor.getFullYear() !== now.getFullYear()) return null;
    return now.getMonth();
  }
  return null;
}
