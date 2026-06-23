import { AllMusicBottomPlayer, ALL_MUSIC_BOTTOM_PLAYER_EXTRA_PAD } from "@/components/AllMusicBottomPlayer";
import { Pressable } from "@/components/Pressable";
import { useMusicPlayer, type MusicTrack } from "@/context/MusicPlayerContext";
import {
  addLocalMusicTracks,
  loadLocalMusicLibrary,
  removeLocalMusicTrack,
  titleFromFileName,
  type StoredLocalTrack,
} from "@/lib/localMusicLibrary";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function fmtMmSs(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AllMusicScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playPlaylistAt, isPlaying, currentTrack, stop } = useMusicPlayer();

  const [tracks, setTracks] = useState<StoredLocalTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const listBottomPad =
    insets.bottom + 24 + (currentTrack ? ALL_MUSIC_BOTTOM_PLAYER_EXTRA_PAD : 0);

  const refreshLibrary = useCallback(async () => {
    const list = await loadLocalMusicLibrary();
    setTracks(list);
    return list;
  }, []);

  useEffect(() => {
    void refreshLibrary().finally(() => setLoading(false));
  }, [refreshLibrary]);

  const filteredTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) || t.artistName.toLowerCase().includes(q)
    );
  }, [tracks, searchQuery]);

  const importFromDevice = async () => {
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

      const { tracks: merged, added, skippedTitles } = await addLocalMusicTracks(incoming);
      setTracks(merged);

      if (added.length === 0 && skippedTitles.length > 0) {
        if (skippedTitles.length === 1) {
          Alert.alert("Already in library", `"${skippedTitles[0]}" is already in your music list.`);
        } else {
          Alert.alert(
            "Already in library",
            `${skippedTitles.length} songs were skipped because they are already in your library.`
          );
        }
        return;
      }

      if (added.length === 1) {
        const skippedNote =
          skippedTitles.length > 0 ? ` ${skippedTitles.length} duplicate skipped.` : "";
        Alert.alert("Music added", `"${added[0].title}" is ready to play.${skippedNote}`);
      } else if (added.length > 0) {
        const skippedNote =
          skippedTitles.length > 0 ? ` ${skippedTitles.length} duplicate(s) skipped.` : "";
        Alert.alert("Music added", `${added.length} songs added to your library.${skippedNote}`);
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
            const next = await removeLocalMusicTrack(track.id);
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
          <Text className="text-xs text-gray-500 font-semibold mt-0.5">From your phone</Text>
        </View>
        <Pressable
          onPress={() => void importFromDevice()}
          disabled={importing}
          className="rounded-full px-4 py-2.5 bg-[#76C893] flex-row items-center"
        >
          {importing ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <>
              <Ionicons name="add" size={20} color="white" />
              <Text className="text-sm font-extrabold text-white ml-1">Add</Text>
            </>
          )}
        </Pressable>
      </View>

      {tracks.length > 0 ? (
        <View className="px-3 pb-2">
          <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 border border-gray-200">
            <Ionicons name="search" size={18} color="#9ca3af" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search your music..."
              placeholderTextColor="#9ca3af"
              className="flex-1 ml-2 text-sm text-gray-800"
            />
          </View>
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#76C893" />
          <Text className="text-gray-500 mt-4">Loading your music…</Text>
        </View>
      ) : tracks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-[#eaf7f0] items-center justify-center mb-4">
            <Ionicons name="musical-notes" size={40} color="#76C893" />
          </View>
          <Text className="text-lg font-extrabold text-gray-900 text-center">No music yet</Text>
          <Text className="text-sm text-gray-500 text-center mt-2 leading-6">
            Tap Add to import songs from your phone. Your library stays on this device.
          </Text>
          <Pressable
            onPress={() => void importFromDevice()}
            disabled={importing}
            className="mt-6 px-8 py-3.5 rounded-full bg-[#76C893] flex-row items-center"
          >
            {importing ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="folder-open-outline" size={20} color="white" />
                <Text className="text-white font-extrabold ml-2">Import from phone</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : filteredTracks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-gray-600 text-center font-semibold">No songs match your search.</Text>
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
              <View className="bg-white rounded-2xl p-3 flex-row items-center border border-gray-100">
                <Pressable
                  onPress={() => void startPlayback(item, "snippet")}
                  className="flex-1 flex-row items-center active:opacity-90"
                >
                  <View className="w-12 h-12 rounded-xl bg-[#eaf7f0] items-center justify-center mr-3 shrink-0">
                    <Ionicons name="musical-notes" size={24} color="#76C893" />
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
                  onPress={() => void startPlayback(item, "full")}
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

                <Pressable
                  onPress={() => confirmRemove(item)}
                  hitSlop={10}
                  className="w-9 h-9 rounded-full items-center justify-center ml-2"
                >
                  <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                </Pressable>
              </View>
            );
          }}
        />
      )}

      <AllMusicBottomPlayer />
    </View>
  );
}
