import * as ImageManipulator from "expo-image-manipulator";
import { getGeminiApiKey, isGeminiConfigured } from "./geminiCoach";

export type MealPhotoAnalysis = {
  title: string;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  description: string;
  confidence: "low" | "medium" | "high";
};

export { isGeminiConfigured };

const GEMINI_MODEL = "gemini-2.5-flash";

const ANALYSIS_PROMPT = `Analyze this meal photo. Estimate nutrition for the visible portion only.

Return JSON with these exact keys:
- title (string): short dish name
- calories (number): estimated kcal
- proteinG (number or null)
- carbsG (number or null)
- fatG (number or null)
- description (string): one short portion note
- confidence ("low" | "medium" | "high")

If the image is not food, use title "Unknown food", calories 1, confidence "low".`;

type GeminiPart = {
  text?: string;
  thought?: boolean;
};

type GeminiGenerateResponse = {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
};

function parseGeminiError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    /* ignore */
  }
  return body || `Gemini request failed (${status})`;
}

function roundMacro(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return null;
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function pickNumber(record: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const n = Number(value.replace(/[^\d.]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  return trimmed;
}

function extractResponseText(data: GeminiGenerateResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const answerParts = parts.filter((part) => part.thought !== true && typeof part.text === "string");
  if (answerParts.length > 0) {
    return answerParts.map((part) => part.text ?? "").join("").trim();
  }

  const textParts = parts.filter((part) => typeof part.text === "string");
  return textParts.map((part) => part.text ?? "").join("").trim();
}

function parseAnalysisJson(raw: string): MealPhotoAnalysis {
  const payload = extractJsonPayload(raw);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    throw new Error("Could not read nutrition from the photo. Try again or enter details manually.");
  }

  const title = pickString(parsed, "title", "name", "food", "foodName", "dish");
  const calories = Math.round(pickNumber(parsed, "calories", "kcal", "calorie", "energy_kcal"));
  const confidenceRaw = pickString(parsed, "confidence", "certainty").toLowerCase();
  const confidence =
    confidenceRaw === "low" || confidenceRaw === "medium" || confidenceRaw === "high"
      ? confidenceRaw
      : "medium";
  const description = pickString(parsed, "description", "notes", "portion", "summary");

  if (!title || !Number.isFinite(calories) || calories <= 0) {
    throw new Error("Could not identify food in this photo. Enter the meal details manually.");
  }

  return {
    title,
    calories,
    proteinG: roundMacro(parsed.proteinG ?? parsed.protein_g ?? parsed.protein),
    carbsG: roundMacro(parsed.carbsG ?? parsed.carbs_g ?? parsed.carbs ?? parsed.carbohydrates),
    fatG: roundMacro(parsed.fatG ?? parsed.fat_g ?? parsed.fat),
    description,
    confidence,
  };
}

async function imageUriToBase64Jpeg(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    {
      compress: 0.75,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );
  if (!result.base64) {
    throw new Error("Could not prepare the photo for analysis.");
  }
  return result.base64;
}

function formatAnalysisDescription(analysis: MealPhotoAnalysis): string {
  const macroParts: string[] = [];
  if (analysis.proteinG != null) macroParts.push(`Protein ${analysis.proteinG}g`);
  if (analysis.carbsG != null) macroParts.push(`Carbs ${analysis.carbsG}g`);
  if (analysis.fatG != null) macroParts.push(`Fat ${analysis.fatG}g`);
  const macroLine = macroParts.length > 0 ? macroParts.join(" · ") : "";
  const estimateLabel = `AI estimate (${analysis.confidence} confidence)`;
  const notes = analysis.description.trim();
  return [estimateLabel, macroLine, notes].filter(Boolean).join("\n");
}

/** Send a meal photo to Gemini Vision and return estimated nutrition fields. */
export async function analyzeMealPhoto(imageUri: string): Promise<MealPhotoAnalysis> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Gemini API key is not set. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file and restart Expo."
    );
  }

  const base64 = await imageUriToBase64Jpeg(imageUri);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBodies = [
    {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64 } },
            { text: ANALYSIS_PROMPT },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            calories: { type: "number" },
            proteinG: { type: "number", nullable: true },
            carbsG: { type: "number", nullable: true },
            fatG: { type: "number", nullable: true },
            description: { type: "string" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["title", "calories", "description", "confidence"],
        },
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64 } },
            { text: ANALYSIS_PROMPT },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    },
  ];

  let lastError = "Gemini request failed.";
  let data: GeminiGenerateResponse | null = null;

  for (const body of requestBodies) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    if (!res.ok) {
      lastError = parseGeminiError(raw, res.status);
      continue;
    }
    try {
      data = JSON.parse(raw) as GeminiGenerateResponse;
      break;
    } catch {
      lastError = "Invalid response from Gemini.";
    }
  }

  if (!data) {
    throw new Error(lastError);
  }

  if (data.promptFeedback?.blockReason) {
    throw new Error("Gemini blocked this photo. Try a different image or enter details manually.");
  }

  const finishReason = data.candidates?.[0]?.finishReason;
  const text = extractResponseText(data);
  if (!text) {
    if (finishReason === "SAFETY") {
      throw new Error("Gemini could not analyze this photo. Enter meal details manually.");
    }
    throw new Error("Gemini returned an empty analysis. Please try again.");
  }

  const analysis = parseAnalysisJson(text);
  return {
    ...analysis,
    description: formatAnalysisDescription(analysis),
  };
}
