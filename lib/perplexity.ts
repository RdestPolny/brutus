const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const MODEL = "sonar-pro";

export async function askPerplexityTable(prompt: string): Promise<string> {
  const result = await askPerplexityTableWithDebug(prompt);
  return result.content;
}

export async function askPerplexityTableWithDebug(
  prompt: string
): Promise<{ content: string; request: unknown; response: unknown }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY not set");

  const request = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Odpowiadasz wyłącznie tabelą Markdown. Bez wstępu, komentarzy, podsumowań i tekstu poza tabelą. Jeśli nie znajdziesz wartości, wpisz 'nie znaleziono'.",
      },
      { role: "user", content: prompt },
    ],
  };

  const res = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60000),
  });

  const rawText = await res.text();
  const data = parseJsonOrRawText(rawText);

  if (!res.ok) {
    throw new Error(`Perplexity error ${res.status}: ${JSON.stringify(data)}`);
  }

  return {
    content: String((data as PerplexityResponse)?.choices?.[0]?.message?.content ?? "").trim(),
    request,
    response: data,
  };
}

interface PerplexityResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function parseJsonOrRawText(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    return { rawText };
  }
}

export function buildRegistryPrompt(nip: string): string {
  return `Nip firmy: ${nip}, podaj Nazwę, KRS, adres, formę prawną, kapitał zakładowy, datę rejestracji i główną działalność. W tabeli, bez dodatkowego komentarza.
Tabela musi mieć dokładnie kolumny: Nazwa | KRS | Adres | Forma prawna | Kapitał zakładowy | Data rejestracji | Główna działalność.`;
}

export function buildDigitalPresencePrompt(companyName: string): string {
  return `${companyName} - poszukaj strony internetowej i linków do social mediów tej firmy, przygotuj tabelę z kolumnami: Platforma, Adres, Liczba followersów / Dodatkowe informacje.
Platforma to będzie np.
Strona/Wordpress, [https://strategiczni.pl/](https://strategiczni.pl/)
lub np.
Facebook, [https://www.facebook.com/agencjaseosemstrategiczni/](https://www.facebook.com/agencjaseosemstrategiczni/), 500 followersów
tylko tabela jako output bez dodatkowego komentarza`;
}
