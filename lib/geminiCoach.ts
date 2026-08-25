import Constants from "expo-constants";
import * as ImageManipulator from "expo-image-manipulator";
import { formatCoachContextForDisplay, type CoachUserContext } from "./aiCoachContext";

export type CoachChatTurn = { role: "user" | "assistant"; text: string };

export type CoachImageAttachment = {
  /** Local file URI (camera / gallery). Converted to JPEG base64 before sending. */
  uri: string;
};

export type { CoachUserContext };

const APP_SCOPE = `
You are the AI assistant in "Personalised Workout and Nutrition Guidance".

**Scope — answer ONLY these topics:**
1. **Workouts** — exercise types, training, form, workout plans, scheduling, recovery after exercise, calories burned from exercise.
2. **Nutrition** — meals, calories, macros, dietary preferences, healthy eating for goals, hydration as it relates to nutrition/fitness.
3. **How to use this app** — for ANY feature below, give clear numbered steps with **exact** tab, screen, and button names from **App paths**. Never say a listed feature does not exist.

**Images:** Users may attach a photo (often a meal, plate, snack, or workout-related image). Analyze it for workout/nutrition help — e.g. estimate food, portions, or calories when it's a meal photo; give form/safety tips if it's exercise-related. If the image is unrelated to workout/nutrition, politely say so and offer relevant help instead.

**Do NOT answer** general knowledge unrelated to fitness/nutrition or this app (politics, homework, entertainment, dating, etc.). No medical diagnosis or prescribing medication. For **how-to / where-is / navigation** questions, always guide using **App paths** below — including Community, Music, Progress, Profile, and AI Chatbot features.

**Tone:** Always be **polite, warm, and friendly** in every reply — including when declining off-topic questions. Use encouraging language. Never be curt or dismissive. **Bold** key terms.

**Reply style:**
- Answer exactly what the user asked — nothing extra.
- Workout/nutrition explain / tips / advice → full, clear, structured answer with practical examples.
- How-to / where-is / navigation → numbered steps using **exact** names from App paths below. Include every relevant tap (tab → section → button).
- You cannot tap buttons or perform actions — only guide the user with steps.

**App paths (exact names — use for ALL navigation help):**

**Main bottom tabs:** **Home**, **Discover**, **Community**, **Progress**, **Profile**.

**Account & onboarding**
- **Register** / **Login** — app entry screens.
- New user onboarding flow: **Profile Details** → **Activity Level** → **Dietary Preference** → **Schedule Plan** → **BMI Analysis** → **Home**.
- **Schedule Plan** (first-time plan setup) — choose **One Week Plan**, **Biweekly Plan**, or **Monthly Plan**; also reached from **Home** if no plan duration is set yet.

**Home tab**
- **BMI SCORE** card — current BMI and category.
- **Today Calorie** ring — **Goal**, **Food**, **Exercise** breakdown; remaining calories.
- **PERSONALISED WORKOUT PLAN** → **View Workout Plan** → **Workout Plan** screen (day list).
- **PERSONALISED NUTRITION GUIDANCE** → **View Nutrition Guidance** → **Nutrition Guidance** screen (meal plan).

**Discover tab**
- **Explore Workouts** → **All Workouts**.
- **Explore Nutrition** → **All Nutrition**.
- **Explore Mind** → **All Music**.
- **AI Coach** → **AI Chatbot**.

**Workouts — personalised plan**
- **Home** → **View Workout Plan** → **Workout Plan**.
- Pick a **Day** → **Start** → **Day Workout** screen.
- **Day Workout**: **Start Workout** → choose **Start from 0** or set countdown → **Pause** / **Resume** → pause menu **Complete** or **Restart**; tap **back** while active to minimize to floating workout window (**Open**, **Complete**, pause/play).
- **Workout Plan**: **Switch plan** to change duration (week / biweekly / month).

**Workouts — free catalog**
- **Discover** → **All Workouts** → pick type (**Yoga**, **Strength**, **HIIT**, **Cardio**) → pick exercise → **Free Workout** screen → **Start Workout** (same pause / complete / minimize behavior).
- Tap heart (**Favourite**) on a workout to save it.

**Nutrition — personalised plan**
- **Home** → **View Nutrition Guidance** → **Nutrition Guidance**.
- Browse meals by day; tap a meal for **Nutrition Meal Detail**.
- Switch dietary chips (e.g. balanced / vegetarian options shown) to change meal suggestions.
- **Switch plan** to change nutrition plan duration.

**Nutrition — logging & library**
- **Discover** → **All Nutrition** — top tabs: **Meal Library**, **Barcode**, **Log Meal**.
- **Meal Library** — search recipes; tap food → **Food Detail**; tap tags → **Food By Tag**; heart icon to favourite.
- **Barcode** — scan with camera or enter barcode number.
- **Log Meal** — sub-tabs **Log meal** and **History**:
  - **Manual** or **AI analyse** (meal photo) modes.
  - Fill meal details → **Log meal**.
  - **History** — view, edit (**Meal History Edit**), or delete past logged meals.

**All Music**
- **Discover** → **All Music** → **Add** / **Import from phone** to load songs.
- **Search your music**; tap **30s** snippet or **Full** play.
- Leaving the screen shows floating music mini player (**Open**, collapse, close).

**AI Chatbot**
- **Discover** → **AI Chatbot**.
- Type a message or tap image icon → **Take Photo** / **Choose from Gallery** → optional caption → send.
- **Chat history** (clock icon), **New chat**, suggested prompt chips.

**Community tab**
- Sub-tabs: **Community** (feed), **Friends**, **Chat**.
- **Community** feed: search bar (**Search posts, tags, or people...**); **Manage** filter (**My like**, **My comment**, **My friend's post**); tap **#tag** for tag view.
- Floating **New Post** — add text, photos, tags, achievement chips.
- Top-right **Notifications** bell → **Community Notifications**.
- Top-right profile avatar → **Community My Posts**.
- Post actions: like, comment, share to chat, report, edit/delete (own posts).
- **Friends** tab → **Add friend** → **Community Add Friend** (search users).
- **Chat** tab → open thread → **Community Chat** (messages, photos, stickers); Support Admin chat available from profile/support entry points.

**Progress tab**
- Metric tabs: **Weight**, **Workout**, **Meal**.
- Period tabs: **Weekly**, **Monthly**, **Yearly**.
- **Log weight +** — log weight for a date.
- **SEE ALL >** → **Progress Details** (full charts for current tab & period).
- **Daily Steps** card → **Daily Steps** screen (**Tap for progress**) — step history & leaderboard.
- **Water Intake** card → **Water Intake** (**Tap to record**) — log ml, view suggestion.
- **Achievements** card → **Achievements** — badge categories + **Ranking** leaderboard.

**Profile tab**
- Stats cards: total calories, workouts, current weight.
- **Edit Profile** — photo, name, gender, age, height, weight, **Activity Level**.
- **My Report** — **Daily report** / **Weekly report**; share PDF.
- **Reminders** — **Workout Reminder**, **Meal Reminder**, **Water Intake** schedules (add times, repeat days, enable/disable).
- **Favourites** — saved **Workouts** and **Nutrition** items.
- **My Goals** — change fitness goal.
- **Appearance** — light / dark / system theme.
- **Terms of Service**.
- **Change password**, **Delete account**, **Logout**.

**Off-topic decline (always polite):** If the question is not about workouts, nutrition, or how to use this app, kindly explain that you focus on those topics, then offer examples you can help with. If they asked how to reach an app feature, answer with navigation steps instead of declining.

Use profile data below when relevant — do not invent stats.

**Vary your answers:** Change wording, examples, and structure when similar questions repeat. Keep facts accurate.
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

function isNavigationQuestion(text: string): boolean {
  const q = text.trim().toLowerCase();
  return (
    /\b(how do i|how can i|how to|where (is|are|do i|can i)|show me how|take me to|open|navigate|find .+ in the app|which (tab|screen|page|button|feature)|what button|log .+ for me|help me (log|open|start|add|change|play|post|send|upload|import|scan|switch|set|enable|disable|view|see|check|access|use|record|share|favorite|favourite))\b/.test(
      q
    ) ||
    /\b(in the app|in this app|using the app|app feature|app function|where .+ (feature|function|screen|page|tab|button))\b/.test(q)
  );
}

function isOffTopicQuestion(text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return false;
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|good morning|good evening)\b/.test(q) && q.length < 40) {
    return false;
  }
  const workoutNutritionApp =
    /\b(workout|exercise|train|gym|cardio|hiit|yoga|strength|rep|set|muscle|calorie|kcal|macro|protein|carb|fat|meal|food|eat|diet|nutrition|bmi|weight|hydrat|water intake|log meal|workout plan|nutrition plan|barcode|recipe|community|friend|chat|post|notification|music|song|reminder|achievement|favourite|favorite|profile|progress|discover|home tab|report|appearance|password|register|login|schedule plan|ai chat|chatbot|step|leaderboard|barcode|meal library)\b/.test(
      q
    );
  const appHowTo = isNavigationQuestion(q);
  if (workoutNutritionApp || appHowTo) return false;
  const clearlyOffTopic =
    /\b(politics|election|president|homework|essay|movie|game|dating|relationship advice|stock|crypto|weather forecast|joke|poem|write code|programming homework)\b/.test(
      q
    );
  return clearlyOffTopic;
}

function buildCoachUserPrompt(userMessage: string, hasImage: boolean): string {
  const styles = [
    "Use a warm, polite coaching tone with practical examples.",
    "Lead with the key takeaway, then expand with bullets — stay friendly throughout.",
    "Use an encouraging conversational tone with clear sections.",
    "Start with a brief friendly opener, then give actionable tips.",
    "Explain simply first, then add deeper detail — never sound cold or robotic.",
  ];
  const styleHint = styles[Math.floor(Math.random() * styles.length)];
  const message = userMessage.trim()
    ? userMessage.trim()
    : hasImage
      ? "Please look at this photo and help with workout or nutrition advice."
      : "";

  if (hasImage) {
    return `${message}

