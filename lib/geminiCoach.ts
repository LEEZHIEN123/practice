import Constants from "expo-constants";
import { formatCoachContextForDisplay, type CoachUserContext } from "./aiCoachContext";

export type CoachChatTurn = { role: "user" | "assistant"; text: string };

export type { CoachUserContext };

const APP_SCOPE = `
You are the AI assistant in "Personalised Workout and Nutrition Guidance".

You can answer **any fitness-related question** and **guide how to use this app** when asked.

**Reply to the question only**
- Answer exactly what the user asked — nothing extra.

- Since you are a chatbot, you do not have access to the app. If they ask **how to use** a feature: give navigation steps.
 
Explain / tips / advice → full, clear, structured answer. Navigation → clearly numbered steps. Helpful depth by default unless they want a quick yes/no.

App paths (use only for how-to / do-it-for-me):
Tabs: **Home**, **Discover**, **Community**, **Progress**, **Profile**.
**Home** — calorie ring; **View Workout Plan**; **PERSONALISED NUTRITION GUIDANCE → View Nutrition Guidance** (nutrition plan is on Home, not Discover).
**Discover** — All Workouts; **All Nutrition** (Log Meal / Food Library — logging only); All Music; AI Chatbot.
**Progress** — charts; **Water Intake**; **Daily Steps** (ranking); **Achievements**.
**Community** — feed, Friends, Chat.
**Profile** — profile, dietary preference, reminders, BMI, settings.
Key: nutrition plan → **Home → View Nutrition Guidance**; log food → **Discover → All Nutrition → Log Meal**.

Decline only non-fitness / non-app topics. When the user asks something unrelated, politely say this app focuses on **fitness-related** topics only, then offer to help with workouts, meals, hydration, goals, or how to use the app. No medical diagnosis. Friendly; **bold** key terms. Use profile data below when relevant — do not invent stats.

**Vary your answers:** Each reply should feel fresh — change wording, examples, structure, and tips when the same or similar question is asked again. Keep facts accurate; do not repeat the same script every time.
`;

/** Cap history size — large threads make native Gemini calls feel slow. */
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS_PER_TURN = 700;

function isExplainStyleQuestion(text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return false;
  if (/^(hi|hello|hey|thanks|thank you|ok|okay)\b/.test(q) && q.length < 24) return false;
  if (
    /\b(how do i|how can i|where (is|do i)|show me how|help me (log|open|start|post|add|change)|log .+ for me|open .+ for me)\b/.test(
      q
    )
  ) {
    return false;
  }
  return (
    /\b(explain|what is|what are|what's|why|how does|how do .+ work|tell me about|describe|meaning of|difference between|tips for|should i|benefits of|importance of|help me understand)\b/.test(
      q
    ) || (q.endsWith("?") && !/\b(how do i|how can i|where)\b/.test(q))
  );
}

function buildCoachUserPrompt(userMessage: string): string {
  const styles = [
    "Use a coaching tone with practical examples.",
    "Lead with the key takeaway, then expand with bullets.",
    "Use a friendly conversational tone with clear sections.",
    "Start with a short overview, then give actionable tips.",
    "Explain simply first, then add deeper detail.",
  ];
  const styleHint = styles[Math.floor(Math.random() * styles.length)];

  if (!isExplainStyleQuestion(userMessage)) {
    return `${userMessage}

[Reply instruction: Answer this question only. Vary your wording from previous replies. ${styleHint}]`;
  }
  return `${userMessage}

[Reply instruction: Answer this question only. Give a complete explanation. Do not add app navigation steps. Do not say you lack access unless they asked you to perform an action in the app. Vary your wording and examples from previous replies. ${styleHint}]`;
}

export function buildCoachSystemInstruction(userContext?: CoachUserContext | null): string {
  const profileBlock = userContext ? formatCoachContextForDisplay(userContext) : "";
  if (!profileBlock) {
    return `${APP_SCOPE}\n\nNo user profile loaded yet. Give general fitness guidance and mention they can complete their profile for personalized tips.`;
  }
  return `${APP_SCOPE}\n\nCurrent user profile (from the app — use when relevant):\n${profileBlock}`;
}

const GEMINI_MODEL = "gemini-3.5-flash-lite";

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

type GeminiPart = { text?: string; thought?: boolean };
type GeminiChunk = {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
};

function textFromParts(parts: GeminiPart[] | undefined): string {
  if (!parts?.length) return "";
  // Skip internal thinking parts — only surface the final answer text.
  return parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
}

