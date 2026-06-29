import { useMusicPlayer } from "@/context/MusicPlayerContext";
import { getMusicCategoryIcon } from "@/lib/musicCategoryIcons";
import { useMusicModeToast } from "@/lib/useMusicModeToast";
import { useThemedScreen } from "@/lib/useThemedScreen";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useMemo, useState } from "react";
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
  const { navStyle, textPrimary, textSecondary, textMuted, theme } = useThemedScreen();
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
    repeatOne,
    shuffle,
    toggleRepeatOne,
    toggleShuffle,
    stop,
  } = useMusicPlayer();

  const [sliding, setSliding] = useState(false);
  const [slideValue, setSlideValue] = useState(0);
  const { toast, showToast } = useMusicModeToast();

  const dur = Math.max(durationMillis || currentTrack?.durationMs || 0, 1);
  const progress = useMemo(() => Math.min(1, Math.max(0, positionMillis / dur)), [positionMillis, dur]);
  const displayProgress = sliding ? slideValue : progress;

  if (!currentTrack) return null;

  const canNext = repeatOne || playlist.length > 1;
  const icon = getMusicCategoryIcon(currentTrack.categoryId);
  const queueLabel =
    playlist.length > 0 ? `${currentIndex + 1} / ${playlist.length}` : "";

  return (
    <View
      className="absolute left-0 right-0 shadow-lg shadow-black/10 relative"
      style={[
        navStyle,
        {
          bottom: 0,
          paddingBottom: Math.max(insets.bottom, 10),
          paddingTop: 10,
          paddingHorizontal: 14,
        },
      ]}
    >
      <View className="flex-row items-start justify-between mb-2 gap-2">
        <Text className="text-[10px] font-extrabold uppercase tracking-widest flex-1" style={textMuted}>
          Now playing {queueLabel ? ` · ${queueLabel}` : ""}
        </Text>
        <Pressable
          onPress={() => void stop()}
          hitSlop={10}
          accessibilityLabel="Stop playback"
          className="w-9 h-9 rounded-full items-center justify-center"
          style={({ pressed }) => ({
            backgroundColor: pressed ? theme.rowBg : theme.cardBg,
          })}
        >
          <Ionicons name="close" size={22} color={theme.danger} />
        </Pressable>
      </View>

      <View className="flex-row items-center">
        <View
          className="w-11 h-11 rounded-xl items-center justify-center shrink-0"
          style={{ backgroundColor: theme.accentSoft }}
        >
          <Ionicons name={icon} size={22} color={theme.accent} />
        </View>
        <View className="flex-1 ml-3 min-w-0">
          <Text className="text-sm font-extrabold" style={textPrimary} numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <Text className="text-xs font-semibold mt-0.5" style={textSecondary} numberOfLines={1}>
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
          minimumTrackTintColor={theme.accent}
          maximumTrackTintColor={theme.cardBorder}
          thumbTintColor={theme.accentText}
        />
        <View className="flex-row justify-between px-0.5 -mt-0.5">
          <Text className="text-[10px] font-bold" style={textMuted}>
            {fmtMmSs(sliding ? slideValue * dur : positionMillis)}
          </Text>
          <Text className="text-[10px] font-bold" style={textMuted}>
            {fmtMmSs(dur)}
          </Text>
        </View>
      </View>

      {toast ? (
        <View className="absolute left-0 right-0 items-center" style={{ top: -36 }}>
          <View className="bg-gray-900/90 px-4 py-2 rounded-full">
            <Text className="text-[16px] font-bold text-red-500">{toast}</Text>
          </View>
        </View>
      ) : null}

      <View className="flex-row items-center justify-center mt-1 gap-6">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => {
              toggleShuffle();
              showToast(shuffle ? "Random play off" : "Random play on");
            }}
            hitSlop={10}
            accessibilityLabel={shuffle ? "Shuffle on" : "Shuffle off"}
            className="w-10 h-10 rounded-full items-center justify-center"
          >
            <Ionicons
              name="shuffle"
              size={22}
              color={shuffle ? theme.accentText : theme.iconMuted}
            />
          </Pressable>
          <Pressable onPress={() => void skipPrevious()} hitSlop={12} className="p-2">
            <Ionicons name="play-skip-back" size={28} color={theme.textPrimary} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => void togglePlayPause()}
          hitSlop={12}
          className="w-14 h-14 rounded-full bg-[#76C893] items-center justify-center"
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={28} color="#fff" />
        </Pressable>

        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => void skipNext()}
            disabled={!canNext}
            hitSlop={12}
            className={`p-2 ${!canNext ? "opacity-30" : ""}`}
          >
            <Ionicons name="play-skip-forward" size={28} color={theme.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => {
              toggleRepeatOne();
              showToast(repeatOne ? "Repeat song off" : "Repeat song on");
            }}
            hitSlop={10}
            accessibilityLabel={repeatOne ? "Repeat one on" : "Repeat one off"}
            className="w-10 h-10 rounded-full items-center justify-center"
          >
            <Ionicons
              name="repeat"
              size={22}
              color={repeatOne ? theme.accentText : theme.iconMuted}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Extra bottom space so the list clears the dock. */
export const ALL_MUSIC_BOTTOM_PLAYER_EXTRA_PAD = 180;
