import { Text, View } from "react-native";

export function CommentReviewTip() {
  return (
    <View
      className="mb-2 rounded-xl px-3 py-2 border"
      style={{ backgroundColor: "#fff7ed", borderColor: "#fdba74" }}
    >
      <Text className="text-xs font-semibold text-[#c2410c]">
        Under review. Please be careful with community guidelines.
      </Text>
    </View>
  );
}
