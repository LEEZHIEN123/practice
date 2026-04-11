import { Platform } from "react-native";

/** Default export from expo-sensors/build/Accelerometer (sensor singleton). */
export type AccelerometerModule = {
  isAvailableAsync: () => Promise<boolean>;
  setUpdateInterval: (intervalMs: number) => void;
  addListener: (listener: (event: { x: number; y: number; z: number }) => void) => { remove: () => void };
};

let loadPromise: Promise<AccelerometerModule | null> | null = null;

/**
 * Loads Accelerometer only when needed. Returns null if the native module is missing
 * (same class of issue as ExponentPedometer on some builds / simulators / web).
 */
export function getAccelerometerOrNull(): Promise<AccelerometerModule | null> {
  if (Platform.OS === "web") return Promise.resolve(null);
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const mod = await import("expo-sensors/build/Accelerometer");
        const Accelerometer = mod.default;
        if (!(await Accelerometer.isAvailableAsync())) return null;
        return Accelerometer as AccelerometerModule;
      } catch {
        return null;
      }
    })();
  }
  return loadPromise;
}
