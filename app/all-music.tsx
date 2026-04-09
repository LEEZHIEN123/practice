import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Track = {
  id: string;
  title: string;
  artistName: string;
  artworkUrl: string;
  streamUrl: string;
  durationMs: number;
};

/**
 * Shared player so audio continues across in-app navigation.
 * We intentionally do NOT unload on screen unmount.
 */
let sharedSound: Audio.Sound | null = null;
let sharedPlayingId: string | null = null;
let sharedIsPlaying = false;
let sharedPlayReq = 0;
let sharedDiscoveryProvider: string | null = null;
let sharedSnippetTimeout: ReturnType<typeof setTimeout> | null = null;

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

function fmtMmSs(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clearSharedSnippetTimeout() {
  if (sharedSnippetTimeout) {
    clearTimeout(sharedSnippetTimeout);
    sharedSnippetTimeout = null;
  }
}

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
  // app_name is required by the public API.
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

async function fetchTracksForQuery(searchQuery: string): Promise<Track[]> {
  const provider = await resolveDiscoveryProvider();
  const url = `${provider}/v1/tracks/search?query=${encodeURIComponent(searchQuery)}&app_name=practice&limit=40`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json = (await res.json()) as { data?: any[] };

  const out: Track[] = [];
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
  const [selectedId, setSelectedId] = useState(MUSIC_CATEGORIES[0].id);
  const selectedCategory = useMemo(
    () => MUSIC_CATEGORIES.find((c) => c.id === selectedId) ?? MUSIC_CATEGORIES[0],
    [selectedId]
  );

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(sharedPlayingId);
  const [isPlaying, setIsPlaying] = useState<boolean>(sharedIsPlaying);
  const [shouldResumeOnActive, setShouldResumeOnActive] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const playReqRef = useRef(0);

  const unloadSound = useCallback(async () => {
    clearSharedSnippetTimeout();
    const s = sharedSound ?? soundRef.current;
    if (s) {
      try {
        // Ensure it fully stops before unloading (avoids overlap on fast taps).
        await s.stopAsync();
        await s.unloadAsync();
      } catch {
        /* ignore */
      }
      if (soundRef.current === s) soundRef.current = null;
      if (sharedSound === s) sharedSound = null;
    }
    sharedPlayingId = null;
    sharedIsPlaying = false;
    setPlayingId(null);
    setIsPlaying(false);
    setShouldResumeOnActive(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    // Sync UI with shared player on mount.
    soundRef.current = sharedSound;
    setPlayingId(sharedPlayingId);
    setIsPlaying(sharedIsPlaying);
  }, []);

  // If user leaves the app while preview is playing, resume when they return.
  useEffect(() => {
    let lastState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener("change", async (nextState) => {
      const prev = lastState;
      lastState = nextState;

      if (prev === "active" && nextState !== "active") {
        const s = sharedSound ?? soundRef.current;
        if (s) {
          try {
            const st = await s.getStatusAsync();
            if (st.isLoaded && st.isPlaying) {
              setShouldResumeOnActive(true);
              await s.pauseAsync();
              sharedIsPlaying = false;
              setIsPlaying(false);
            }
          } catch {
            /* ignore */
          }
        }
      }

      const s2 = sharedSound ?? soundRef.current;
      if (nextState === "active" && shouldResumeOnActive && s2 && sharedPlayingId != null) {
        try {
          const st = await s2.getStatusAsync();
          if (st.isLoaded && !st.isPlaying) {
            await s2.playAsync();
            sharedIsPlaying = true;
            setIsPlaying(true);
          }
        } catch {
          /* ignore */
        } finally {
          setShouldResumeOnActive(false);
        }
      }
    });
    return () => sub.remove();
  }, [shouldResumeOnActive]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await unloadSound();
      setLoading(true);
      setError(null);
      try {
        const list = await fetchTracksForQuery(selectedCategory.query);
        if (!cancelled) {
          setTracks(list);
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
  }, [selectedCategory.query, unloadSound]);

  const startPlayback = async (track: Track, mode: "full" | "snippet") => {
    const reqId = ++playReqRef.current;
    const sharedReqId = ++sharedPlayReq;
    const s = sharedSound ?? soundRef.current;

    if (playingId === track.id && s) {
      try {
        const st = await s.getStatusAsync();
        if (st.isLoaded && st.isPlaying) {
          await s.pauseAsync();
          sharedPlayingId = null;
          sharedIsPlaying = false;
          setPlayingId(null);
          setIsPlaying(false);
          setShouldResumeOnActive(false);
          return;
        }
        if (st.isLoaded && !st.isPlaying) {
          await s.playAsync();
          sharedPlayingId = track.id;
          sharedIsPlaying = true;
          setPlayingId(track.id);
          setIsPlaying(true);
          setShouldResumeOnActive(false);
          return;
        }
      } catch {
        await unloadSound();
      }
    }

    await unloadSound();
    // If another tap happened while we were unloading, abort this request.
    if (playReqRef.current !== reqId) return;
    if (sharedPlayReq !== sharedReqId) return;

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.streamUrl },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded || !("didJustFinish" in status) || !status.didJustFinish) return;
          sharedPlayingId = null;
          sharedIsPlaying = false;
          setPlayingId(null);
          setIsPlaying(false);
          setShouldResumeOnActive(false);
          sound.unloadAsync().catch(() => {});
          if (soundRef.current === sound) soundRef.current = null;
          if (sharedSound === sound) sharedSound = null;
        }
      );
      if (playReqRef.current !== reqId) {
        sound.unloadAsync().catch(() => {});
        return;
      }
      if (sharedPlayReq !== sharedReqId) {
        sound.unloadAsync().catch(() => {});
        return;
      }
      sharedSound = sound;
      sharedPlayingId = track.id;
      sharedIsPlaying = true;
      soundRef.current = sound;
      setPlayingId(track.id);
      setIsPlaying(true);
      setShouldResumeOnActive(false);

      if (mode === "snippet") {
        clearSharedSnippetTimeout();
        sharedSnippetTimeout = setTimeout(() => {
          if (playReqRef.current !== reqId) return;
          sound
            .stopAsync()
            .catch(() => {})
            .finally(() => {
              sharedPlayingId = null;
              sharedIsPlaying = false;
              setPlayingId(null);
              setIsPlaying(false);
            });
        }, 30_000);
      }
    } catch {
      setError("Preview could not be played on this device.");
    }
  };

  const retry = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchTracksForQuery(selectedCategory.query);
      setTracks(list);
      setError(list.length ? null : "No tracks in this category.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load music.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#f3f4f3]">
      <View
        style={{ paddingTop: insets.top + 8 }}
        className="px-5 pb-4 flex-row items-center bg-[#f3f4f3]"
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-200 mr-3"
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-2xl font-extrabold text-gray-900">All Music</Text>
        </View>
      </View>

      {/* Category chips */}
      <View className="bg-[#f3f4f3] pb-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingVertical: 10 }}
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
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 18, paddingTop: 12 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => {
            const playing = isPlaying && playingId === item.id;
            return (
              <View className="bg-white rounded-2xl p-3 flex-row items-center border border-gray-100">
                {/* Tap anywhere here (except the play button) for a 30s snippet */}
                <Pressable
                  onPress={() => startPlayback(item, "snippet")}
                  className="flex-1 flex-row items-center active:opacity-90"
                >
                  <Image
                    source={{ uri: item.artworkUrl }}
                    style={{ width: 56, height: 56, borderRadius: 12 }}
                    contentFit="cover"
                  />
                  <View className="flex-1 ml-3 pr-2">
                    <Text className="text-base font-extrabold text-gray-900" numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
                      {item.artistName}
                    </Text>
                  </View>
                </Pressable>

                {/* Play button plays the full track in-app */}
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
    </View>
  );
}
