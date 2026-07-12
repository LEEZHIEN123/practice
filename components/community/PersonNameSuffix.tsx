import { Text } from "react-native";

type PersonNameSuffixProps = {
  isMe?: boolean;
  isFriend?: boolean;
  accentColor: string;
  textClassName?: string;
};

/** Shows " · me" for the signed-in user, or " · friend" for accepted friends. */
export function PersonNameSuffix({
  isMe = false,
  isFriend = false,
  accentColor,
  textClassName = "text-sm font-bold",
}: PersonNameSuffixProps) {
  if (isMe) {
    return (
      <Text className={textClassName} style={{ color: accentColor }}>
        {" "}
        · me
      </Text>
    );
  }
  if (isFriend) {
    return (
      <Text className={textClassName} style={{ color: accentColor }}>
        {" "}
        · friend
      </Text>
    );
  }
  return null;
}
