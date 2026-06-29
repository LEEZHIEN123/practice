const path = require("path");
const appJson = require("./app.json");

// Load `.env` from the project root when Expo reads this config.
require("@expo/env").load(path.resolve(__dirname, ".env"), { force: true });

const geminiApiKey = (process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "").trim();
const openWeatherApiKey = (process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY ?? "").trim();

module.exports = {
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      softwareKeyboardLayoutMode: "resize",
    },
    extra: {
      ...appJson.expo.extra,
      geminiApiKey,
      openWeatherApiKey,
    },
  },
};
