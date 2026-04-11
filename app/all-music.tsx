import { AllMusicBottomPlayer, ALL_MUSIC_BOTTOM_PLAYER_EXTRA_PAD } from "@/components/AllMusicBottomPlayer";
import { useMusicPlayer, type MusicTrack } from "@/context/MusicPlayerContext";
import { getMusicCategoryIcon } from "@/lib/musicCategoryIcons";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function fmtMmSs(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Genre chips → iTunes search terms (catalog varies by region). */
const MUSIC_CATEGORIES: { id: string; label: string; query: string }[] = [
  { id: "hiphop", label: "Hip Hop", query: "hip hop" },
  { id: "rnb", label: "R&B", query: "r&b soul" },
  { id: "rock", label: "Rock", query: "rock" },
  { id: "pop", label: "Pop", query: "pop" },
  { id: "electronic", label: "Electronic", query: "electronic edm dance" },
  { id: "jazz", label: "Jazz", query: "jazz" },
  { id: "latin", label: "Latin", query: "latin reggaeton" },
  { id: "country", label: "Country", query: "country" },
  { id: "indie", label: "Indie", query: "indie alternative" },
];

let sharedDiscoveryProvider: string | null = null;

async function resolveDiscoveryProvider(): Promise<string> {
  if (sharedDiscoveryProvider) return sharedDiscoveryProvider;

  const res = await fetch("https://api.audius.co");
  if (!res.ok) throw new Error(`Provider lookup failed (${res.status})`);
  const json = (await res.json()) as { data?: { endpoint?: string }[] };
  const endpoints = (json.data ?? [])
    .map((x) => (typeof x.endpoint === "string" ? x.endpoint : ""))
    .filter(Boolean)
    .map((e) => e.replace(/\/+$/, ""));

  const provider = endpoints.length
    ? endpoints[Math.floor(Math.random() * endpoints.length)]
    : "https://discoveryprovider.audius.co";

  sharedDiscoveryProvider = provider;
  return provider;
}

function audiusStreamUrl(provider: string, trackId: string) {
  return `${provider}/v1/tracks/${encodeURIComponent(trackId)}/stream?app_name=practice`;
}

function audiusArtworkUrl(t: any) {
  const a = t?.artwork;
  const candidates = [a?._1000x1000, a?._480x480, a?._150x150, a?._100x100];
  for (const c of candidates) {
    if (typeof c === "string" && c) return c;
  }
  return "";
}

async function fetchTracksForQuery(searchQuery: string): Promise<MusicTrack[]> {
  const provider = await resolveDiscoveryProvider();
  const url = `${provider}/v1/tracks/search?query=${encodeURIComponent(searchQuery)}&app_name=practice&limit=40`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json = (await res.json()) as { data?: any[] };

  const out: MusicTrack[] = [];
  const seen = new Set<string>();

  for (const t of json.data ?? []) {
    const id = t?.id != null ? String(t.id) : "";
    const isStreamable = typeof t?.isStreamable === "boolean" ? t.isStreamable : true;
    if (!id || !isStreamable) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    const durationMs =
      typeof t?.duration === "number" && Number.isFinite(t.duration)
        ? Math.max(0, Math.round(t.duration * 1000))
        : 0;

    out.push({
      id,
      title: typeof t?.title === "string" ? t.title : "Unknown",
      artistName: typeof t?.user?.name === "string" ? t.user.name : "Unknown",
      artworkUrl: audiusArtworkUrl(t),
      streamUrl: audiusStreamUrl(provider, id),
      durationMs,
    });
  }

  return out;
}

export default function AllMusicScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playPlaylistAt, isPlaying, currentTrack } = useMusicPlayer();

  const [selectedId, setSelectedId] = useState(MUSIC_CATEGORIES[0].id);
  const selectedCategory = useMemo(
    () => MUSIC_CATEGORIES.find((c) => c.id === selectedId) ?? MUSIC_CATEGORIES[0],
    [selectedId]
  );

  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const listBottomPad =
    insets.bottom + 24 + (currentTrack ? ALL_MUSIC_BOTTOM_PLAYER_EXTRA_PAD : 0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await fetchTracksForQuery(selectedCategory.query);
        if (!cancelled) {
          setTracks(list.map((t) => ({ ...t, categoryId: selectedId })));
          setError(list.length ? null : "No tracks in this category.");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load music.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCategory.query, selectedId]);

  const startPlayback = async (track: MusicTrack, mode: "full" | "snippet") => {
    const idx = tracks.findIndex((t) => t.id === track.id);
    if (idx < 0) return;
    await playPlaylistAt(tracks, idx, mode);
  };

  const retry = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchTracksForQuery(selectedCategory.query);
      setTracks(list.map((t) => ({ ...t, categoryId: selectedId })));
      setError(list.length ? null : "No tracks in this category.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load music.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#f3f4f3] relative">
      <View
        style={{ paddingTop: insets.top + 8 }}
        className="px-3 pb-4 flex-row items-center bg-[#f3f4f3]"
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text className="text-2xl font-extrabold text-gray-900">All Music</Text>
        </View>
      </View>

      {/* Category chips */}
      <View className="bg-[#f3f4f3] pb-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 10, paddingVertical: 10 }}
        >
          {MUSIC_CATEGORIES.map((cat) => {
            const active = cat.id === selectedId;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedId(cat.id)}
                className={`px-5 py-3 rounded-2xl ${
                  active ? "bg-[#76C893]" : "bg-white"
                } shadow-sm`}
              >
                <Text
                  className={`text-base font-extrabold ${active ? "text-white" : "text-gray-800"}`}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#76C893" />
          <Text className="text-gray-500 mt-4">Loading {selectedCategory.label}…</Text>
        </View>
      ) : error && tracks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="cloud-offline-outline" size={48} color="#9ca3af" />
          <Text className="text-gray-700 text-center mt-4 font-semibold">{error}</Text>
          <Pressable onPress={retry} className="mt-6 px-6 py-3 rounded-full bg-[#76C893]">
            <Text className="text-white font-extrabold">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: listBottomPad, paddingHorizontal: 12, paddingTop: 12 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => {
            const playing = isPlaying && currentTrack?.id === item.id;
            const rowIcon = getMusicCategoryIcon(item.categoryId ?? selectedId);
            return (
              <View className="bg-white rounded-2xl p-3 flex-row items-center border border-gray-100">
                <Pressable
                  onPress={() => startPlayback(item, "snippet")}
                  className="flex-1 flex-row items-center active:opacity-90"
                >
                  <View className="w-12 h-12 rounded-xl bg-[#eaf7f0] items-center justify-center mr-3 shrink-0">
                    <Ionicons name={rowIcon} size={24} color="#76C893" />
                  </View>
                  <View className="flex-1 pr-2 min-w-0">
                    <Text className="text-base font-extrabold text-gray-900" numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
                      {item.artistName}
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => startPlayback(item, "full")}
                  hitSlop={10}
                  className="items-center justify-center ml-1"
                >
                  <View className="w-10 h-10 rounded-full bg-[#eaf7f0] items-center justify-center">
                    <Ionicons name={playing ? "pause" : "play"} size={20} color="#76C893" />
                  </View>
                  <Text className="text-[10px] text-gray-400 font-bold mt-1">
                    {item.durationMs ? fmtMmSs(item.durationMs) : "—"}
                  </Text>
                </Pressable>
              </View>
            );
          }}
          ListHeaderComponent={
            <>
              {error ? (
                <Text className="text-amber-800 text-sm mb-3 px-1">{error}</Text>
              ) : null}
            </>
          }
        />
      )}

      <AllMusicBottomPlayer />
    </View>
  );
}
