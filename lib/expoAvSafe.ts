/**
 * Lazy-load expo-av Audio API without a static `import { Audio } from "expo-av"`, which would
 * evaluate the package index and native ExponentAV at bundle load (crashes when the native
 * module is missing).
 */
export type ExpoAvAudioModule = typeof import("expo-av/build/Audio");

let loadPromise: Promise<ExpoAvAudioModule | null> | null = null;

export function getExpoAvAudioOrNull(): Promise<ExpoAvAudioModule | null> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        return await import("expo-av/build/Audio");
      } catch {
        return null;
      }
    })();
  }
  return loadPromise;
}
