import {
  formatCalendarDayKey,
  getDeviceIanaTimezone,
  isBeforeLocalSixAm,
} from "@/lib/calendarDay";
import { fetchOpenMeteoSixAmWeather } from "@/lib/openMeteo";
import {
  fetchSixAmForecastWeather,
  isOpenWeatherConfigured,
} from "@/lib/openWeather";
import {
  calculateBmi,
  predictWaterIntakeMl,
  type WaterActivityLevel,
  type WaterWeatherCondition,
} from "@/lib/waterIntakeModel";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";

type ProfileSnapshot = {
  age?: number;
  gender?: "male" | "female";
  height?: number;
  weight?: number;
  activityLevel?: string | null;
};

export type WaterWeatherSnapshot = {
  placeName: string | null;
  temperature: number;
  humidity: number;
  condition: WaterWeatherCondition;
  description: string;
  isLive: boolean;
  isForecast: boolean;
  unavailableReason: string | null;
};

type CachedSuggestion = {
  dayKey: string;
  suggestedMl: number;
  placeName: string | null;
  weatherCondition: WaterWeatherCondition;
  weatherDescription: string;
  temperature: number;
  humidity: number;
  isLive: boolean;
  isForecast: boolean;
  unavailableReason: string | null;
  weatherLocked: boolean;
};

function cacheKey(uid: string, dayKey: string) {
  return `water-suggestion:v6:${uid}:${dayKey}`;
}

function mapActivityLevel(level?: string | null): WaterActivityLevel {
  if (level === "sedentary" || level === "light") return "low";
  if (level === "very_active" || level === "extra_active") return "high";
  return "medium";
}

function estimateActivityDurationMinutes(burnedKcal: number, steps: number): number {
  if (burnedKcal > 0) {
    return Math.min(120, Math.max(30, Math.round(burnedKcal / 7)));
  }
  if (steps > 0) {
    return Math.min(90, Math.max(30, Math.round(steps / 120)));
  }
  return 60;
}

function formatPlaceName(parts: Location.LocationGeocodedAddress[]): string | null {
  const first = parts[0];
  if (!first) return null;
  const city = first.city || first.subregion || first.district || first.name;
  const region = first.region;
  const country = first.country;
  if (city && country) return region ? `${city}, ${region}, ${country}` : `${city}, ${country}`;
  if (city) return city;
  if (region && country) return `${region}, ${country}`;
  return country ?? null;
}

async function resolvePlaceName(latitude: number, longitude: number): Promise<string | null> {
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    return formatPlaceName(places);
  } catch {
    return null;
  }
}