function truncateTurnText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_HISTORY_CHARS_PER_TURN) return trimmed;
  return `${trimmed.slice(0, MAX_HISTORY_CHARS_PER_TURN)}…`;
}

function compactHistory(history: CoachChatTurn[]): CoachChatTurn[] {
  return history.slice(-MAX_HISTORY_TURNS).map((turn) => ({
    role: turn.role,
    text: truncateTurnText(turn.text),
  }));
}

function buildRequestBody(
  history: CoachChatTurn[],
  userMessage: string,
  userContext: CoachUserContext | null | undefined,
  thinkingMode: "budget" | "level" | "off"
) {
  const explainMode = isExplainStyleQuestion(userMessage);
  const contents = [
    ...compactHistory(history).map((turn) => ({
      role: turn.role === "user" ? "user" : "model",
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: buildCoachUserPrompt(userMessage) }] },
  ];

  const generationConfig: Record<string, unknown> = {
    temperature: explainMode ? 0.9 : 0.85,
    topP: 0.95,
    // Keep replies snappy; long caps make native waits feel slow.
    maxOutputTokens: explainMode ? 1024 : 768,
  };

  if (thinkingMode === "budget") {
    // Disable thinking tokens (same as meal photo AI).
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  } else if (thinkingMode === "level") {
    // Gemini 3.x alternate: keep thinking at the lowest level.
    generationConfig.thinkingConfig = { thinkingLevel: "minimal" };
  }

  return {
    system_instruction: { parts: [{ text: buildCoachSystemInstruction(userContext) }] },
    contents,
    generationConfig,
  };
}

async function generateOnce(
  apiKey: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  onPartial?: (text: string) => void
): Promise<string> {
  // Prefer non-streaming on native/dev builds: RN often buffers SSE until complete,
  // so streamGenerateContent adds overhead without earlier first tokens.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    signal,
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(parseGeminiError(raw, res.status));
  }
  let data: GeminiChunk;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid response from Gemini.");
  }
  const text = textFromParts(data.candidates?.[0]?.content?.parts).trim();
  if (!text) throw new Error("Gemini returned an empty reply. Please try again.");
  onPartial?.(text);
  return text;
}

/** After the API rejects a thinking config once, prefer the mode that worked. */
let preferredThinkingMode: "budget" | "level" | "off" = "off";

function isRetryableConfigError(message: string): boolean {
  const msg = message.toLowerCase();
  // Gemini often returns a generic INVALID_ARGUMENT for unsupported thinkingConfig.
  return (
    msg.includes("thinking") ||
    msg.includes("budget") ||
    msg.includes("thinkingconfig") ||
    msg.includes("thinking_level") ||
    msg.includes("thinkinglevel") ||
    msg.includes("invalid argument") ||
    msg.includes("invalid_argument")
  );
}

/** Send conversation history + new user message to Gemini; returns assistant reply text. */
export async function sendCoachMessage(
  history: CoachChatTurn[],
  userMessage: string,
  userContext?: CoachUserContext | null,
  onPartial?: (text: string) => void
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Gemini API key is not set. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file and restart Expo."
    );
  }

  const controller = new AbortController();
  const timeoutMs = 35_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // "off" first — gemini-3.5-flash-lite often rejects thinkingBudget/thinkingLevel with
    // generic "Request contains an invalid argument". Prefer the last mode that worked.
    const modes = Array.from(
      new Set<"budget" | "level" | "off">([preferredThinkingMode, "off", "budget", "level"])
    );
    let lastError: unknown = null;
    for (const mode of modes) {
      try {
        const text = await generateOnce(
          apiKey,
          buildRequestBody(history, userMessage, userContext, mode),
          controller.signal,
          onPartial
        );
        preferredThinkingMode = mode;
        return text;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : "";
        if (mode === modes[modes.length - 1] || !isRetryableConfigError(msg)) throw err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Could not reach Gemini. Check your internet connection.");
  } catch (e) {
    if (e instanceof Error && (e.name === "AbortError" || controller.signal.aborted)) {
      throw new Error(
        "Gemini timed out after 35s. Check phone internet, that Google AI is reachable, and try again."
      );
    }
    throw e instanceof Error
      ? e
      : new Error("Could not reach Gemini. Check your internet connection.");
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Optional: warm DNS/TLS to Gemini so the first chat/food request is faster. */
export function warmupGeminiConnection(): void {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return;
  void fetch(`https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta`, {
    method: "GET",
    headers: { "x-goog-api-key": apiKey },
  }).catch(() => {});
}
