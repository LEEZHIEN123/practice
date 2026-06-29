import { isBeforeLocalSixAm } from "./calendarDay";
import type { WaterWeatherCondition } from "./waterIntakeModel";

export type OpenMeteoSixAmSnapshot = {
  temperature: number;
  humidity: number;
  condition: WaterWeatherCondition;
  description: string;
  /** False before 6:00 AM (forecast); true at/after 6:00 AM (recorded hour). */
  isHistorical: boolean;
};

function describeWeatherCode(code: number): string {
  const labels: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return labels[code] ?? "Morning weather";
}

export function mapOpenMeteoWeatherCode(code: number): WaterWeatherCondition {
  if (code === 0) return "sunny";
  if (code === 1 || code === 2 || code === 3 || code === 45 || code === 48) return "cloudy";
  return "rainy";
}

/**
 * Hourly weather at 6:00 AM local on `dayKey`.
 * Works for future 6 AM (forecast) and past 6 AM today (recorded hour) — no API key needed.
 */
export async function fetchOpenMeteoSixAmWeather(
  latitude: number,
  longitude: number,
  dayKey: string,
  timeZone: string
): Promise<OpenMeteoSixAmSnapshot | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("hourly", "temperature_2m,relative_humidity_2m,weather_code");
  url.searchParams.set("timezone", timeZone);
  url.searchParams.set("start_date", dayKey);
  url.searchParams.set("end_date", dayKey);

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const data = (await response.json()) as {
    hourly?: {
      time?: string[];
      temperature_2m?: number[];
      relative_humidity_2m?: number[];
      weather_code?: number[];
    };
  };

  const times = data.hourly?.time ?? [];
  const target = `${dayKey}T06:00`;
  const idx = times.indexOf(target);
  if (idx < 0) return null;

  const temperature = data.hourly?.temperature_2m?.[idx];
  const humidity = data.hourly?.relative_humidity_2m?.[idx];
  const weatherCode = data.hourly?.weather_code?.[idx];

  if (
    typeof temperature !== "number" ||
    !Number.isFinite(temperature) ||
    typeof humidity !== "number" ||
    !Number.isFinite(humidity) ||
    typeof weatherCode !== "number"
  ) {
    return null;
  }

  const beforeSixAm = isBeforeLocalSixAm(new Date(), timeZone, dayKey);

  return {
    temperature,
    humidity,
    condition: mapOpenMeteoWeatherCode(weatherCode),
    description: describeWeatherCode(weatherCode),
    isHistorical: !beforeSixAm,
  };
}
