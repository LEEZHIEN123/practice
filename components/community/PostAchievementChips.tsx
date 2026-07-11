import { achievementDescriptionFromId, achievementTitleFromId } from "@/lib/achievements";
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

type PostAchievementChipsProps = {
  achievementIds: string[];
  compact?: boolean;
};

export function PostAchievementChips({ achievementIds, compact = false }: PostAchievementChipsProps) {
  const ids = (achievementIds ?? []).filter(Boolean);
  if (!ids.length) return null;

  return (
    <View className={compact ? "mt-2" : "mt-3"}>
      {!compact ? (
        <Text className="text-sm font-extrabold tracking-widest mb-2" style={{ color: "#dc2626" }}>
          ACHIEVEMENTS SHARED
        </Text>
      ) : null}
      <View className="gap-2">
        {ids.map((id) => {
          const title = achievementTitleFromId(id);
          const description = achievementDescriptionFromId(id);
          return (
            <View
              key={id}
              className="flex-row items-start rounded-2xl px-3 py-2.5 border"
              style={{ backgroundColor: "#fff7ed", borderColor: "#fdba74" }}
            >
              <Ionicons
                name="trophy"
                size={compact ? 14 : 16}
                color="#ea580c"
                style={{ marginTop: 2 }}
              />
              <View className="flex-1 ml-2.5">
                <Text
                  className={compact ? "text-xs font-extrabold" : "text-sm font-extrabold"}
                  style={{ color: "#c2410c" }}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                {description ? (
                  <Text
                    className={compact ? "text-[10px] mt-0.5 leading-4" : "text-xs mt-0.5 leading-5"}
                    style={{ color: "#9a3412" }}
                    numberOfLines={compact ? 2 : 3}
                  >
                    {description}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
