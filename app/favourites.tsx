import { Pressable } from "@/components/Pressable";
import {
  ProfileScreenHeader,
  ThemedCard,
  ThemedScreen,
  ThemedText,
} from "@/components/themed/ThemedUi";
import { loadFavourites, removeFavourite, type FavouriteItem } from "@/lib/favourites";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";

function favouriteIcon(kind: FavouriteItem["kind"]): keyof typeof Ionicons.glyphMap {
  if (kind === "workout" || kind === "workout-plan") return "barbell-outline";
  return "restaurant-outline";
}

function FavouriteSection({
  title,
  items,
  emptyText,
  onOpen,
  onRemove,
}: {
  title: string;
  items: FavouriteItem[];
  emptyText: string;
  onOpen: (item: FavouriteItem) => void;
  onRemove: (item: FavouriteItem) => void;
}) {
  const { theme } = useThemedScreen();

  return (
    <View className="mb-6">
      <ThemedText className="text-xl font-extrabold mb-3">{title}</ThemedText>
      <ThemedCard className="p-4 gap-3" rounded="2xl">
        {items.length === 0 ? (
          <ThemedText variant="muted" className="text-sm text-center py-6">
            {emptyText}
          </ThemedText>
        ) : (
          items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onOpen(item)}
              onLongPress={() => onRemove(item)}
              className="rounded-2xl px-4 py-4 border flex-row items-center"
              style={{ backgroundColor: theme.rowBg, borderColor: theme.cardBorder }}
            >
              <View
                className="w-11 h-11 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Ionicons name={favouriteIcon(item.kind)} size={22} color={theme.accent} />
              </View>
              <View className="flex-1 pr-2">
                <ThemedText className="text-base font-extrabold">{item.title}</ThemedText>
                <ThemedText variant="muted" className="text-sm mt-1">
                  {item.subtitle}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.iconMuted} />
            </Pressable>
          ))
        )}
      </ThemedCard>
    </View>
  );
}

export default function FavouritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useThemedScreen();
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [items, setItems] = useState<FavouriteItem[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
    return unsub;
  }, []);

  const refresh = useCallback(async () => {
    if (!uid) {
      setItems([]);
      return;
    }
    setItems(await loadFavourites(uid));
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const workoutItems = useMemo(
    () => items.filter((item) => item.kind === "workout" || item.kind === "workout-plan"),
    [items]
  );
  const nutritionItems = useMemo(
    () => items.filter((item) => item.kind === "nutrition"),
    [items]
  );

  const handleRemove = (item: FavouriteItem) => {
    Alert.alert("Remove favourite", `Remove ${item.title} from your favourites?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          if (!uid) return;
          void removeFavourite(uid, item.id).then(refresh);
        },
      },
    ]);
  };

  return (
    <ThemedScreen>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 12,
          paddingTop: insets.top + 12,
        }}
      >
        <ProfileScreenHeader title="Favourites" onBack={() => router.back()} />

        {!uid ? (
          <ThemedCard className="p-5" rounded="2xl">
            <ThemedText variant="muted" className="text-sm text-center py-8">
              Sign in to view your favourites.
            </ThemedText>
          </ThemedCard>
        ) : (
          <>
            <FavouriteSection
              title="Workouts"
              items={workoutItems}
              emptyText="No workout favourites yet. Tap the heart on a workout page."
              onOpen={(item) => router.push(item.route as any)}
              onRemove={handleRemove}
            />
            <FavouriteSection
              title="Nutrition"
              items={nutritionItems}
              emptyText="No meal favourites yet. Tap the heart beside a food name in All Nutrition."
              onOpen={(item) => router.push(item.route as any)}
              onRemove={handleRemove}
            />
          </>
        )}
      </ScrollView>
    </ThemedScreen>
  );
}
