import { Platform } from "react-native";

/** Minimal Pedometer API used by this app. */
export type PedometerModule = {
  isAvailableAsync: () => Promise<boolean>;
  getStepCountAsync: (start: Date, end: Date) => Promise<{ steps: number }>;
  watchStepCount: (cb: (result: { steps: number }) => void) => { remove: () => void };
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  getPermissionsAsync: () => Promise<{ granted: boolean }>;
};

let loadPromise: Promise<PedometerModule | null> | null = null;

/**
 * Returns the Pedometer from expo-sensors, or null if the native module is missing
 * (e.g. web, Expo Go without pedometer, or a dev build that doesn't include ExponentPedometer).
 */
export function getPedometerOrNull(): Promise<PedometerModule | null> {
  if (Platform.OS === "web") return Promise.resolve(null);
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        // Use the Pedometer entry only — importing `expo-sensors` loads the package index, which
        // pulls in ExponentPedometer and crashes at load time when the native module is missing.
        const Pedometer = await import("expo-sensors/build/Pedometer");
        const available = await Pedometer.isAvailableAsync();
        if (!available) return null;
        return Pedometer as unknown as PedometerModule;
      } catch {
        return null;
      }
    })();
  }
  return loadPromise;
}
