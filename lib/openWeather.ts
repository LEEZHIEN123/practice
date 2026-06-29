import Constants from "expo-constants";
import { formatCalendarDayKey, getLocalMinutesSinceMidnight } from "./calendarDay";
import type { WaterWeatherCondition } from "./waterIntakeModel";

export type OpenWeatherSnapshot = {
  placeName: string | null;
  temperature: number;
  humidity: number;
  condition: WaterWeatherCondition;
  description: string;
};

export function isOpenWeatherConfigured(): boolean {
  return Boolean(getApiKey());
}

function getApiKey(): string | null {
  const fromEnv = (process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY ?? "").trim();
  const fromExtra = (
    Constants.expoConfig?.extra?.openWeatherApiKey as string | undefined
  )?.trim();
  const key = fromEnv || fromExtra || "";
  if (!key || key === "your_key_here" || key === "your_openweather_api_key_here") {
    return null;
  }
  return key;
}

export function mapOpenWeatherMain(main: string): WaterWeatherCondition {
  const normalized = main.toLowerCase();
  if (normalized === "clear") return "sunny";
  if (
    normalized === "rain" ||
    normalized === "drizzle" ||
    normalized === "thunderstorm" ||
    normalized === "snow"
  ) {
    return "rainy";
  }
  return "cloudy";
}

async function readOpenWeatherError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (typeof body.message === "string" && body.message.trim().length > 0) {
      return body.message.trim();
    }
  } catch {
    // ignore parse errors
  }
  return `HTTP ${response.status}`;
}

function formatWeatherRequestError(status: number, detail: string): string {
  if (status === 401) {
    return `OpenWeather rejected the API key (${detail}). New keys often need up to 2 hours to activate after signup — wait and tap refresh.`;
  }
  if (status === 403) {
    return `OpenWeather access denied (${detail}). Confirm your free plan includes Current Weather on openweathermap.org.`;
  }
  if (status === 429) {
    return `OpenWeather rate limit reached (${detail}). Please try again in a few minutes.`;
  }
  return `Weather request failed (${detail}).`;
}

export async function fetchCurrentWeather(
  latitude: number,
  longitude: number
): Promise<OpenWeatherSnapshot> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("OpenWeather API key is not configured.");
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Could not read a valid GPS location.");
  }

  const url =
    `https://api.openweathermap.org/data/2.5/weather` +
    `?lat=${encodeURIComponent(String(latitude))}` +
    `&lon=${encodeURIComponent(String(longitude))}` +
    `&units=metric` +
    `&appid=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url);
  if (!response.ok) {
    const detail = await readOpenWeatherError(response);
    throw new Error(formatWeatherRequestError(response.status, detail));
  }

  const data = (await response.json()) as {
    name?: string;
    sys?: { country?: string };
    main?: { temp?: number; humidity?: number };
    weather?: { main?: string; description?: string }[];
  };

  const temperature =
    typeof data.main?.temp === "number" && Number.isFinite(data.main.temp)
      ? data.main.temp
      : 28;
  const humidity =
    typeof data.main?.humidity === "number" && Number.isFinite(data.main.humidity)
      ? data.main.humidity
      : 60;
  const main = data.weather?.[0]?.main ?? "Clouds";
  const description = data.weather?.[0]?.description ?? "Current weather";
  const city = typeof data.name === "string" && data.name.trim().length > 0 ? data.name.trim() : null;
  const country =
    typeof data.sys?.country === "string" && data.sys.country.trim().length > 0
      ? data.sys.country.trim()
      : null;
  const placeName = city ? (country ? `${city}, ${country}` : city) : null;

  return {
    placeName,
    temperature,
    humidity,
    condition: mapOpenWeatherMain(main),
    description,
  };
}

type ForecastListItem = {
  dt: number;
  main?: { temp?: number; humidity?: number };
  weather?: { main?: string; description?: string }[];
};

function parseForecastItem(
  item: ForecastListItem,
  placeName: string | null
): OpenWeatherSnapshot | null {
  const temperature =
    typeof item.main?.temp === "number" && Number.isFinite(item.main.temp)
      ? item.main.temp
      : null;
  const humidity =
    typeof item.main?.humidity === "number" && Number.isFinite(item.main.humidity)
      ? item.main.humidity
      : null;
  if (temperature == null || humidity == null) return null;

  const main = item.weather?.[0]?.main ?? "Clouds";
  const description = item.weather?.[0]?.description ?? "Morning weather";

  return {
    placeName,
    temperature,
    humidity,
    condition: mapOpenWeatherMain(main),
    description,
  };
}

/** Weather closest to 6:00 AM local on `dayKey` from the free 5-day / 3-hour forecast. */
export async function fetchSixAmForecastWeather(
  latitude: number,
  longitude: number,
  dayKey: string,
  timeZone: string,
  placeName: string | null
): Promise<OpenWeatherSnapshot | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const url =
    `https://api.openweathermap.org/data/2.5/forecast` +
    `?lat=${encodeURIComponent(String(latitude))}` +
    `&lon=${encodeURIComponent(String(longitude))}` +
    `&units=metric` +
    `&appid=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url);
  if (!response.ok) {
    const detail = await readOpenWeatherError(response);
    throw new Error(formatWeatherRequestError(response.status, detail));
  }

  const data = (await response.json()) as { list?: ForecastListItem[] };
  const list = Array.isArray(data.list) ? data.list : [];

  let best: ForecastListItem | null = null;
  let bestDiff = Infinity;
  for (const item of list) {
    if (!item?.dt) continue;
    const date = new Date(item.dt * 1000);
    if (formatCalendarDayKey(date, timeZone) !== dayKey) continue;
    const mins = getLocalMinutesSinceMidnight(date, timeZone);
    const diff = Math.abs(mins - 6 * 60);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = item;
    }
  }

  // OpenWeather uses 3-hour steps (e.g. 3:00, 6:00, 9:00) — allow up to 3 hours off.
  if (!best || bestDiff > 180) return null;
  return parseForecastItem(best, placeName);
}