async function readCachedSuggestion(
  uid: string,
  dayKey: string
): Promise<CachedSuggestion | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(uid, dayKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSuggestion;
    if (parsed.dayKey !== dayKey || typeof parsed.suggestedMl !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedSuggestion(uid: string, value: CachedSuggestion) {
  await AsyncStorage.setItem(cacheKey(uid, value.dayKey), JSON.stringify(value));
}

function cachedToWeather(cached: CachedSuggestion): WaterWeatherSnapshot {
  return {
    placeName: cached.placeName,
    temperature: cached.temperature,
    humidity: cached.humidity,
    condition: cached.weatherCondition,
    description: cached.weatherDescription,
    isLive: cached.isLive,
    isForecast: cached.isForecast,
    unavailableReason: cached.unavailableReason,
  };
}

const DEFAULT_WEATHER = {
  temperature: 28,
  humidity: 60,
  condition: "cloudy" as WaterWeatherCondition,
  description: "Partly cloudy at 6:00 AM",
};

function withSixAmDescription(description: string): string {
  const base = description.trim();
  if (base.toLowerCase().includes("6:00 am")) return base;
  return `${base} at 6:00 AM`;
}

function withSixAmForecastDescription(description: string): string {
  const base = description.trim();
  if (base.toLowerCase().includes("forecast")) return base;
  return `Forecast: ${base} at 6:00 AM`;
}

function promoteForecastToSixAmWeather(cached: CachedSuggestion): WaterWeatherSnapshot {
  return {
    placeName: cached.placeName,
    temperature: cached.temperature,
    humidity: cached.humidity,
    condition: cached.weatherCondition,
    description: withSixAmDescription(cached.weatherDescription.replace(/^Forecast:\s*/i, "")),
    isLive: true,
    isForecast: false,
    unavailableReason: null,
  };
}

async function resolveSixAmWeather(
  latitude: number,
  longitude: number,
  dayKey: string,
  timeZone: string,
  placeName: string | null
): Promise<{ snapshot: WaterWeatherSnapshot; locked: boolean; isForecast: boolean }> {
  const now = new Date();
  const beforeSixAm = isBeforeLocalSixAm(now, timeZone, dayKey);

  const openMeteo = await fetchOpenMeteoSixAmWeather(
    latitude,
    longitude,
    dayKey,
    timeZone
  );
  if (openMeteo) {
    const description = beforeSixAm
      ? withSixAmForecastDescription(openMeteo.description)
      : withSixAmDescription(openMeteo.description);

    return {
      snapshot: {
        placeName,
        temperature: openMeteo.temperature,
        humidity: openMeteo.humidity,
        condition: openMeteo.condition,
        description,
        isLive: !beforeSixAm,
        isForecast: beforeSixAm,
        unavailableReason: null,
      },
      locked: !beforeSixAm,
      isForecast: beforeSixAm,
    };
  }

  let forecast = null;
  if (isOpenWeatherConfigured()) {
    try {
      forecast = await fetchSixAmForecastWeather(
        latitude,
        longitude,
        dayKey,
        timeZone,
        placeName
      );
    } catch {
      forecast = null;
    }
  }

  if (beforeSixAm) {
    if (!forecast) {
      throw new Error(
        "6:00 AM weather forecast is not available yet. Check your connection and try again."
      );
    }
    return {
      snapshot: {
        placeName: forecast.placeName ?? placeName,
        temperature: forecast.temperature,
        humidity: forecast.humidity,
        condition: forecast.condition,
        description: withSixAmForecastDescription(forecast.description),
        isLive: false,
        isForecast: true,
        unavailableReason: null,
      },
      locked: false,
      isForecast: true,
    };
  }

  if (forecast) {
    return {
      snapshot: {
        placeName: forecast.placeName ?? placeName,
        temperature: forecast.temperature,
        humidity: forecast.humidity,
        condition: forecast.condition,
        description: withSixAmDescription(forecast.description),
        isLive: true,
        isForecast: false,
        unavailableReason: null,
      },
      locked: true,
      isForecast: false,
    };
  }

  return {
    snapshot: {
      placeName,
      ...DEFAULT_WEATHER,
      isLive: false,
      isForecast: false,
      unavailableReason:
        "Could not load 6:00 AM weather. Using estimated morning weather.",
    },
    locked: false,
    isForecast: false,
  };
}

export function useWaterIntakeSuggestion(options: {
  uid: string | null;
  calendarTz: string;
  calendarDayKey: string;
  profile: ProfileSnapshot;
  burnedKcalToday: number;
  stepsToday: number;
  enabled?: boolean;
}) {
  const {
    uid,
    calendarTz,
    calendarDayKey,
    profile,
    burnedKcalToday,
    stepsToday,
    enabled = true,
  } = options;
  const [suggestedMl, setSuggestedMl] = useState<number | null>(null);
  const [weather, setWeather] = useState<WaterWeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!uid || !enabled) {
      setSuggestedMl(null);
      setWeather(null);
      return;
    }

    const dayKey = calendarDayKey || formatCalendarDayKey(new Date(), calendarTz || getDeviceIanaTimezone());
    const now = new Date();
    const beforeSixAm = isBeforeLocalSixAm(now, calendarTz, dayKey);
    setLoading(true);

    try {
      const cached = await readCachedSuggestion(uid, dayKey);
      if (cached) {
        setSuggestedMl(cached.suggestedMl);
        setWeather(cachedToWeather(cached));
      }

      const age =
        typeof profile.age === "number" && profile.age > 0 ? profile.age : 30;
      const weight =
        typeof profile.weight === "number" && profile.weight > 0 ? profile.weight : 70;
      const height =
        typeof profile.height === "number" && profile.height > 0 ? profile.height : 170;
      const gender = profile.gender === "female" ? "Female" : "Male";
      const activity_level = mapActivityLevel(profile.activityLevel);
      const activity_duration = estimateActivityDurationMinutes(
        burnedKcalToday,
        stepsToday
      );

      let weatherSnapshot: WaterWeatherSnapshot;
      let weatherLocked = cached?.weatherLocked ?? false;
      let isForecast = cached?.isForecast ?? false;
      let resolvedPlaceName: string | null = cached?.placeName ?? null;

      if (cached?.weatherLocked) {
        weatherSnapshot = cachedToWeather(cached);
      } else if (!beforeSixAm && cached?.isForecast && !cached.weatherLocked) {
        weatherSnapshot = promoteForecastToSixAmWeather(cached);
        weatherLocked = true;
        isForecast = false;
      } else {
        weatherSnapshot = {
          placeName: resolvedPlaceName,
          ...DEFAULT_WEATHER,
          isLive: false,
          isForecast: false,
          unavailableReason: null,
        };

        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (!permission.granted) {
            throw new Error("Location permission denied. Enable location to use morning weather.");
          }

          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const { latitude, longitude } = position.coords;
          resolvedPlaceName =
            (await resolvePlaceName(latitude, longitude)) ?? resolvedPlaceName;

          const morning = await resolveSixAmWeather(
            latitude,
            longitude,
            dayKey,
            calendarTz,
            resolvedPlaceName
          );
          weatherSnapshot = morning.snapshot;
          weatherLocked = morning.locked;
          isForecast = morning.isForecast;
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : "Could not load 6:00 AM weather.";
          weatherSnapshot = {
            placeName: resolvedPlaceName,
            ...DEFAULT_WEATHER,
            isLive: false,
            isForecast: false,
            unavailableReason: reason,
          };
        }
      }

      const nextSuggestion = predictWaterIntakeMl({
        gender,
        weather_condition: weatherSnapshot.condition,
        activity_level,
        age,
        weight,
        height,
        BMI: calculateBmi(weight, height),
        temperature: weatherSnapshot.temperature,
        humidity: weatherSnapshot.humidity,
        altitude: 0,
        activity_duration,
      });

      const payload: CachedSuggestion = {
        dayKey,
        suggestedMl: nextSuggestion,
        placeName: weatherSnapshot.placeName,
        weatherCondition: weatherSnapshot.condition,
        weatherDescription: weatherSnapshot.description,
        temperature: weatherSnapshot.temperature,
        humidity: weatherSnapshot.humidity,
        isLive: weatherSnapshot.isLive,
        isForecast,
        unavailableReason: weatherSnapshot.unavailableReason,
        weatherLocked,
      };

      await writeCachedSuggestion(uid, payload);
      setSuggestedMl(nextSuggestion);
      setWeather({ ...weatherSnapshot, isForecast });
    } catch {
      setSuggestedMl((prev) => prev);
      setWeather((prev) => prev);
    } finally {
      setLoading(false);
    }
  }, [
    burnedKcalToday,
    calendarDayKey,
    calendarTz,
    enabled,
    profile.activityLevel,
    profile.age,
    profile.gender,
    profile.height,
    profile.weight,
    stepsToday,
    uid,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    suggestedMl,
    weather,
    weatherDescription: weather?.description ?? null,
    placeName: weather?.placeName ?? null,
    weatherUnavailableReason: weather?.unavailableReason ?? null,
    loading,
    refresh,
  };
}
