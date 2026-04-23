import type { LeadInput } from "./types";

// Model locked by owner — do NOT change without explicit request from @marcinek
const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_FLASH_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface PreprocessResult {
  normalizedName: string;
  industrySlug: string; // kebab-case PL, np. "budownictwo", "it-software", "handel-detaliczny"
}

export async function preprocessLead(input: LeadInput): Promise<PreprocessResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${GEMINI_FLASH_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Na podstawie nazwy firmy i domeny zwróć JSON z:
1. normalizedName — nazwa firmy bez formy prawnej (sp. z o.o., S.A., sp.j. itp.)
2. industrySlug — branża w kebab-case po polsku, maksymalnie 3 słowa

Firma: "${input.companyName}"
Domena: ${input.domain}

Przykłady industrySlug: "budownictwo", "it-software", "handel-detaliczny", "produkcja-spozywcza", "agencja-marketingowa", "e-commerce", "uslgi-finansowe"

Zwróć TYLKO JSON: {"normalizedName": "...", "industrySlug": "..."}`,
            },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    // Preprocessing failure is non-fatal — return safe defaults
    return { normalizedName: input.companyName, industrySlug: "unknown" };
  }

  try {
    const data = await res.json();
    const raw = data.candidates[0].content.parts[0].text as string;
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    return JSON.parse(cleaned) as PreprocessResult;
  } catch {
    return { normalizedName: input.companyName, industrySlug: "unknown" };
  }
}
