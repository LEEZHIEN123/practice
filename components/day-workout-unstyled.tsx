/**
 * Instruction / Record tabs + record list without NativeWind `className`.
 * Uses React.createElement so jsxImportSource (nativewind) does not wrap these
 * trees — avoids a React 19 + css-interop render path that was throwing
 * "Couldn't find a navigation context" when toggling the record tab.
 *
 * Lives under `components/` (not `app/`) so Expo Router does not treat this file as a route.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export type RecordRow = {
  id: string;
  /** Same title as Progress / workoutLogs */
  title: string;
  /** Plan day slot when known (optional; used upstream for filtering) */
  planDay?: number | null;
  startedAt: Date;
  endedAt: Date;
  elapsedSeconds: number;
  burnedKcal: number;
  met: number;
};

function fmtDurationWords(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  if (mm <= 0) return `${ss} sec`;
  if (ss <= 0) return `${mm} min`;
  return `${mm} min ${ss} sec`;
}

function fmtTimeOnly(d: Date) {
  try {
    return d.toLocaleTimeString();
  } catch {
    return d.toTimeString();
  }
}

function fmtDateTime(d: Date) {
  try {
    return d.toLocaleString();
  } catch {
    return d.toString();
  }
}

const recordStyles = StyleSheet.create({
  wrap: { marginTop: 20 },
  wrapEmbedded: { marginTop: 0 },
  title: { fontWeight: "800", fontSize: 16, color: "#111827" },
  subtitle: { fontSize: 12, color: "#4b5563", marginTop: 8, lineHeight: 20 },
  empty: { color: "#6b7280", fontSize: 14, marginTop: 16 },
  list: { marginTop: 12, gap: 8 },
  card: {
    backgroundColor: "#f3f4f3",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#111827" },
  cardLine1: { fontSize: 12, fontWeight: "800", color: "#111827", marginTop: 6 },
  cardLine2: { fontSize: 14, color: "#374151", marginTop: 8 },
  cardLine2Bold: { fontWeight: "800", color: "#111827" },
  cardKcal: { fontSize: 14, fontWeight: "800", marginTop: 8 },
  totalWrap: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: "#b7ead1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#eaf7f0",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  totalLabel: { fontWeight: "800", fontSize: 16, color: "#111827" },
  totalValue: { fontWeight: "800", fontSize: 20 },
});

export function WorkoutRecordPanel(props: {
  dayRecords: RecordRow[];
  totalRecordKcal: number;
  accentGreen: string;
  /** Inside day-workout below tabs — no extra top margin */
  embedded?: boolean;
  /** Plan day number (e.g. 1) — shown in subtitle when embedded */
  planDayNum?: number;
  /** When set (e.g. discover free workout), overrides plan-day subtitle */
  subtitleOverride?: string;
}) {
  const { dayRecords, totalRecordKcal, accentGreen, embedded, planDayNum, subtitleOverride } = props;
  const wrapStyle = embedded ? recordStyles.wrapEmbedded : recordStyles.wrap;

  const recordSubtitle =
    typeof subtitleOverride === "string" && subtitleOverride.length > 0
      ? subtitleOverride
      : embedded && typeof planDayNum === "number"
        ? `Workout record for Day ${planDayNum} of your plan.`
        : "Workout record for your completed workouts.";

  if (dayRecords.length === 0) {
    return React.createElement(
      View,
      { style: wrapStyle },
      React.createElement(Text, { style: recordStyles.title }, "WORKOUT RECORD"),
      React.createElement(Text, { style: recordStyles.subtitle }, recordSubtitle),
      React.createElement(Text, { style: recordStyles.empty }, "No completed workouts yet.")
    );
  }

  return React.createElement(
    View,
    { style: wrapStyle },
    React.createElement(Text, { style: recordStyles.title }, "WORKOUT RECORD"),
    React.createElement(Text, { style: recordStyles.subtitle }, recordSubtitle),
    React.createElement(
      View,
      { style: recordStyles.list },
      ...dayRecords.map((r) =>
        React.createElement(
          View,
          { key: r.id, style: recordStyles.card },
          React.createElement(Text, { style: recordStyles.cardTitle, numberOfLines: 2 }, r.title),
          React.createElement(
            Text,
            { style: recordStyles.cardLine1, numberOfLines: 2 },
            `${fmtDateTime(r.startedAt)} → ${fmtTimeOnly(r.endedAt)}`
          ),
          React.createElement(
            Text,
            { style: recordStyles.cardLine2 },
            "Duration: ",
            React.createElement(Text, { style: recordStyles.cardLine2Bold }, fmtDurationWords(r.elapsedSeconds))
          ),
          React.createElement(
            Text,
            { style: [recordStyles.cardKcal, { color: accentGreen }] },
            `Calories burned: ${Math.round(r.burnedKcal)} kcal`
          )
        )
      )
    ),
    React.createElement(
      View,
      { style: recordStyles.totalWrap },
      React.createElement(Text, { style: recordStyles.totalLabel }, "TOTAL"),
      React.createElement(
        Text,
        { style: [recordStyles.totalValue, { color: accentGreen }] },
        `${Math.round(totalRecordKcal).toLocaleString()} kcal`
      )
    )
  );
}
