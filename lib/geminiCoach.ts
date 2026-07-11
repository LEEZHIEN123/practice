import Constants from "expo-constants";
import { formatCoachContextForDisplay, type CoachUserContext } from "./aiCoachContext";

export type CoachChatTurn = { role: "user" | "assistant"; text: string };

export type { CoachUserContext };

const APP_SCOPE = `
You are the AI assistant inside a fitness app ("Personalised Workout and Nutrition Guidance").

ONLY help with topics related to this app and the user's health journey:
- Workout plans (weekly / biweekly / monthly), scheduled day workouts, free workouts, discover workouts
- Exercise types: cardio, HIIT, strength, yoga, and how to perform or schedule them
- Meals, food logging, calories consumed, balanced meal ideas aligned with the user's goal
- Calorie budget: daily goal, food vs exercise calories, remaining calories
- Fitness goals: gain weight (same as dataset "Muscle Gain"), maintain weight, lose weight; BMI and safe progress
- Water intake, hydration, reminders
- Steps, daily activity, progress tracking
- Recovery, sleep, motivation, and healthy habits tied to training or nutrition
- How to use app areas: Home, Progress, Workout Plan, Day Workout, Discover, Water, Reminders, Achievements, Community

If the user asks about unrelated topics (politics, homework, coding, entertainment trivia, etc.):
- Politely decline in one short sentence
- Offer to help with a workout, meal, hydration, goal, or app feature instead

Safety: Do not diagnose medical conditions. Suggest a doctor or dietitian when appropriate.
Style: Practical, concise, friendly. Use short paragraphs or bullet lists when helpful. Emphasize key terms with **bold** markdown (not plain asterisks alone).
Do not invent the user's stats — only use profile data provided below when present.
`;

export function buildCoachSystemInstruction(userContext?: CoachUserContext | null): string {
  const profileBlock = userContext ? formatCoachContextForDisplay(userContext) : "";
  if (!profileBlock) {
    return `${APP_SCOPE}\n\nNo user profile loaded yet. Give general fitness guidance and mention they can complete their profile for personalized tips.`;
  }
  return `${APP_SCOPE}\n\nCurrent user profile (from the app — use when relevant):\n${profileBlock}`;
}

const GEMINI_MODEL = "gemini-2.5-flash";

export function getGeminiApiKey(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();
  const fromExtra = String(Constants.expoConfig?.extra?.geminiApiKey ?? "").trim();
  const key = fromEnv || fromExtra;
  return key.length > 0 ? key : null;
}

export function isGeminiConfigured(): boolean {
  return getGeminiApiKey() != null;
}

function parseGeminiError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    /* ignore */
  }
  return body || `Gemini request failed (${status})`;
}

/** Send conversation history + new user message to Gemini; returns assistant reply text. */
export async function sendCoachMessage(
  history: CoachChatTurn[],
  userMessage: string,
  userContext?: CoachUserContext | null
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Gemini API key is not set. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file and restart Expo."
    );
  }

  const contents = [
    ...history.map((turn) => ({
      role: turn.role === "user" ? "user" : "model",
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: buildCoachSystemInstruction(userContext) }] },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(parseGeminiError(raw, res.status));
  }

  let data: {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid response from Gemini.");
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new Error("Gemini returned an empty reply. Please try again.");
  }
  return text.trim();
}
