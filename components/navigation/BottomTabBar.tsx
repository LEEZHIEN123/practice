import { CommunityUnreadBadge } from "@/components/community/CommunityUnreadBadge";
import { useAppearance } from "@/context/AppearanceContext";
import { rememberBottomTabRoute } from "@/lib/bottomTabHistory";
import { useCommunityUnread } from "@/lib/useCommunityUnread";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type BottomTabKey = "home" | "discover" | "community" | "progress" | "profile";

/** Icon row + labels + vertical padding, excluding the device safe area. */
export const BOTTOM_TAB_BAR_CORE_HEIGHT = 58;

export const BOTTOM_TAB_ROUTES = [
  "/home",
  "/discover",
  "/community",
  "/progress",
  "/profile",
] as const;

export function isBottomTabRoute(pathname: string) {
  return (BOTTOM_TAB_ROUTES as readonly string[]).includes(pathname);
}

export function bottomTabBarScrollPadding(bottomInset: number, extra = 12) {
  return BOTTOM_TAB_BAR_CORE_HEIGHT + bottomInset + 8 + extra;
}

export function useBottomTabBarScrollPadding(extra = 12) {
  const insets = useSafeAreaInsets();
  return bottomTabBarScrollPadding(insets.bottom, extra);
}

type BottomTabBarProps = {
  active: BottomTabKey;
};

export function BottomTabBar({ active }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useAppearance();
  const { totalUnread } = useCommunityUnread();

  const items: {
    key: BottomTabKey;
    label: string;
    route: "/home" | "/discover" | "/community" | "/progress" | "/profile";
    icon: keyof typeof Ionicons.glyphMap;
    iconActive: keyof typeof Ionicons.glyphMap;
  }[] = [
    { key: "home", label: "HOME", route: "/home", icon: "home-outline", iconActive: "home" },
    {
      key: "discover",
      label: "DISCOVER",
      route: "/discover",
      icon: "compass-outline",
      iconActive: "compass",
    },
    {
      key: "community",
      label: "COMMUNITY",
      route: "/community",
      icon: "people-outline",
      iconActive: "people",
    },
    {
      key: "progress",
      label: "PROGRESS",
      route: "/progress",
      icon: "stats-chart-outline",
      iconActive: "stats-chart",
    },
    { key: "profile", label: "PROFILE", route: "/profile", icon: "person-outline", iconActive: "person" },
  ];

  useEffect(() => {
    if (active === "home") rememberBottomTabRoute("/home");
    else if (active === "discover") rememberBottomTabRoute("/discover");
    else if (active === "community") rememberBottomTabRoute("/community");
    else if (active === "progress") rememberBottomTabRoute("/progress");
  }, [active]);

  return (
    <View
      className="absolute bottom-0 left-0 right-0 flex-row px-2 pt-2"
      style={{
        backgroundColor: theme.navBg,
        borderTopColor: theme.navBorder,
        borderTopWidth: 1,
        paddingBottom: insets.bottom + 8,
        zIndex: 20,
        elevation: 12,
      }}
    >
      {items.map((item) => {
        const isActive = active === item.key;
        const iconColor = isActive ? theme.accentText : theme.iconMuted;
        const labelColor = isActive ? theme.accentText : theme.textMuted;
        const iconName = isActive ? item.iconActive : item.icon;

        return (
          <Pressable
            key={item.key}
            onPress={() => {
              if (isActive) return;
              const currentRoute = items.find((tab) => tab.key === active)?.route;
              rememberBottomTabRoute(currentRoute);
              router.replace(item.route);
            }}
            className="flex-1 items-center py-2"
          >
            <View className="h-[22px] items-center justify-center">
              {item.key === "community" ? (
                <CommunityUnreadBadge count={totalUnread}>
                  <Ionicons name={iconName} size={22} color={iconColor} />
                </CommunityUnreadBadge>
              ) : (
                <Ionicons name={iconName} size={22} color={iconColor} />
              )}
            </View>
            <Text className="text-[10px] font-bold mt-1" style={{ color: labelColor }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
