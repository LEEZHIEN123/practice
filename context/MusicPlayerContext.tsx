import { getExpoAvAudioOrNull } from "@/lib/expoAvSafe";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";

export type MusicTrack = {
  id: string;
  title: string;
  artistName: string;
  artworkUrl: string;
  streamUrl: string;
  durationMs: number;
  /** Library category id (e.g. local) for list icon. */
  categoryId?: string;
};

type ExpoSoundHandle = {
  stopAsync: () => Promise<void>;
  unloadAsync: () => Promise<void>;
  getStatusAsync: () => Promise<any>;
  pauseAsync: () => Promise<void>;
  playAsync: () => Promise<void>;
  setPositionAsync: (ms: number) => Promise<any>;
};

type MusicPlayerContextValue = {
  currentTrack: MusicTrack | null;
  playlist: MusicTrack[];
  currentIndex: number;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  repeatOne: boolean;
  shuffle: boolean;
  playPlaylistAt: (tracks: MusicTrack[], index: number, mode: "full" | "snippet") => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (ms: number) => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  toggleRepeatOne: () => void;
  toggleShuffle: () => void;
  stop: () => Promise<void>;
};

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

let snippetTimeout: ReturnType<typeof setTimeout> | null = null;

function pickRandomIndex(length: number, exclude?: number): number {
  if (length <= 0) return 0;
  if (length === 1) return 0;
  let next = Math.floor(Math.random() * length);
  if (exclude !== undefined && exclude >= 0 && next === exclude) {
    next = (next + 1 + Math.floor(Math.random() * (length - 1))) % length;
  }
  return next;
}

function resolveNextIndex(
  list: MusicTrack[],
  currentIdx: number,
  repeatOne: boolean,
  shuffle: boolean
): number | null {
  if (!list.length) return null;
  if (repeatOne) return currentIdx;
  if (shuffle) return pickRandomIndex(list.length, currentIdx);
  if (currentIdx < list.length - 1) return currentIdx + 1;
  return null;
}

