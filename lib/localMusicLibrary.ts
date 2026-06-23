import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MusicTrack } from "@/context/MusicPlayerContext";

const STORAGE_KEY = "local_music_library_v1";

export type StoredLocalTrack = MusicTrack & {
  addedAt: number;
  /** Original file name from device import (used to block duplicates). */
  sourceFileName?: string;
};

export type AddLocalMusicResult = {
  tracks: StoredLocalTrack[];
  added: StoredLocalTrack[];
  skippedTitles: string[];
};

function duplicateKey(track: Pick<StoredLocalTrack, "sourceFileName" | "title">): string {
  const raw = (track.sourceFileName ?? track.title).trim().toLowerCase();
  return raw
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^/.]+$/, "").trim();
  return base.replace(/[_-]+/g, " ").trim() || "Unknown track";
}

export async function loadLocalMusicLibrary(): Promise<StoredLocalTrack[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is StoredLocalTrack =>
        t != null &&
        typeof t === "object" &&
        typeof (t as StoredLocalTrack).id === "string" &&
        typeof (t as StoredLocalTrack).streamUrl === "string"
    );
  } catch {
    return [];
  }
}

export async function saveLocalMusicLibrary(tracks: StoredLocalTrack[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
}

export async function addLocalMusicTracks(
  incoming: Array<MusicTrack & { sourceFileName?: string }>
): Promise<AddLocalMusicResult> {
  const existing = await loadLocalMusicLibrary();
  const byId = new Map(existing.map((t) => [t.id, t]));
  const existingKeys = new Set(existing.map((t) => duplicateKey(t)));
  const now = Date.now();
  const added: StoredLocalTrack[] = [];
  const skippedTitles: string[] = [];

  for (const track of incoming) {
    if (!track.streamUrl) continue;

    const key = duplicateKey({
      sourceFileName: track.sourceFileName,
      title: track.title,
    });

    if (byId.has(track.id) || existingKeys.has(key)) {
      skippedTitles.push(track.title);
      continue;
    }

    const stored: StoredLocalTrack = {
      ...track,
      categoryId: track.categoryId ?? "local",
      sourceFileName: track.sourceFileName,
      addedAt: now,
    };
    byId.set(track.id, stored);
    existingKeys.add(key);
    added.push(stored);
  }

  const merged = [...byId.values()].sort((a, b) => b.addedAt - a.addedAt);
  if (added.length > 0) {
    await saveLocalMusicLibrary(merged);
  }
  return { tracks: merged, added, skippedTitles };
}

export async function removeLocalMusicTrack(id: string): Promise<StoredLocalTrack[]> {
  const next = (await loadLocalMusicLibrary()).filter((t) => t.id !== id);
  await saveLocalMusicLibrary(next);
  return next;
}
