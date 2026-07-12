import { displayCommunityUserName } from "@/lib/communityService";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Text, View, type StyleProp, type TextStyle } from "react-native";

const SUPPORT_ADMIN_BADGE_BLUE = "#2563eb";

type CommunityAuthorNameProps = {
  authorId: string;
  authorName: string;
  adminUid: string | null;
  textStyle?: StyleProp<TextStyle>;
  textClassName?: string;
  /** Shown after the name for the current user's own posts. */
  ownSuffix?: ReactNode;
  iconSize?: number;
};

/** Author display name with a blue verified badge beside Support Admin. */
export function CommunityAuthorName({
  authorId,
  authorName,
  adminUid,
  textStyle,
  textClassName = "text-base font-extrabold",
  ownSuffix,
  iconSize = 16,
}: CommunityAuthorNameProps) {
  const name = displayCommunityUserName(authorId, authorName, adminUid);
  const isSupportAdmin = Boolean(adminUid && authorId === adminUid);

  return (
    <View className="flex-row items-center flex-wrap">
      <Text className={textClassName} style={textStyle}>
        {name}
      </Text>
      {isSupportAdmin ? (
        <Ionicons
          name="shield-checkmark"
          size={iconSize}
          color={SUPPORT_ADMIN_BADGE_BLUE}
          style={{ marginLeft: 4 }}
          accessibilityLabel="Support Admin"
        />
      ) : null}
      {ownSuffix}
    </View>
  );
}

/** Blue badge only — use when the name is already rendered as "Support Admin". */
export function SupportAdminBadge({ size = 16 }: { size?: number }) {
  return (
    <Ionicons
      name="shield-checkmark"
      size={size}
      color={SUPPORT_ADMIN_BADGE_BLUE}
      style={{ marginLeft: 4 }}
      accessibilityLabel="Support Admin"
    />
  );
}