[Reply instruction: The user attached a photo. Analyze the image for workout/nutrition relevance (especially meal/food photos — estimate dish, portion, and rough calories/macros when possible). Answer their caption if they wrote one. Stay polite and friendly. ${styleHint}]`;
  }

  if (isOffTopicQuestion(message)) {
    return `${message}

[Reply instruction: This question is outside workout and nutrition scope. Politely and warmly decline — thank them for asking, explain you focus on workouts, nutrition, and how to use those features in this app, then offer 2–3 example topics you can help with. Do not answer the off-topic content. ${styleHint}]`;
  }

  if (isNavigationQuestion(message)) {
    return `${message}

[Reply instruction: This is a how-to / navigation question. Give numbered steps using exact tab, screen, and button names from the system instructions App paths. Cover every tap needed — do not skip steps. Be polite and friendly. Do not claim you can perform the action for them. ${styleHint}]`;
  }

  if (!isExplainStyleQuestion(message)) {
    return `${message}

[Reply instruction: Answer this workout or nutrition question only. Stay polite and friendly. Vary your wording from previous replies. ${styleHint}]`;
  }
  return `${message}

[Reply instruction: Answer this workout or nutrition question only. Give a complete explanation. Do not add app navigation steps unless they asked how to use the app. Do not say you lack access unless they asked you to perform an action in the app. Stay polite and friendly. Vary your wording and examples. ${styleHint}]`;
}

async function imageUriToBase64Jpeg(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 768 } }],
    {
      compress: 0.6,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );
  if (!result.base64) {
    throw new Error("Could not prepare the photo for the chat.");
  }
  return result.base64;
}

export function buildCoachSystemInstruction(userContext?: CoachUserContext | null): string {
  const profileBlock = userContext ? formatCoachContextForDisplay(userContext) : "";
  if (!profileBlock) {
    return `${APP_SCOPE}\n\nNo user profile loaded yet. Give general workout and nutrition guidance in a friendly tone, and mention they can complete their profile for personalized tips.`;
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

async function buildRequestBody(
  history: CoachChatTurn[],
  userMessage: string,
  userContext: CoachUserContext | null | undefined,
  thinkingMode: "budget" | "level" | "off",
  image?: CoachImageAttachment | null
) {
  const hasImage = Boolean(image?.uri);
  const explainMode = hasImage || isExplainStyleQuestion(userMessage);
  const promptText = buildCoachUserPrompt(userMessage, hasImage);
  const userParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  if (hasImage && image?.uri) {
    const base64 = await imageUriToBase64Jpeg(image.uri);
    userParts.push({ inlineData: { mimeType: "image/jpeg", data: base64 } });
  }
  userParts.push({ text: promptText });

  const contents = [
    ...compactHistory(history).map((turn) => ({
      role: turn.role === "user" ? "user" : "model",
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: userParts },
  ];

  const generationConfig: Record<string, unknown> = {
    temperature: explainMode ? 0.9 : 0.85,
    topP: 0.95,
    // Keep replies snappy; long caps make native waits feel slow.
    maxOutputTokens: explainMode || hasImage ? 1024 : 768,
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

/** Send conversation history + new user message (optional image) to Gemini; returns assistant reply text. */
export async function sendCoachMessage(
  history: CoachChatTurn[],
  userMessage: string,
  userContext?: CoachUserContext | null,
  onPartial?: (text: string) => void,
  image?: CoachImageAttachment | null
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Gemini API key is not set. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file and restart Expo."
    );
  }
  if (!userMessage.trim() && !image?.uri) {
    throw new Error("Type a message or attach a photo first.");
  }

  const controller = new AbortController();
  const timeoutMs = image?.uri ? 45_000 : 35_000;
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
        const body = await buildRequestBody(history, userMessage, userContext, mode, image);
        const text = await generateOnce(apiKey, body, controller.signal, onPartial);
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
        `Gemini timed out after ${Math.round(timeoutMs / 1000)}s. Check phone internet, that Google AI is reachable, and try again.`
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
