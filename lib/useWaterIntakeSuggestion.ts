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

export type PreviousLocationSuggestion = {
  placeName: string | null;
  suggestedMl: number;
  weatherDescription: string;
  weatherCondition: WaterWeatherCondition;
  temperature: number;
  humidity: number;
};

type CachedSuggestion = {
  dayKey: string;
  suggestedMl: number;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
  weatherCondition: WaterWeatherCondition;
  weatherDescription: string;
  temperature: number;
  humidity: number;
  isLive: boolean;
  isForecast: boolean;
  unavailableReason: string | null;
  weatherLocked: boolean;
  previousLocation: PreviousLocationSuggestion | null;
};

function cacheKey(uid: string, dayKey: string) {
  return `water-suggestion:v7:${uid}:${dayKey}`;
}

const LOCATION_CHANGE_KM = 15;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasMovedToNewLocation(
  cached: CachedSuggestion | null,
  latitude: number,
  longitude: number,
  placeName: string | null
): boolean {
  if (!cached) return false;
  if (typeof cached.latitude === "number" && typeof cached.longitude === "number") {
    return haversineKm(cached.latitude, cached.longitude, latitude, longitude) >= LOCATION_CHANGE_KM;
  }
  if (cached.placeName && placeName) {
    return cached.placeName.trim().toLowerCase() !== placeName.trim().toLowerCase();
  }
  return false;
}

function snapshotPreviousLocation(cached: CachedSuggestion): PreviousLocationSuggestion {
  return {
    placeName: cached.placeName,
    suggestedMl: cached.suggestedMl,
    weatherDescription: cached.weatherDescription,
    weatherCondition: cached.weatherCondition,
    temperature: cached.temperature,
    humidity: cached.humidity,
  };
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
    return {
      ...parsed,
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      previousLocation: parsed.previousLocation ?? null,
    };
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
  const [previousLocation, setPreviousLocation] = useState<PreviousLocationSuggestion | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!uid || !enabled) {
      setSuggestedMl(null);
      setWeather(null);
      setPreviousLocation(null);
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
        setPreviousLocation(cached.previousLocation ?? null);
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

      let currentLat: number | null = cached?.latitude ?? null;
      let currentLon: number | null = cached?.longitude ?? null;
      let resolvedPlaceName: string | null = cached?.placeName ?? null;
      let locationError: string | null = null;

      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          throw new Error("Location permission denied. Enable location to use morning weather.");
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        currentLat = position.coords.latitude;
        currentLon = position.coords.longitude;
        resolvedPlaceName =
          (await resolvePlaceName(currentLat, currentLon)) ?? resolvedPlaceName;
      } catch (error) {
        locationError =
          error instanceof Error ? error.message : "Could not load 6:00 AM weather.";
      }

      const moved =
        currentLat != null &&
        currentLon != null &&
        hasMovedToNewLocation(cached, currentLat, currentLon, resolvedPlaceName);

      let previousLocationSnapshot: PreviousLocationSuggestion | null =
        cached?.previousLocation ?? null;
      if (moved && cached) {
        previousLocationSnapshot = snapshotPreviousLocation(cached);
      }

      let weatherSnapshot: WaterWeatherSnapshot;
      let weatherLocked = false;
      let isForecast = false;

      if (cached?.weatherLocked && !moved) {
        weatherSnapshot = cachedToWeather(cached);
        weatherLocked = true;
        isForecast = cached.isForecast;
        resolvedPlaceName = cached.placeName;
        if (currentLat == null) currentLat = cached.latitude;
        if (currentLon == null) currentLon = cached.longitude;
      } else if (!beforeSixAm && cached?.isForecast && !cached.weatherLocked && !moved) {
        weatherSnapshot = promoteForecastToSixAmWeather(cached);
        weatherLocked = true;
        isForecast = false;
        resolvedPlaceName = cached.placeName;
        if (currentLat == null) currentLat = cached.latitude;
        if (currentLon == null) currentLon = cached.longitude;
      } else if (currentLat != null && currentLon != null) {
        try {
          const morning = await resolveSixAmWeather(
            currentLat,
            currentLon,
            dayKey,
            calendarTz,
            resolvedPlaceName
          );
          weatherSnapshot = morning.snapshot;
          weatherLocked = morning.locked;
          isForecast = morning.isForecast;
          resolvedPlaceName = morning.snapshot.placeName ?? resolvedPlaceName;
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
      } else if (cached) {
        weatherSnapshot = cachedToWeather(cached);
        weatherLocked = cached.weatherLocked;
        isForecast = cached.isForecast;
      } else {
        weatherSnapshot = {
          placeName: resolvedPlaceName,
          ...DEFAULT_WEATHER,
          isLive: false,
          isForecast: false,
          unavailableReason: locationError,
        };
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
        placeName: weatherSnapshot.placeName ?? resolvedPlaceName,
        latitude: currentLat,
        longitude: currentLon,
        weatherCondition: weatherSnapshot.condition,
        weatherDescription: weatherSnapshot.description,
        temperature: weatherSnapshot.temperature,
        humidity: weatherSnapshot.humidity,
        isLive: weatherSnapshot.isLive,
        isForecast,
        unavailableReason: weatherSnapshot.unavailableReason,
        weatherLocked,
        previousLocation: previousLocationSnapshot,
      };

      await writeCachedSuggestion(uid, payload);
      setSuggestedMl(nextSuggestion);
      setWeather({ ...weatherSnapshot, isForecast });
      setPreviousLocation(previousLocationSnapshot);
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
    previousLocation,
    previousSuggestedMl: previousLocation?.suggestedMl ?? null,
    previousPlaceName: previousLocation?.placeName ?? null,
    weatherUnavailableReason: weather?.unavailableReason ?? null,
    loading,
    refresh,
  };
}
