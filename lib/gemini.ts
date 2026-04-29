const DEFAULT_GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite-preview";

export async function askGeminiJsonWithDebug<T>(
  prompt: string,
  options?: { systemInstruction?: string; model?: string }
): Promise<{ content: T | null; rawText: string; request: unknown; response: unknown }> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY not set");

  const model = options?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const baseUrl = (process.env.GEMINI_API_BASE_URL ?? DEFAULT_GEMINI_API_BASE_URL).replace(/\/$/, "");
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const request = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    ...(options?.systemInstruction
      ? {
          systemInstruction: {
            parts: [{ text: options.systemInstruction }],
          },
        }
      : {}),
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  };

  const res = await fetch(`${baseUrl}/${modelPath}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60000),
  });

  const rawText = await res.text();
  const response = parseJsonOrRawText(rawText);

  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${JSON.stringify(response)}`);
  }

  const answerText = extractGeminiText(response).trim();

  return {
    content: parseModelJson<T>(answerText),
    rawText: answerText,
    request,
    response,
  };
}

function extractGeminiText(response: unknown): string {
  const data = response as GeminiResponse;
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

function parseModelJson<T>(text: string): T | null {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

function parseJsonOrRawText(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    return { rawText };
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}
