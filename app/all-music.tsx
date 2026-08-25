import { ALL_MUSIC_BOTTOM_PLAYER_EXTRA_PAD, AllMusicBottomPlayer } from "@/components/AllMusicBottomPlayer";
import { Pressable } from "@/components/Pressable";
import {
  ProfileScreenHeader,
  ThemedBackButton,
  ThemedCard,
  ThemedScreen,
  ThemedText,
  useProfileCardStyles,
} from "@/components/themed/ThemedUi";
import { useMusicPlayer, type MusicTrack } from "@/context/MusicPlayerContext";
import {
  addLocalMusicTracks,
  loadLocalMusicLibrary,
  removeLocalMusicTrack,
  titleFromFileName,
  type StoredLocalTrack,
} from "@/lib/localMusicLibrary";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";

function fmtMmSs(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSkippedSongsMessage(skippedTitles: string[]): string {
  if (skippedTitles.length === 0) return "";

  if (skippedTitles.length === 1) {
    return `"${skippedTitles[0]}" was not added because it is already in your library.`;
  }

  const listed = skippedTitles
    .slice(0, 5)
    .map((title) => `• ${title}`)
    .join("\n");
  const more =
    skippedTitles.length > 5 ? `\n…and ${skippedTitles.length - 5} more.` : "";

  return `These songs were not added because they are already in your library:\n${listed}${more}`;
}

export default function AllMusicScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playPlaylistAt, isPlaying, currentTrack, stop } = useMusicPlayer();
  const { theme } = useThemedScreen();
  const accentButtonLabelColor = "#ffffff";
  const { inputStyle, placeholderColor } = useProfileCardStyles();

  const [tracks, setTracks] = useState<StoredLocalTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [authUid, setAuthUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const prevAuthUidRef = useRef<string | null | undefined>(undefined);

  const listBottomPad =
    insets.bottom + 24 + (currentTrack ? ALL_MUSIC_BOTTOM_PLAYER_EXTRA_PAD : 0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  const refreshLibrary = useCallback(async () => {
    if (!authUid) {
      setTracks([]);
      return [];
    }
    const list = await loadLocalMusicLibrary(authUid);
    setTracks(list);
    return list;
  }, [authUid]);

  useEffect(() => {
    if (prevAuthUidRef.current !== undefined && prevAuthUidRef.current !== authUid) {
      void stop();
    }
    prevAuthUidRef.current = authUid;
    setLoading(true);
    void refreshLibrary().finally(() => setLoading(false));
  }, [authUid, refreshLibrary, stop]);

  const filteredTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) || t.artistName.toLowerCase().includes(q)
    );
  }, [tracks, searchQuery]);

  const importFromDevice = async () => {
    if (!authUid) {
      Alert.alert("Sign in required", "Log in to add music to your library.");
      return;
    }
    try {
      setImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const incoming: Array<MusicTrack & { sourceFileName?: string }> = result.assets.map((asset) => ({
        id: asset.uri,
        title: titleFromFileName(asset.name ?? "Track"),
        artistName: "On device",
        artworkUrl: "",
        streamUrl: asset.uri,
        durationMs: 0,
        categoryId: "local",
        sourceFileName: asset.name ?? undefined,
      }));

      const { tracks: merged, added, skippedTitles } = await addLocalMusicTracks(authUid, incoming);
      setTracks(merged);

      if (added.length === 0 && skippedTitles.length > 0) {
        Alert.alert("Music already in the library", formatSkippedSongsMessage(skippedTitles));
        return;
      }

      if (added.length === 1) {
        const skippedNote =
          skippedTitles.length > 0
            ? `\n\n${formatSkippedSongsMessage(skippedTitles)}`
            : "";
        Alert.alert("Music added", `"${added[0].title}" is ready to play.${skippedNote}`);
      } else if (added.length > 0) {
        const skippedNote =
          skippedTitles.length > 0
            ? `\n\n${formatSkippedSongsMessage(skippedTitles)}`
            : "";
        Alert.alert(
          "Music added",
          `${added.length} songs added to your library.${skippedNote}`
        );
      }
    } catch (e: unknown) {
      Alert.alert("Import failed", e instanceof Error ? e.message : "Could not import music.");
    } finally {
      setImporting(false);
    }
  };

  const confirmRemove = (track: StoredLocalTrack) => {
    Alert.alert("Remove song", `Remove "${track.title}" from your library?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const next = await removeLocalMusicTrack(authUid, track.id);
            setTracks(next);
            if (currentTrack?.id === track.id) {
              await stop();
            }
          })();
        },
      },
    ]);
  };

  const startPlayback = async (track: MusicTrack, mode: "full" | "snippet") => {
    const list = filteredTracks.length > 0 ? filteredTracks : tracks;
    const idx = list.findIndex((t) => t.id === track.id);
    if (idx < 0) return;
    await playPlaylistAt(list, idx, mode);
  };

  return (
    <ThemedScreen className="relative">
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 12 }}>
        <ProfileScreenHeader
          title="All Music"
          onBack={() => router.back()}
          rightSlot={
            <Pressable
              onPress={() => void importFromDevice()}
              disabled={importing}
              className="rounded-full px-4 py-2.5 bg-[#76C893] flex-row items-center"
            >
              {importing ? (
                <ActivityIndicator color={accentButtonLabelColor} size="small" />
              ) : (
                <>
                  <Ionicons name="add" size={20} color={accentButtonLabelColor} />
                  <ThemedText
                    className="text-sm font-extrabold ml-1"
                    style={{ color: accentButtonLabelColor }}
                  >
                    Add
                  </ThemedText>
                </>
              )}
            </Pressable>
          }
        />
        <ThemedText variant="muted" className="text-xs text-center font-semibold -mt-1 mb-2">
          From your phone
        </ThemedText>
      </View>

      {tracks.length > 0 ? (
        <View className="px-3 pb-2">
          <View className="flex-row items-center rounded-2xl px-4 py-3" style={inputStyle}>
            <Ionicons name="search" size={18} color={theme.iconMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search your music..."
              placeholderTextColor={placeholderColor}
              className="flex-1 ml-2 text-sm"
              style={{ color: theme.textPrimary }}
            />
          </View>
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#76C893" />
          <ThemedText variant="muted" className="mt-4">
            Loading your music…
          </ThemedText>
        </View>
      ) : tracks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: theme.accentSoft }}
          >
            <Ionicons name="musical-notes" size={40} color="#76C893" />
          </View>
          <ThemedText className="text-lg font-extrabold text-center">No music yet</ThemedText>
          <ThemedText variant="muted" className="text-sm text-center mt-2 leading-6">
            Tap Add to import songs from your phone. Each account has its own library on this device.
          </ThemedText>
          <Pressable
            onPress={() => void importFromDevice()}
            disabled={importing}
            className="mt-6 px-8 py-3.5 rounded-full bg-[#76C893] flex-row items-center"
          >
            {importing ? (
              <ActivityIndicator color={accentButtonLabelColor} />
            ) : (
              <>
                <Ionicons name="folder-open-outline" size={20} color={accentButtonLabelColor} />
                <ThemedText
                  className="font-extrabold ml-2"
                  style={{ color: accentButtonLabelColor }}
                >
                  Import from phone
                </ThemedText>
              </>
            )}
          </Pressable>
        </View>
      ) : filteredTracks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <ThemedText variant="secondary" className="text-center font-semibold">
            No songs match your search.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={filteredTracks}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: listBottomPad, paddingHorizontal: 12, paddingTop: 8 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => {
            const playing = isPlaying && currentTrack?.id === item.id;
            return (
              <ThemedCard rounded="2xl" className="p-3 flex-row items-center">
                <Pressable
                  onPress={() => void startPlayback(item, "snippet")}
                  className="flex-1 flex-row items-center active:opacity-90"
                >
                  <View
                    className="w-12 h-12 rounded-xl items-center justify-center mr-3 shrink-0"
                    style={{ backgroundColor: theme.accentSoft }}
                  >
                    <Ionicons name="musical-notes" size={24} color="#76C893" />
                  </View>
                  <View className="flex-1 pr-2 min-w-0">
                    <ThemedText className="text-base font-extrabold" numberOfLines={2}>
                      {item.title}
                    </ThemedText>
                    <ThemedText variant="muted" className="text-sm mt-0.5" numberOfLines={1}>
                      {item.artistName}
                    </ThemedText>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => void startPlayback(item, "full")}
                  hitSlop={10}
                  className="items-center justify-center ml-1"
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: theme.accentSoft }}
                  >
                    <Ionicons name={playing ? "pause" : "play"} size={20} color="#76C893" />
                  </View>
                  <ThemedText variant="muted" className="text-[10px] font-bold mt-1">
                    {item.durationMs ? fmtMmSs(item.durationMs) : "—"}
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={() => confirmRemove(item)}
                  hitSlop={10}
                  className="w-9 h-9 rounded-full items-center justify-center ml-2"
                >
                  <Ionicons name="trash-outline" size={18} color={theme.iconMuted} />
                </Pressable>
              </ThemedCard>
            );
          }}
        />
      )}

      <AllMusicBottomPlayer />
    </ThemedScreen>
  );
}