function clearSnippetTimeout() {
  if (snippetTimeout) {
    clearTimeout(snippetTimeout);
    snippetTimeout = null;
  }
}

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const [playlist, setPlaylist] = useState<MusicTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const [repeatOne, setRepeatOne] = useState(false);
  const [shuffle, setShuffle] = useState(false);

  const soundRef = useRef<ExpoSoundHandle | null>(null);
  const playReqRef = useRef(0);
  const playlistRef = useRef<MusicTrack[]>([]);
  const indexRef = useRef(0);
  const modeRef = useRef<"full" | "snippet">("full");
  const currentIdRef = useRef<string | null>(null);
  const loadTrackAtRef = useRef<(tracks: MusicTrack[], index: number, mode: "full" | "snippet", reqId: number) => Promise<void>>(async () => {});
  const repeatOneRef = useRef(false);
  const shuffleRef = useRef(false);
  const [shouldResumeOnActive, setShouldResumeOnActive] = useState(false);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);
  useEffect(() => {
    indexRef.current = currentIndex;
  }, [currentIndex]);
  useEffect(() => {
    currentIdRef.current = currentTrack?.id ?? null;
  }, [currentTrack?.id]);
  useEffect(() => {
    repeatOneRef.current = repeatOne;
  }, [repeatOne]);
  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);

  const unloadCurrent = useCallback(async () => {
    clearSnippetTimeout();
    const s = soundRef.current;
    if (s) {
      try {
        await s.stopAsync();
        await s.unloadAsync();
      } catch {
        /* ignore */
      }
      soundRef.current = null;
    }
  }, []);

  const loadTrackAt = useCallback(
    async (tracks: MusicTrack[], index: number, mode: "full" | "snippet", reqId: number) => {
      const track = tracks[index];
      if (!track) return;

      await unloadCurrent();
      if (playReqRef.current !== reqId) return;

      const Audio = await getExpoAvAudioOrNull();
      if (!Audio) return;

      const onStatus = (status: any) => {
        if (playReqRef.current !== reqId) return;
        if (!status?.isLoaded) return;

        setPositionMillis(typeof status.positionMillis === "number" ? status.positionMillis : 0);
        if (typeof status.durationMillis === "number" && status.durationMillis > 0) {
          setDurationMillis(status.durationMillis);
        }
        setIsPlaying(Boolean(status.isPlaying));

        if (status.didJustFinish) {
          const list = playlistRef.current;
          const idx = indexRef.current;
          const m = modeRef.current;
          if (m === "snippet") {
            setIsPlaying(false);
            setCurrentTrack(null);
            setPlaylist([]);
            currentIdRef.current = null;
            void unloadCurrent();
            clearSnippetTimeout();
            return;
          }
          const next = resolveNextIndex(
            list,
            idx,
            repeatOneRef.current,
            shuffleRef.current
          );
          if (next !== null) {
            setCurrentIndex(next);
            indexRef.current = next;
            setCurrentTrack(list[next] ?? null);
            const nextReq = ++playReqRef.current;
            setTimeout(() => {
              void loadTrackAtRef.current(list, next, "full", nextReq);
            }, 0);
          } else {
            setIsPlaying(false);
            setCurrentTrack(null);
            setPlaylist([]);
            currentIdRef.current = null;
            void unloadCurrent();
          }
        }
      };

      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: track.streamUrl },
          { shouldPlay: true, progressUpdateIntervalMillis: 250 },
          onStatus,
          false
        );
        if (playReqRef.current !== reqId) {
          sound.unloadAsync().catch(() => {});
          return;
        }

        const handle = sound as unknown as ExpoSoundHandle;
        soundRef.current = handle;
        setPlaylist(tracks);
        setCurrentIndex(index);
        indexRef.current = index;
        playlistRef.current = tracks;
        modeRef.current = mode;
        setCurrentTrack(track);
        currentIdRef.current = track.id;
        setIsPlaying(true);
        setShouldResumeOnActive(false);
        if (track.durationMs > 0) setDurationMillis(track.durationMs);

        if (mode === "snippet") {
          clearSnippetTimeout();
          snippetTimeout = setTimeout(() => {
            if (playReqRef.current !== reqId) return;
            sound
              .stopAsync()
              .catch(() => {})
              .finally(() => {
                setIsPlaying(false);
                setCurrentTrack(null);
                setPlaylist([]);
                currentIdRef.current = null;
                sound.unloadAsync().catch(() => {});
                if (soundRef.current === handle) soundRef.current = null;
              });
          }, 30_000);
        }
      } catch {
        setCurrentTrack(null);
        setPlaylist([]);
        currentIdRef.current = null;
        setIsPlaying(false);
      }
    },
    [unloadCurrent]
  );

  useEffect(() => {
    loadTrackAtRef.current = loadTrackAt;
  }, [loadTrackAt]);

  useEffect(() => {
    void (async () => {
      const Audio = await getExpoAvAudioOrNull();
      if (!Audio) return;
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
    let lastState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener("change", async (nextState) => {
      const prev = lastState;
      lastState = nextState;

      if (prev === "active" && nextState !== "active") {
        const s = soundRef.current;
        if (s) {
          try {
            const st = await s.getStatusAsync();
            if (st.isLoaded && st.isPlaying) {
              setShouldResumeOnActive(true);
              await s.pauseAsync();
              setIsPlaying(false);
            }
          } catch {
            /* ignore */
          }
        }
      }

      if (nextState === "active" && shouldResumeOnActive && soundRef.current && currentIdRef.current) {
        const s2 = soundRef.current;
        try {
          const st = await s2.getStatusAsync();
          if (st.isLoaded && !st.isPlaying) {
            await s2.playAsync();
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

  const playPlaylistAt = useCallback(
    async (tracks: MusicTrack[], index: number, mode: "full" | "snippet") => {
      const track = tracks[index];
      if (!track) return;

      const s = soundRef.current;
      if (currentIdRef.current === track.id && s) {
        try {
          const st = await s.getStatusAsync();
          if (st.isLoaded && st.isPlaying) {
            await s.pauseAsync();
            setIsPlaying(false);
            setShouldResumeOnActive(false);
            return;
          }
          if (st.isLoaded && !st.isPlaying) {
            await s.playAsync();
            setIsPlaying(true);
            setShouldResumeOnActive(false);
            return;
          }
        } catch {
          await unloadCurrent();
        }
      }

      const reqId = ++playReqRef.current;
      await loadTrackAt(tracks, index, mode, reqId);
    },
    [loadTrackAt, unloadCurrent]
  );

  const togglePlayPause = useCallback(async () => {
    const s = soundRef.current;
    if (!s || !currentIdRef.current) return;
    try {
      const st = await s.getStatusAsync();
      if (!st.isLoaded) return;
      if (st.isPlaying) {
        await s.pauseAsync();
        setIsPlaying(false);
      } else {
        await s.playAsync();
        setIsPlaying(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const seekTo = useCallback(async (ms: number) => {
    const s = soundRef.current;
    if (!s) return;
    try {
      const st = await s.getStatusAsync();
      if (!st.isLoaded) return;
      const dur = typeof st.durationMillis === "number" && st.durationMillis > 0 ? st.durationMillis : durationMillis;
      const clamped = dur > 0 ? Math.max(0, Math.min(ms, dur)) : Math.max(0, ms);
      await s.setPositionAsync(clamped);
      setPositionMillis(clamped);
    } catch {
      /* ignore */
    }
  }, [durationMillis]);

  const stop = useCallback(async () => {
    playReqRef.current += 1;
    clearSnippetTimeout();
    await unloadCurrent();
    setCurrentTrack(null);
    setPlaylist([]);
    currentIdRef.current = null;
    setIsPlaying(false);
    setPositionMillis(0);
    setDurationMillis(0);
    setShouldResumeOnActive(false);
  }, [unloadCurrent]);

  const skipNext = useCallback(async () => {
    const list = playlistRef.current;
    const idx = indexRef.current;
    if (!list.length) return;
    const next = resolveNextIndex(list, idx, repeatOneRef.current, shuffleRef.current);
    if (next === null) return;
    const reqId = ++playReqRef.current;
    setCurrentIndex(next);
    indexRef.current = next;
    setCurrentTrack(list[next] ?? null);
    currentIdRef.current = list[next]?.id ?? null;
    await loadTrackAt(list, next, "full", reqId);
  }, [loadTrackAt]);

  const toggleRepeatOne = useCallback(() => {
    setRepeatOne((v) => !v);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((v) => !v);
  }, []);

  const skipPrevious = useCallback(async () => {
    const list = playlistRef.current;
    const idx = indexRef.current;
    if (!list.length) return;

    const s = soundRef.current;
    let pos = 0;
    try {
      if (s) {
        const st = await s.getStatusAsync();
        if (st.isLoaded && typeof st.positionMillis === "number") pos = st.positionMillis;
      }
    } catch {
      /* ignore */
    }

    if (pos > 3000) {
      await seekTo(0);
      return;
    }

    if (idx <= 0) {
      await seekTo(0);
      return;
    }

    const prev = idx - 1;
    const reqId = ++playReqRef.current;
    setCurrentIndex(prev);
    indexRef.current = prev;
    setCurrentTrack(list[prev] ?? null);
    currentIdRef.current = list[prev]?.id ?? null;
    await loadTrackAt(list, prev, "full", reqId);
  }, [loadTrackAt, seekTo]);

  const value = useMemo<MusicPlayerContextValue>(
    () => ({
      currentTrack,
      playlist,
      currentIndex,
      isPlaying,
      positionMillis,
      durationMillis,
      repeatOne,
      shuffle,
      playPlaylistAt,
      togglePlayPause,
      seekTo,
      skipNext,
      skipPrevious,
      toggleRepeatOne,
      toggleShuffle,
      stop,
    }),
    [
      currentTrack,
      playlist,
      currentIndex,
      isPlaying,
      positionMillis,
      durationMillis,
      repeatOne,
      shuffle,
      playPlaylistAt,
      togglePlayPause,
      seekTo,
      skipNext,
      skipPrevious,
      toggleRepeatOne,
      toggleShuffle,
      stop,
    ]
  );

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>;
}

export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) {
    throw new Error("useMusicPlayer must be used within MusicPlayerProvider");
  }
  return ctx;
}
