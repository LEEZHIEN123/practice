import { Text, View } from "react-native";

type AdminPendingReportTipProps = {
  target: "post" | "comment";
};

export function AdminPendingReportTip({ target }: AdminPendingReportTipProps) {
  const label = target === "post" ? "post" : "comment";

  return (
    <View
      className="rounded-xl px-3 py-2 border"
      style={{ backgroundColor: "#eff6ff", borderColor: "#93c5fd" }}
    >
      <Text className="text-xs font-semibold text-[#1d4ed8]">
        Pending report: This {label} has been reported and is waiting for review in Report
        Management.
      </Text>
    </View>
  );
}
