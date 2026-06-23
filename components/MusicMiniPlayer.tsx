import { useMusicPlayer } from "@/context/MusicPlayerContext";
import { getMusicCategoryIcon } from "@/lib/musicCategoryIcons";
import { useMusicModeToast } from "@/lib/useMusicModeToast";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { usePathname } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COLLAPSED = 52;
const CARD_PAD = 8;

function fmtMmSs(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clampPos(
  x: number,
  y: number,
  w: number,
  h: number,
  screenW: number,
  screenH: number,
  topInset: number,
  bottomInset: number
) {
  const minX = CARD_PAD;
  const minY = topInset + CARD_PAD;
  const maxX = screenW - w - CARD_PAD;
  const maxY = screenH - h - bottomInset - CARD_PAD;
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

/**
 * If the widget's horizontal center lies in the middle band of the screen,
 * snap to the left or right edge (whichever side of center it's on).
 */
function snapToSideIfInCenterZone(
  x: number,
  y: number,
  w: number,
  h: number,
  screenW: number,
  screenH: number,
  topInset: number,
  bottomInset: number
) {
  const centerX = x + w / 2;
  const distFromMid = Math.abs(centerX - screenW / 2);
  const halfBand = screenW * 0.22;
  let nx = x;
  if (distFromMid <= halfBand) {
    const leftX = CARD_PAD;
    const rightX = screenW - w - CARD_PAD;
    nx = centerX < screenW / 2 ? leftX : rightX;
  }
  return clampPos(nx, y, w, h, screenW, screenH, topInset, bottomInset);
}

/**
 * Draggable floating player: collapsed = category icon; expanded = full controls.
 * Close stops playback; shrink keeps audio and shows icon only.
 */
export function MusicMiniPlayer() {
  const pathname = usePathname();
  const { width: screenW, height: screenH } = useWindowDimensions();
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
    repeatOne,
    shuffle,
    toggleRepeatOne,
    toggleShuffle,
    stop,
  } = useMusicPlayer();

  const cardW = Math.min(200, Math.round(screenW * 0.88));
  const cardH = 224;
  const movedRef = useRef(false);
  const headerMovedRef = useRef(false);
  const dragOriginRef = useRef({ x: 0, y: 0 });
  const posRef = useRef({ x: 0, y: 0 });
  const posReadyRef = useRef(false);

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState(false);

  const [sliding, setSliding] = useState(false);
  const [slideValue, setSlideValue] = useState(0);
  const { toast, showToast } = useMusicModeToast();

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    if (!currentTrack) {
      posReadyRef.current = false;
      setExpanded(false);
      return;
    }
    if (!posReadyRef.current) {
      const w = COLLAPSED;
      const h = COLLAPSED;
      const next = clampPos(
        screenW - w - 10,
        insets.top + 52,
        w,
        h,
        screenW,
        screenH,
        insets.top,
        insets.bottom
      );
      setPos(next);
      posRef.current = next;
      posReadyRef.current = true;
    }
  }, [currentTrack, screenW, screenH, insets.top, insets.bottom]);

  const dur = Math.max(durationMillis || currentTrack?.durationMs || 0, 1);
  const progress = useMemo(() => Math.min(1, Math.max(0, positionMillis / dur)), [positionMillis, dur]);
  const displayProgress = sliding ? slideValue : progress;

  const categoryIcon = currentTrack ? getMusicCategoryIcon(currentTrack.categoryId) : "musical-notes";

  const applyDrag = useCallback(
    (dx: number, dy: number) => {
      const w = expanded ? cardW : COLLAPSED;
      const h = expanded ? cardH : COLLAPSED;
      const origin = dragOriginRef.current;
      const next = clampPos(
        origin.x + dx,
        origin.y + dy,
        w,
        h,
        screenW,
        screenH,
        insets.top,
        insets.bottom
      );
      setPos(next);
    },
    [cardW, cardH, expanded, screenW, screenH, insets.top, insets.bottom]
  );

  const panCollapsed = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          dragOriginRef.current = { ...posRef.current };
          movedRef.current = false;
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3) movedRef.current = true;
          applyDrag(g.dx, g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (!movedRef.current && Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10) {
            setExpanded(true);
            setPos((p) => {
              const c = clampPos(p.x, p.y, cardW, cardH, screenW, screenH, insets.top, insets.bottom);
              return snapToSideIfInCenterZone(
                c.x,
                c.y,
                cardW,
                cardH,
                screenW,
                screenH,
                insets.top,
                insets.bottom
              );
            });
          } else if (movedRef.current) {
            setPos((p) =>
              snapToSideIfInCenterZone(
                p.x,
                p.y,
                COLLAPSED,
                COLLAPSED,
                screenW,
                screenH,
                insets.top,
                insets.bottom
              )
            );
          }
          movedRef.current = false;
        },
      }),
    [applyDrag, cardW, cardH, screenW, screenH, insets.top, insets.bottom]
  );

  const panHeader = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          dragOriginRef.current = { ...posRef.current };
          headerMovedRef.current = false;
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2) headerMovedRef.current = true;
          applyDrag(g.dx, g.dy);
        },
        onPanResponderRelease: () => {
          if (headerMovedRef.current) {
            setPos((p) =>
              snapToSideIfInCenterZone(
                p.x,
                p.y,
                cardW,
                cardH,
                screenW,
                screenH,
                insets.top,
                insets.bottom
              )
            );
          }
          headerMovedRef.current = false;
        },
      }),
    [applyDrag, cardW, cardH, screenW, screenH, insets.top, insets.bottom]
  );

  const canNext = repeatOne || playlist.length > 1;

  const handleClose = () => {
    posReadyRef.current = false;
    void stop();
  };

  const handleShrink = () => {
    setExpanded(false);
    setPos((p) => {
      const c = clampPos(p.x, p.y, COLLAPSED, COLLAPSED, screenW, screenH, insets.top, insets.bottom);
      return snapToSideIfInCenterZone(
        c.x,
        c.y,
        COLLAPSED,
        COLLAPSED,
        screenW,
        screenH,
        insets.top,
        insets.bottom
      );
    });
  };

  if (!currentTrack) return null;

  /** On All Music, the in-screen bottom bar handles controls; floating player appears after leaving. */
  const onAllMusicScreen =
    pathname === "/all-music" || (typeof pathname === "string" && pathname.endsWith("all-music"));
  if (onAllMusicScreen) return null;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { zIndex: 9999, elevation: 14 }]}>
      <View
        style={{
          position: "absolute",
          left: pos.x,
          top: pos.y,
          width: expanded ? cardW : COLLAPSED,
        }}
      >
        {!expanded ? (
          <View {...panCollapsed.panHandlers} collapsable={false}>
            <View
              className="rounded-full bg-[#76C893] items-center justify-center shadow-lg shadow-black/20 border-2 border-white"
              style={{ width: COLLAPSED, height: COLLAPSED }}
            >
              <Ionicons name={categoryIcon} size={26} color="#fff" />
              {isPlaying ? (
                <View className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-200 border border-white" />
              ) : null}
            </View>
          </View>
        ) : (
          <View
            className="bg-white rounded-2xl border border-gray-200 shadow-xl shadow-black/20 overflow-hidden"
            style={{ width: cardW }}
          >
            <View className="flex-row items-center justify-between border-b border-gray-100 bg-[#f9faf9]">
              <View {...panHeader.panHandlers} className="flex-row items-center flex-1 px-2 py-2 gap-1">
                <Ionicons name="menu" size={20} color="#9ca3af" />
                <Text className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Drag</Text>
              </View>
              <View className="flex-row items-center pr-1">
                <Pressable
                  onPress={handleShrink}
                  hitSlop={10}
                  className="w-9 h-9 rounded-full items-center justify-center active:bg-gray-200"
                >
                  <Ionicons name="chevron-down" size={22} color="#374151" />
                </Pressable>
                <Pressable
                  onPress={handleClose}
                  hitSlop={10}
                  className="w-9 h-9 rounded-full items-center justify-center active:bg-red-50"
                >
                  <Ionicons name="close" size={22} color="#dc2626" />
                </Pressable>
              </View>
            </View>

            <View className="p-2.5 pt-2">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-[10px] bg-[#eaf7f0] items-center justify-center">
                  <Ionicons name={categoryIcon} size={22} color="#76C893" />
                </View>
                <View className="flex-1 ml-2 min-w-0">
                  <Text className="text-xs font-extrabold text-gray-900" numberOfLines={1}>
                    {currentTrack.title}
                  </Text>
                  <Text className="text-[10px] text-gray-500 font-semibold mt-0.5" numberOfLines={1}>
                    {currentTrack.artistName}
                  </Text>
                </View>
              </View>

              <View className="mt-2">
                <Slider
                  style={{ width: "100%", height: 32 }}
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
                <View className="flex-row justify-between px-0.5 -mt-1">
                  <Text className="text-[9px] font-bold text-gray-400">
                    {fmtMmSs(sliding ? slideValue * dur : positionMillis)}
                  </Text>
                  <Text className="text-[9px] font-bold text-gray-400">{fmtMmSs(dur)}</Text>
                </View>
              </View>

              {toast ? (
                <View className="items-center -mt-1 mb-1">
                  <View className="bg-gray-900/90 px-3 py-1.5 rounded-full">
                    <Text className="text-[10px] font-bold text-red-500">{toast}</Text>
                  </View>
                </View>
              ) : null}

              <View className="flex-row items-center justify-center mt-1 px-1 gap-2">
                <Pressable
                  onPress={() => {
                    toggleShuffle();
                    showToast(shuffle ? "Random play off" : "Random play on");
                  }}
                  hitSlop={8}
                  className="w-8 h-8 rounded-full items-center justify-center ml-2"
                >
                  <Ionicons name="shuffle" size={18} color={shuffle ? "#52B69A" : "#9ca3af"} />
                </Pressable>
                <Pressable onPress={() => void skipPrevious()} hitSlop={8} className="p-1">
                  <Ionicons name="play-skip-back" size={22} color="#111827" />
                </Pressable>
                <Pressable
                  onPress={() => void togglePlayPause()}
                  hitSlop={8}
                  className="w-11 h-11 rounded-full bg-[#76C893] items-center justify-center"
                >
                  <Ionicons name={isPlaying ? "pause" : "play"} size={22} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={() => void skipNext()}
                  disabled={!canNext}
                  hitSlop={8}
                  className={`p-1 ${!canNext ? "opacity-30" : ""}`}
                >
                  <Ionicons name="play-skip-forward" size={22} color="#111827" />
                </Pressable>
                <Pressable
                  onPress={() => {
                    toggleRepeatOne();
                    showToast(repeatOne ? "Repeat song off" : "Repeat song on");
                  }}
                  hitSlop={8}
                  className="w-8 h-8 rounded-full items-center justify-center mr-2"
                >
                  <Ionicons name="repeat" size={18} color={repeatOne ? "#52B69A" : "#9ca3af"} />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
