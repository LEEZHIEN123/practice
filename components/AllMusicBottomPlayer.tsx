import { useMusicPlayer } from "@/context/MusicPlayerContext";
import { getMusicCategoryIcon } from "@/lib/musicCategoryIcons";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function fmtMmSs(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Bottom dock on All Music: same prev / play-pause / next + seek as the floating mini player. */
export function AllMusicBottomPlayer() {
  const insets = useSafeAreaInsets();
  const {
    currentTrack,
    isPlaying,
    positionMillis,
    durationMillis,
    togglePlayPause,
    seekTo,
    skipNext,
    skipPrevious,
    playlist,
    currentIndex,
    stop,
  } = useMusicPlayer();

  const [sliding, setSliding] = useState(false);
  const [slideValue, setSlideValue] = useState(0);

  const dur = Math.max(durationMillis || currentTrack?.durationMs || 0, 1);
  const progress = useMemo(() => Math.min(1, Math.max(0, positionMillis / dur)), [positionMillis, dur]);
  const displayProgress = sliding ? slideValue : progress;

  if (!currentTrack) return null;

  const canNext = currentIndex < playlist.length - 1;
  const icon = getMusicCategoryIcon(currentTrack.categoryId);
  const queueLabel =
    playlist.length > 0 ? `${currentIndex + 1} / ${playlist.length}` : "";

  return (
    <View
      className="absolute left-0 right-0 bg-white border-t border-gray-200 shadow-lg shadow-black/10"
      style={{
        bottom: 0,
        paddingBottom: Math.max(insets.bottom, 10),
        paddingTop: 10,
        paddingHorizontal: 14,
      }}
    >
      <View className="flex-row items-start justify-between mb-2 gap-2">
        <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest flex-1">
          Now playing {queueLabel ? ` · ${queueLabel}` : ""}
        </Text>
        <Pressable
          onPress={() => void stop()}
          hitSlop={10}
          accessibilityLabel="Stop playback"
          className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center active:bg-gray-200"
        >
          <Ionicons name="close" size={22} color="#dc2626" />
        </Pressable>
      </View>

      <View className="flex-row items-center">
        <View className="w-11 h-11 rounded-xl bg-[#eaf7f0] items-center justify-center shrink-0">
          <Ionicons name={icon} size={22} color="#76C893" />
        </View>
        <View className="flex-1 ml-3 min-w-0">
          <Text className="text-sm font-extrabold text-gray-900" numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <Text className="text-xs text-gray-500 font-semibold mt-0.5" numberOfLines={1}>
            {currentTrack.artistName}
          </Text>
        </View>
      </View>

      <View className="mt-2">
        <Slider
          style={{ width: "100%", height: 28 }}
          minimumValue={0}
          maximumValue={1}
          value={displayProgress}
          onSlidingStart={() => {
            setSliding(true);
            setSlideValue(progress);
          }}
          onValueChange={(v) => setSlideValue(v)}
          onSlidingComplete={async (v) => {
            setSliding(false);
            await seekTo(v * dur);
          }}
          minimumTrackTintColor="#76C893"
          maximumTrackTintColor="#e5e7eb"
          thumbTintColor="#52B69A"
        />
        <View className="flex-row justify-between px-0.5 -mt-0.5">
          <Text className="text-[10px] font-bold text-gray-400">
            {fmtMmSs(sliding ? slideValue * dur : positionMillis)}
          </Text>
          <Text className="text-[10px] font-bold text-gray-400">{fmtMmSs(dur)}</Text>
        </View>
      </View>

      <View className="flex-row items-center justify-center gap-10 mt-1">
        <Pressable onPress={() => void skipPrevious()} hitSlop={12} className="p-2">
          <Ionicons name="play-skip-back" size={28} color="#111827" />
        </Pressable>
        <Pressable
          onPress={() => void togglePlayPause()}
          hitSlop={12}
          className="w-14 h-14 rounded-full bg-[#76C893] items-center justify-center"
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={28} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => void skipNext()}
          disabled={!canNext}
          hitSlop={12}
          className={`p-2 ${!canNext ? "opacity-30" : ""}`}
        >
          <Ionicons name="play-skip-forward" size={28} color="#111827" />
        </Pressable>
      </View>
    </View>
  );
}

/** Extra bottom space so the list clears the dock. */
export const ALL_MUSIC_BOTTOM_PLAYER_EXTRA_PAD = 168;
