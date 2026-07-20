import { Text, View } from "react-native";

type PostPendingReviewTipProps = {
  variant: "author" | "public" | "admin";
};

const TIP_COPY: Record<PostPendingReviewTipProps["variant"], string> = {
  author: "This post is under review. Please contact Support Admin if you have any questions.",
  public: "This post is under review. Please verify the information before responding, sharing, or taking action.",
  admin: "Pending review — see Report Management.",
};

const TIP_STYLE: Record<
  PostPendingReviewTipProps["variant"],
  { backgroundColor: string; borderColor: string; color: string }
> = {
  author: { backgroundColor: "#fff7ed", borderColor: "#fdba74", color: "#c2410c" },
  public: { backgroundColor: "#fff7ed", borderColor: "#fdba74", color: "#c2410c" },
  admin: { backgroundColor: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" },
};

export function PostPendingReviewTip({ variant }: PostPendingReviewTipProps) {
  const style = TIP_STYLE[variant];

  return (
    <View
      className="rounded-lg px-2.5 py-1.5 border"
      style={{ backgroundColor: style.backgroundColor, borderColor: style.borderColor }}
    >
      <Text className="text-[10px] font-semibold leading-4" style={{ color: style.color }}>
        {TIP_COPY[variant]}
      </Text>
    </View>
  );
}
